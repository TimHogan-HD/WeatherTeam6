import { describe, expect, it } from 'vitest'
import type { HourlyReading, HourlyReadings, HourlySample, RockLevel } from '@weatherteam6/types'
import {
  airDewSpreadF,
  dryAgain,
  drynessNow,
  spreadSeries,
  spreadWords,
} from './rockReadings.js'

const H = 3_600_000
const T0 = Date.parse('2026-10-20T12:00:00Z')
const NOW = T0 + 10 * 60_000

const hour = (i: number, level: RockLevel | null, marginC: number | null = 5): HourlyReading => ({
  valid_at: new Date(T0 + i * H).toISOString(),
  rock: level === null ? null : { level, qualified: true },
  friction: null,
  score: null,
  t_surface_c: null,
  condensation_margin_c: marginC,
})

const readings = (hours: HourlyReading[]): HourlyReadings => ({
  model: 'gfs_seamless',
  unavailable_reason: null,
  hours,
  days: [],
})

describe('drynessNow', () => {
  it('reads the hour covering now', () => {
    expect(drynessNow(readings([hour(-1, 'wet'), hour(0, 'drying'), hour(1, 'dry')]), NOW)).toBe('Drying')
  })

  it('is a gap with no hour near now, an unread rock, or a reason there are no readings', () => {
    expect(drynessNow(readings([hour(5, 'dry')]), NOW)).toBeNull()
    expect(drynessNow(readings([hour(0, null)]), NOW)).toBeNull()
    expect(drynessNow({ ...readings([hour(0, 'dry')]), unavailable_reason: 'model_unavailable' }, NOW)).toBeNull()
    expect(drynessNow(undefined, NOW)).toBeNull()
  })
})

describe('dryAgain', () => {
  it('is now when the rock is dry now', () => {
    expect(dryAgain(readings([hour(0, 'dry')]), NOW)).toEqual({ kind: 'now' })
  })

  it('is the first dry hour ahead, skipping an unread one rather than calling it dry', () => {
    const r = readings([hour(-1, 'dry'), hour(0, 'wet'), hour(1, null), hour(2, 'drying'), hour(3, 'dry'), hour(4, 'dry')])
    expect(dryAgain(r, NOW)).toEqual({ kind: 'at', ms: T0 + 3 * H })
  })

  it('says not in the forecast, through the last hour read, when no hour ahead is dry', () => {
    expect(dryAgain(readings([hour(0, 'wet'), hour(1, 'drying'), hour(2, 'drying')]), NOW)).toEqual({
      kind: 'not-in-forecast',
      throughMs: T0 + 2 * H,
    })
  })

  it('ends the not-dry span at the last hour read, not at unread hours past it', () => {
    expect(dryAgain(readings([hour(0, 'wet'), hour(1, 'drying'), hour(2, null), hour(30, null)]), NOW)).toEqual({
      kind: 'not-in-forecast',
      throughMs: T0 + 1 * H,
    })
  })

  it('is a gap when now could not be read, never now', () => {
    expect(dryAgain(readings([hour(0, null), hour(1, 'dry')]), NOW)).toBeNull()
  })
})

const sample = (i: number, tempC: number | null, dewC: number | null) =>
  ({ valid_at: new Date(T0 + i * H).toISOString(), temp_c: tempC, dewpoint_c: dewC }) as HourlySample

describe('airDewSpreadF (#436)', () => {
  it('is the air minus its dew point as an interval in °F, never through the scale’s 32', () => {
    // 15 − 5 = 10 °C is 18°F apart; cToF would have made it 50.
    expect(airDewSpreadF({ temp_c: 15, dewpoint_c: 5 })).toBeCloseTo(18)
    expect(airDewSpreadF({ temp_c: -3, dewpoint_c: -4 })).toBeCloseTo(1.8)
  })

  it('is a gap, never a spread of 0, when either value is missing', () => {
    expect(airDewSpreadF({ temp_c: null, dewpoint_c: 5 })).toBeNull()
    expect(airDewSpreadF({ temp_c: 5, dewpoint_c: null })).toBeNull()
    expect(airDewSpreadF({ temp_c: 0, dewpoint_c: null })).toBeNull()
  })

  it('reads a saturated hour as 0, not a gap: a real 0 and a missing value stay apart', () => {
    expect(airDewSpreadF({ temp_c: 0, dewpoint_c: 0 })).toBe(0)
  })
})

describe('spreadSeries', () => {
  it('keeps the hour covering now to 42 ahead, a missing value as a gap', () => {
    const hours = [sample(-2, 10, 5), sample(0, 10, 5), sample(1, null, 5), sample(42, 9, 8), sample(43, 9, 8)]
    const s = spreadSeries(hours, NOW)
    expect(s.map((h) => h.t)).toEqual([T0, T0 + H, T0 + 42 * H])
    expect(s[0]?.spreadF).toBeCloseTo(9)
    expect(s[1]?.spreadF).toBeNull()
    expect(s[2]?.spreadF).toBeCloseTo(1.8)
  })

  it('is empty with no hours', () => {
    expect(spreadSeries([], NOW)).toEqual([])
  })
})

describe('spreadWords', () => {
  it('rounds to a whole degree', () => {
    expect(spreadWords(17.6)).toBe('18°F')
    expect(spreadWords(0.6)).toBe('1°F')
  })

  it('reads at dew point at 0 and for a pair that rounds below it, never a negative spread', () => {
    expect(spreadWords(0)).toBe('at dew point')
    expect(spreadWords(0.4)).toBe('at dew point')
    expect(spreadWords(-1.8)).toBe('at dew point')
  })

  it('is an em dash for a gap', () => {
    expect(spreadWords(null)).toBe('—')
  })
})
