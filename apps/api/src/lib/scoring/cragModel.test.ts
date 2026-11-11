import { describe, it, expect } from 'vitest'
import { SCORE_MODEL_FACTS, fToC, sunWallsFor, type RockType, type SunWall } from '@weatherteam6/types'
import { RAIN_WINDOW } from '../weather/rainMedian.js'
import { RED_WING_ONE_PM, redWing20261019 } from './redWing20261019.fixture.js'
import {
  DAY_FIRST_HOUR,
  DAY_LAST_HOUR,
  DAY_RUN_HOURS,
  DEW_START_C,
  FALLING_RAIN_MM,
  FULL_SOAK_IN,
  HEAT_SCALE_C,
  HEAT_START_C,
  CONDENSATION_FLOOR,
  SNOW_DRYNESS_CAP,
  condensationA,
  dayRepresentative,
  evaluateCragA,
  evaluateWallA,
  frictionFactorA,
  frictionPenaltiesA,
  heldBackBy,
  SUN_HEAT_ALLOWANCE_C,
  rockLevelA,
  scoreA,
  shelterScale,
  sunWarmingC,
} from './cragModel.js'
import { CONDENSATION_CLEAR_MARGIN_C, dryingWindowHours, type HourlyConditions, type WeatherHour } from './hourlyConditions.js'
import { DEFAULT_WINDOW_MIN_SCORE } from '../runs/hourlyReadings.js'

describe('SCORE_MODEL_FACTS', () => {
  it('states the rules the model actually runs on', () => {
    expect(fToC(SCORE_MODEL_FACTS.dewStartF)).toBeCloseTo(DEW_START_C, 9)
    expect(SCORE_MODEL_FACTS.condensationClearMarginC).toBe(CONDENSATION_CLEAR_MARGIN_C)
    expect(SCORE_MODEL_FACTS.condensationMaxCut).toBe(1 - CONDENSATION_FLOOR)
    expect(SCORE_MODEL_FACTS.dayRunHours).toBe(DAY_RUN_HOURS)
    expect(SCORE_MODEL_FACTS.dayFirstHour).toBe(DAY_FIRST_HOUR)
    expect(SCORE_MODEL_FACTS.dayLastHour).toBe(DAY_LAST_HOUR)
    expect(SCORE_MODEL_FACTS.goodHoursMinScore).toBe(DEFAULT_WINDOW_MIN_SCORE)
    expect(SCORE_MODEL_FACTS.tempFadeScaleF).toBeCloseTo((HEAT_SCALE_C * 9) / 5, 9)
    expect(SCORE_MODEL_FACTS.fullSoakIn).toBe(FULL_SOAK_IN)
    expect(SCORE_MODEL_FACTS.fallingRainInPerHour).toBeCloseTo(FALLING_RAIN_MM / 25.4, 2)
    expect(SCORE_MODEL_FACTS.rainLeadHours).toBe(RAIN_WINDOW.after)
  })
})

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

const crag = (hours: WeatherHour[], rockType: RockType = 'granite') =>
  evaluateCragA(hours, { rockType, lat: LAT, lon: LON })

describe('frictionFactorA', () => {
  it('is 1 on a cool dry day with the rock well above its dew point', () => {
    expect(frictionFactorA(12, 12, 0)).toBeCloseTo(1, 6)
  })

  it('falls with heat, humidity and cold, and is halved, never zeroed, at the dew point', () => {
    expect(frictionFactorA(30, 30, 0)!).toBeLessThan(0.31)
    expect(frictionFactorA(25, 20, 20)!).toBeLessThan(0.6)
    expect(frictionFactorA(-10, -10, -20)!).toBeLessThan(0.5)
    expect(frictionFactorA(10, 12, 10)).toBe(CONDENSATION_FLOOR)
    expect(frictionFactorA(5, 12, 10)).toBe(CONDENSATION_FLOOR)
  })

  it('keeps its own 30–60 °F range when the reader has none', () => {
    // 60 °F is 15.56 °C: just under it is full grip, a degree over is not.
    expect(frictionFactorA(20, 15.5, 0)).toBeCloseTo(1, 6)
    expect(frictionFactorA(20, 16.6, 0)!).toBeLessThan(1)
    // 30 °F is -1.11 °C.
    expect(frictionFactorA(20, -1, -20)).toBeCloseTo(1, 6)
    expect(frictionFactorA(20, -2.2, -20)!).toBeLessThan(1)
  })

  it('moves the heat and cold edges to the reader’s range', () => {
    const warm = { lowC: -1.11, highC: 26.7 } // 30–80 °F
    expect(frictionFactorA(30, 24, 0, warm)).toBeCloseTo(1, 6)
    expect(frictionFactorA(30, 24, 0)!).toBeLessThan(0.6)
    const cold = { lowC: -17.8, highC: 10 } // 0–50 °F
    expect(frictionFactorA(0, -10, -20, cold)).toBeCloseTo(1, 6)
    expect(frictionFactorA(20, 15, 0, cold)!).toBeLessThan(1)
  })

  it('withholds rather than defaulting a missing input', () => {
    expect(frictionFactorA(null, 12, 0)).toBeNull()
    expect(frictionFactorA(12, null, 0)).toBeNull()
    expect(frictionFactorA(12, 12, null)).toBeNull()
  })
})

describe('frictionPenaltiesA — sun on the wall (#537)', () => {
  // °F in, the heat or cold penalty out. Mass well clear of the dew point, so only heat and cold move.
  const dF = (f: number) => (f * 5) / 9
  const heat = (airF: number, sunF: number, range?: { lowC: number; highC: number }) =>
    frictionPenaltiesA(30, fToC(airF), -20, range, dF(sunF))!.heat
  const cold = (airF: number, sunF: number) => frictionPenaltiesA(30, fToC(airF), -20, undefined, dF(sunF))!.cold
  const airOnly = (airF: number) => Math.exp(-Math.max(0, fToC(airF) - HEAT_START_C) / HEAT_SCALE_C)

  it('prices the issue’s live rows against the sunlit edge, 15 °F above the air’s', () => {
    expect(SUN_HEAT_ALLOWANCE_C).toBeCloseTo(dF(15), 9)
    // Red Wing 11/6 1 PM: 45 °F air + 41 °F sun is 86 °F rock, 11 °F past 75 °F. It read 0.30 as 86 °F air.
    expect(heat(45, 41)).toBeCloseTo(Math.exp(-dF(11) / HEAT_SCALE_C), 9)
    expect(heat(45, 41)).toBeGreaterThan(0.55)
    expect(heat(45, 41)).toBeLessThan(0.65)
    // Chattanooga: 67 °F air + 50 °F sun is 117 °F rock. Still bad.
    expect(heat(67, 50)).toBeLessThan(0.2)
  })

  it('leaves a shaded wall exactly as the air reads it, walked in tenths across the air’s edge', () => {
    for (let f = 50; f <= 100; f += 0.1) expect(heat(f, 0)).toBeCloseTo(airOnly(f), 12)
  })

  it('takes the air’s excess when the sun is under the allowance, however hot the air', () => {
    // 90 °F air with 14.9 °F of sun: the rock's 104.9 °F is under 90 + 15, so the air decides.
    expect(heat(90, 14.9)).toBeCloseTo(airOnly(90), 12)
    expect(heat(90, 15)).toBeCloseTo(airOnly(90), 12)
    expect(heat(90, 15.5)).toBeLessThan(airOnly(90))
  })

  it('does not step: rock walked in tenths past 75 °F under cool air', () => {
    // 45 °F air, sun from 29 °F (74 °F rock) to 31 °F (76 °F rock).
    let previous = heat(45, 29)
    expect(previous).toBeCloseTo(1, 9)
    expect(heat(45, 30)).toBeCloseTo(1, 9)
    for (let s = 29.1; s <= 31; s += 0.1) {
      const h = heat(45, s)
      expect(h).toBeLessThanOrEqual(previous)
      expect(previous - h).toBeLessThan(0.01)
      previous = h
    }
    expect(previous).toBeLessThan(1)
  })

  it('moves the sunlit edge with the reader’s heat edge', () => {
    const warm = { lowC: fToC(30), highC: fToC(70) } // sunlit edge 85 °F
    expect(heat(50, 35, warm)).toBeCloseTo(1, 9)
    expect(heat(50, 36, warm)).toBeLessThan(1)
    expect(heat(50, 26)).toBeLessThan(1)
  })

  it('keeps the cold side in full: sun warms a cold wall by all of its warming', () => {
    // 15 °F air + 15 °F sun is 30 °F rock, the cold edge.
    expect(cold(15, 15)).toBeCloseTo(1, 9)
    expect(cold(15, 0)).toBeCloseTo(Math.exp(-dF(15) / HEAT_SCALE_C), 9)
  })
})

describe('condensationA', () => {
  it('takes the median wall, and never less than CONDENSATION_FLOOR', () => {
    // Mass 1.5 °C over the dew point on a wall at air temperature: three quarters of the clear margin.
    expect(condensationA(11.5, 10, [0])).toBeCloseTo(0.75, 10)
    // Five walls the sun lifts past the clear margin outvote three in shade, and not the other way round.
    expect(condensationA(10, 10, [3, 3, 3, 3, 3, 0, 0, 0])).toBe(1)
    expect(condensationA(10, 10, [3, 3, 3, 0, 0, 0, 0, 0])).toBe(CONDENSATION_FLOOR)
    // Below the dew point on every wall: halved, never zeroed.
    expect(condensationA(5, 10, [0, -1])).toBe(CONDENSATION_FLOOR)
  })

  it('does not step: walked in tenths past both edges', () => {
    let prev = condensationA(10, 10, [-1])!
    for (let k = -10; k <= 30; k++) {
      const f = condensationA(10, 10, [k / 10])!
      expect(f).toBeGreaterThanOrEqual(prev)
      expect(f - prev).toBeLessThan(0.051)
      prev = f
    }
    expect(prev).toBe(1)
  })

  it('scores the median wall’s margin, so the published margin is the one it read (#444 review)', () => {
    // Middle walls at +1 and +3 °C: the median margin is 2 °C, clear — not the 0.75 a median of factors gives.
    expect(condensationA(10, 10, [1, 1, 1, 1, 3, 3, 3, 3])).toBe(1)
    // Middle walls at −0.5 and +1.5: margin +0.5, a quarter of the clear margin, floored.
    expect(condensationA(10, 10, [-0.5, -0.5, -0.5, -0.5, 1.5, 1.5, 1.5, 1.5])).toBe(CONDENSATION_FLOOR)
  })

  it('withholds when any wall is missing', () => {
    expect(condensationA(10, 8, [0, null])).toBeNull()
    expect(condensationA(10, 8, [0, NaN])).toBeNull()
    expect(condensationA(10, 8, [])).toBeNull()
  })

  it('lets the sun on Crag A’s walls clear rock whose mass sits at the dew point', () => {
    // Dew point held just over the rock mass (a constructed case: above the air at night),
    // so the mass alone reads condensing all day.
    const muggy = series(6 * 24, () => ({ dewpoint_c: 13 }))
    const out = crag(muggy)
    const cond = (i: number) => out[i]!.diagnostics.penalties!.condensation
    const night = 4 * 24 + 4
    const afternoon = 4 * 24 + 14
    expect(out[afternoon]!.diagnostics.t_mass_c! - 13).toBeLessThan(0)
    expect(cond(night)).toBe(CONDENSATION_FLOOR)
    expect(cond(afternoon)).toBeGreaterThan(CONDENSATION_FLOOR)
    // The published margin and flag are the ones the score read, not the mass's.
    expect(out[night]!.condensation_margin_c!).toBeLessThan(0)
    expect(out[night]!.friction?.condensing).toBe(true)
    expect(out[afternoon]!.condensation_margin_c!).toBeGreaterThan(0)
    expect(out[afternoon]!.friction?.condensing).toBe(false)
  })

  it('adds the sun and nothing else: a warming morning does not chill the rock below its mass (#534)', () => {
    // Overcast, no sun at all, air swinging 16 °C a day. The lagged surface trails the air
    // all morning, so `T_surface − air` would put the rock below its own mass.
    const grey = series(6 * 24, (i) => {
      const lh = i % 24
      return { air_temp_c: 12 + 8 * Math.cos((2 * Math.PI * (lh - 15)) / 24), shortwave_wm2: 0, cloud_pct: 100, dewpoint_c: 3 }
    })
    const out = crag(grey)
    const morning = 4 * 24 + 10
    const h = out[morning]!
    expect(h.t_surface_c!).toBeLessThan(grey[morning]!.air_temp_c! - 0.5)
    for (const x of out.slice(4 * 24)) {
      expect(x.condensation_margin_c!).toBeCloseTo(x.diagnostics.t_mass_c! - 3, 10)
    }
  })

  it('never reads a wall below its mass: the gain only lifts it, sunny or not (#534)', () => {
    const out = crag(series(6 * 24, () => ({ dewpoint_c: 8 })))
    for (const x of out.slice(4 * 24)) {
      expect(x.condensation_margin_c!).toBeGreaterThanOrEqual(x.diagnostics.t_mass_c! - 8 - 1e-9)
    }
    // The published gain is the median wall's, the one the margin read, not the horizontal one.
    for (const x of out.slice(4 * 24)) {
      expect(x.condensation_margin_c!).toBeCloseTo(x.diagnostics.t_mass_c! + x.diagnostics.solar_gain_c! - 8, 10)
    }
    // And the sun still lifts it: early afternoon is clear of the mass alone.
    const afternoon = out[4 * 24 + 14]!
    expect(afternoon.condensation_margin_c!).toBeGreaterThan(afternoon.diagnostics.t_mass_c! - 8 + 1)
  })

  it('publishes Wall A’s margin as T_mass + that wall’s lagged gain − dew', () => {
    const hours = series(6 * 24, () => ({ dewpoint_c: 8 }))
    const out = evaluateWallA(hours, { rockType: 'granite', wall: { lat: LAT, lon: LON, aspectDeg: 90, cliffAngleDeg: 0 } })
    for (const x of out.slice(4 * 24)) {
      expect(x.condensation_margin_c!).toBeCloseTo(x.diagnostics.t_mass_c! + x.diagnostics.solar_gain_c! - 8, 10)
    }
  })
})

describe('scoreA', () => {
  it('is 100 × dryness × friction, with no exponent on either (#536)', () => {
    expect(scoreA(1, 0.5)).toBe(50)
    // Half the drying window done is dryness 0.25: the score keeps the ramp's curve.
    // Under the old dryness^0.55 this was 47.
    expect(scoreA(0.25, 1)).toBe(25)
    expect(scoreA(0.25, 0.5)).toBe(13)
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

  it('sets the clock back by the rain’s size: drizzle dents, more rain dents further', () => {
    const at = (mm: number) => crag(series(144, (i) => (i === 130 ? { precip_mm: mm } : {})))[130]!
    // v2 kept drying through drizzle; it must still cost something.
    expect(at(0.1).diagnostics.wetness_factor!).toBeLessThan(1)
    expect(at(0.1).diagnostics.wetness_factor!).toBeGreaterThan(0.5)
    expect(at(0.3).diagnostics.wetness_factor!).toBeLessThan(at(0.1).diagnostics.wetness_factor!)
    // Just under the falling-rain line is still a dent, not a zero.
    expect(at(FALLING_RAIN_MM - 0.01).diagnostics.wetness_factor!).toBeGreaterThan(0)
  })

  it('reads rain still falling at FALLING_RAIN_MM as wet, however small the storm', () => {
    const out = crag(series(144, (i) => (i === 130 ? { precip_mm: FALLING_RAIN_MM } : {})))
    expect(out[129]!.diagnostics.wetness_factor).toBe(1)
    expect(out[130]!.diagnostics.wetness_factor).toBe(0)
    expect(out[130]!.score).toBe(0)
    // Once it stops, the small storm's dent is all that is left.
    expect(out[131]!.diagnostics.wetness_factor!).toBeGreaterThan(0.5)
  })

  it('reads rock that breaks when wet as Wet under any rain, and other rock as Drying', () => {
    // Six hours of 0.4 mm/h drizzle, just under the falling-rain line.
    const drizzle = series(144, (i) => (i >= 124 && i < 130 ? { precip_mm: FALLING_RAIN_MM - 0.1 } : {}))
    const arenite = crag(drizzle, 'sandstone_quartz_arenite')
    const granite = crag(drizzle, 'granite')
    for (let i = 124; i < 130; i++) expect(arenite[i]!.rock?.level).toBe('wet')
    // The dent is the score's; only the word changed.
    expect(arenite[129]!.score!).toBeGreaterThan(0)
    expect(arenite[130]!.rock?.level).toBe('drying')
    expect(granite[127]!.rock?.level).toBe('drying')
  })

  it('reaches zero only on a full soak', () => {
    // Fragile rock dries one hour per hour, so the hour after the rain shows the dent itself.
    const after = (mm: number) =>
      crag(series(144, (i) => (i >= 126 && i < 130 ? { precip_mm: mm } : {})), 'sandstone_quartz_arenite')[130]!
    // 0.4" over four hours needs the whole 48-hour window: one hour on, (1/48)².
    expect(after(2.54).diagnostics.wetness_factor!).toBeLessThan(0.001)
    // Four hours of mist needs a fraction of it.
    expect(after(0.1).diagnostics.wetness_factor!).toBeGreaterThan(0.5)
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

  // Arenite breaks when wet, so it dries exactly one hour per hour and the sums below are exact.
  const soak = (i: number) => (i >= 100 && i < 104 ? { precip_mm: 5 } : {})
  const dry = (out: HourlyConditions[], i: number) => out[i]!.diagnostics.wetness_factor!

  it('adds a trace after a soak to what is left, and keeps the drying already done (2026-11-09)', () => {
    // 20 mm, seventeen dry hours, then 0.3 mm in the eighteenth.
    const out = crag(series(160, (i) => (i === 121 ? { precip_mm: 0.3 } : soak(i))), 'sandstone_quartz_arenite')
    // 17 of 48 hours done: (17/48)².
    expect(dry(out, 120)).toBeCloseTo(0.1254, 3)
    // 31 h left is 4.24 mm of the 10.16 mm full soak; 4.54 mm needs 32.1 h: (15.9/48)².
    // The storm total (20.3 mm) restarted the whole window here and read 0.
    expect(dry(out, 121)).toBeCloseTo(0.11, 2)
  })

  it('has no step in how long after a soak the next rain falls', () => {
    // The same 0.3 mm, one to sixty hours after the soak: the reading in its hour.
    const atTrace = Array.from({ length: 60 }, (_, k) => {
      const at = 104 + k
      return dry(crag(series(170, (i) => (i === at ? { precip_mm: 0.3 } : soak(i))), 'sandstone_quartz_arenite'), at)
    })
    for (let k = 1; k < atTrace.length; k++) {
      expect(atTrace[k]!).toBeGreaterThanOrEqual(atTrace[k - 1]!)
      // An hour's drying is at most 2/48 of the squared ramp; a 24-hour storm rule jumped 0.2 here.
      expect(atTrace[k]! - atTrace[k - 1]!).toBeLessThan(0.05)
    }
    // Once the soak has dried, the trace costs what it costs on dry rock.
    const alone = dry(crag(series(170, (i) => (i === 163 ? { precip_mm: 0.3 } : {})), 'sandstone_quartz_arenite'), 163)
    expect(atTrace[59]!).toBeCloseTo(alone, 9)
  })

  it('adds rain more than a day after a soak, even when it is the smaller of the two', () => {
    // 20 mm on a 96-hour rock, then 0.4 mm thirty hours on: less than what is left, and still more water.
    const both = crag(series(260, (i) => (i === 134 ? { precip_mm: 0.4 } : soak(i))), 'sandstone_eolian')
    const soakOnly = crag(series(260, soak), 'sandstone_eolian')
    expect(dry(soakOnly, 133)).toBe(dry(both, 133))
    // The wet hour itself earns no drying, which alone puts it one hour behind. The added
    // water is 2.7 h more (66 h left is 4.8 mm; 5.2 mm needs 68.7 h), so it runs over two behind.
    for (let i = 136; i < 190; i++) expect(dry(both, i)).toBeLessThan(dry(soakOnly, i - 2))
    // It dries later, not never.
    expect(dry(both, 259)).toBe(1)
  })

  it('withholds an hour of unknown rain and every hour after it until a full window has dried', () => {
    const out = crag(series(192, (i) => (i === 120 ? { precip_mm: null } : {})))
    expect(out[119]!.score).not.toBeNull()
    expect(out[120]!.score).toBeNull()
    expect(out[121]!.score).toBeNull()
    expect(out[191]!.score).not.toBeNull()
  })

  it('scores friction against the range it is handed', () => {
    // A hot, dry series: 30 °C (86 °F) afternoons.
    // Hour 111 is 15:00 on day 5, once the rock mass has the history it needs.
    const hot = series(120, (_, h) => ({ air_temp_c: (h.air_temp_c ?? 0) + 18 }))
    const own = crag(hot)
    const warmLover = evaluateCragA(hot, { rockType: 'granite', lat: LAT, lon: LON, range: { lowC: -1.11, highC: 29.4 } })
    expect(own[111]!.diagnostics.friction_factor).not.toBeNull()
    expect(warmLover[111]!.diagnostics.friction_factor!).toBeGreaterThan(own[111]!.diagnostics.friction_factor!)
    expect(warmLover[111]!.score!).toBeGreaterThan(own[111]!.score!)
  })

  it('never dries fragile rock faster than the clock on the wall (F17)', () => {
    // Half an inch over the first night, then sunny, dry days.
    const wet = (i: number) => (i >= 24 && i < 29 ? { precip_mm: 2.54 } : {})
    // Both have a 48-hour window; only the arenite breaks when wet.
    const arenite = crag(series(120, wet), 'sandstone_quartz_arenite')
    const arkose = crag(series(120, wet), 'sandstone_arkose')
    // 24 elapsed hours of a 48-hour window can leave the rock no drier than (24/48)².
    expect(arenite[28 + 24]!.diagnostics.wetness_factor!).toBeLessThanOrEqual(0.25)
    // The weather's speed-up still applies to a rock that only softens.
    expect(arkose[28 + 24]!.diagnostics.wetness_factor!).toBeGreaterThan(0.25)
    const eolian = crag(series(120, wet), 'sandstone_eolian')
    expect(eolian[28 + 48]!.diagnostics.wetness_factor!).toBeLessThanOrEqual(0.25)
  })

  it('reads any rock dry once its full window of real time has passed, however damp and still (2026-11-02)', () => {
    // A full soak, then cold, overcast, still, near-saturated days that would barely dry anything.
    const gloom = series(160, (i) =>
      i >= 24 && i < 29
        ? { precip_mm: 5 }
        : i >= 29
          ? { air_temp_c: 4, dewpoint_c: 3.5, wind_kmh: 0, cloud_pct: 100, shortwave_wm2: 0 }
          : {},
    )
    for (const rock of ['granite', 'sandstone_quartz_arenite', 'unknown'] as const) {
      const max = dryingWindowHours(rock, 0).maxHours
      const out = crag(gloom, rock)
      expect(out[28 + max - 1]!.diagnostics.wetness_factor!).toBeLessThan(1)
      expect(out[28 + max]!.diagnostics.wetness_factor).toBe(1)
    }
  })

  it('lets snow lie and caps dryness while it does', () => {
    const cold = series(96, (i) =>
      i >= 48 && i < 52 ? { precip_mm: 3, air_temp_c: -3 } : i >= 52 ? { air_temp_c: -3, shortwave_wm2: 0 } : {},
    )
    const out = crag(cold)
    expect(out[90]!.diagnostics.wetness_factor!).toBeLessThanOrEqual(SNOW_DRYNESS_CAP)
  })
})

describe('evaluateCragA — rock in sun and in shade', () => {
  const day4 = (localHour: number) => 4 * 24 + localHour

  it('splits the sunny side from the shaded one on a clear afternoon', () => {
    const pair = crag(series(6 * 24))[day4(15)]!.rock_sun_shade!
    expect(pair.sun_c - pair.shade_c).toBeGreaterThan(5)
  })

  it('reads every face alike at night', () => {
    const pair = crag(series(6 * 24))[day4(2)]!.rock_sun_shade!
    expect(pair.sun_c - pair.shade_c).toBeLessThan(0.5)
  })

  it('withholds the pair when the sun was not measured, rather than reading a sunless afternoon', () => {
    const hours = series(6 * 24, (i) => (i === day4(15) ? { shortwave_wm2: null } : {}))
    expect(crag(hours)[day4(15)]!.rock_sun_shade).toBeNull()
  })
})

describe('evaluateWallA', () => {
  const wall = (cliffAngleDeg: number) => ({ lat: LAT, lon: LON, aspectDeg: 180, cliffAngleDeg })

  it('keeps an overhang dry through drizzle an open wall gets wet in', () => {
    const hours = series(96, (i) => (i === 80 ? { precip_mm: 0.3 } : {}))
    const open = evaluateWallA(hours, { rockType: 'granite', wall: wall(0) })
    const roof = evaluateWallA(hours, { rockType: 'granite', wall: wall(-30) })
    expect(open[80]!.diagnostics.wetness_factor!).toBeLessThan(1)
    expect(roof[80]!.diagnostics.wetness_factor).toBe(1)
  })

  it('scores the wall it is handed, not the crag', () => {
    // A north wall in the same weather dries on its own clock, not the eight-wall median.
    // Granite, rained on at 10am: rock that breaks when wet dries at elapsed time on every
    // wall alike, and so does any rock overnight, when no wall dries faster than that.
    const hours = series(144, (i) => (i === 106 ? { precip_mm: 5 } : {}))
    const north = evaluateWallA(hours, { rockType: 'granite', wall: { ...wall(0), aspectDeg: 0 } })
    const whole = crag(hours, 'granite')
    expect(north.slice(106).map((h) => h.diagnostics.wetness_factor)).not.toEqual(
      whole.slice(106).map((h) => h.diagnostics.wetness_factor),
    )
  })
})

describe('evaluateWallA — sun on the wall', () => {
  const south = { lat: LAT, lon: LON, aspectDeg: 180, cliffAngleDeg: 0 }
  const day4 = (localHour: number) => 4 * 24 + localHour
  const heatOf = (h: HourlyConditions) => h.diagnostics.penalties!.heat
  const coldOf = (h: HourlyConditions) => h.diagnostics.penalties!.cold
  const warm = series(6 * 24, (_, h) => ({ air_temp_c: h.air_temp_c! + 10 }))

  it('charges a sunlit wall heat the same wall under trees does not pay', () => {
    const lit = evaluateWallA(warm, { rockType: 'granite', wall: south })[day4(13)]!
    const trees = evaluateWallA(warm, { rockType: 'granite', wall: south, treeShaded: true })[day4(13)]!
    expect(heatOf(lit)).toBeLessThan(heatOf(trees) - 0.1)
    // Under trees the wall reads air temperature, exactly as Crag A does.
    const air = warm[day4(13)]!.air_temp_c!
    expect(heatOf(trees)).toBeCloseTo(Math.exp(-Math.max(0, air - HEAT_START_C) / HEAT_SCALE_C), 10)
    expect(lit.score!).toBeLessThan(trees.score!)
  })

  it('warms a cold wall, so a sunny face beats a shaded one in winter air', () => {
    const cold = series(6 * 24, (_, h) => ({ air_temp_c: h.air_temp_c! - 24, dewpoint_c: -20 }))
    const lit = evaluateWallA(cold, { rockType: 'granite', wall: south })[day4(13)]!
    const trees = evaluateWallA(cold, { rockType: 'granite', wall: south, treeShaded: true })[day4(13)]!
    expect(coldOf(lit)).toBeGreaterThan(coldOf(trees) + 0.1)
    expect(lit.score!).toBeGreaterThan(trees.score!)
  })

  it('fades after sunset, and reads none on a face the sun is behind', () => {
    // The lag carries a little of the afternoon into the night, as T_surface's does.
    expect(sunWarmingC(warm, south)[day4(2)]!).toBeLessThan(0.5)
    const north = sunWarmingC(warm, { ...south, aspectDeg: 0 })
    expect(north[day4(13)]).toBe(0)
  })

  it('takes no warming where the skyline hides the sun', () => {
    const walled: SunWall = { name: 'Pit', aspect_deg: 180, height_m: 10, foot: { lat: LAT, lon: LON }, horizon_deg: Array.from({ length: 360 }, () => 89) }
    expect(sunWarmingC(warm, south, walled).every((c) => c === 0)).toBe(true)
  })

  it('warms little under cloud: the cloud is already in the shortwave', () => {
    const overcast = warm.map((h) => ({ ...h, shortwave_wm2: h.shortwave_wm2! * 0.15, cloud_pct: 100 }))
    const clear = sunWarmingC(warm, south)[day4(13)]!
    expect(clear).toBeGreaterThan(5)
    expect(sunWarmingC(overcast, south)[day4(13)]!).toBeLessThan(clear * 0.15)
  })

  it('withholds an hour whose sun was not measured, under trees too', () => {
    const gap = warm.map((h, i) => (i === day4(13) ? { ...h, shortwave_wm2: null } : h))
    expect(sunWarmingC(gap, south)[day4(13)]).toBeNull()
    expect(sunWarmingC(gap, south, null, true)[day4(13)]).toBe(0)
    expect(evaluateWallA(gap, { rockType: 'granite', wall: south })[day4(13)]!.score).toBeNull()
    // Trees take the heat term's sun away, but condensation still reads the wall's modelled sun.
    expect(evaluateWallA(gap, { rockType: 'granite', wall: south, treeShaded: true })[day4(13)]!.score).toBeNull()
  })

  // `redWing20261019.fixture.ts` says where the day comes from. Winter Wall's skyline is the real lidar one.
  it('Red Wing, 2026-10-19: Winter Wall in sun is too hot, the shaded side is good', () => {
    const walls = sunWallsFor('red-wing')!.walls
    const winter = walls.find((w) => w.name === 'Winter Wall')!
    const roof = walls.find((w) => w.name === 'Large Roof Area')!
    const { lat, lon } = winter.foot
    const hours = redWing20261019(lat, lon)
    const orient = (w: SunWall) => ({ lat: w.foot.lat, lon: w.foot.lon, aspectDeg: w.aspect_deg, cliffAngleDeg: 0 })
    const onePm = RED_WING_ONE_PM
    const winterWall = evaluateWallA(hours, { rockType: 'carbonate_cherty', wall: orient(winter), skyline: winter })[onePm]!
    const shaded = evaluateWallA(hours, { rockType: 'carbonate_cherty', wall: orient(roof), skyline: roof, treeShaded: true })[onePm]!
    const cragA = evaluateCragA(hours, { rockType: 'carbonate_cherty', lat, lon })[onePm]!
    expect(cragA.score).toBeGreaterThanOrEqual(90)
    expect(shaded.score).toBeGreaterThanOrEqual(90)
    expect(winterWall.score!).toBeLessThan(40)
    // #537 raised the sunlit rock's heat edge 15 °F; the hours climbers called unbearable stay
    // under the 'mixed' rung (40) at midday and close to it either side: 11 AM is 51 °F + 43 °F sun.
    const day = evaluateWallA(hours, { rockType: 'carbonate_cherty', wall: orient(winter), skyline: winter })
    const midday = [onePm - 2, onePm - 1, onePm, onePm + 1].map((i) => day[i]!.score!)
    for (const s of midday) expect(s).toBeLessThan(45)
    expect(Math.max(...midday.slice(1))).toBeLessThan(40)
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

  // #401: a perfect morning scored 100 for someone who only climbs after noon.
  it("reads the day from the reader's climbing hours, both ends included", () => {
    const hours = [at(8, 100), at(9, 100), at(10, 100), at(11, 40), at(12, 50), at(13, 60), at(14, 55)]
    expect(dayRepresentative(hours, OFFSET)?.score).toBe(100)
    expect(dayRepresentative(hours, OFFSET, { first: 12, last: 14 })?.score).toBe(50)
    // The last hour counts: 12-14 holds exactly one run, 12-13 none.
    expect(dayRepresentative(hours, OFFSET, { first: 12, last: 13 })).toBeNull()
  })
})

describe('heldBackBy', () => {
  const clear = { wet_rock: 1, condensation: 1, heat: 1, humidity: 1, cold: 1 }

  it('names the penalties most limiting first', () => {
    expect(heldBackBy({ ...clear, humidity: 0.8, heat: 0.6 })).toEqual(['heat', 'humidity'])
  })

  it('names a penalty only when it alone would take a point off a perfect score', () => {
    expect(heldBackBy({ ...clear, cold: 0.996 })).toEqual([])
    expect(heldBackBy({ ...clear, cold: 0.994 })).toEqual(['cold'])
  })

  it('names the largest of several small penalties that together cost a point', () => {
    const small = { wet_rock: 0.997, condensation: 0.996, heat: 0.998, humidity: 0.996, cold: 0.999 }
    expect(heldBackBy(small)).toEqual(['condensation'])
  })

  it('names both of two penalties at zero, rock first', () => {
    expect(heldBackBy({ ...clear, condensation: 0, wet_rock: 0 })).toEqual(['wet_rock', 'condensation'])
  })

  it('is null when the score was not computed', () => {
    expect(heldBackBy(null)).toBeNull()
  })

  it('reads penalties that multiply back to the score on every scored hour', () => {
    // Hot and humid throughout, with a shower once the rock has dried.
    const hours = crag(
      series(144, (i, h) => ({ air_temp_c: h.air_temp_c! + 18, dewpoint_c: 17, ...(i === 130 ? { precip_mm: 1 } : {}) })),
    )
    const named = new Set<string>()
    for (const h of hours) {
      const p = h.diagnostics.penalties
      if (h.score === null) {
        expect(p).toBeNull()
        continue
      }
      expect(p).not.toBeNull()
      const product = p!.wet_rock * p!.condensation * p!.heat * p!.humidity * p!.cold
      expect(Math.round(100 * product)).toBe(h.score)
      expect(heldBackBy(p)!.length > 0).toBe(h.score < 100)
      for (const l of heldBackBy(p) ?? []) named.add(l)
    }
    expect(named).toContain('wet_rock')
    expect(named).toContain('heat')
    expect(named).toContain('humidity')
  })
})
