import { describe, expect, it } from 'vitest'
import {
  checksAgainstForecast,
  lastAtEachLead,
  rainChanceComparison,
  scoreDrift,
  type DayTruth,
  type LeadRecord,
} from './tripLead.js'

const rec = (over: Partial<LeadRecord> & Pick<LeadRecord, 'lead_days' | 'recorded_at'>): LeadRecord => ({
  location_id: 'A',
  local_date: '2026-10-10',
  score: null,
  members_wet: null,
  member_count: null,
  members_rewet: null,
  rewet_member_count: null,
  ...over,
})
const at = (iso: string) => new Date(iso)
const truth = (over: Partial<DayTruth> = {}): DayTruth => ({
  location_id: 'A',
  local_date: '2026-10-10',
  outcome_score: null,
  outcome_rain_mm: null,
  gauge_rain_mm: null,
  ...over,
})

describe('lastAtEachLead', () => {
  it('keeps the latest recording at each lead, whatever order rows arrive in', () => {
    const byDay = lastAtEachLead([
      rec({ lead_days: 2, recorded_at: at('2026-10-08T20:00:00Z'), score: 70 }),
      rec({ lead_days: 2, recorded_at: at('2026-10-08T06:00:00Z'), score: 90 }),
      rec({ lead_days: 1, recorded_at: at('2026-10-09T06:00:00Z'), score: 50 }),
    ])
    expect(byDay.get('A|2026-10-10')?.get(2)?.score).toBe(70)
    expect(byDay.get('A|2026-10-10')?.get(1)?.score).toBe(50)
  })

  it('keeps two crags on one date apart', () => {
    const byDay = lastAtEachLead([
      rec({ lead_days: 1, recorded_at: at('2026-10-09T06:00:00Z'), score: 50 }),
      rec({ location_id: 'B', lead_days: 1, recorded_at: at('2026-10-09T07:00:00Z'), score: 99 }),
    ])
    expect(byDay.size).toBe(2)
  })
})

describe('scoreDrift', () => {
  it('measures each lead against lead 0 and the look back, only on days that have both ends', () => {
    const byDay = lastAtEachLead([
      // Day 1: 100 three days out, 60 on the day, turned out 50.
      rec({ lead_days: 3, recorded_at: at('2026-10-07T20:00:00Z'), score: 100 }),
      rec({ lead_days: 0, recorded_at: at('2026-10-10T08:00:00Z'), score: 60 }),
      // Day 2: scored three days out only, nothing on the day.
      rec({ local_date: '2026-10-11', lead_days: 3, recorded_at: at('2026-10-08T20:00:00Z'), score: 90 }),
    ])
    const [row] = scoreDrift(byDay, [truth({ outcome_score: 50 }), truth({ local_date: '2026-10-11', outcome_score: 80 })], [3])
    expect(row).toEqual({ lead: 3, n: 1, meanMove: 40, bigMoveShare: 1, nOutcome: 2, meanError: 30 })
  })

  it('reports a lead nobody reached as empty, never zero movement', () => {
    const [row] = scoreDrift(lastAtEachLead([]), [], [5])
    expect(row).toMatchObject({ n: 0, meanMove: null, bigMoveShare: null, meanError: null })
  })

  it('skips a recording whose score was withheld rather than reading it as 0', () => {
    const byDay = lastAtEachLead([
      rec({ lead_days: 2, recorded_at: at('2026-10-08T20:00:00Z'), score: null }),
      rec({ lead_days: 0, recorded_at: at('2026-10-10T08:00:00Z'), score: 90 }),
    ])
    expect(scoreDrift(byDay, [], [2])[0]?.n).toBe(0)
  })
})

describe('rainChanceComparison', () => {
  const chances = (wet: number, rewet: number, local_date = '2026-10-10') =>
    rec({
      local_date,
      lead_days: 1,
      recorded_at: at('2026-10-09T06:00:00Z'),
      members_wet: wet,
      member_count: 100,
      members_rewet: rewet,
      rewet_member_count: 100,
    })

  it('scores both chances on the same days, and the sharper one wins', () => {
    const byDay = lastAtEachLead([chances(70, 10), chances(80, 90, '2026-10-11')])
    const rows = rainChanceComparison(
      byDay,
      [truth({ gauge_rain_mm: 0 }), truth({ local_date: '2026-10-11', gauge_rain_mm: 6 })],
      [1],
      0.5,
    )
    const gauge = rows.find((r) => r.truth === 'gauge')
    expect(gauge).toMatchObject({ n: 2, wet: 1 })
    // members_wet: (0.7² + 0.2²) / 2 = 0.265; members_rewet: (0.1² + 0.1²) / 2 = 0.01.
    expect(gauge?.brierWet).toBeCloseTo(0.265)
    expect(gauge?.brierRewet).toBeCloseTo(0.01)
  })

  it('drops a day for both chances when either chance is unknown', () => {
    const byDay = lastAtEachLead([{ ...chances(70, 10), members_rewet: null }, chances(80, 90, '2026-10-11')])
    const rows = rainChanceComparison(byDay, [truth({ gauge_rain_mm: 0 }), truth({ local_date: '2026-10-11', gauge_rain_mm: 6 })], [1], 0.5)
    expect(rows.find((r) => r.truth === 'gauge')?.n).toBe(1)
  })

  it('never reads a missing gauge day as dry', () => {
    const rows = rainChanceComparison(lastAtEachLead([chances(70, 10)]), [truth({ outcome_rain_mm: 0, gauge_rain_mm: null })], [1], 0.5)
    expect(rows.find((r) => r.truth === 'gauge')).toMatchObject({ n: 0, brierWet: null })
    expect(rows.find((r) => r.truth === 'model')).toMatchObject({ n: 1, wet: 0 })
  })

  it('counts rain exactly at the threshold as wet', () => {
    const rows = rainChanceComparison(lastAtEachLead([chances(50, 50)]), [truth({ gauge_rain_mm: 0.5 })], [1], 0.5)
    expect(rows.find((r) => r.truth === 'gauge')?.wet).toBe(1)
  })
})

describe('checksAgainstForecast', () => {
  it('reads the nearest scored recording a day or more ahead, never the day itself', () => {
    const byDay = lastAtEachLead([
      rec({ lead_days: 0, recorded_at: at('2026-10-10T08:00:00Z'), score: 20 }),
      rec({ lead_days: 1, recorded_at: at('2026-10-09T08:00:00Z'), score: null }),
      rec({ lead_days: 2, recorded_at: at('2026-10-08T08:00:00Z'), score: 85 }),
    ])
    const rows = checksAgainstForecast(byDay, [{ location_id: 'A', local_date: '2026-10-10', observed: 'wet' }])
    expect(rows.find((r) => r.observed === 'wet')).toEqual({ observed: 'wet', n: 1, good: 1, fair: 0, poor: 0, unscored: 0 })
  })

  it('counts a check with no score ahead as unscored', () => {
    const rows = checksAgainstForecast(lastAtEachLead([]), [{ location_id: 'A', local_date: '2026-10-10', observed: 'dry' }])
    expect(rows.find((r) => r.observed === 'dry')?.unscored).toBe(1)
  })
})
