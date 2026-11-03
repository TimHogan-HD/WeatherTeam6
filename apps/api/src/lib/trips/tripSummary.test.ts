import { describe, expect, it } from 'vitest'
import type { TripDayLookBack } from '@weatherteam6/types'
import {
  tripDateList,
  tripDayLookBacks,
  localDateAt,
  tripDayTrends,
  withCheckIns,
  withGaugeDays,
  withVolunteerGauges,
  type DayWeatherRecord,
  type ForecastRecord,
  type GaugeDayRow,
  type VolunteerReportRow,
} from './tripSummary.js'

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

const wx = (
  recorded_at: string,
  precip_mm_mean: number | null,
  temp_c_max: number | null,
  local_date = '2026-10-16',
): DayWeatherRecord => ({ local_date, recorded_at: new Date(recorded_at), precip_mm_mean, temp_c_max })

describe('tripDayTrends', () => {
  it('takes the earliest and latest recording of each day, whatever order they arrive in', () => {
    const days = tripDayTrends({
      dates: ['2026-10-16', '2026-10-17'],
      records: [
        wx('2026-10-10T06:00:00Z', 1.1, 12),
        wx('2026-10-13T06:00:00Z', 0.5, 10),
        wx('2026-10-04T06:00:00Z', 2.0, 11.5),
        wx('2026-10-08T06:00:00Z', 3.0, 13),
        wx('2026-10-05T06:00:00Z', 2.5, 12.5, '2026-10-17'),
      ],
    })
    expect(days[0]).toEqual({
      local_date: '2026-10-16',
      first: { recorded_at: '2026-10-04T06:00:00.000Z', precip_mm_mean: 2.0, temp_c_max: 11.5 },
      last: { recorded_at: '2026-10-13T06:00:00.000Z', precip_mm_mean: 0.5, temp_c_max: 10 },
    })
    // One recording is both ends: the reader shows one figure, not a change.
    expect(days[1]?.first).toEqual(days[1]?.last)
    expect(days[1]?.first?.precip_mm_mean).toBe(2.5)
  })

  it('passes over a recording with no weather at either end', () => {
    const [day] = tripDayTrends({
      dates: ['2026-10-16'],
      records: [
        wx('2026-10-03T06:00:00Z', null, null),
        wx('2026-10-04T06:00:00Z', 0, null),
        wx('2026-10-12T06:00:00Z', null, 14),
        wx('2026-10-13T06:00:00Z', null, null),
      ],
    })
    expect(day?.first?.recorded_at).toBe('2026-10-04T06:00:00.000Z')
    expect(day?.last?.recorded_at).toBe('2026-10-12T06:00:00.000Z')
  })

  it('answers every trip date, with both ends null where nothing was recorded', () => {
    expect(
      tripDayTrends({ dates: ['2026-10-16', '2026-10-17'], records: [wx('2026-10-13T06:00:00Z', null, null)] }),
    ).toEqual([
      { local_date: '2026-10-16', first: null, last: null },
      { local_date: '2026-10-17', first: null, last: null },
    ])
  })
})

describe('withGaugeDays', () => {
  const day = (local_date: string): TripDayLookBack => ({ local_date, outcome: null, first: null, last: null })
  const row = (station: string, local_date: string, rain_mm: number | null): GaugeDayRow => ({
    station,
    local_date,
    rain_mm,
    hours_reported: rain_mm === null ? 20 : 24,
    hours_expected: 24,
  })

  it('joins the crag’s own station on each date and leaves a date without a row null', () => {
    const days = withGaugeDays([day('2026-10-04'), day('2026-10-05')], { station: 'DLL', distance_km: 13.2 }, [
      row('DLL', '2026-10-04', 2.5),
      row('MSN', '2026-10-05', 9),
    ])
    expect(days[0]?.gauge).toEqual({ station: 'DLL', distance_km: 13.2, rain_mm: 2.5, hours_reported: 24, hours_expected: 24 })
    // MSN's reading for the 5th belongs to another crag's gauge.
    expect(days[1]?.gauge).toBeNull()
  })

  it('gives a crag with no gauge in reach null on every day, whatever rows exist', () => {
    const days = withGaugeDays([day('2026-10-04')], null, [row('DLL', '2026-10-04', 2.5)])
    expect(days[0]?.gauge).toBeNull()
  })

  it('carries a short day through as null rain with its counts', () => {
    const days = withGaugeDays([day('2026-10-04')], { station: 'DLL', distance_km: 13.2 }, [row('DLL', '2026-10-04', null)])
    expect(days[0]?.gauge).toMatchObject({ rain_mm: null, hours_reported: 20 })
  })
})

describe('withVolunteerGauges', () => {
  const day = (local_date: string): TripDayLookBack => ({ local_date, outcome: null, first: null, last: null })
  const report = (station: string, report_date: string, rain_mm: number, obs_hour: number | null = 7): VolunteerReportRow => ({
    station,
    station_name: `${station} name`,
    report_date,
    obs_hour,
    rain_mm,
  })
  const near = [
    { station: 'WI-PC-38', distance_km: 6.1 },
    { station: 'MN-GH-1', distance_km: 9.4 },
  ]

  it('takes the nearest station that reported for each day, falling to the next when it skipped one', () => {
    const days = withVolunteerGauges([day('2026-10-29'), day('2026-10-30')], near, [
      report('WI-PC-38', '2026-10-30', 10.67),
      report('MN-GH-1', '2026-10-30', 8),
      // WI-PC-38 skipped the 31st, so the 30th falls to MN-GH-1.
      report('MN-GH-1', '2026-10-31', 1.2),
    ])
    expect(days[0]?.volunteer_gauge).toEqual({
      station: 'WI-PC-38',
      name: 'WI-PC-38 name',
      distance_km: 6.1,
      rain_mm: 10.67,
      report_date: '2026-10-30',
      obs_hour: 7,
    })
    expect(days[1]?.volunteer_gauge).toMatchObject({ station: 'MN-GH-1', distance_km: 9.4, report_date: '2026-10-31' })
  })

  it('is null when no candidate reported, and ignores a station that is not the crag’s', () => {
    const days = withVolunteerGauges([day('2026-10-29')], near, [report('WI-XX-9', '2026-10-30', 4)])
    expect(days[0]?.volunteer_gauge).toBeNull()
    expect(withVolunteerGauges([day('2026-10-29')], [], [report('WI-PC-38', '2026-10-30', 4)])[0]?.volunteer_gauge).toBeNull()
  })
})

describe('localDateAt', () => {
  it('puts a Chicago evening check on its own day, not the next UTC one', () => {
    expect(localDateAt(new Date('2026-10-10T23:30:00Z'), 'America/Chicago', -92.5)).toBe('2026-10-10')
    expect(localDateAt(new Date('2026-10-11T00:30:00Z'), 'America/Chicago', -92.5)).toBe('2026-10-10')
  })

  it('falls back to the longitude’s offset without a gauge zone', () => {
    expect(localDateAt(new Date('2026-10-11T00:30:00Z'), null, -92.5)).toBe('2026-10-10')
    expect(localDateAt(new Date('2026-10-10T23:30:00Z'), null, 10)).toBe('2026-10-11')
  })
})

describe('withCheckIns', () => {
  it('marks only the days with a check, and every other day false, not absent', () => {
    const days = withCheckIns(
      [
        { local_date: '2026-10-04', outcome: null, first: null, last: null },
        { local_date: '2026-10-05', outcome: null, first: null, last: null },
      ],
      new Set(['2026-10-05', '2026-10-09']),
    )
    expect(days.map((d) => d.checked_in)).toEqual([false, true])
  })
})
