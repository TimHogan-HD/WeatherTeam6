import { describe, it, expect } from 'vitest'
import {
  localTimeToUtc,
  markSharedProbability,
  parseDeterministicHourly,
  parseEnsemble,
  parseEnsembleHourly,
  type ModelHourly,
} from './openMeteo.js'

/**
 * Every assertion here names the implementation line it constrains, per
 * `defect-patterns.md` §11. The fixtures are the shapes the live API actually
 * returned on 2026-08-31 — including the degraded one, which is the whole reason
 * `parseDeterministicHourly` reports `ambiguous` instead of trusting a bare key.
 */

const TIMES = ['2026-09-01T00:00', '2026-09-01T01:00', '2026-09-01T02:00']

describe('parseDeterministicHourly', () => {
  it('attributes a suffixed multi-model response to each model', () => {
    const parsed = parseDeterministicHourly(
      {
        time: TIMES,
        temperature_2m_gfs_seamless: [10, 11, 12],
        temperature_2m_ecmwf_ifs025: [20, 21, 22],
      },
      ['gfs_seamless', 'ecmwf_ifs025'],
    )

    expect(parsed.ambiguous).toBe(false)
    expect(parsed.models.map((m) => m.model)).toEqual(['gfs_seamless', 'ecmwf_ifs025'])
    // Constrains the `_${model}` suffix in `hoursForModel`'s column lookup: swap
    // the two models' arrays and this flips.
    expect(parsed.models[0]?.hours.map((h) => h.temp_c)).toEqual([10, 11, 12])
    expect(parsed.models[1]?.hours.map((h) => h.temp_c)).toEqual([20, 21, 22])
  })

  it('names a requested model the response carried no column for', () => {
    const parsed = parseDeterministicHourly(
      { time: TIMES, temperature_2m_gfs_seamless: [10, 11, 12] },
      ['gfs_seamless', 'icon_seamless'],
    )

    // Constrains the `requested.filter(...)` that builds `unavailable`. If it
    // returned [] the caller would report full coverage at a point one model
    // does not reach.
    expect(parsed.unavailable).toEqual(['icon_seamless'])
    expect(parsed.models).toHaveLength(1)
  })

  it('refuses to attribute a bare column when more than one model was asked for', () => {
    // The measured degraded shape: asking for gfs + hrrr outside CONUS answers
    // 200 with an unsuffixed series and no mention that hrrr was dropped.
    const parsed = parseDeterministicHourly({ time: TIMES, temperature_2m: [10, 11, 12] }, [
      'gfs_seamless',
      'ncep_hrrr_conus',
    ])

    // Constrains the `requested.length === 1` guard. Remove it and this returns
    // one model — labelled with whichever name happened to be first.
    expect(parsed.ambiguous).toBe(true)
    expect(parsed.models).toEqual([])
    expect(parsed.unavailable).toEqual([])
  })

  it('attributes a bare column when exactly one model was asked for', () => {
    const parsed = parseDeterministicHourly({ time: TIMES, temperature_2m: [10, 11, 12] }, [
      'ncep_hrrr_conus',
    ])

    expect(parsed.ambiguous).toBe(false)
    expect(parsed.models[0]?.model).toBe('ncep_hrrr_conus')
    expect(parsed.models[0]?.hours.map((h) => h.temp_c)).toEqual([10, 11, 12])
  })

  it('reports every requested model unavailable when the payload carries no columns', () => {
    const parsed = parseDeterministicHourly({ time: TIMES }, ['gfs_seamless', 'icon_seamless'])

    // Constrains the `hasUnsuffixedColumns` branch: an empty payload must be
    // "no coverage", never "ambiguous", or the caller re-fetches for nothing.
    expect(parsed.ambiguous).toBe(false)
    expect(parsed.unavailable).toEqual(['gfs_seamless', 'icon_seamless'])
  })

  it('keeps a null-filled column null instead of zero', () => {
    // NBM defines surface_pressure and returns nothing but nulls for it, at
    // every point Probe A measured.
    const parsed = parseDeterministicHourly(
      {
        time: TIMES,
        temperature_2m_ncep_nbm_conus: [10, 11, 12],
        surface_pressure_ncep_nbm_conus: [null, null, null],
      },
      ['ncep_nbm_conus'],
    )

    // Constrains the `?? null` in `hoursForModel`. With `?? 0` this reads
    // 0 mb — a pressure a table would print without hesitation.
    expect(parsed.models[0]?.hours.map((h) => h.pressure_hpa)).toEqual([null, null, null])
  })

  it('keeps hours past a model horizon null instead of zero', () => {
    // The array is shorter than `time`: HRRR's 54h against a 276h request.
    const parsed = parseDeterministicHourly(
      { time: TIMES, temperature_2m_ncep_hrrr_conus: [10], wind_speed_10m_ncep_hrrr_conus: [4] },
      ['ncep_hrrr_conus'],
    )

    const hours = parsed.models[0]?.hours ?? []
    expect(hours).toHaveLength(3)
    // Same `?? null` line, reached by a short array rather than an explicit
    // null — 0 °C and 0 km/h are the values `?? 0` would invent here.
    expect(hours[2]?.temp_c).toBeNull()
    expect(hours[2]?.wind_kmh).toBeNull()
  })
})

describe('markSharedProbability', () => {
  const withProbability = (model: string, values: (number | null)[]): ModelHourly => ({
    model,
    probability_is_shared: false,
    hours: values.map((v, i) => ({
      valid_at_local: TIMES[i] ?? `2026-09-01T0${i}:00`,
      temp_c: null,
      dewpoint_c: null,
      humidity_pct: null,
      precip_mm: null,
      wind_kmh: null,
      wind_gust_kmh: null,
      wind_dir_deg: null,
      cloud_pct: null,
      precip_prob_pct: v,
      pressure_hpa: null,
    })),
  })

  it('marks both models when two probability series are identical', () => {
    const models = [
      withProbability('ncep_hrrr_conus', [10, 20, 30]),
      withProbability('ncep_nbm_conus', [10, 20, 30]),
      withProbability('gfs_seamless', [5, 5, 5]),
    ]
    markSharedProbability(models)

    // Constrains the `bucket.length > 1` test. Without it nothing is ever
    // marked, and Phase 3 heads an unattributable column with a model name.
    expect(models[0]?.probability_is_shared).toBe(true)
    expect(models[1]?.probability_is_shared).toBe(true)
    expect(models[2]?.probability_is_shared).toBe(false)
  })

  it('does not treat two models with no probability at all as sharing one', () => {
    const models = [
      withProbability('gfs_seamless', [null, null, null]),
      withProbability('icon_seamless', [null, null, null]),
    ]
    markSharedProbability(models)

    // Constrains the `values.every((v) => v === null)` skip. Drop it and two
    // absent series serialise identically and mark each other as shared.
    expect(models.map((m) => m.probability_is_shared)).toEqual([false, false])
  })
})

describe('localTimeToUtc', () => {
  it('shifts a local wall-clock time by the offset', () => {
    // -25200 is the offset Open-Meteo reported for Red Rock.
    const utc = localTimeToUtc('2026-09-01T12:00', -25200)
    // Constrains the sign of `asUtc - offset * 1000`. Adding instead of
    // subtracting lands on 05:00Z, which is 14 hours off.
    expect(utc?.toISOString()).toBe('2026-09-01T19:00:00.000Z')
  })

  it('returns null for a slot that did not parse', () => {
    // `toStringArray` turns a malformed element into '', and this is what
    // stops that becoming the epoch.
    expect(localTimeToUtc('', 0)).toBeNull()
    expect(localTimeToUtc('not-a-time', 0)).toBeNull()
  })

  it('treats a non-finite offset as UTC rather than producing an invalid date', () => {
    const utc = localTimeToUtc('2026-09-01T12:00', Number.NaN)
    // Constrains the `Number.isFinite(utcOffsetSeconds)` guard: without it the
    // arithmetic yields an Invalid Date whose toISOString throws.
    expect(utc?.toISOString()).toBe('2026-09-01T12:00:00.000Z')
  })
})

describe('parseEnsembleHourly', () => {
  // Two GFS members and one ECMWF member. The ECMWF array is short on purpose:
  // one model reaching its horizon before the others is the normal case.
  const hourly = {
    time: TIMES,
    precipitation_member01_ncep_gefs_seamless: [0, 2, 4],
    precipitation_ncep_gefs_seamless: [0, 4, 8],
    precipitation_member01_ecmwf_ifs025_ensemble: [0, 6],
    temperature_2m_member01_ncep_gefs_seamless: [10, 12, 14],
    windspeed_10m_member01_ncep_gefs_seamless: [5, 6, 7],
  }

  it('counts members per model, and the count falls as a model runs out', () => {
    const hours = parseEnsembleHourly(hourly)

    expect(hours[1]?.member_count).toBe(3)
    expect(hours[1]?.model_member_counts).toEqual({ gfs_seamless: 2, ecmwf_ifs025: 1 })
    // Constrains the per-hour `valuesAtHour(...).length` and the `n > 0` guard.
    // A count taken once per run instead of per hour would say 3 here too, and
    // name ECMWF as contributing to an hour it does not reach.
    expect(hours[2]?.member_count).toBe(2)
    expect(hours[2]?.model_member_counts).toEqual({ gfs_seamless: 2 })
  })

  it('returns null, not zero, for a variable no member reported', () => {
    const hours = parseEnsembleHourly(hourly)

    // Only GFS carried temperature and wind, and only for these hours; a
    // variable with no members at all must not read as a measurement.
    expect(hours[0]?.temp_c_p50).toBe(10)
    const noTemp = parseEnsembleHourly({
      time: TIMES,
      precipitation_ncep_gefs_seamless: [1, 1, 1],
    })
    // Constrains `percentileOrNull`'s empty guard. `computePercentile` answers
    // 0 for an empty array, which renders as 0 °C.
    expect(noTemp[0]?.temp_c_p50).toBeNull()
    expect(noTemp[0]?.wind_kmh_p90).toBeNull()
    expect(noTemp[0]?.precip_mm_p50).toBe(1)
  })

  it('counts the members over the measurable threshold, not the ones above zero', () => {
    const hours = parseEnsembleHourly({
      time: TIMES,
      // 0.05 mm is below Open-Meteo's own 0.1 mm resolution: a member reporting
      // it is a member reporting nothing, and counting it would put a chance of
      // rain on a dry hour.
      precipitation_ncep_gefs_seamless: [0, 0.05, 0.1],
      precipitation_member01_ncep_gefs_seamless: [0, 2, 2],
    })

    expect(hours.map((h) => h.members_wet)).toEqual([0, 1, 2])
    expect(hours.map((h) => h.member_count)).toEqual([2, 2, 2])
  })

  it('keeps the ensemble mean, which is the only precipitation figure that adds up', () => {
    const hours = parseEnsembleHourly({
      time: TIMES,
      precipitation_ncep_gefs_seamless: [0, 0, 4],
      precipitation_member01_ncep_gefs_seamless: [0, 2, 0],
    })

    // A p50 of these hours is 0, 1, 2 — summing those is the median of nothing.
    // The means sum to the mean of the members' totals, which is what a day
    // total is built from.
    expect(hours.map((h) => h.precip_mm_mean)).toEqual([0, 1, 2])
  })

  it('has no mean and no wet count past the horizon, rather than zero of each', () => {
    const hours = parseEnsembleHourly({
      time: TIMES,
      precipitation_ncep_gefs_seamless: [1, null, null],
    })

    // Constrains the `precip.length === 0` guard. A mean of an empty array is
    // NaN and a sum seeded at 0 would be 0 mm — a forecast of no rain for an
    // hour no member reached.
    expect(hours[1]?.precip_mm_mean).toBeNull()
    expect(hours[1]?.member_count).toBe(0)
    expect(hours[1]?.members_wet).toBe(0)
  })

  it('skips a time slot that could not be read', () => {
    const hours = parseEnsembleHourly({
      time: ['2026-09-01T00:00', 42, '2026-09-01T02:00'],
      precipitation_ncep_gefs_seamless: [1, 1, 1],
    })
    // `toStringArray` maps the non-string to '' to preserve indexing; this
    // constrains the `if (!valid_at_local) continue` that drops it rather than
    // emitting an hour with no timestamp.
    expect(hours.map((h) => h.valid_at_local)).toEqual([
      '2026-09-01T00:00',
      '2026-09-01T02:00',
    ])
  })
})

describe('parseEnsemble per-model output', () => {
  const sixVariables = (suffix: string, scale: number): Record<string, number[]> => ({
    [`precipitation${suffix}`]: [0, scale],
    [`temperature_2m${suffix}`]: [10 * scale, 12 * scale],
    [`windspeed_10m${suffix}`]: [5, 6],
    [`relativehumidity_2m${suffix}`]: [40, 50],
    [`dewpoint_2m${suffix}`]: [1, 2],
    [`shortwave_radiation${suffix}`]: [100, 200],
  })

  it('reports each model separately as well as pooled', () => {
    const result = parseEnsemble({
      time: ['2026-09-01T00:00', '2026-09-01T01:00'],
      ...sixVariables('_ncep_gefs_seamless', 1),
      ...sixVariables('_ecmwf_ifs025_ensemble', 2),
    })

    expect(result.by_model?.map((m) => m.model)).toEqual(['gfs_seamless', 'ecmwf_ifs025'])
    // Constrains `arraysFor` picking the entry whose model matches. Pointing it
    // at the flattened arrays instead would give both models the pooled number.
    expect(result.by_model?.[0]?.days[0]?.temp_c_max).toBe(12)
    expect(result.by_model?.[1]?.days[0]?.temp_c_max).toBe(24)
    expect(result.partial_models).toEqual([])
  })

  it('names a model that returned precipitation but not every variable, instead of scoring it', () => {
    const result = parseEnsemble({
      time: ['2026-09-01T00:00', '2026-09-01T01:00'],
      ...sixVariables('_ncep_gefs_seamless', 1),
      precipitation_ecmwf_ifs025_ensemble: [0, 3],
    })

    // Constrains the `some((a) => a.length === 0)` test. Without it ECMWF gets
    // a row whose temp_c_max is `ensembleMedian([], 0)` — a fabricated 0 °C
    // high published under that model's name.
    expect(result.by_model?.map((m) => m.model)).toEqual(['gfs_seamless'])
    expect(result.partial_models).toEqual(['ecmwf_ifs025'])
    // It still contributed to the pooled precipitation, so it is still a source.
    expect(result.model_sources).toEqual(['gfs_seamless', 'ecmwf_ifs025'])
  })
})
