import { describe, it, expect } from 'vitest'
import {
  BODY_RADIATIVE_COEFF_W_M2K,
  BODY_STILL_AIR_H_C_W_M2K,
  LEWIS_RATIO_K_PER_KPA,
  METABOLIC_HEAT_W_M2,
  SKIN_TEMP_C,
  UNCOMPENSABLE_WETTEDNESS,
  bodyConvectiveCoefficient,
  dryFractionFrictionFactor,
  operativeTemperatureC,
  skinWettedness,
  sweatFrictionFactor,
} from './sweatBalance.js'
import { saturationVapourPressureKpa } from './rockThermal.js'

/**
 * **The expected values here are hand-worked from the relations in the module's
 * own documentation, not from the module.** `defect-patterns.md` §11 is the
 * class this repo has shipped four times — a fixture built by the same
 * understanding as the code proves only that the code agrees with itself — so
 * the heat-balance sums below are written out in the comments and computed from
 * the constants rather than from `skinWettedness`.
 */
describe('bodyConvectiveCoefficient', () => {
  it('follows 8.3·v^0.6 above the still-air floor', () => {
    // 8 km/h = 2.22222 m/s; 2.22222^0.6 = e^(0.6 · ln 2.22222) = e^0.479105 = 1.614627
    // 8.3 × 1.614627 = 13.4014
    expect(bodyConvectiveCoefficient(8)).toBeCloseTo(13.4014, 3)
  })

  it('floors at the still-air value rather than going to zero in dead calm', () => {
    expect(bodyConvectiveCoefficient(0)).toBe(BODY_STILL_AIR_H_C_W_M2K)
    // The correlation crosses the floor at 8.3·v^0.6 = 3.1, i.e. v = 0.2229 m/s
    // = 0.80 km/h. Just under it the floor still wins.
    expect(bodyConvectiveCoefficient(0.5)).toBe(BODY_STILL_AIR_H_C_W_M2K)
    expect(bodyConvectiveCoefficient(2)).toBeGreaterThan(BODY_STILL_AIR_H_C_W_M2K)
  })

  it('withholds rather than defaulting for a missing or impossible wind', () => {
    expect(bodyConvectiveCoefficient(null)).toBeNull()
    expect(bodyConvectiveCoefficient(NaN)).toBeNull()
    expect(bodyConvectiveCoefficient(-1)).toBeNull()
  })
})

describe('operativeTemperatureC', () => {
  it('is the convection- and radiation-weighted mean of air and surroundings', () => {
    // (13.4 × 40 + 4.7 × 66) / 18.1 = (536 + 310.2) / 18.1 = 46.7514
    expect(operativeTemperatureC(40, 66, 13.4, 4.7)).toBeCloseTo(46.7514, 3)
  })

  it('equals air temperature when the surroundings are at air temperature', () => {
    expect(operativeTemperatureC(18, 18, 13.4, 4.7)).toBeCloseTo(18, 10)
  })

  it('withholds when either temperature is missing — never one standing in for the other', () => {
    expect(operativeTemperatureC(null, 20, 13.4, 4.7)).toBeNull()
    expect(operativeTemperatureC(20, null, 13.4, 4.7)).toBeNull()
  })
})

describe('skinWettedness', () => {
  /**
   * The full hand-worked case, and the one every other assertion leans on.
   *
   * 16 °C air, a 31 °C sunlit wall, 8 km/h, dew point 4 °C.
   *   h_c = 8.3 · (8/3.6)^0.6                        = 13.4014
   *   h_o = h_c + 4.7                                = 18.1014
   *   T_op = (13.4014·16 + 4.7·31) / 18.1014         = 19.8947
   *   D    = 18.1014 · (35 − 19.8947)                = 273.43
   *   E_req = 400 − 273.43                           =  126.57
   *   es(35) = 0.6108·e^(17.27·35/272.3)             = 5.6227 kPa
   *   e_a    = 0.6108·e^(17.27·4/241.3)              = 0.8133 kPa
   *   E_max  = 16.5 · 13.4014 · (5.6227 − 0.8133)    = 1063.5
   *   w      = 126.57 / 1063.5                       = 0.1190
   */
  it('matches the heat balance worked by hand', () => {
    const result = skinWettedness({
      airTempC: 16,
      radiantTempC: 31,
      dewPointC: 4,
      windKmh: 8,
    })
    expect(result).not.toBeNull()
    expect(result!.operative_temp_c).toBeCloseTo(19.8947, 3)
    expect(result!.required_w_m2).toBeCloseTo(126.57, 1)
    expect(result!.max_w_m2).toBeCloseTo(1063.5, 0)
    expect(result!.wettedness).toBeCloseTo(0.1190, 3)
  })

  it('is zero in the cold, because no evaporation is needed to stay in balance', () => {
    const cold = skinWettedness({ airTempC: -5, radiantTempC: -5, dewPointC: -12, windKmh: 8 })
    expect(cold!.wettedness).toBe(0)
    expect(cold!.required_w_m2).toBe(0)
  })

  /**
   * The property the whole friction reading rests on, and the reason this model
   * uses a heat balance rather than a temperature band: the requirement rises
   * *steeply* as the operative temperature passes skin temperature, because the
   * dry channel has closed and everything has to leave as sweat.
   *
   * Asserted against the closed form rather than against the function: at
   * `T_op = SKIN_TEMP_C` the dry loss is exactly zero, so `E_req` is exactly the
   * metabolic rate. Nothing in the implementation special-cases that crossing.
   */
  it('requires exactly the metabolic rate when the environment is at skin temperature', () => {
    const atSkin = skinWettedness({
      airTempC: SKIN_TEMP_C,
      radiantTempC: SKIN_TEMP_C,
      dewPointC: 10,
      windKmh: 8,
    })
    expect(atSkin!.operative_temp_c).toBeCloseTo(SKIN_TEMP_C, 10)
    expect(atSkin!.required_w_m2).toBeCloseTo(METABOLIC_HEAT_W_M2, 6)
  })

  it('rises monotonically with air temperature, with no step at the crossing', () => {
    let previous = -1
    let biggestJump = 0
    for (let tenths = 250; tenths <= 500; tenths++) {
      const w = skinWettedness({
        airTempC: tenths / 10,
        radiantTempC: tenths / 10,
        dewPointC: 10,
        windKmh: 8,
      })!.wettedness
      expect(w).toBeGreaterThanOrEqual(previous)
      if (previous >= 0) biggestJump = Math.max(biggestJump, w - previous)
      previous = w
    }
    // A tenth of a degree moves the ratio by well under a percentage point
    // anywhere across the crossing. This is the invariant issue #148 is about,
    // one layer below the score.
    expect(biggestJump).toBeLessThan(0.01)
  })

  it('reads the hot wall, not just the hot air — the radiant term is load-bearing', () => {
    const shaded = skinWettedness({ airTempC: 30, radiantTempC: 30, dewPointC: 16, windKmh: 8 })!
    const sunlit = skinWettedness({ airTempC: 30, radiantTempC: 57, dewPointC: 16, windKmh: 8 })!
    expect(sunlit.wettedness).toBeGreaterThan(shaded.wettedness)
  })

  it('reports the uncompensable sentinel when the dew point reaches skin temperature', () => {
    // es(35) − es(35) = 0, so E_max is 0: the air is as wet as the hand can be.
    const saturated = skinWettedness({
      airTempC: 36,
      radiantTempC: 36,
      dewPointC: SKIN_TEMP_C,
      windKmh: 8,
    })!
    expect(saturated.max_w_m2).toBeCloseTo(0, 10)
    expect(saturated.wettedness).toBe(UNCOMPENSABLE_WETTEDNESS)
    expect(Number.isFinite(saturated.wettedness)).toBe(true)
  })

  it.each([
    ['air temperature', { airTempC: null }],
    ['radiant temperature', { radiantTempC: null }],
    ['dew point', { dewPointC: null }],
    ['wind', { windKmh: null }],
  ])('withholds when %s is missing', (_label, override) => {
    expect(
      skinWettedness({
        airTempC: 20,
        radiantTempC: 20,
        dewPointC: 10,
        windKmh: 8,
        ...override,
      }),
    ).toBeNull()
  })

  it('scales with the metabolic rate, which is the dial the harness costs', () => {
    const base = skinWettedness({ airTempC: 30, radiantTempC: 30, dewPointC: 16, windKmh: 8 })!
    const harder = skinWettedness({
      airTempC: 30,
      radiantTempC: 30,
      dewPointC: 16,
      windKmh: 8,
      metabolicW: 500,
    })!
    // Only the numerator moves: E_max is unchanged and the difference is
    // exactly 100 W/m² over it.
    expect(harder.max_w_m2).toBeCloseTo(base.max_w_m2, 10)
    expect(harder.wettedness - base.wettedness).toBeCloseTo(100 / base.max_w_m2, 10)
  })
})

describe('the two sweat maps', () => {
  it('exp(-w) never reaches zero, which is what keeps the score continuous', () => {
    expect(sweatFrictionFactor(0)).toBe(1)
    expect(sweatFrictionFactor(1)).toBeCloseTo(Math.exp(-1), 10)
    expect(sweatFrictionFactor(UNCOMPENSABLE_WETTEDNESS)).toBeGreaterThan(0)
  })

  it('1 - w reaches exactly zero, and that is the difference between them', () => {
    expect(dryFractionFrictionFactor(0)).toBe(1)
    expect(dryFractionFrictionFactor(0.25)).toBeCloseTo(0.75, 10)
    expect(dryFractionFrictionFactor(1)).toBe(0)
    expect(dryFractionFrictionFactor(2)).toBe(0)
  })

  it('agree to first order where ordinary climbing days sit', () => {
    for (const w of [0.02, 0.05, 0.1]) {
      expect(Math.abs(sweatFrictionFactor(w)! - dryFractionFrictionFactor(w)!)).toBeLessThan(0.006)
    }
  })

  it('both withhold rather than returning a plausible factor for a null reading', () => {
    expect(sweatFrictionFactor(null)).toBeNull()
    expect(dryFractionFrictionFactor(null)).toBeNull()
    expect(sweatFrictionFactor(NaN)).toBeNull()
    expect(dryFractionFrictionFactor(NaN)).toBeNull()
  })
})

describe('the constants are the ones the documentation names', () => {
  it('keeps the Lewis relation and the skin saturation pressure in step', () => {
    // If SKIN_TEMP_C moves, the bound on how much a hand can ever shed moves
    // with it. Pinned so the number in the module docs stays true.
    expect(LEWIS_RATIO_K_PER_KPA).toBe(16.5)
    expect(saturationVapourPressureKpa(SKIN_TEMP_C)).toBeCloseTo(5.6227, 3)
  })

  it('keeps the body radiative coefficient below the rock one', () => {
    // A person does not radiate from their whole surface; a wall does. If these
    // ever cross, one of them has been copied from the other.
    expect(BODY_RADIATIVE_COEFF_W_M2K).toBeLessThan(5.5)
  })
})
