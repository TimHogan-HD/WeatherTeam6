import { describe, it, expect } from 'vitest'
import {
  CONDENSATION_CLEAR_MARGIN_C,
  DEFAULT_WEIGHTS,
  FRICTION_BANDS,
  SIGNIFICANT_HOURLY_PRECIP_MM,
  WETNESS_RAMP_EXPONENT,
  bestWindow,
  condensationFactor,
  derivedScore,
  dryingWindowHours,
  evaluateHour,
  evaluateHourlyConditions,
  frictionFactor,
  frictionLevel,
  dryingAngleFactor,
  frictionLevelsAtLeast,
  rockLevel,
  rockLevelsAtLeast,
  wetnessFactor,
  type HourConditionsInput,
  type HourlyConditions,
  type WeatherHour,
} from './hourlyConditions.js'
import { MAX_HOURS, MIN_HOURS } from './dryingModel.js'
import {
  MASS_TAU_HOURS,
  saturationVapourPressureKpa,
  surfaceTemperature,
  type WallOrientation,
} from './rockThermal.js'
import { SCORE_BANDS } from '@weatherteam6/types'

/** Dew point for a temperature and relative humidity, by inverting the Magnus form. */
function dewPointC(tempC: number, rhPct: number): number {
  const es = saturationVapourPressureKpa(tempC)!
  const ln = Math.log((es * rhPct) / 100 / 0.6108)
  return (237.3 * ln) / (17.27 - ln)
}

const hour = (over: Partial<HourConditionsInput> = {}): HourConditionsInput => ({
  valid_at: '2026-09-21T13:00:00Z',
  airTempC: 16,
  dewPointC: dewPointC(16, 45),
  windKmh: 8,
  cloudPct: 0,
  shortwaveWm2: 500,
  massTempC: 14,
  effectiveDryHours: 500,
  rockType: 'sandstone',
  cliffAngleDeg: 45,
  ...over,
})

describe('wetnessFactor and the rock reading', () => {
  it('shares one drying table with dryingModel rather than carrying a second copy', () => {
    // `conditionsScore.ts` keeps its own MAX_HOURS, pinned to dryingModel's by a
    // cross-module test. v2 imports the table instead, so there is nothing to
    // pin — this asserts the import is real rather than a lookalike.
    const { minHours, maxHours } = dryingWindowHours('sandstone', 0)
    expect(minHours).toBe(MIN_HOURS.sandstone)
    expect(maxHours).toBe(MAX_HOURS.sandstone)
  })

  it('applies the same 30%-slower-on-a-slab angle factor as dryingModel', () => {
    expect(dryingWindowHours('granite', 90).maxHours).toBeCloseTo(MAX_HOURS.granite * 1.3, 10)
    expect(dryingWindowHours('granite', 45).maxHours).toBeCloseTo(MAX_HOURS.granite * 1.15, 10)
  })

  it('curves upward, which is the #137 finding and not a linear ramp', () => {
    const { maxHours } = dryingWindowHours('sandstone', 0)
    // Halfway through the window a linear ramp would be at 0.5. The concave one
    // is at 0.5^2 = 0.25, because rock strength returns late.
    expect(wetnessFactor(maxHours / 2, 'sandstone', 0)).toBeCloseTo(0.25, 10)
    expect(WETNESS_RAMP_EXPONENT).toBeGreaterThan(1)
  })

  it('pins its endpoints at 0 and 1 so the ramp cannot step at either edge', () => {
    const { maxHours } = dryingWindowHours('limestone', 0)
    expect(wetnessFactor(0, 'limestone', 0)).toBe(0)
    expect(wetnessFactor(maxHours, 'limestone', 0)).toBe(1)
    expect(wetnessFactor(maxHours - 0.001, 'limestone', 0)).toBeGreaterThan(0.999)
    expect(wetnessFactor(maxHours * 10, 'limestone', 0)).toBe(1)
  })

  it('never hands drying credit to a negative clock', () => {
    // An even exponent maps a negative input to a positive share of the curve,
    // which is the guard `conditionsScore` needed for the same reason.
    expect(wetnessFactor(-40, 'sandstone', 0)).toBe(0)
  })

  it('names the level off the same window the factor uses', () => {
    expect(rockLevel(0, 'sandstone', 0)).toBe('wet')
    expect(rockLevel(MIN_HOURS.sandstone - 0.1, 'sandstone', 0)).toBe('wet')
    expect(rockLevel(MIN_HOURS.sandstone, 'sandstone', 0)).toBe('drying')
    expect(rockLevel(MAX_HOURS.sandstone - 0.1, 'sandstone', 0)).toBe('drying')
    expect(rockLevel(MAX_HOURS.sandstone, 'sandstone', 0)).toBe('dry')
  })

  it('withholds rather than reading an unknown rain history as a dry wall', () => {
    expect(wetnessFactor(null, 'sandstone', 45)).toBeNull()
    expect(rockLevel(null, 'sandstone', 45)).toBeNull()
    expect(evaluateHour(hour({ effectiveDryHours: null }), true).rock).toBeNull()
    expect(evaluateHour(hour({ effectiveDryHours: null }), true).score).toBeNull()
  })
})

describe('condensationFactor', () => {
  it('is zero at and below the dew point — the wall is wet, whatever the rain did', () => {
    expect(condensationFactor(0)).toBe(0)
    expect(condensationFactor(-3)).toBe(0)
  })

  it('reaches 1 at the clear margin, linearly, with no step at either end', () => {
    expect(condensationFactor(CONDENSATION_CLEAR_MARGIN_C)).toBe(1)
    expect(condensationFactor(CONDENSATION_CLEAR_MARGIN_C / 2)).toBeCloseTo(0.5, 10)
    expect(condensationFactor(50)).toBe(1)
  })

  it('withholds for an unmeasured margin rather than calling it clear', () => {
    expect(condensationFactor(null)).toBeNull()
    expect(condensationFactor(NaN)).toBeNull()
  })
})

describe('the friction reading', () => {
  it('cannot read better than poor when the wall is below its dew point', () => {
    // The handoff's rule, and it falls out of the physics rather than being
    // legislated: a condensing wall has a condensation factor of 0, and 0 times
    // anything is 0.
    const condensing = evaluateHour(hour({ airTempC: 12, dewPointC: 13, massTempC: 11 }), true)
    expect(condensing.friction!.condensing).toBe(true)
    expect(condensing.friction!.level).toBe('poor')
    expect(condensing.score).toBe(0)
  })

  it('reads a muggy day worse than a dry one at the same air temperature', () => {
    // The ordering the handoff asks for by name. Same air, same sun, same wind
    // — only the moisture differs, and two independent point buckets could not
    // have said this.
    const muggy = evaluateHour(
      hour({ airTempC: 27, dewPointC: dewPointC(27, 85), massTempC: 25, shortwaveWm2: 200 }),
      true,
    )
    const dry = evaluateHour(
      hour({ airTempC: 27, dewPointC: dewPointC(27, 30), massTempC: 25, shortwaveWm2: 200 }),
      true,
    )
    expect(muggy.score!).toBeLessThan(dry.score!)
    expect(muggy.friction!.level).toBe('poor')
  })

  it('multiplies the two mechanisms, so neither compensates for the other', () => {
    expect(frictionFactor(1, 0.5)).toBeCloseTo(0.5, 10)
    expect(frictionFactor(0.5, 1)).toBeCloseTo(0.5, 10)
    expect(frictionFactor(0, 1)).toBe(0)
  })

  it('names levels on the published bands', () => {
    expect(frictionLevel(FRICTION_BANDS.great)).toBe('great')
    expect(frictionLevel(FRICTION_BANDS.great - 0.001)).toBe('good')
    expect(frictionLevel(FRICTION_BANDS.good)).toBe('good')
    expect(frictionLevel(FRICTION_BANDS.fair)).toBe('fair')
    expect(frictionLevel(FRICTION_BANDS.fair - 0.001)).toBe('poor')
  })

  it('withholds the whole reading when a mechanism could not be measured', () => {
    expect(evaluateHour(hour({ massTempC: null }), true).friction).toBeNull()
    expect(evaluateHour(hour({ dewPointC: null }), true).friction).toBeNull()
    // Past a model's shortwave horizon T_surface is null, which takes the
    // radiant term with it. Never degraded to air temperature.
    const beyondHorizon = evaluateHour(hour({ shortwaveWm2: null }), true)
    expect(beyondHorizon.t_surface_c).toBeNull()
    expect(beyondHorizon.friction).toBeNull()
    expect(beyondHorizon.score).toBeNull()
  })

  it('carries the per-hour sun qualification, not a per-location one', () => {
    // Midnight: no sun to catch, so aspect cannot change the answer.
    expect(evaluateHour(hour({ shortwaveWm2: 0 }), true).friction!.qualified).toBe(true)
    // Bright sun: the wall's unknown orientation could have changed it.
    expect(evaluateHour(hour({ shortwaveWm2: 900 }), true).friction!.qualified).toBe(false)
  })
})

describe('the derived score', () => {
  it('is the weighted geometric mean of the two factors and nothing else', () => {
    // Hand-worked: 100 × 0.8^0.55 × 0.5^0.45 = 100 × 0.88450 × 0.73205 = 64.75
    expect(derivedScore(0.8, 0.5)).toBe(65)
    expect(derivedScore(1, 1)).toBe(100)
    expect(derivedScore(0, 1)).toBe(0)
    expect(derivedScore(1, 0)).toBe(0)
  })

  it('has no cap: a perfect day reaches 100 and nothing holds it below', () => {
    expect(derivedScore(1, 1, { wetness: 0.5, friction: 0.5 })).toBe(100)
    expect(derivedScore(1, 1, { wetness: 0.65, friction: 0.35 })).toBe(100)
  })

  it('withholds when a factor is unknown — null is never rendered as 0', () => {
    expect(derivedScore(null, 1)).toBeNull()
    expect(derivedScore(1, null)).toBeNull()
  })

  it('moves with the weights in the direction they name', () => {
    // Wetness-heavy rescues a dry wall in bad friction and punishes the reverse.
    const dryBadFriction = { wetness: 1, friction: 0.3 }
    const wetGoodFriction = { wetness: 0.3, friction: 1 }
    const heavy = { wetness: 0.65, friction: 0.35 }
    expect(derivedScore(dryBadFriction.wetness, dryBadFriction.friction, heavy)!).toBeGreaterThan(
      derivedScore(dryBadFriction.wetness, dryBadFriction.friction, DEFAULT_WEIGHTS)!,
    )
    expect(derivedScore(wetGoodFriction.wetness, wetGoodFriction.friction, heavy)!).toBeLessThan(
      derivedScore(wetGoodFriction.wetness, wetGoodFriction.friction, DEFAULT_WEIGHTS)!,
    )
  })
})

/**
 * **The invariant issue #148 was filed over, ported to the new model.**
 *
 * v1 stepped 6 points of the total at 95 °F from a fifth of a degree no forecast
 * resolves. The walk below is the one `conditionsScore.test.ts` carries, run
 * past both edges of the old band on a model that no longer has bands — the
 * point being that a step can appear anywhere a factor turns a corner, not only
 * where someone drew a line.
 */
describe('continuity across the temperature axis', () => {
  const walk = (shortwaveWm2: number, from: number, to: number): { worst: number; at: number } => {
    let worst = 0
    let at = 0
    let previous: number | null = null
    for (let tenths = from * 10; tenths <= to * 10; tenths++) {
      const c = tenths / 10
      const score = evaluateHour(
        hour({ airTempC: c, dewPointC: dewPointC(c, 45), massTempC: c - 2, shortwaveWm2 }),
        true,
      ).score
      if (score !== null && previous !== null && Math.abs(score - previous) > worst) {
        worst = Math.abs(score - previous)
        at = c
      }
      previous = score
    }
    return { worst, at }
  }

  it.each([
    ['in full sun', 900],
    ['in shade', 0],
  ])('never moves more than rounding forces, %s', (_label, shortwave) => {
    // -20 to 45 °C is the range a climbing location sees. Rounding to a whole
    // score is worth one point; anything above that is a step.
    const { worst } = walk(shortwave, -20, 45)
    // Both bounds matter. The upper one is the invariant; the lower one is what
    // stops this passing because the walk never reached the model at all —
    // `defect-patterns.md` §11, a fixture that cannot touch the line it claims.
    expect(worst).toBeGreaterThan(0)
    expect(worst).toBeLessThanOrEqual(1)
  })

  it('has no step at the old 35 °C band edge, which is where v1 had one', () => {
    const below = evaluateHour(
      hour({ airTempC: 34.9, dewPointC: dewPointC(34.9, 45), massTempC: 32.9 }),
      true,
    ).score!
    const above = evaluateHour(
      hour({ airTempC: 35.1, dewPointC: dewPointC(35.1, 45), massTempC: 33.1 }),
      true,
    ).score!
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1)
  })

  it('slides continuously through the heat rather than being capped or vetoed', () => {
    const at = (c: number): number =>
      evaluateHour(
        hour({ airTempC: c, dewPointC: dewPointC(c, 45), massTempC: c - 2, shortwaveWm2: 900 }),
        true,
      ).score!
    // Strictly decreasing across the whole range that made issue #21, with no
    // plateau — a plateau is what a cap looks like from outside.
    const samples = [20, 25, 30, 35, 40, 45].map(at)
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeLessThan(samples[i - 1]!)
    }
  })

  /** Issue #21's own case, and the acceptance criterion this phase carries. */
  it('reads 104 °F as Rock: dry, Friction: poor, well below where v1 puts it', () => {
    const c = 40
    const result = evaluateHour(
      hour({ airTempC: c, dewPointC: dewPointC(c, 45), massTempC: c - 2, shortwaveWm2: 900 }),
      true,
    )
    expect(result.rock!.level).toBe('dry')
    expect(result.friction!.level).toBe('poor')
    // v1 returns 88 for this input. Anything at or above the "Mostly dry" rung
    // would be the same failure in a new model.
    expect(result.score!).toBeLessThan(SCORE_BANDS.mostlyDry)
  })
})

describe('evaluateHourlyConditions', () => {
  const series = (count: number, over: Partial<WeatherHour> = {}): WeatherHour[] =>
    Array.from({ length: count }, (_, i) => ({
      valid_at: `2026-09-21T${String(i % 24).padStart(2, '0')}:00:00Z`,
      air_temp_c: 16,
      dewpoint_c: dewPointC(16, 45),
      wind_kmh: 8,
      cloud_pct: 0,
      shortwave_wm2: 0,
      precip_mm: 0,
      ...over,
    }))

  it('withholds the friction reading until the series is long enough for T_mass', () => {
    // `massTemperatureC` refuses a series under 2τ, because before that the
    // first sample is most of the answer wearing a multi-day label.
    const short = evaluateHourlyConditions(series(MASS_TAU_HOURS), {
      rockType: 'granite',
      cliffAngleDeg: 0,
    })
    expect(short[short.length - 1]!.diagnostics.t_mass_c).toBeNull()
    expect(short[short.length - 1]!.friction).toBeNull()
    expect(short[short.length - 1]!.score).toBeNull()

    const long = evaluateHourlyConditions(series(2 * MASS_TAU_HOURS + 1), {
      rockType: 'granite',
      cliffAngleDeg: 0,
    })
    expect(long[long.length - 1]!.diagnostics.t_mass_c).not.toBeNull()
    expect(long[long.length - 1]!.friction).not.toBeNull()
  })

  it('resets the drying clock on the hour rain falls, before that hour is scored', () => {
    const hours = series(120)
    hours[100]!.precip_mm = SIGNIFICANT_HOURLY_PRECIP_MM
    const out = evaluateHourlyConditions(hours, { rockType: 'granite', cliffAngleDeg: 0 })
    // An hour it is raining in is a wet wall, whatever it had done beforehand.
    expect(out[100]!.diagnostics.effective_dry_hours).toBe(0)
    expect(out[100]!.rock!.level).toBe('wet')
    expect(out[101]!.diagnostics.effective_dry_hours!).toBeGreaterThan(0)
  })

  it('ignores rain below the hourly threshold rather than resetting on drizzle', () => {
    const hours = series(120)
    hours[100]!.precip_mm = SIGNIFICANT_HOURLY_PRECIP_MM - 0.1
    const out = evaluateHourlyConditions(hours, { rockType: 'granite', cliffAngleDeg: 0 })
    expect(out[100]!.diagnostics.effective_dry_hours!).toBeGreaterThan(0)
  })

  it('accumulates drying at a rate, not by the calendar — the point of Layer 1d', () => {
    const warmDry = evaluateHourlyConditions(
      series(120, { air_temp_c: 25, dewpoint_c: dewPointC(25, 30), wind_kmh: 20 }),
      { rockType: 'sandstone', cliffAngleDeg: 0 },
    )
    const coldDamp = evaluateHourlyConditions(
      series(120, { air_temp_c: 2, dewpoint_c: dewPointC(2, 95), wind_kmh: 2 }),
      { rockType: 'sandstone', cliffAngleDeg: 0 },
    )
    const warmHours = warmDry[119]!.diagnostics.effective_dry_hours!
    const coldHours = coldDamp[119]!.diagnostics.effective_dry_hours!
    expect(warmHours).toBeGreaterThan(coldHours * 5)
    // The same 120 elapsed hours: v1 would have handed both the same clock.
    expect(warmDry[119]!.rock!.level).toBe('dry')
    expect(coldDamp[119]!.rock!.level).not.toBe('dry')
  })

  it('counts an unmeasured hour as no drying rather than filling it at the reference rate', () => {
    const measured = evaluateHourlyConditions(series(120), {
      rockType: 'sandstone',
      cliffAngleDeg: 0,
    })
    const holed = series(120)
    for (let i = 40; i < 80; i++) holed[i]!.wind_kmh = null
    const withHole = evaluateHourlyConditions(holed, { rockType: 'sandstone', cliffAngleDeg: 0 })
    // Under-counting reads the wall wetter, which is the safe direction.
    expect(withHole[119]!.diagnostics.effective_dry_hours!).toBeLessThan(
      measured[119]!.diagnostics.effective_dry_hours!,
    )
  })

  it('does not credit drying to an hour whose rain was never measured', () => {
    // A null precipitation is a gap, not a dry hour. Crediting it would be a
    // missing value rendered as a favourable one — the direction issue #34
    // forbids — and the hours either side of it are otherwise identical.
    const measured = evaluateHourlyConditions(series(120), {
      rockType: 'sandstone',
      cliffAngleDeg: 0,
    })
    const unmeasured = series(120)
    for (let i = 40; i < 80; i++) unmeasured[i]!.precip_mm = null
    const out = evaluateHourlyConditions(unmeasured, { rockType: 'sandstone', cliffAngleDeg: 0 })
    expect(out[119]!.diagnostics.effective_dry_hours!).toBeLessThan(measured[119]!.diagnostics.effective_dry_hours!)
    // And the clock stands still rather than resetting: an unmeasured hour is
    // not a rainy one either.
    expect(out[79]!.diagnostics.effective_dry_hours).toBe(out[39]!.diagnostics.effective_dry_hours)
  })
  it('withholds the rock reading when the rain history is declared unknown', () => {
    const out = evaluateHourlyConditions(series(120), {
      rockType: 'granite',
      cliffAngleDeg: 0,
      priorEffectiveHours: null,
    })
    expect(out[119]!.rock).toBeNull()
    expect(out[119]!.score).toBeNull()
  })

  it('unqualifies the rock reading once a sunlit hour has fed the drying clock', () => {
    const dark = evaluateHourlyConditions(series(120), { rockType: 'granite', cliffAngleDeg: 0 })
    expect(dark[119]!.rock!.qualified).toBe(true)

    const sunlit = series(120)
    sunlit[110]!.shortwave_wm2 = 900
    const out = evaluateHourlyConditions(sunlit, { rockType: 'granite', cliffAngleDeg: 0 })
    expect(out[109]!.rock!.qualified).toBe(true)
    expect(out[119]!.rock!.qualified).toBe(false)
  })
})

describe('bestWindow', () => {
  const at = (h: number, level: 'great' | 'poor', score: number): HourlyConditions => ({
    valid_at: `2026-09-21T${String(h).padStart(2, '0')}:00:00Z`,
    rock: { level: 'dry', qualified: true },
    friction: { level, condensing: false, qualified: true },
    score,
    t_surface_c: 20,
    condensation_margin_c: 5,
    diagnostics: {
      t_mass_c: 15,
      skin_wettedness: 0.1,
      wetness_factor: 1,
      friction_factor: level === 'great' ? 0.9 : 0.2,
      effective_dry_hours: 500,
    },
  })

  it('finds the longest contiguous run clearing the minimums', () => {
    const window = bestWindow([
      at(6, 'poor', 20),
      at(7, 'great', 90),
      at(8, 'great', 90),
      at(9, 'great', 90),
      at(10, 'poor', 20),
      at(11, 'great', 90),
    ])
    expect(window!.from).toBe('2026-09-21T07:00:00Z')
    expect(window!.to).toBe('2026-09-21T09:00:00Z')
    expect(window!.hours).toBe(3)
  })

  it('reports the worst hour in the run, not the best', () => {
    const window = bestWindow([at(7, 'great', 90), at(8, 'great', 62), at(9, 'great', 88)])
    expect(window!.min_score).toBe(62)
  })

  it('breaks the run on a withheld hour — a window is a claim about every hour in it', () => {
    const unknown = { ...at(8, 'great', 90), score: null, friction: null }
    const window = bestWindow([at(7, 'great', 90), unknown, at(9, 'great', 90)])
    expect(window!.hours).toBe(1)
  })

  it('is unqualified if any hour in it is', () => {
    const unqualified = at(8, 'great', 90)
    unqualified.friction = { level: 'great', condensing: false, qualified: false }
    const window = bestWindow([at(7, 'great', 90), unqualified, at(9, 'great', 90)])
    expect(window!.hours).toBe(3)
    expect(window!.qualified).toBe(false)
  })

  it('returns null when nothing clears', () => {
    expect(bestWindow([at(7, 'poor', 20), at(8, 'poor', 20)])).toBeNull()
  })

  it('exposes the level orderings a caller builds minimums from', () => {
    expect(rockLevelsAtLeast('drying')).toEqual(['drying', 'dry'])
    expect(frictionLevelsAtLeast('good')).toEqual(['good', 'great'])
  })
})

/**
 * **The fence around the unvalidated step, asserted rather than described.**
 *
 * Owner decision, 2026-09-21: the friction reading keeps its heat-balance model
 * and the one guess in it — `sweatBalance.sweatFrictionFactor` — is quarantined
 * instead of removed. The terms were that **words and ordering reach a screen
 * and magnitudes do not**, so the 0-1 factors live under `diagnostics`.
 *
 * This is the check, and it is deliberately a check rather than a comment:
 * `.claude/rules/architecture.md` is full of rules that hold because something
 * fails when they are broken. A Phase 3 response built by spreading an
 * `HourlyConditions` would carry a friction magnitude to a client; one built by
 * naming its fields cannot do it by accident. If a factor is promoted back to
 * the top level, this fails and whoever did it has to say why.
 */
describe('the diagnostics fence', () => {
  const sample = evaluateHour(hour(), true)

  it('keeps every raw factor off the top level of the result', () => {
    for (const field of [
      'friction_factor',
      'wetness_factor',
      'skin_wettedness',
      't_mass_c',
      'effective_dry_hours',
    ]) {
      expect(Object.keys(sample)).not.toContain(field)
      expect(Object.keys(sample.diagnostics)).toContain(field)
    }
  })

  it('publishes the readings as words, and the score, and nothing else numeric', () => {
    // t_surface_c and condensation_margin_c are derived measurements with named
    // biases, not guesses about grip, so they are renderable and stay here.
    expect(Object.keys(sample).sort()).toEqual([
      'condensation_margin_c',
      'diagnostics',
      'friction',
      'rock',
      'score',
      't_surface_c',
      'valid_at',
    ])
    expect(typeof sample.friction!.level).toBe('string')
    expect(typeof sample.rock!.level).toBe('string')
  })
})

describe('a recorded wall — the Phase 4 acceptance line', () => {
  /**
   * *"A saved location's aspect and tilt change its score in the direction a
   * climber would predict."* The climber's prediction for a hot, clear
   * midsummer noon: the wall in the shade is the one to be on, and a slab
   * lying back into the sun is the worst of all.
   */
  const RED_ROCK = { lat: 36.13, lon: -115.43 }
  const orient = (aspectDeg: number, cliffAngleDeg: number): WallOrientation => ({
    ...RED_ROCK,
    aspectDeg,
    cliffAngleDeg,
  })
  const hotNoon = (cliffAngleDeg: number, wall: WallOrientation | null) =>
    evaluateHour(
      hour({
        valid_at: '2026-06-21T20:00:00Z',
        airTempC: 29,
        dewPointC: 5,
        windKmh: 5,
        shortwaveWm2: 950,
        massTempC: 24,
        cliffAngleDeg,
        wall,
      }),
      true,
    )

  it('reads a north wall cooler and scores it no worse than a south wall at summer noon', () => {
    const north = hotNoon(0, orient(0, 0))
    const south = hotNoon(0, orient(180, 0))
    expect(north.t_surface_c!).toBeLessThan(south.t_surface_c!)
    expect(north.score!).toBeGreaterThanOrEqual(south.score!)
  })

  it('scores a sun-facing slab below a shaded vertical wall', () => {
    const northWall = hotNoon(0, orient(0, 0))
    const southSlab = hotNoon(70, orient(180, 70))
    expect(southSlab.t_surface_c!).toBeGreaterThan(northWall.t_surface_c! + 10)
    expect(southSlab.score!).toBeLessThan(northWall.score!)
  })

  it('qualifies the friction reading once the wall is known', () => {
    expect(hotNoon(0, null).friction!.qualified).toBe(false)
    expect(hotNoon(0, orient(0, 0)).friction!.qualified).toBe(true)
  })

  it('takes the sun at the middle of the hour the shortwave mean covers, not its stamp', () => {
    // Open-Meteo stamps the mean at the end of the hour. An east wall at 15:00Z
    // must be lit by the 14:30Z sun; this fails if the stamp is used instead,
    // because the sun climbs ~12° in that half hour.
    const wall = orient(90, 0)
    const input = hour({ valid_at: '2026-06-21T15:00:00Z', shortwaveWm2: 500, wall })
    const expected = surfaceTemperature({
      airTempC: input.airTempC,
      shortwaveWm2: input.shortwaveWm2,
      windKmh: input.windKmh,
      cloudPct: input.cloudPct,
      cliffAngleDeg: input.cliffAngleDeg,
      wall: { orientation: wall, at: new Date('2026-06-21T14:30:00Z') },
    })
    const atStamp = surfaceTemperature({
      airTempC: input.airTempC,
      shortwaveWm2: input.shortwaveWm2,
      windKmh: input.windKmh,
      cloudPct: input.cloudPct,
      cliffAngleDeg: input.cliffAngleDeg,
      wall: { orientation: wall, at: new Date('2026-06-21T15:00:00Z') },
    })
    const got = evaluateHour(input, true).t_surface_c!
    expect(got).toBeCloseTo(expected.t_surface_c!, 10)
    expect(Math.abs(got - atStamp.t_surface_c!)).toBeGreaterThan(0.01)
  })

  it('keeps the rock reading qualified through a sunny drying day when the wall is known', () => {
    // Sequential hours on the solstice with daylight shortwave. Without a wall
    // any bright hour in the drying clock unqualifies the rock reading; with
    // one, none does.
    const start = Date.parse('2026-06-20T00:00:00Z')
    const hours: WeatherHour[] = Array.from({ length: 2 * MASS_TAU_HOURS + 48 }, (_, i) => {
      const at = new Date(start + i * 3_600_000)
      const utc = at.getUTCHours()
      // Daylight at Red Rock is roughly 13Z-03Z; a flat 600 W/m² is enough.
      const day = utc >= 14 || utc <= 2
      return {
        valid_at: at.toISOString(),
        air_temp_c: 25,
        dewpoint_c: 5,
        wind_kmh: 5,
        cloud_pct: 0,
        shortwave_wm2: day ? 600 : 0,
        precip_mm: i === 0 ? 5 : 0,
      }
    })
    const without = evaluateHourlyConditions(hours, { rockType: 'granite', cliffAngleDeg: 0 })
    const withWall = evaluateHourlyConditions(hours, {
      rockType: 'granite',
      cliffAngleDeg: 0,
      wall: orient(0, 0),
    })
    expect(without[without.length - 1]!.rock!.qualified).toBe(false)
    expect(withWall[withWall.length - 1]!.rock!.qualified).toBe(true)
  })
})

describe('dryingAngleFactor', () => {
  it('runs 1.0 at vertical to 1.3 at a flat slab and holds an overhang at vertical', () => {
    expect(dryingAngleFactor(0)).toBe(1)
    expect(dryingAngleFactor(90)).toBeCloseTo(1.3, 10)
    expect(dryingAngleFactor(45)).toBeCloseTo(1.15, 10)
    // Extending the line would dry a roof 30% faster — an inflation nobody
    // measured (issue #34).
    expect(dryingAngleFactor(-30)).toBe(1)
    expect(dryingAngleFactor(-90)).toBe(1)
  })

  it('is the factor dryingWindowHours applies', () => {
    const { maxHours } = dryingWindowHours('granite', -45)
    expect(maxHours).toBe(MAX_HOURS.granite)
  })
})
