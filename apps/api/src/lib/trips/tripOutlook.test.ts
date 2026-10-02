import { describe, it, expect } from 'vitest'
import type { OutlookDay } from '@weatherteam6/types'
import { computePercentile } from '../weather/openMeteo.js'
import type { Outlook } from '../weather/ensembleOutlook.js'
import { summarizeTripOutlook, tripDayCount, tripRainTotal } from './tripOutlook.js'

function day(local_date: string, temp_c_max: number | null): OutlookDay {
  return {
    local_date,
    is_today: false,
    temp_c_max,
    temp_c_min: null,
    precip_mm_mean: null,
    members_wet: null,
    member_count: 0,
    models: [],
  }
}

function outlook(dates: string[], member_precip: (number | null)[][]): Outlook {
  return { utc_offset_seconds: -18000, dates, member_precip, days: dates.map((d) => day(d, 10)) }
}

describe('tripRainTotal', () => {
  it('takes percentiles of member totals, which adding daily p90s does not give', () => {
    // Members wet on different days: each day's p90 is 8 mm, so the sum of daily
    // p90s is 16 mm, but no member's trip is wetter than 10 mm.
    const dates = ['2026-10-03', '2026-10-04']
    const members = [
      [0, 10],
      [0, 0],
      [10, 0],
    ]
    const dailyP90Sum = dates.reduce(
      (acc, _, i) => acc + computePercentile(members.map((m) => m[i] ?? 0).sort((a, b) => a - b), 90),
      0,
    )
    expect(dailyP90Sum).toBe(16)

    const total = tripRainTotal(outlook(dates, members), '2026-10-03', '2026-10-04')
    expect(total).toEqual({
      mean_mm: 20 / 3,
      p10_mm: 2,
      p90_mm: 10,
      member_count: 3,
      days_covered: 2,
    })
  })

  it('sums only the members that reached every covered day', () => {
    const dates = ['2026-10-03', '2026-10-04']
    const total = tripRainTotal(
      outlook(dates, [
        [1, 1],
        [3, 3],
        // A model that ran out after the first day would put a one-day total in a two-day range.
        [50, null],
      ]),
      '2026-10-03',
      '2026-10-04',
    )
    expect(total?.member_count).toBe(2)
    expect(total?.mean_mm).toBe(4)
  })

  it('counts only trip days the outlook reached', () => {
    const dates = ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']
    const total = tripRainTotal(
      outlook(dates, [
        [9, 1, 1, null],
        [9, 2, 2, null],
      ]),
      '2026-10-03',
      '2026-10-10',
    )
    expect(total?.days_covered).toBe(2)
    expect(total?.mean_mm).toBe(3)
  })

  it('is null when no trip day is inside the horizon', () => {
    const total = tripRainTotal(outlook(['2026-10-02'], [[1]]), '2026-11-01', '2026-11-03')
    expect(total).toBeNull()
  })
})

describe('summarizeTripOutlook', () => {
  it('cuts the days to the trip and reports the trip length beside them', () => {
    const o = outlook(['2026-10-02', '2026-10-03', '2026-10-04'], [[0, 0, 0]])
    o.days = [day('2026-10-02', 30), day('2026-10-03', 12), day('2026-10-04', null)]
    const s = summarizeTripOutlook('loc', o, '2026-10-03', '2026-10-20')
    expect(s.trip_days).toBe(18)
    expect(s.days?.map((d) => d.local_date)).toEqual(['2026-10-03', '2026-10-04'])
    expect(s.high_c_range).toEqual({ min: 12, max: 12 })
    expect(s.rain_total?.days_covered).toBe(2)
  })

  it('keeps a failed read apart from a trip with no days in range', () => {
    const failed = summarizeTripOutlook('loc', null, '2026-10-03', '2026-10-04')
    expect(failed.days).toBeNull()

    const far = summarizeTripOutlook('loc', outlook(['2026-10-02'], [[0]]), '2026-12-01', '2026-12-02')
    expect(far.days).toEqual([])
    expect(far.rain_total).toBeNull()
    expect(far.high_c_range).toBeNull()
  })
})

describe('tripDayCount', () => {
  it('includes both ends and crosses a month', () => {
    expect(tripDayCount('2026-10-30', '2026-11-02')).toBe(4)
    expect(tripDayCount('2026-10-03', '2026-10-03')).toBe(1)
  })
})
