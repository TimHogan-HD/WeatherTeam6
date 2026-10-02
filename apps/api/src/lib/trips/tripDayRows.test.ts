import { describe, it, expect } from 'vitest'
import type { OutlookDay, ReadingsDay } from '@weatherteam6/types'
import type { Outlook } from '../weather/ensembleOutlook.js'
import { recordingHour, tripDayRows } from './tripDayRows.js'

const DATES = ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']

function outlookDay(local_date: string): OutlookDay {
  return {
    local_date,
    is_today: false,
    temp_c_max: 15,
    temp_c_min: 5,
    precip_mm_mean: 0.4,
    members_wet: 20,
    member_count: 143,
    models: ['gfs_seamless'],
  }
}

const OUTLOOK: Outlook = {
  utc_offset_seconds: -18000,
  dates: DATES,
  member_precip: [],
  days: DATES.map(outlookDay),
}

function readingsDay(local_date: string, score: number): ReadingsDay {
  return {
    local_date,
    window: null,
    best: {
      valid_at: `${local_date}T18:00:00Z`,
      rock: { level: 'dry', qualified: true },
      friction: { level: 'good', condensing: false, qualified: true },
      score,
      t_surface_c: 12,
      condensation_margin_c: 4,
    },
  }
}

// 01:30 UTC on the 3rd is the evening of the 2nd at UTC-5.
const NOW = new Date('2026-10-03T01:30:00Z')
const FETCHED = new Date('2026-10-02T23:00:00Z')

describe('tripDayRows', () => {
  it("records from the location's local today, not UTC's, and only trip days", () => {
    const rows = tripDayRows({
      locationId: 'loc',
      now: NOW,
      ranges: [{ start: '2026-09-30', end: '2026-10-03' }],
      outlook: OUTLOOK,
      readings: null,
      scoredRunFetchedAt: null,
    })
    expect(rows.map((r) => [r.local_date, r.lead_days])).toEqual([
      ['2026-10-02', 0],
      ['2026-10-03', 1],
    ])
  })

  it('stamps every row with the firing hour, so a rerun inside it writes the same key', () => {
    const rows = tripDayRows({
      locationId: 'loc',
      now: NOW,
      ranges: [{ start: '2026-10-02', end: '2026-10-02' }],
      outlook: OUTLOOK,
      readings: null,
      scoredRunFetchedAt: null,
    })
    expect(rows[0]?.recorded_at.toISOString()).toBe('2026-10-03T01:00:00.000Z')
    expect(recordingHour(new Date('2026-10-03T01:59:59Z'))).toEqual(recordingHour(NOW))
  })

  it('scores only the days the readings reach, and names the run behind each score', () => {
    const rows = tripDayRows({
      locationId: 'loc',
      now: NOW,
      ranges: [{ start: '2026-10-02', end: '2026-10-05' }],
      outlook: OUTLOOK,
      readings: [readingsDay('2026-10-02', 80), readingsDay('2026-10-03', 64)],
      scoredRunFetchedAt: FETCHED,
    })
    expect(rows.map((r) => r.score)).toEqual([80, 64, null, null])
    expect(rows[1]).toMatchObject({ dryness: 'dry', friction: 'good', scored_run_fetched_at: FETCHED })
    expect(rows[3]).toMatchObject({ dryness: null, friction: null, scored_run_fetched_at: null, temp_c_max: 15 })
  })

  it('writes weather only at a location that is not a crag', () => {
    const rows = tripDayRows({
      locationId: 'loc',
      now: NOW,
      ranges: [{ start: '2026-10-02', end: '2026-10-05' }],
      outlook: OUTLOOK,
      readings: null,
      scoredRunFetchedAt: FETCHED,
    })
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.score === null && r.scored_run_fetched_at === null)).toBe(true)
    expect(rows[0]?.member_count).toBe(143)
  })

  it('leaves out a day neither source reached', () => {
    const rows = tripDayRows({
      locationId: 'loc',
      now: NOW,
      ranges: [{ start: '2026-10-02', end: '2026-10-05' }],
      outlook: { ...OUTLOOK, days: OUTLOOK.days.slice(0, 2) },
      readings: null,
      scoredRunFetchedAt: null,
    })
    expect(rows.map((r) => r.local_date)).toEqual(['2026-10-02', '2026-10-03'])
  })

  it('records a day once when two trips cover it', () => {
    const rows = tripDayRows({
      locationId: 'loc',
      now: NOW,
      ranges: [
        { start: '2026-10-02', end: '2026-10-03' },
        { start: '2026-10-03', end: '2026-10-04' },
      ],
      outlook: OUTLOOK,
      readings: null,
      scoredRunFetchedAt: null,
    })
    expect(rows.map((r) => r.local_date)).toEqual(['2026-10-02', '2026-10-03', '2026-10-04'])
  })
})
