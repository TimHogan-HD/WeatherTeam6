import { describe, expect, it } from 'vitest'
import type { HourlyReading, HourlySample, HourlySeries } from '@weatherteam6/types'
import { dayChips, daysOutPhrase, frictionCells, frictionSummary } from './hourlyDay.js'

const HOUR_MS = 3_600_000
// 05:00 UTC is midnight at a UTC-5 crag.
const T0 = Date.UTC(2026, 8, 15, 5)
const OFFSET = -5 * 3600

function sample(i: number, localDate = '2026-09-15'): HourlySample {
  return {
    valid_at: new Date(T0 + i * HOUR_MS).toISOString(),
    local_date: localDate,
    temp_c: 15,
    dewpoint_c: null,
    humidity_pct: null,
    precip_mm: null,
    wind_kmh: null,
    wind_gust_kmh: null,
    wind_dir_deg: null,
    cloud_pct: null,
    pressure_hpa: null,
    temp_c_p10: null,
    temp_c_p50: 15,
    temp_c_p90: null,
    wind_kmh_p10: null,
    wind_kmh_p50: null,
    wind_kmh_p90: null,
    precip_mm_mean: null,
    precip_mm_p10: null,
    precip_mm_p90: null,
    precip_chance_pct: null,
    member_count: null,
  }
}

function reading(validAt: string, level: 'poor' | 'fair' | 'good' | 'great'): HourlyReading {
  return {
    valid_at: validAt,
    rock: null,
    friction: { level, condensing: false, qualified: true },
    score: null,
    t_surface_c: null,
    condensation_margin_c: null,
  }
}

function series(hours: HourlySample[], readings: HourlyReading[]): HourlySeries {
  return {
    location_id: 'loc',
    utc_offset_seconds: OFFSET,
    fetched_at: null,
    model: 'gfs_seamless',
    unavailable_models: [],
    readings: { model: 'gfs_seamless', unavailable_reason: null, hours: readings, days: [] },
    hours,
    days: [],
  }
}

const days = [
  { local_date: '2026-09-15', has_deterministic: true, has_ensemble: true },
  { local_date: '2026-09-16', has_deterministic: true, has_ensemble: false },
  { local_date: '2026-09-17', has_deterministic: true, has_ensemble: true },
  { local_date: '2026-09-18', has_deterministic: true, has_ensemble: true },
]

describe('dayChips', () => {
  it('labels the window’s first day Today and keeps an undrawable day in its place', () => {
    expect(dayChips(days)).toEqual([
      { local_date: '2026-09-15', label: 'Today', drawable: true },
      { local_date: '2026-09-16', label: 'Wed', drawable: false },
      { local_date: '2026-09-17', label: 'Thu', drawable: true },
      { local_date: '2026-09-18', label: 'Fri', drawable: true },
    ])
  })
})

describe('daysOutPhrase', () => {
  it('counts from the window’s first day, not the viewer’s clock', () => {
    expect(daysOutPhrase(days, '2026-09-15')).toBe('today')
    expect(daysOutPhrase(days, '2026-09-16')).toBe('tomorrow')
    expect(daysOutPhrase(days, '2026-09-18')).toBe('in 3 days')
    expect(daysOutPhrase(days, '2026-09-01')).toBeNull()
  })
})

describe('frictionCells', () => {
  const hours = Array.from({ length: 24 }, (_, i) => sample(i))

  it('labels hours on the location’s clock, every sixth and the last', () => {
    const cells = frictionCells(series(hours, []), '2026-09-15')
    expect(cells[0]?.hour).toBe('00')
    expect(cells.filter((c) => c.tick).map((c) => c.hour)).toEqual(['00', '06', '12', '18', '23'])
  })

  it('joins readings on the instant, so a reading list missing an hour does not shift the rest', () => {
    // The readings skip hour 1. An index join would put hour 2's level on hour 1.
    const readings = [
      reading(hours[0]!.valid_at, 'fair'),
      reading(hours[2]!.valid_at, 'great'),
    ]
    const cells = frictionCells(series(hours, readings), '2026-09-15')
    expect(cells.slice(0, 3).map((c) => c.level)).toEqual(['fair', null, 'great'])
  })

  it('reads an absent readings field as no levels rather than failing', () => {
    // The type says the field is always there; an API older than the client
    // omits it, which is the case under test.
    const s = { ...series(hours, []), readings: undefined } as unknown as HourlySeries
    expect(frictionCells(s, '2026-09-15').every((c) => c.level === null)).toBe(true)
  })
})

describe('frictionSummary', () => {
  it('collapses runs and names a gap as a gap', () => {
    const hours = Array.from({ length: 4 }, (_, i) => sample(i))
    const readings = [
      reading(hours[0]!.valid_at, 'fair'),
      reading(hours[1]!.valid_at, 'fair'),
      reading(hours[3]!.valid_at, 'great'),
    ]
    expect(frictionSummary(frictionCells(series(hours, readings), '2026-09-15'))).toBe(
      'Friction by hour: 00–01 Fair, 02 no reading, 03 Great',
    )
  })
})
