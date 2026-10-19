import { describe, expect, it } from 'vitest'
import type { ForecastSnapshot, HourlyReading, HourlySample, ReadingsDay } from '@weatherteam6/types'
import { slimFigure, type SlimInputs } from './slimHeader.js'

const OFFSET = -5 * 3600

const row = (forecast_date: string, over: Partial<ForecastSnapshot> = {}) =>
  ({ forecast_date, temp_c_min: 8, temp_c_max: 19, ...over }) as ForecastSnapshot

const reading = (valid_at: string, score: number): HourlyReading => ({
  valid_at,
  rock: { level: 'dry', qualified: true },
  friction: { level: 'great', condensing: false, qualified: true },
  score,
  t_surface_c: 18,
  condensation_margin_c: 6,
})

const day = (local_date: string, score: number | null): ReadingsDay => ({
  local_date,
  window: null,
  best: score === null ? null : reading(`${local_date}T18:00:00Z`, score),
})

const sample = (valid_at: string, local_date: string, over: Partial<HourlySample> = {}) =>
  ({ valid_at, local_date, temp_c: 15, dewpoint_c: 5, precip_chance_pct: 0, ...over }) as HourlySample

const NOW = Date.parse('2026-09-28T17:10:00Z')

function inputs(over: Partial<SlimInputs> = {}): SlimInputs {
  return {
    isClimbingLocation: true,
    forecast: [row('2026-09-27'), row('2026-09-28', { is_today: true }), row('2026-09-29'), row('2026-09-30')],
    todayDate: '2026-09-28',
    readings: {
      days: [day('2026-09-27', 99), day('2026-09-28', 61), day('2026-09-29', 88), day('2026-09-30', 88)],
      utcOffsetSeconds: OFFSET,
      severeAlertEvent: null,
      alertsPending: false,
    },
    hours: [
      sample('2026-09-28T16:00:00Z', '2026-09-28', { precip_chance_pct: 12 }),
      sample('2026-09-28T17:00:00Z', '2026-09-28', { precip_chance_pct: 40 }),
      sample('2026-09-29T17:00:00Z', '2026-09-29', { precip_chance_pct: 95 }),
    ],
    selectedDate: '2026-09-30',
    readMs: null,
    hourReadings: [],
    utcOffsetSeconds: OFFSET,
    nowMs: NOW,
    ...over,
  }
}

describe('slimFigure on Daily', () => {
  it('names the best day from today on, never a past one, and the earlier of a tie', () => {
    const f = slimFigure('daily', inputs())
    expect(f.value).toBe(88)
    expect(f.label).toBe('best day')
    expect(f.line).toBe('Tuesday · 9/29 · Good hours: None')
  })

  it('withholds the figure while alerts load and under a Severe+ alert, as every score is', () => {
    const base = inputs()
    if (base.readings === null) throw new Error('fixture')
    for (const readings of [
      { ...base.readings, alertsPending: true },
      { ...base.readings, severeAlertEvent: 'Excessive Heat Warning' },
    ]) {
      const f = slimFigure('daily', { ...base, readings })
      expect(f.value).toBeNull()
      expect(f.line).toBeNull()
    }
  })

  it('carries a city’s high today instead, since a city has no score', () => {
    const f = slimFigure('daily', inputs({ isClimbingLocation: false, readings: null }))
    expect(f).toMatchObject({ value: 66, unit: '°', label: 'high today', tone: 'plain' })
  })
})

describe('slimFigure on Hourly', () => {
  // 16:00Z is 11 AM at the crag; 17:00Z is noon.
  const READ = Date.parse('2026-09-28T16:00:00Z')
  const hours = [
    sample('2026-09-28T16:00:00Z', '2026-09-28', {
      temp_c: 12.4,
      dewpoint_c: 3.6,
      precip_mm_mean: 0,
      precip_chance_pct: 12,
      humidity_pct: 49.4,
      wind_kmh: 16,
      wind_gust_kmh: 29,
    }),
    sample('2026-09-28T17:00:00Z', '2026-09-28', { precip_chance_pct: 40 }),
    sample('2026-09-29T17:00:00Z', '2026-09-29', { temp_c: 20, precip_chance_pct: 95 }),
  ]
  const hourReadings = [reading('2026-09-28T16:00:00Z', 73), reading('2026-09-28T17:00:00Z', 95)]

  it('is the read hour’s score, its clock, and every figure the charts draw there', () => {
    const f = slimFigure('hourly', inputs({ hours, hourReadings, readMs: READ }))
    expect(f).toMatchObject({ value: 73, label: 'Today 11 AM', tone: 'score' })
    expect(f.line).toBe('Air / dew: 54° / 38° · Rain: 0 in, 12% · Humidity: 49% · Wind / gusts: 10 / 18 mph')
  })

  it('names another day by its weekday', () => {
    const f = slimFigure('hourly', inputs({ hours, hourReadings, readMs: Date.parse('2026-09-29T17:00:00Z') }))
    expect(f.label).toBe('Tue 12 PM')
    // No reading for that hour: a gap, never a borrowed neighbour's score.
    expect(f.value).toBeNull()
  })

  it('withholds the score under a Severe+ alert and while alerts load, and keeps the figures', () => {
    const base = inputs({ hours, hourReadings, readMs: READ })
    const severe = slimFigure('hourly', { ...base, readings: { ...base.readings!, severeAlertEvent: 'Flood Warning' } })
    expect(severe.value).toBeNull()
    expect(severe.line).toMatch(/^Air \/ dew: 54° \/ 38° .* · Alert: score withheld$/)
    const pending = slimFigure('hourly', { ...base, readings: { ...base.readings!, alertsPending: true } })
    expect(pending.value).toBeNull()
    expect(pending.line).not.toMatch(/Alert/)
  })

  it('dashes a missing figure rather than writing a plausible one', () => {
    const gappy = [
      sample('2026-09-28T16:00:00Z', '2026-09-28', {
        temp_c: null,
        dewpoint_c: 3.6,
        precip_mm_mean: null,
        precip_chance_pct: null,
        humidity_pct: null,
        wind_kmh: null,
        wind_gust_kmh: null,
      }),
    ]
    const f = slimFigure('hourly', inputs({ hours: gappy, hourReadings, readMs: READ }))
    expect(f.line).toBe('Air / dew: — / 38° · Rain: —, — · Humidity: — · Wind / gusts: — / — mph')
  })

  it('is the hour’s air temperature for a city', () => {
    const f = slimFigure('hourly', inputs({ isClimbingLocation: false, readings: null, hours, readMs: READ }))
    expect(f).toMatchObject({ value: 54, unit: '°', tone: 'plain', label: 'Today 11 AM' })
  })

  it('is a gap while no hour is read', () => {
    const f = slimFigure('hourly', inputs({ hours, hourReadings, readMs: null }))
    expect(f.value).toBeNull()
    expect(f.line).toBeNull()
  })
})

describe('slimFigure on Precip', () => {
  it('is today’s highest hourly chance, not another day’s', () => {
    expect(slimFigure('precip', inputs())).toMatchObject({ value: 40, unit: '%', label: 'chance today' })
  })

  it('is a gap, not 0%, while the hours load', () => {
    expect(slimFigure('precip', inputs({ hours: [] })).value).toBeNull()
  })
})

describe('slimFigure on Rock', () => {
  it('is the margin between the two figures printed beside it', () => {
    // 12.4 °C prints 54°F and 3.6 °C prints 38°F; the raw interval rounds to 16.
    const hours = [sample('2026-09-28T17:00:00Z', '2026-09-28', { temp_c: 12.4, dewpoint_c: 3.6 })]
    const f = slimFigure('rock', inputs({ hours }))
    expect(f.line).toBe('Air: 54°F · Dew point: 38°F')
    expect(f.value).toBe(16)
    const close = [sample('2026-09-28T17:00:00Z', '2026-09-28', { temp_c: 12.2, dewpoint_c: 3.9 })]
    const g = slimFigure('rock', inputs({ hours: close }))
    expect(g.line).toBe('Air: 54°F · Dew point: 39°F')
    expect(g.value).toBe(15)
  })

  it('is a gap when either figure is missing, never the other one alone', () => {
    const hours = [sample('2026-09-28T17:00:00Z', '2026-09-28', { dewpoint_c: null })]
    const f = slimFigure('rock', inputs({ hours }))
    expect(f.value).toBeNull()
    expect(f.line).toBe('Air: 59°F · Dew point: —')
  })
})

describe('slimFigure on Crag', () => {
  it('is today’s score', () => {
    expect(slimFigure('crag', inputs())).toMatchObject({ value: 61, label: 'today', tone: 'score' })
  })
})
