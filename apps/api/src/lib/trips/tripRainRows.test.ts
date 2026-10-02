import { describe, it, expect } from 'vitest'
import type { OutlookDay } from '@weatherteam6/types'
import type { Outlook } from '../weather/ensembleOutlook.js'
import { tripRainRows } from './tripRainRows.js'

const DATES = ['2026-10-02', '2026-10-03', '2026-10-04']

function day(local_date: string, temp_c_max: number | null): OutlookDay {
  return {
    local_date,
    is_today: false,
    temp_c_max,
    temp_c_min: null,
    precip_mm_mean: null,
    members_wet: null,
    member_count: 2,
    models: [],
  }
}

const OUTLOOK: Outlook = {
  utc_offset_seconds: -18000,
  dates: DATES,
  member_precip: [
    [1, 2, 3],
    [0, 0, 1],
  ],
  days: [day('2026-10-02', 10), day('2026-10-03', 14), day('2026-10-04', 12)],
}

const NOW = new Date('2026-10-02T15:42:10Z')

describe('tripRainRows', () => {
  it('writes one point per trip, each summed over its own dates, at the firing hour', () => {
    const rows = tripRainRows({
      locationId: 'loc',
      now: NOW,
      outlook: OUTLOOK,
      trips: [
        { id: 'whole', start: '2026-10-02', end: '2026-10-04' },
        { id: 'late', start: '2026-10-04', end: '2026-10-06' },
      ],
    })
    expect(rows).toEqual([
      {
        trip_id: 'whole',
        location_id: 'loc',
        recorded_at: new Date('2026-10-02T15:00:00Z'),
        mean_mm: 3.5,
        p10_mm: expect.any(Number),
        p90_mm: expect.any(Number),
        member_count: 2,
        days_covered: 3,
        trip_days: 3,
        high_c_max: 14,
      },
      {
        trip_id: 'late',
        location_id: 'loc',
        recorded_at: new Date('2026-10-02T15:00:00Z'),
        mean_mm: 2,
        p10_mm: expect.any(Number),
        p90_mm: expect.any(Number),
        member_count: 2,
        // Two of its three days are past the horizon: the point says so.
        days_covered: 1,
        trip_days: 3,
        high_c_max: 12,
      },
    ])
  })

  it('writes nothing for a trip with no day inside the horizon yet', () => {
    const rows = tripRainRows({
      locationId: 'loc',
      now: NOW,
      outlook: OUTLOOK,
      trips: [{ id: 'far', start: '2026-11-01', end: '2026-11-03' }],
    })
    expect(rows).toEqual([])
  })

  it('keeps the high when no member reached every day, with the rain left null', () => {
    const rows = tripRainRows({
      locationId: 'loc',
      now: NOW,
      outlook: { ...OUTLOOK, member_precip: [[1, null, 3], [null, 0, 1]] },
      trips: [{ id: 'whole', start: '2026-10-02', end: '2026-10-04' }],
    })
    expect(rows[0]).toMatchObject({ mean_mm: null, p10_mm: null, p90_mm: null, days_covered: null, high_c_max: 14 })
  })
})
