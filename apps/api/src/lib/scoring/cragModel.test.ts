import { describe, it, expect } from 'vitest'
import {
  SNOW_DRYNESS_CAP,
  dayRepresentative,
  evaluateCragA,
  evaluateWallA,
  frictionFactorA,
  rockLevelA,
  scoreA,
  shelterScale,
} from './cragModel.js'
import type { HourlyConditions, WeatherHour } from './hourlyConditions.js'

const HOUR_MS = 3_600_000
const START = Date.parse('2026-10-01T07:00:00Z') // local midnight at UTC-7
const LAT = 36.13
const LON = -115.43

/** A mild, dry, still series; `over` edits individual hours by index. */
function series(n: number, over: (i: number, h: WeatherHour) => Partial<WeatherHour> = () => ({})): WeatherHour[] {
  return Array.from({ length: n }, (_, i) => {
    const lh = i % 24
    const base: WeatherHour = {
      valid_at: new Date(START + i * HOUR_MS).toISOString(),
      air_temp_c: 12 + 4 * Math.cos((2 * Math.PI * (lh - 15)) / 24),
      dewpoint_c: 0,
      wind_kmh: 8,
      cloud_pct: 10,
      shortwave_wm2: lh > 6 && lh < 19 ? 700 * Math.sin((Math.PI * (lh - 6)) / 13) : 0,
      precip_mm: 0,
    }
    return { ...base, ...over(i, base) }
  })
}

const crag = (hours: WeatherHour[], rockType: 'granite' | 'sandstone_eolian' = 'granite') =>
  evaluateCragA(hours, { rockType, lat: LAT, lon: LON })

describe('frictionFactorA', () => {
  it('is 1 on a cool dry day with the rock well above its dew point', () => {
    expect(frictionFactorA(12, 12, 0)).toBeCloseTo(1, 6)
  })

  it('falls with heat, humidity and cold, and is 0 at the dew point', () => {
    expect(frictionFactorA(30, 30, 0)!).toBeLessThan(0.31)
    expect(frictionFactorA(25, 20, 20)!).toBeLessThan(0.6)
    expect(frictionFactorA(-10, -10, -20)!).toBeLessThan(0.5)
    expect(frictionFactorA(10, 12, 10)).toBe(0)
  })

  it('withholds rather than defaulting a missing input', () => {
    expect(frictionFactorA(null, 12, 0)).toBeNull()
    expect(frictionFactorA(12, null, 0)).toBeNull()
    expect(frictionFactorA(12, 12, null)).toBeNull()
  })
})

describe('scoreA', () => {
  it('is 100 × dryness^0.55 × friction, with no exponent on friction', () => {
    expect(scoreA(1, 0.5)).toBe(50)
    expect(scoreA(0.25, 1)).toBe(Math.round(100 * Math.pow(0.25, 0.55)))
    expect(scoreA(null, 1)).toBeNull()
    expect(scoreA(1, null)).toBeNull()
  })
})

describe('shelterScale', () => {
  it('only shelters a wall overhanging by 5° or more, and never below 10%', () => {
    expect(shelterScale(0)).toBe(1)
    expect(shelterScale(30)).toBe(1)
    expect(shelterScale(-4)).toBe(1)
    expect(shelterScale(-15)).toBeCloseTo(0.5)
    expect(shelterScale(-60)).toBe(0.1)
  })
})

describe('rockLevelA', () => {
  it('is dry only at full dryness and wet below the rock type’s MIN share', () => {
    expect(rockLevelA(1, 'granite')).toBe('dry')
    expect(rockLevelA(0.5, 'granite')).toBe('drying')
    expect(rockLevelA(0, 'granite')).toBe('wet')
    expect(rockLevelA(null, 'granite')).toBeNull()
  })
})

describe('evaluateCragA — the drying clock', () => {
  it('treats the start of the series as soaked and dries from there', () => {
    const out = crag(series(96))
    expect(out[0]!.diagnostics.wetness_factor).toBe(0)
    expect(out[95]!.diagnostics.wetness_factor).toBe(1)
    expect(out[95]!.rock?.level).toBe('dry')
  })

  it('reads drizzle (0.1 mm) as wet rock — v2 kept drying through it', () => {
    const out = crag(series(144, (i) => (i === 130 ? { precip_mm: 0.1 } : {})))
    expect(out[129]!.diagnostics.wetness_factor).toBe(1)
    expect(out[130]!.diagnostics.wetness_factor).toBe(0)
    expect(out[130]!.score).toBe(0)
  })

  it('a small shower after a big storm does not erase the big soak', () => {
    // 20 mm over the first night, then a 0.2 mm shower two days later.
    const big = (i: number) => (i >= 24 && i < 28 ? { precip_mm: 5 } : i === 72 ? { precip_mm: 0.2 } : {})
    const withShower = crag(series(120, (i) => big(i)), 'sandstone_eolian')
    const bigOnly = crag(series(120, (i) => (i >= 24 && i < 28 ? { precip_mm: 5 } : {})), 'sandstone_eolian')
    // The shower can only make it wetter, never drier than the big storm alone.
    for (let i = 72; i < 120; i++) {
      expect(withShower[i]!.diagnostics.wetness_factor!).toBeLessThanOrEqual(bigOnly[i]!.diagnostics.wetness_factor!)
    }
  })

  it('withholds an hour of unknown rain and every hour after it until a full window has dried', () => {
    const out = crag(series(192, (i) => (i === 120 ? { precip_mm: null } : {})))
    expect(out[119]!.score).not.toBeNull()
    expect(out[120]!.score).toBeNull()
    expect(out[121]!.score).toBeNull()
    expect(out[191]!.score).not.toBeNull()
  })

  it('lets snow lie and caps dryness while it does', () => {
    const cold = series(96, (i) =>
      i >= 48 && i < 52 ? { precip_mm: 3, air_temp_c: -3 } : i >= 52 ? { air_temp_c: -3, shortwave_wm2: 0 } : {},
    )
    const out = crag(cold)
    expect(out[90]!.diagnostics.wetness_factor!).toBeLessThanOrEqual(SNOW_DRYNESS_CAP)
  })
})

describe('evaluateWallA', () => {
  const wall = (cliffAngleDeg: number) => ({ lat: LAT, lon: LON, aspectDeg: 180, cliffAngleDeg })

  it('keeps an overhang dry through drizzle an open wall gets wet in', () => {
    const hours = series(96, (i) => (i === 80 ? { precip_mm: 0.3 } : {}))
    const open = evaluateWallA(hours, { rockType: 'granite', wall: wall(0) })
    const roof = evaluateWallA(hours, { rockType: 'granite', wall: wall(-30) })
    expect(open[80]!.diagnostics.wetness_factor).toBe(0)
    expect(roof[80]!.diagnostics.wetness_factor).toBe(1)
  })

  it('scores the wall it is handed, not the crag', () => {
    // A north wall in the same weather dries on its own clock, not the eight-wall median.
    const hours = series(144, (i) => (i === 100 ? { precip_mm: 2 } : {}))
    const north = evaluateWallA(hours, { rockType: 'sandstone_eolian', wall: { ...wall(0), aspectDeg: 0 } })
    const whole = crag(hours, 'sandstone_eolian')
    expect(north.slice(100).map((h) => h.diagnostics.wetness_factor)).not.toEqual(
      whole.slice(100).map((h) => h.diagnostics.wetness_factor),
    )
  })
})

describe('dayRepresentative', () => {
  const OFFSET = -7 * 3600
  const at = (lh: number, score: number | null): HourlyConditions =>
    ({ valid_at: new Date(START + lh * HOUR_MS).toISOString(), score }) as HourlyConditions

  it('is the worst hour of the best three-hour run between 8 am and 6 pm', () => {
    const hours = [at(6, 100), at(7, 100), at(8, 90), at(9, 40), at(10, 70), at(11, 80), at(12, 75), at(13, 30)]
    expect(dayRepresentative(hours, OFFSET)?.score).toBe(70)
  })

  it('does not let one mild morning hour carry the day', () => {
    const hours = [at(8, 95), at(9, 30), at(10, 20), at(11, 20)]
    expect(dayRepresentative(hours, OFFSET)?.score).toBe(20)
  })

  it('skips a run containing an unscored hour, and is null when none qualifies', () => {
    expect(dayRepresentative([at(8, 90), at(9, null), at(10, 90)], OFFSET)).toBeNull()
    expect(dayRepresentative([at(8, 90), at(10, 90), at(11, 90)], OFFSET)).toBeNull()
  })
})
