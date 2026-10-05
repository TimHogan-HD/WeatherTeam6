import { describe, expect, it } from 'vitest'
import { tripDateList, tripDayLookBacks, type ForecastRecord } from './tripSummary.js'

const rec = (recorded_at: string, lead_days: number, score: number | null, local_date = '2026-10-04'): ForecastRecord => ({
  local_date,
  recorded_at: new Date(recorded_at),
  lead_days,
  score,
  dryness: score === null ? null : score > 80 ? 'dry' : 'wet',
  precip_mm_mean: 0.2,
  members_wet: 50,
  member_count: 143,
})

describe('tripDayLookBacks', () => {
  it('takes the first and last scored recordings, whatever order they arrive in', () => {
    const [day] = tripDayLookBacks({
      dates: ['2026-10-04'],
      records: [
        rec('2026-10-04T18:00:00Z', 0, 41),
        rec('2026-09-25T00:00:00Z', 9, null),
        rec('2026-10-05T00:00:00Z', 0, null),
        rec('2026-10-03T00:00:00Z', 1, 100),
        rec('2026-10-03T00:00:00Z', 1, 100, '2026-10-05'),
      ],
      outcomes: [],
    })
    expect(day?.first).toMatchObject({ lead_days: 1, score: 100, recorded_at: '2026-10-03T00:00:00.000Z' })
    expect(day?.last).toMatchObject({ lead_days: 0, score: 41 })
    expect(day?.outcome).toBeNull()
  })

  it('falls back to weather-only recordings when none was scored', () => {
    const [day] = tripDayLookBacks({
      dates: ['2026-10-04'],
      records: [rec('2026-09-26T00:00:00Z', 8, null), rec('2026-09-25T00:00:00Z', 9, null)],
      outcomes: [],
    })
    expect(day?.first?.lead_days).toBe(9)
    expect(day?.last?.lead_days).toBe(8)
  })

  it('answers every trip date, with nulls for a day nothing was recorded for', () => {
    const days = tripDayLookBacks({
      dates: ['2026-10-03', '2026-10-04'],
      records: [],
      outcomes: [{ local_date: '2026-10-04', score: 0, dryness: 'wet', rain_mm: 7, temp_c_max: 16, temp_c_min: 8 }],
    })
    expect(days.map((d) => d.local_date)).toEqual(['2026-10-03', '2026-10-04'])
    expect(days[0]).toEqual({ local_date: '2026-10-03', outcome: null, first: null, last: null })
    expect(days[1]?.outcome).toEqual({ score: 0, dryness: 'wet', rain_mm: 7, temp_c_max: 16, temp_c_min: 8 })
  })
})

describe('tripDateList', () => {
  it('lists a trip across a month end, and one day alone', () => {
    expect(tripDateList('2026-09-30', '2026-10-02')).toEqual(['2026-09-30', '2026-10-01', '2026-10-02'])
    expect(tripDateList('2026-10-04', '2026-10-04')).toEqual(['2026-10-04'])
  })
})
