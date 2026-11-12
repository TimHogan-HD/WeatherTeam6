import { describe, expect, it } from 'vitest'
import type { RainGaugeDay, RainGaugeReadings } from '@weatherteam6/types'
import { compareGauges, missingLabel, modelDays, sideLine, verdictHeadline } from './gaugeLines.js'

const IN = 25.4

function airport(date: string, inches: number | null): RainGaugeDay['gauge'] {
  return {
    station: 'RGK',
    distance_km: 14,
    rain_mm: inches === null ? null : inches * IN,
    hours_reported: inches === null ? 20 : 24,
    hours_expected: 24,
  }
}

function volunteer(date: string, inches: number): RainGaugeDay['volunteer_gauge'] {
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  return { station: 'WI-PC-38', name: 'Hager City 1.8 WNW', distance_km: 3, rain_mm: inches * IN, report_date: next, obs_hour: 7 }
}

/** The mockup's week, oldest first: Fri to Wed. Mon's airport day is partial; Sat had no volunteer report. */
const WEEK: { date: string; models: number | null; air: number | null | 'none'; vol: number | null }[] = [
  { date: '2026-11-06', models: 0.61, air: 0.48, vol: 0.55 },
  { date: '2026-11-07', models: 0.05, air: 0, vol: null },
  { date: '2026-11-08', models: 0, air: 0, vol: 0 },
  { date: '2026-11-09', models: 0.18, air: null, vol: 0.2 },
  { date: '2026-11-10', models: 0.42, air: 0.31, vol: 0.38 },
  { date: '2026-11-11', models: 0, air: 0, vol: 0 },
]

function readings(rows = WEEK, over: Partial<RainGaugeReadings> = {}): RainGaugeReadings {
  return {
    airport: { station: 'RGK', distance_km: 14, answered: true },
    volunteer: { stations: 1, failed: 0 },
    days: rows.map((r) => ({
      local_date: r.date,
      gauge: r.air === 'none' ? null : airport(r.date, r.air),
      volunteer_gauge: r.vol === null ? null : volunteer(r.date, r.vol),
    })),
    ...over,
  }
}

const modelsOf =
  (rows = WEEK) =>
  (date: string): number | null => {
    const m = rows.find((r) => r.date === date)?.models
    return m == null ? null : m * IN
  }

const inches = (mm: number) => Math.round((mm / IN) * 100) / 100

describe('compareGauges', () => {
  it('sets each gauge beside the models over its own whole days only', () => {
    const c = compareGauges(readings(), modelsOf())
    const air = c.find((s) => s.kind === 'airport')
    const vol = c.find((s) => s.kind === 'volunteer')
    // Monday's partial airport day is out of the airport's sum and the models' beside it, but in the volunteer's.
    expect(air?.days).toBe(5)
    expect(inches(air?.gaugeMm ?? -1)).toBe(0.79)
    expect(inches(air?.modelsMm ?? -1)).toBe(1.08)
    // Saturday had no volunteer report: out of both the volunteer's sum and its models total.
    expect(vol?.days).toBe(5)
    expect(inches(vol?.gaugeMm ?? -1)).toBe(1.13)
    expect(inches(vol?.modelsMm ?? -1)).toBe(1.21)
    // 0.79 against 1.08 is past a quarter; 1.13 against 1.21 is inside it.
    expect(c.map((s) => s.read)).toEqual(['wetter', 'matched'])
  })

  it('leaves out a day the models have no whole figure for, rather than reading it as dry', () => {
    // Fri was the wettest day; with the models' Fri a part day, both gauges lose it.
    const rows = WEEK.map((r) => (r.date === '2026-11-06' ? { ...r, models: null } : r))
    const c = compareGauges(readings(rows), modelsOf(rows))
    expect(c.map((s) => s.days)).toEqual([4, 4])
    expect(inches(c[0]?.gaugeMm ?? -1)).toBe(0.31)
  })

  it('reads the models as drier when the gauges caught more', () => {
    const rows = WEEK.map((r) => ({ ...r, models: r.models === null ? null : r.models / 2 }))
    expect(compareGauges(readings(rows), modelsOf(rows)).map((s) => s.read)).toEqual(['drier', 'drier'])
  })

  it('reads totals within a quarter of the larger as matched, and just past it as not', () => {
    const one = (models: number, air: number) => [{ date: '2026-11-10', models, air, vol: null }]
    const r = (rows: typeof WEEK) => compareGauges(readings(rows, { volunteer: { stations: 0, failed: 0 } }), modelsOf(rows))[0]?.read
    expect(r(one(1.0, 0.76))).toBe('matched')
    expect(r(one(1.0, 0.74))).toBe('wetter')
    expect(r(one(0.74, 1.0))).toBe('drier')
    // Under 0.20 in the floor is 0.05 in, not a quarter.
    expect(r(one(0.2, 0.16))).toBe('matched')
    expect(r(one(0.2, 0.14))).toBe('wetter')
  })

  it('reads too little rain on a near-dry week, never a match', () => {
    const rows = WEEK.map((r) => ({ ...r, models: r.models === null ? null : 0.01, air: 0, vol: 0.01 }))
    const c = compareGauges(readings(rows), modelsOf(rows))
    expect(c.map((s) => s.read)).toEqual(['little', 'little'])
    expect(verdictHeadline(c)).toBe('Too little rain to compare')
  })

  it('is empty when no gauge has a whole day to compare', () => {
    const rows = WEEK.map((r) => ({ ...r, air: 'none' as const, vol: null }))
    const c = compareGauges(readings(rows), modelsOf(rows))
    expect(c).toEqual([])
    expect(verdictHeadline(c)).toBeNull()
  })
})

describe('verdictHeadline and sideLine', () => {
  it('names the gauge each part of a split answer is about', () => {
    expect(verdictHeadline(compareGauges(readings(), modelsOf()))).toBe(
      'The models ran wetter than the airport gauge and matched the volunteer gauge',
    )
  })

  it('speaks for both gauges only when they agree', () => {
    const rows = WEEK.map((r) => ({ ...r, models: r.models === null ? null : r.models * 2 }))
    expect(verdictHeadline(compareGauges(readings(rows), modelsOf(rows)))).toBe('The models ran wetter than the gauges')
  })

  it('says the gauges disagree when one reads the models wetter and the other drier', () => {
    const rows = WEEK.map((r) => ({ ...r, vol: r.vol === null ? null : r.vol * 2 }))
    expect(verdictHeadline(compareGauges(readings(rows), modelsOf(rows)))).toBe('The gauges disagree with each other')
  })

  it('lets a gauge with too little rain stay silent beside one that can tell', () => {
    // The airport caught a soaking the models missed; the volunteer's days were near dry.
    const rows = [
      { date: '2026-11-10', models: 0.05, air: 0.6, vol: null },
      { date: '2026-11-11', models: 0.01, air: 'none' as const, vol: 0.02 },
    ]
    expect(compareGauges(readings(rows), modelsOf(rows)).map((s) => s.read)).toEqual(['drier', 'little'])
    expect(verdictHeadline(compareGauges(readings(rows), modelsOf(rows)))).toBe('The models ran drier than the airport gauge')
  })

  it('names the one gauge there is', () => {
    const rows = WEEK.map((r) => ({ ...r, vol: null }))
    expect(verdictHeadline(compareGauges(readings(rows), modelsOf(rows)))).toBe('The models ran wetter than the airport gauge')
  })

  it('prints each sum with its day count', () => {
    const [air, vol] = compareGauges(readings(), modelsOf())
    expect(air && sideLine(air)).toBe('Airport caught 0.79 in where the models had 1.08 in, over the 5 days it reported in full.')
    expect(vol && sideLine(vol)).toBe('Volunteer caught 1.13 in where the models had 1.21 in, over the 5 days it reported.')
    expect(sideLine({ kind: 'airport', gaugeMm: 0, modelsMm: 0, days: 1, read: 'little' })).toBe(
      'Airport caught 0 in where the models had 0 in, over the 1 day it reported in full.',
    )
  })
})

describe('missingLabel', () => {
  it('says no reading only for the gauge whose read failed', () => {
    const r = readings(WEEK, { airport: { station: 'RGK', distance_km: 14, answered: false } })
    expect(missingLabel(r, 'airport')).toBe('no reading')
    expect(missingLabel(r, 'volunteer')).toBe('no report')
    const v = readings(WEEK, { volunteer: { stations: 3, failed: 1 } })
    expect(missingLabel(v, 'airport')).toBe('no report')
    expect(missingLabel(v, 'volunteer')).toBe('no reading')
  })
})

describe('modelDays', () => {
  const hour = (date: string, h: number, mm: number) => ({ valid_at_local: `${date}T${String(h).padStart(2, '0')}:00`, precip_mm: mm })
  it('totals a day only when all 24 hours are there', () => {
    const hours = [
      ...Array.from({ length: 10 }, (_, i) => hour('2026-11-09', 14 + i, 1)),
      ...Array.from({ length: 24 }, (_, i) => hour('2026-11-10', i, i === 5 ? 2.5 : 0)),
      // A missing hour in the middle makes the day partial, not drier.
      ...Array.from({ length: 24 }, (_, i) => hour('2026-11-11', i, 1)).filter((_, i) => i !== 12),
    ]
    const m = modelDays(hours)
    expect(m.get('2026-11-09')).toEqual({ kind: 'partial' })
    expect(m.get('2026-11-10')).toEqual({ kind: 'value', mm: 2.5 })
    expect(m.get('2026-11-11')).toEqual({ kind: 'partial' })
    expect(m.get('2026-11-12')).toBeUndefined()
  })
})
