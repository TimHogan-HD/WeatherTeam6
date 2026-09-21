import { describe, it, expect } from 'vitest'
import {
  ABSORPTANCE_SPREAD,
  ASPECT_QUALIFY_MARGIN_C,
  DRYING_RATE_MAX,
  MASS_TAU_HOURS,
  MAX_PLAUSIBLE_SHORTWAVE_WM2,
  REFERENCE_DRYING_CONDITIONS,
  REFERENCE_EVAP_INDEX,
  SKY_COOLING_HORIZONTAL_C,
  SOLAR_ABSORPTANCE,
  condensationMarginC,
  convectiveCoefficient,
  dryingRateMultiplier,
  effectiveDryingHours,
  evaporativeCapacity,
  isCondensing,
  massTemperatureC,
  radiativeCoefficient,
  saturationVapourPressureKpa,
  skyCoolingC,
  surfaceCoefficient,
  surfaceTemperature,
  type SurfaceTemperatureInput,
} from './rockThermal.js'

/**
 * **Every expected value below is hand-worked from the published correlation**,
 * not produced by a helper that shares the implementation's assumptions —
 * `defect-patterns.md` §11, which is the class this repo has shipped four times.
 * Where the arithmetic is long enough to be worth showing, it is shown in the
 * comment above the assertion.
 *
 * The two independent checks that matter most, because they could catch the code
 * and the fixture being wrong in the same direction:
 *
 * - `saturationVapourPressureKpa` is checked against **published steam-table
 *   values** (1.7053 kPa at 15 °C, 2.3383 at 20 °C), not against itself.
 * - The `T_mass` step response is checked against its **closed form**,
 *   `20·(1 − e⁻¹)`, which the implementation does not contain.
 */

/** A vertical wall, clear sky, still air — the base every case varies from. */
const base: SurfaceTemperatureInput = {
  airTempC: 20,
  shortwaveWm2: 0,
  windKmh: 0,
  cloudPct: 0,
  cliffAngleDeg: 0,
}

describe('convectiveCoefficient', () => {
  // h_c = 5.7 + 3.8 v, v in m/s (Jürges 1924 via McAdams 1954).
  it('is 5.7 W/m²K in still air', () => {
    expect(convectiveCoefficient(0)).toBeCloseTo(5.7, 10)
  })

  it('reaches 24.7 W/m²K at 18 km/h, which is the correlation’s 5 m/s limit', () => {
    expect(convectiveCoefficient(18)).toBeCloseTo(24.7, 10)
  })

  it('stays on the linear branch past 5 m/s rather than stepping to 7.2·v^0.78', () => {
    // The published turbulent branch gives 7.2·10^0.78 = 25.27 at the join
    // against the linear form's 24.7 — a discontinuity this deliberately does
    // not reproduce. 36 km/h is 10 m/s: 5.7 + 38 = 43.7.
    expect(convectiveCoefficient(36)).toBeCloseTo(43.7, 10)
  })

  it('withholds rather than inventing a coefficient for a missing or negative wind', () => {
    expect(convectiveCoefficient(null)).toBeNull()
    expect(convectiveCoefficient(-1)).toBeNull()
    expect(convectiveCoefficient(Number.NaN)).toBeNull()
  })
})

describe('radiativeCoefficient', () => {
  it('is the same size as convection in still air, which is why it cannot be dropped', () => {
    // h_r = 4 · 0.93 · 5.670374419e-8 · 293.15³ = 5.314 W/m²K at 20 °C,
    // against a convective 5.7 at zero wind.
    expect(radiativeCoefficient(20)).toBeCloseTo(5.314035, 5)
    expect(radiativeCoefficient(25)).toBeCloseTo(5.590609, 5)
  })

  it('withholds a missing temperature', () => {
    expect(radiativeCoefficient(null)).toBeNull()
  })
})

describe('surfaceCoefficient', () => {
  it('is convection plus radiation, which is what ASHRAE means by h_o', () => {
    // 3.4 m/s = 12.24 km/h: 5.7 + 12.92 + 5.591 = 24.211 W/m²K.
    expect(surfaceCoefficient(25, 3.4 * 3.6)).toBeCloseTo(24.210609, 5)
  })

  it('runs above ASHRAE’s own summer design figure of 17 W/m²K at the same wind', () => {
    // Documented, not accidental — Jürges/McAdams overestimates at a real
    // surface, and a high h_o reads the rock cooler.
    expect(surfaceCoefficient(25, 3.4 * 3.6)!).toBeGreaterThan(17)
  })

  it('withholds when either half is unmeasurable', () => {
    expect(surfaceCoefficient(null, 10)).toBeNull()
    expect(surfaceCoefficient(20, null)).toBeNull()
  })
})

describe('skyCoolingC', () => {
  it('is zero for a vertical wall — ASHRAE’s published endpoint', () => {
    expect(skyCoolingC(0, 0)).toBeCloseTo(0, 10)
  })

  it('is the full 3.9 °C for a flat slab under a clear sky — the other endpoint', () => {
    expect(skyCoolingC(90, 0)).toBeCloseTo(SKY_COOLING_HORIZONTAL_C, 10)
  })

  it('goes to zero under full cloud, however flat the surface', () => {
    expect(skyCoolingC(90, 100)).toBeCloseTo(0, 10)
  })

  it('interpolates linearly on both axes', () => {
    expect(skyCoolingC(45, 0)).toBeCloseTo(1.95, 10)
    expect(skyCoolingC(90, 50)).toBeCloseTo(1.95, 10)
  })

  it('clamps an out-of-range angle or cloud rather than extrapolating', () => {
    expect(skyCoolingC(120, 0)).toBeCloseTo(SKY_COOLING_HORIZONTAL_C, 10)
    expect(skyCoolingC(-10, 0)).toBeCloseTo(0, 10)
    expect(skyCoolingC(90, 150)).toBeCloseTo(0, 10)
  })

  it('withholds when either input is missing', () => {
    expect(skyCoolingC(null, 0)).toBeNull()
    expect(skyCoolingC(0, null)).toBeNull()
  })
})

describe('surfaceTemperature', () => {
  it('equals air temperature for a vertical wall at night in still air', () => {
    // gain = 0.65 · 0 / h_o = 0; skyCooling = 3.9 · 0 · 1 = 0.
    const out = surfaceTemperature({ ...base, airTempC: 10 })
    expect(out.t_surface_c).toBeCloseTo(10, 10)
    expect(out.solar_gain_c).toBeCloseTo(0, 10)
  })

  it('reads a sunlit wall far above air temperature — the Phase 1 acceptance case', () => {
    // 900 W/m², 10.8 km/h = 3 m/s, air 25 °C
    //   h_c = 5.7 + 11.4          = 17.100
    //   h_r = 4 · 0.93 · σ · 298.15³ =  5.591
    //   h_o                        = 22.691
    // gain = 0.65 · 900 / 22.691 = 585 / 22.691 = 25.7816 °C
    // T_surface = 25 + 25.7816 − 0 = 50.7816 °C, which is where a measured
    // sunlit rock face in a light breeze actually sits.
    const out = surfaceTemperature({
      ...base,
      airTempC: 25,
      shortwaveWm2: 900,
      windKmh: 10.8,
    })
    expect(out.solar_gain_c).toBeCloseTo(25.7815910, 6)
    expect(out.t_surface_c).toBeCloseTo(50.7815910, 6)
    expect(out.t_surface_c! - 25).toBeGreaterThan(20)
  })

  it('reads a shaded slab below air temperature — the other half of the acceptance case', () => {
    // Clear night, flat slab: 5 − 3.9 = 1.1
    const out = surfaceTemperature({
      ...base,
      airTempC: 5,
      cliffAngleDeg: 90,
    })
    expect(out.t_surface_c).toBeCloseTo(1.1, 10)
    expect(out.t_surface_c!).toBeLessThan(5)
  })

  it('keeps 0 W/m² apart from a missing reading — 0 is midnight', () => {
    const night = surfaceTemperature({ ...base, shortwaveWm2: 0 })
    const unmeasured = surfaceTemperature({ ...base, shortwaveWm2: null })

    expect(night.t_surface_c).toBeCloseTo(20, 10)
    expect(unmeasured.t_surface_c).toBeNull()
    expect(unmeasured.solar_gain_c).toBeNull()
  })

  it('treats an impossible irradiance as a gap — issue #155’s gem_seamless value', () => {
    expect(surfaceTemperature({ ...base, shortwaveWm2: 2847 }).t_surface_c).toBeNull()
    expect(surfaceTemperature({ ...base, shortwaveWm2: -5 }).t_surface_c).toBeNull()
    // The ceiling itself is still a reading.
    expect(
      surfaceTemperature({ ...base, shortwaveWm2: MAX_PLAUSIBLE_SHORTWAVE_WM2 }).t_surface_c,
    ).not.toBeNull()
  })

  it('never falls back to air temperature when an input is missing', () => {
    for (const missing of [
      { airTempC: null },
      { windKmh: null },
      { cloudPct: null },
      { cliffAngleDeg: null },
    ] as Partial<SurfaceTemperatureInput>[]) {
      const out = surfaceTemperature({ ...base, shortwaveWm2: 500, ...missing })
      expect(out.t_surface_c).toBeNull()
      expect(out.qualified).toBe(false)
    }
  })

  describe('per-hour aspect qualification', () => {
    it('qualifies an hour whose solar gain cannot reach the margin', () => {
      // Still air at 20 °C: h_o = 5.7 + 5.314 = 11.014, gain = 0.65 · I / 11.014.
      // The margin is crossed at I = 11.014 / 0.65 = 16.94 W/m², so 16.8 gives
      // 0.9915 and 17.1 gives 1.0092 — deep twilight either way.
      expect(surfaceTemperature({ ...base, shortwaveWm2: 16.8 }).qualified).toBe(true)
      expect(surfaceTemperature({ ...base, shortwaveWm2: 17.1 }).qualified).toBe(false)
    })

    it('qualifies night and heavy overcast, and refuses a bright midday hour', () => {
      expect(surfaceTemperature({ ...base, shortwaveWm2: 0 }).qualified).toBe(true)
      expect(surfaceTemperature({ ...base, shortwaveWm2: 5, cloudPct: 100 }).qualified).toBe(true)
      expect(surfaceTemperature({ ...base, shortwaveWm2: 900 }).qualified).toBe(false)
    })

    it('qualifies further into daylight when wind has pinned the wall to the air', () => {
      // Same 50 W/m². Still air: gain 2.95 °C. At 30 km/h, h_o = 42.68 and the
      // gain is 0.76 °C — below the margin, so aspect cannot change the answer.
      expect(surfaceTemperature({ ...base, shortwaveWm2: 50 }).qualified).toBe(false)
      expect(surfaceTemperature({ ...base, shortwaveWm2: 50, windKmh: 30 }).qualified).toBe(true)
      expect(ASPECT_QUALIFY_MARGIN_C).toBe(1)
    })

    it('qualifies every hour when the user has turned the sun off', () => {
      // Nothing reads irradiance, so no geometry can change the answer — and the
      // reading survives past the model's shortwave horizon.
      const out = surfaceTemperature({
        ...base,
        shortwaveWm2: null,
        includeSun: false,
        airTempC: 20,
      })
      expect(out.t_surface_c).toBeCloseTo(20, 10)
      expect(out.solar_gain_c).toBe(0)
      expect(out.qualified).toBe(true)
    })
  })

  describe('continuity — the invariant issue #148 was filed for', () => {
    /**
     * A discontinuity and a steep slope look the same at one sample spacing and
     * different at two: halving the step halves the largest adjacent change of a
     * smooth function and leaves a jump exactly where it was.
     *
     * `T_surface` genuinely is steep near zero wind — 900 W/m² on a wall in dead
     * calm moves ~19 °C per km/h — so asserting "no adjacent pair moves by more
     * than X" would either fail on real physics or be too loose to catch a step.
     * This asserts the shape instead.
     */
    function maxAdjacentDelta(
      vary: (x: number) => number | null,
      from: number,
      to: number,
      step: number,
    ): number {
      let worst = 0
      let previous: number | null = null
      for (let x = from; x <= to + step / 2; x += step) {
        const value = vary(x)
        expect(value).not.toBeNull()
        if (previous !== null) worst = Math.max(worst, Math.abs(value! - previous))
        previous = value
      }
      return worst
    }

    const axes: { name: string; from: number; to: number; step: number; vary: (x: number) => number | null }[] = [
      {
        name: 'air temperature',
        from: -20,
        to: 45,
        step: 0.1,
        vary: (x) => surfaceTemperature({ ...base, airTempC: x, shortwaveWm2: 600 }).t_surface_c,
      },
      {
        name: 'irradiance',
        from: 0,
        to: MAX_PLAUSIBLE_SHORTWAVE_WM2,
        step: 1,
        vary: (x) => surfaceTemperature({ ...base, shortwaveWm2: x, windKmh: 10 }).t_surface_c,
      },
      {
        name: 'wind',
        from: 0,
        to: 100,
        step: 0.1,
        vary: (x) => surfaceTemperature({ ...base, shortwaveWm2: 900, windKmh: x }).t_surface_c,
      },
      {
        name: 'cloud',
        from: 0,
        to: 100,
        step: 0.1,
        vary: (x) =>
          surfaceTemperature({ ...base, cloudPct: x, cliffAngleDeg: 90, shortwaveWm2: 300 })
            .t_surface_c,
      },
      {
        name: 'cliff angle',
        from: 0,
        to: 90,
        step: 0.1,
        vary: (x) =>
          surfaceTemperature({ ...base, cliffAngleDeg: x, shortwaveWm2: 300 }).t_surface_c,
      },
    ]

    for (const axis of axes) {
      it(`has no step across the ${axis.name} axis`, () => {
        const coarse = maxAdjacentDelta(axis.vary, axis.from, axis.to, axis.step)
        const fine = maxAdjacentDelta(axis.vary, axis.from, axis.to, axis.step / 2)
        // A smooth function halves; a jump would hold at ~1.0 of the coarse value.
        expect(fine).toBeLessThan(coarse * 0.6)
      })
    }

    it('crosses the qualification margin without moving the temperature', () => {
      // The flag flips at 16.94 W/m² in still air. The reading either side of it
      // must be continuous — the flag is a caveat on the number, not a branch in it.
      const below = surfaceTemperature({ ...base, shortwaveWm2: 16.93 })
      const above = surfaceTemperature({ ...base, shortwaveWm2: 16.96 })
      expect(below.qualified).toBe(true)
      expect(above.qualified).toBe(false)
      expect(Math.abs(above.t_surface_c! - below.t_surface_c!)).toBeLessThan(0.01)
    })
  })

  describe('absorptance sensitivity — the evidence for Open Question 4', () => {
    it('separates pale from dark by tens of degrees in bright sun', () => {
      const at = (absorptance: number) =>
        surfaceTemperature({ ...base, shortwaveWm2: 900, windKmh: 10.8, absorptance }).t_surface_c!
      // Air 20 °C: h_o = 5.7 + 11.4 + 5.314 = 22.414.
      // (0.9 − 0.4) · 900 / 22.414 = 20.08 °C
      expect(at(ABSORPTANCE_SPREAD.dark) - at(ABSORPTANCE_SPREAD.pale)).toBeCloseTo(20.0767, 3)
      expect(SOLAR_ABSORPTANCE).toBeGreaterThan(ABSORPTANCE_SPREAD.pale)
      expect(SOLAR_ABSORPTANCE).toBeLessThan(ABSORPTANCE_SPREAD.dark)
    })

    it('separates them by nothing at all on the hours that are qualified', () => {
      // This is the answer to Open Question 4: α only moves hours whose reading
      // is already flagged as unanswerable without an aspect we do not have.
      const at = (absorptance: number, shortwaveWm2: number) =>
        surfaceTemperature({ ...base, shortwaveWm2, absorptance })
      const qualifyingIrradiance = 16.8
      const pale = at(ABSORPTANCE_SPREAD.pale, qualifyingIrradiance)
      const dark = at(ABSORPTANCE_SPREAD.dark, qualifyingIrradiance)
      expect(pale.qualified).toBe(true)
      // (0.9 − 0.4) · 16.8 / 11.014 = 0.76 °C — under a degree.
      expect(dark.t_surface_c! - pale.t_surface_c!).toBeLessThan(1)
    })
  })
})

describe('massTemperatureC', () => {
  const flat = (hours: number, value: number | null) => Array.from({ length: hours }, () => value)

  it('returns the constant it was given', () => {
    expect(massTemperatureC(flat(96, 10))).toBeCloseTo(10, 10)
  })

  it('reaches 1 − e⁻¹ of a step change after exactly one time constant', () => {
    // 48 h at 0 °C, then 48 h at 20 °C, τ = 48. The closed form is
    // 20·(1 − e^(−48/48)) = 20 · 0.632121 = 12.6424, and nothing in the
    // implementation contains that expression.
    const series = [...flat(48, 0), ...flat(48, 20)]
    expect(massTemperatureC(series)).toBeCloseTo(20 * (1 - Math.exp(-1)), 9)
  })

  it('attenuates a diurnal swing to under a degree, as the τ note claims', () => {
    // 10 days of 15 ± 10 °C on a 24 h cycle. 1/√(1 + (2πτ/P)²) = 0.079 at
    // τ = 48, P = 24, so ±10 becomes ±0.79.
    const series = Array.from({ length: 240 }, (_, i) => 15 + 10 * Math.sin((2 * Math.PI * i) / 24))
    const out = massTemperatureC(series)
    expect(out).not.toBeNull()
    expect(Math.abs(out! - 15)).toBeLessThan(1)
  })

  it('carries the decay across a hole instead of skipping it', () => {
    // Same step change, with 24 h of the 20 °C stretch missing. Decaying across
    // the gap lands on the no-gap answer; skipping the null hours entirely would
    // land near 7.87 °C, which is what this discriminates.
    const withGap = [...flat(48, 0), ...flat(24, null), ...flat(24, 20)]
    expect(massTemperatureC(withGap)).toBeCloseTo(20 * (1 - Math.exp(-1)), 9)
  })

  it('withholds a series too short for the seed to have decayed', () => {
    expect(massTemperatureC(flat(2 * MASS_TAU_HOURS - 1, 10))).toBeNull()
    expect(massTemperatureC(flat(2 * MASS_TAU_HOURS, 10))).toBeCloseTo(10, 10)
  })

  it('withholds a series that is mostly holes', () => {
    const sparse = Array.from({ length: 96 }, (_, i) => (i % 3 === 0 ? 10 : null))
    expect(massTemperatureC(sparse)).toBeNull()
  })

  it('withholds an empty or entirely missing series', () => {
    expect(massTemperatureC([])).toBeNull()
    expect(massTemperatureC(flat(96, null))).toBeNull()
  })

  it('honours a shorter τ so Phase 2 can sweep it', () => {
    // τ = 24, minSpan 48: one time constant of a step is the same closed form.
    const series = [...flat(24, 0), ...flat(24, 20)]
    expect(massTemperatureC(series, { tauHours: 24 })).toBeCloseTo(20 * (1 - Math.exp(-1)), 9)
  })
})

describe('condensationMarginC', () => {
  it('reports a wall below the dew point as condensing — the Phase 1 acceptance case', () => {
    const margin = condensationMarginC(5, 8)
    expect(margin).toBeCloseTo(-3, 10)
    expect(isCondensing(margin)).toBe(true)
  })

  it('reports a warm wall as not condensing', () => {
    expect(isCondensing(condensationMarginC(20, 8))).toBe(false)
  })

  it('withholds rather than reporting "not condensing" when unmeasured', () => {
    expect(condensationMarginC(null, 8)).toBeNull()
    expect(condensationMarginC(20, null)).toBeNull()
    expect(isCondensing(null)).toBeNull()
  })
})

describe('saturationVapourPressureKpa', () => {
  it('reproduces published steam-table values', () => {
    // Independent of this implementation: FAO-56 Annex 2 lists 0.6108 kPa at
    // 0 °C, 1.7053 at 15 °C and 2.3383 at 20 °C.
    expect(saturationVapourPressureKpa(0)).toBeCloseTo(0.6108, 4)
    expect(saturationVapourPressureKpa(15)).toBeCloseTo(1.7053, 4)
    expect(saturationVapourPressureKpa(20)).toBeCloseTo(2.3383, 4)
  })

  it('withholds a missing temperature', () => {
    expect(saturationVapourPressureKpa(null)).toBeNull()
  })
})

describe('evaporativeCapacity', () => {
  it('matches hand arithmetic at the reference conditions', () => {
    // e°(15) = 1.705346 kPa; e_a = 0.60 · that = 1.023208; deficit = 0.682138.
    // u₂ = (10 / 3.6) · 0.747951 = 2.077642; f(u) = 1 + 0.54 · 2.077642 = 2.121927.
    // index = 0.682138 · 2.121927 = 1.447448.
    expect(REFERENCE_EVAP_INDEX).toBeCloseTo(1.447448, 5)
  })

  it('agrees with the reference constant when fed the same conditions as a dew point', () => {
    // 60% RH at 15 °C is a dew point of 7.3075 °C (inverse Magnus).
    const out = evaporativeCapacity({
      surfaceTempC: REFERENCE_DRYING_CONDITIONS.surfaceTempC,
      dewPointC: 7.307464,
      windKmh: REFERENCE_DRYING_CONDITIONS.windKmh,
    })
    expect(out).toBeCloseTo(REFERENCE_EVAP_INDEX, 5)
  })

  it('is the bare deficit in still air', () => {
    // e°(20) − e°(10) = 2.338281 − 1.227963 = 1.110319, times f(0) = 1.
    expect(evaporativeCapacity({ surfaceTempC: 20, dewPointC: 10, windKmh: 0 })).toBeCloseTo(
      1.110319,
      5,
    )
  })

  it('rises with wind at a fixed deficit', () => {
    const still = evaporativeCapacity({ surfaceTempC: 20, dewPointC: 10, windKmh: 0 })!
    const breezy = evaporativeCapacity({ surfaceTempC: 20, dewPointC: 10, windKmh: 25 })!
    expect(breezy).toBeGreaterThan(still)
  })

  it('separates two days at the same temperature by their humidity alone', () => {
    // The claim the whole quantity exists to support: 25 °C at a 10 °C dew point
    // and 25 °C at a 23 °C dew point are different climbing days, and two
    // independent point buckets could not say so.
    const dry = evaporativeCapacity({ surfaceTempC: 25, dewPointC: 10, windKmh: 10 })!
    const muggy = evaporativeCapacity({ surfaceTempC: 25, dewPointC: 23, windKmh: 10 })!
    expect(dry).toBeGreaterThan(muggy * 3)
  })

  it('is zero for a surface at or below the dew point, not negative', () => {
    expect(evaporativeCapacity({ surfaceTempC: 5, dewPointC: 10, windKmh: 10 })).toBe(0)
    expect(evaporativeCapacity({ surfaceTempC: 10, dewPointC: 10, windKmh: 10 })).toBeCloseTo(0, 10)
  })

  it('withholds when any input is missing', () => {
    expect(evaporativeCapacity({ surfaceTempC: null, dewPointC: 10, windKmh: 10 })).toBeNull()
    expect(evaporativeCapacity({ surfaceTempC: 20, dewPointC: null, windKmh: 10 })).toBeNull()
    expect(evaporativeCapacity({ surfaceTempC: 20, dewPointC: 10, windKmh: null })).toBeNull()
  })
})

describe('dryingRateMultiplier', () => {
  it('is exactly 1 at the reference conditions, so MAX_HOURS keeps its meaning', () => {
    const out = dryingRateMultiplier({
      surfaceTempC: REFERENCE_DRYING_CONDITIONS.surfaceTempC,
      dewPointC: 7.307464,
      windKmh: REFERENCE_DRYING_CONDITIONS.windKmh,
    })
    expect(out).toBeCloseTo(1, 5)
  })

  it('caps a blazing dry gale rather than drying sandstone in a morning', () => {
    // 45 °C surface, 0 °C dew point, 40 km/h runs at ~34× uncapped.
    expect(dryingRateMultiplier({ surfaceTempC: 45, dewPointC: 0, windKmh: 40 })).toBe(
      DRYING_RATE_MAX,
    )
  })

  it('is zero on an hour the wall is condensing, with no floor under it', () => {
    expect(dryingRateMultiplier({ surfaceTempC: 2, dewPointC: 6, windKmh: 20 })).toBe(0)
  })

  it('withholds rather than assuming the reference rate', () => {
    expect(dryingRateMultiplier({ surfaceTempC: null, dewPointC: 10, windKmh: 10 })).toBeNull()
  })
})

describe('effectiveDryingHours', () => {
  it('sums the measured hours and counts the rest separately', () => {
    expect(effectiveDryingHours([1, 1, 1, null, 2])).toEqual({
      effective_hours: 5,
      measured_hours: 4,
      unmeasured_hours: 1,
    })
  })

  it('never fills an unmeasured hour in at the reference rate', () => {
    // Four unmeasured hours contribute 0, not 4 — under-counting reads the wall
    // as wetter than it is, which is the direction issue #34 requires.
    const out = effectiveDryingHours([null, null, null, null])
    expect(out.effective_hours).toBe(0)
    expect(out.unmeasured_hours).toBe(4)
    expect(out.measured_hours).toBe(0)
  })

  it('scales by the step when a sample covers more than an hour', () => {
    expect(effectiveDryingHours([1, 2], 3)).toEqual({
      effective_hours: 9,
      measured_hours: 6,
      unmeasured_hours: 0,
    })
  })

  it('returns zeroes for an empty window', () => {
    expect(effectiveDryingHours([])).toEqual({
      effective_hours: 0,
      measured_hours: 0,
      unmeasured_hours: 0,
    })
  })
})
