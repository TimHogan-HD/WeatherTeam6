import { describe, expect, it } from 'vitest'
import type { HourlyReading, OutlookDay, ReadingsDay, TripOutlook, TripTrendPoint } from '@weatherteam6/types'
import {
  coverageLabel,
  forecastOpens,
  formatTripDates,
  highChangeChip,
  outlookState,
  rainChangeChip,
  readingWords,
  tripDates,
  tripDayTiles,
  tripTiming,
  trendMarks,
} from './trips.js'
import type { DayReadings } from './overview.js'

function outlookDay(local_date: string, over: Partial<OutlookDay> = {}): OutlookDay {
  return {
    local_date,
    is_today: false,
    temp_c_max: 16,
    temp_c_min: 8,
    precip_mm_mean: 0.5,
    members_wet: 9,
    member_count: 50,
    models: ['gfs_seamless'],
    ...over,
  }
}

function reading(score: number): HourlyReading {
  return {
    valid_at: '2026-10-08T18:00:00Z',
    rock: { level: 'dry', qualified: true },
    friction: { level: 'great', condensing: false, qualified: true },
    score,
    t_surface_c: 12,
    condensation_margin_c: 4,
  }
}

function readingsDay(local_date: string, score: number): ReadingsDay {
  return { local_date, window: null, best: reading(score) }
}

function readings(days: ReadingsDay[], over: Partial<DayReadings> = {}): DayReadings {
  return { days, utcOffsetSeconds: -18000, severeAlertEvent: null, alertsPending: false, ...over }
}

const DATES = ['2026-10-08', '2026-10-09', '2026-10-10']
const TODAY = '2026-10-02'

describe('tripDayTiles', () => {
  it('joins the readings and the outlook on local_date, not on position', () => {
    // Both lists out of order and with an extra day either side.
    const tiles = tripDayTiles({
      dates: DATES,
      today: '2026-10-03',
      isCrag: true,
      outlook: [
        outlookDay('2026-10-10', { temp_c_max: 14 }),
        outlookDay('2026-10-08', { temp_c_max: 16 }),
        outlookDay('2026-10-11', { temp_c_max: 99 }),
      ],
      readings: readings([readingsDay('2026-10-09', 60), readingsDay('2026-10-08', 86), readingsDay('2026-10-07', 11)]),
    })
    expect(tiles.map((t) => t.kind)).toEqual(['scored', 'scored', 'unscored'])
    const [thu, fri, sat] = tiles
    expect(thu?.kind === 'scored' && thu.summary.score).toBe(86)
    expect(thu?.weather?.highC).toBe(16)
    // Fri is scored but the outlook has no row for it: its weather is a gap, not Sat's.
    expect(fri?.kind === 'scored' && fri.summary.score).toBe(60)
    expect(fri?.weather).toBeNull()
    expect(sat?.weather?.highC).toBe(14)
  })

  it('takes its words from the readings, and the chance and agreement from the members', () => {
    const [thu] = tripDayTiles({
      dates: ['2026-10-08'],
      today: TODAY,
      isCrag: true,
      outlook: [outlookDay('2026-10-08')],
      readings: readings([readingsDay('2026-10-08', 86)]),
    })
    expect(thu?.kind === 'scored' && readingWords(thu.summary)).toBe('Dry · Great')
    expect(thu?.weather?.chance).toBe(0.18)
    expect(thu?.weather?.agreement).toBe(0.82)
  })

  it('withholds the score while alerts load and under a Severe+ alert, and keeps the words', () => {
    for (const over of [{ alertsPending: true }, { severeAlertEvent: 'Extreme Heat Warning' }]) {
      const [thu] = tripDayTiles({
        dates: ['2026-10-08'],
        today: TODAY,
      isCrag: true,
        outlook: [outlookDay('2026-10-08')],
        readings: readings([readingsDay('2026-10-08', 86)], over),
      })
      expect(thu?.kind).toBe('scored')
      if (thu?.kind !== 'scored') continue
      expect(thu.summary.score).toBeNull()
      expect(readingWords(thu.summary)).toBe('Dry · Great')
    }
  })

  it('says when an unscored day will be scored, and nothing once that date has come', () => {
    const tiles = tripDayTiles({ dates: DATES, today: TODAY,
      isCrag: true, outlook: [], readings: null })
    expect(tiles.map((t) => (t.kind === 'unscored' ? t.scoredFrom : 'scored'))).toEqual([
      // Thu 8 enters the readings on Fri 2, which is today: no promise to make.
      null,
      '2026-10-03',
      '2026-10-04',
    ])
  })

  it('promises no date at a location that is not a crag', () => {
    const tiles = tripDayTiles({ dates: DATES, today: TODAY, outlook: [], readings: null, isCrag: false })
    expect(tiles.map((t) => t.kind === 'unscored' && t.scoredFrom)).toEqual([null, null, null])
  })

  it('scores nothing without readings, even for a day inside the window', () => {
    const tiles = tripDayTiles({
      dates: ['2026-10-03'],
      today: TODAY,
      isCrag: true,
      outlook: [outlookDay('2026-10-03')],
      readings: null,
    })
    expect(tiles[0]).toMatchObject({ kind: 'unscored', scoredFrom: null })
  })
})

describe('outlookState', () => {
  const base = { locationId: 'a', trip_days: 3 }
  it('reads days: null as a failure and [] as not in range yet', () => {
    const failed: TripOutlook = { ...base, utc_offset_seconds: null, days: null, rain_total: null, high_c_range: null }
    const notYet: TripOutlook = { ...base, utc_offset_seconds: 0, days: [], rain_total: null, high_c_range: null }
    expect(outlookState(failed).kind).toBe('unavailable')
    expect(outlookState(notYet).kind).toBe('notYet')
    expect(outlookState(undefined).kind).toBe('unavailable')
    expect(
      outlookState({ ...base, utc_offset_seconds: 0, days: [outlookDay('2026-10-08')], rain_total: null, high_c_range: null })
        .kind,
    ).toBe('days')
  })
})

function point(recorded_at: string, over: Partial<TripTrendPoint> = {}): TripTrendPoint {
  return {
    recorded_at,
    mean_mm: 5,
    p10_mm: 1,
    p90_mm: 10,
    days_covered: 3,
    trip_days: 3,
    high_c_max: 15,
    ...over,
  }
}

describe('trendMarks', () => {
  it('marks a point that covered only part of the trip, and one with no coverage', () => {
    const marks = trendMarks([
      point('2026-10-02T12:00:00Z', { days_covered: 3 }),
      point('2026-10-01T12:00:00Z', { days_covered: 2 }),
      point('2026-10-03T12:00:00Z', { days_covered: null, mean_mm: null, p10_mm: null, p90_mm: null }),
    ])
    expect(marks.map((m) => m.partial)).toEqual([true, false, true])
    expect(marks.map((m) => new Date(m.ms).toISOString().slice(0, 10))).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
  })
})

describe('change chips', () => {
  it('compare the newest point with the oldest that covered the same days', () => {
    const points = [
      point('2026-09-30T12:00:00Z', { days_covered: 2, mean_mm: 1, high_c_max: 10 }),
      point('2026-10-01T12:00:00Z', { mean_mm: 8.636, high_c_max: 14 }),
      point('2026-10-02T12:00:00Z', { mean_mm: 4.572, high_c_max: 16.8 }),
    ]
    expect(rainChangeChip(points)).toBe('Rain: down 0.16 in')
    expect(highChangeChip(points)).toBe('High: up 5°')
  })

  it('withhold a change across coverage, or from one point', () => {
    const across = [point('2026-10-01T12:00:00Z', { days_covered: 2 }), point('2026-10-02T12:00:00Z')]
    expect(rainChangeChip(across)).toBeNull()
    expect(highChangeChip([point('2026-10-02T12:00:00Z')])).toBeNull()
  })
})

describe('trip labels', () => {
  it('formats the dates within and across a month', () => {
    expect(formatTripDates('2026-10-08', '2026-10-10')).toBe('Thu 8 – Sat 10 Oct')
    expect(formatTripDates('2026-09-30', '2026-10-03')).toBe('Wed 30 Sep – Sat 3 Oct')
    expect(tripDates('2026-09-30', '2026-10-02')).toEqual(['2026-09-30', '2026-10-01', '2026-10-02'])
  })

  it('says when the trip is and when its forecast opens', () => {
    const trip = { startDate: '2026-10-08', endDate: '2026-10-10' }
    expect(tripTiming(trip, TODAY)).toBe('in 6 days')
    expect(tripTiming(trip, '2026-10-09')).toBe('underway')
    expect(tripTiming(trip, '2026-10-11')).toBe('ended')
    expect(forecastOpens('2026-10-30', TODAY)).toBe('2026-10-15')
    expect(forecastOpens('2026-10-17', TODAY)).toBeNull()
  })

  it('says how much of the trip a total covers', () => {
    expect(coverageLabel(3, 3)).toBe('All 3 days')
    expect(coverageLabel(2, 3)).toBe('2 of 3 days')
  })
})
