import { logger } from '../logger.js'

export type DailyForecast = {
  date: string // YYYY-MM-DD
  precip_mm_p10: number
  precip_mm_p50: number
  precip_mm_p90: number
  temp_c_min: number
  temp_c_max: number
  wind_kmh_max: number
  humidity_pct: number
  dewpoint_c: number
  shortwave_wm2: number
}

export type OpenMeteoResult = {
  days: DailyForecast[]
  model_sources: string[]
  /**
   * The location's offset from UTC, as Open-Meteo resolved it from the
   * coordinates (`timezone=auto`). `0` when the upstream did not report one.
   *
   * Carried out of here because `date` on every `DailyForecast` is now a **local**
   * calendar day, so the caller cannot work out which of them is "today" from
   * `new Date()` alone — see issue #33.
   */
  utc_offset_seconds: number
}

export type ForecastLocation = {
  lat: number
  lon: number
  elevation_m: number | null
}

type EnsembleResponse = {
  latitude: number
  longitude: number
  elevation?: number
  utc_offset_seconds?: number
  hourly: Record<string, unknown>
}

type NbmResponse = {
  latitude: number
  longitude: number
  elevation?: number
  daily?: Record<string, unknown>
}

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const ENSEMBLE_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble'
/**
 * All four models are requested **and all four are read** (2026-08-26). Until
 * that date `parseEnsemble` filtered every array to GFS, so three quarters of
 * the payload was downloaded, parsed and discarded while the sources footer
 * named all four.
 */
const ENSEMBLE_MODELS = 'gfs_seamless,ecmwf_ifs025,icon_seamless_eps,gem_global'

/**
 * The suffix Open-Meteo appends to each model's member keys. Verified against
 * the live API 2026-08-26 — they are **not** the model names from
 * `ENSEMBLE_MODELS` and cannot be derived from them (`gfs_seamless` →
 * `_ncep_gefs_seamless`, `ecmwf_ifs025` → `_ecmwf_ifs025_ensemble`).
 *
 * Keys are the names reported in `model_sources`, so they must stay the
 * `ENSEMBLE_MODELS` spelling that a reader would recognise.
 */
const ENSEMBLE_MODEL_SUFFIXES: Record<string, string> = {
  gfs_seamless: '_ncep_gefs_seamless',
  ecmwf_ifs025: '_ecmwf_ifs025_ensemble',
  icon_seamless_eps: '_icon_seamless_eps',
  gem_global: '_gem_global_ensemble',
}
const HOURLY_VARS =
  'precipitation,temperature_2m,windspeed_10m,relativehumidity_2m,dewpoint_2m,shortwave_radiation'
const NBM_DAILY_VARS = [
  'precipitation_sum',
  'precipitation_p10',
  'precipitation_p50',
  'precipitation_p90',
  'temperature_2m_max',
  'temperature_2m_min',
  'wind_speed_10m_max',
  'relative_humidity_2m_mean',
  'dewpoint_2m_mean',
  'shortwave_radiation_sum',
].join(',')
const LAPSE_RATE_C_PER_M = 0.0065

export async function fetchWithRetry(
  url: string,
  maxAttempts = 4,
  headers?: Record<string, string>,
): Promise<Response> {
  let lastErr: Error = new Error('no attempts made')
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, headers ? { headers } : undefined)
      if (res.ok) return res
      if (res.status !== 429 && res.status < 500) return res
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
    }
    if (attempt < maxAttempts - 1) {
      const delay = Math.pow(2, attempt) * 1000
      await new Promise<void>((r) => setTimeout(r, delay))
    }
  }
  throw lastErr
}

// Element-validated extraction: Open-Meteo arrays may carry nulls, and a malformed
// response could carry string sentinels or NaN — anything non-finite becomes null so
// it can never leak into sums, percentiles, or stored snapshots. Coercions of
// actual values (not nulls) are logged: they mean the upstream format changed.
function toNullableNumberArray(record: Record<string, unknown>, key: string): (number | null)[] {
  const val = record[key]
  if (!Array.isArray(val)) return []
  let coerced = 0
  const out = val.map((v): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (v !== null && v !== undefined) coerced++
    return null
  })
  if (coerced > 0) {
    logger.warn({ key, coerced }, '[openMeteo] non-numeric values coerced to null')
  }
  return out
}

// Preserves array length: time arrays index-align with the value arrays, so a
// malformed slot becomes '' (skipped by consumers) rather than being filtered
// out, which would shift every subsequent index onto the wrong timestamp.
function toStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return []
  return val.map((t): string => (typeof t === 'string' ? t : ''))
}

export function buildDateIndex(times: string[]): Map<string, number[]> {
  const map = new Map<string, number[]>()
  for (let i = 0; i < times.length; i++) {
    const t = times[i]
    if (!t) continue
    const date = t.slice(0, 10)
    const bucket = map.get(date)
    if (bucket) {
      bucket.push(i)
    } else {
      map.set(date, [i])
    }
  }
  return map
}

export function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  const a = sorted[lo] ?? 0
  const b = sorted[hi] ?? 0
  return a + (b - a) * (idx - lo)
}

function mean(values: number[], fallback: number): number {
  if (values.length === 0) return fallback
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Every member array for one variable, from one model.
 *
 * Two key shapes are collected, both of which are real members:
 * `precipitation_member01_ncep_gefs_seamless` (a perturbed member) and
 * `precipitation_ncep_gefs_seamless` (the model's **control run** — the
 * unperturbed forecast, which the old GFS-only filter dropped because it
 * matched on the literal `_member` prefix).
 *
 * The suffixes in `ENSEMBLE_MODEL_SUFFIXES` are literal constants with no regex
 * metacharacters, so they are interpolated directly.
 */
function memberArraysFor(
  hourly: Record<string, unknown>,
  allKeys: string[],
  variable: string,
  suffix: string,
): (number | null)[][] {
  const pattern = new RegExp(`^${variable}(_member\\d+)?${suffix}$`)
  return allKeys.filter((k) => pattern.test(k)).map((k) => toNullableNumberArray(hourly, k))
}

/** The value at each member's own daily extreme, one entry per member. */
function perMemberDaily(
  arrays: (number | null)[][],
  indices: number[],
  reduce: (values: number[]) => number,
): number[] {
  const out: number[] = []
  for (const vals of arrays) {
    const dayValues: number[] = []
    for (const i of indices) {
      const v = vals[i]
      if (v !== null && v !== undefined) dayValues.push(v)
    }
    if (dayValues.length > 0) out.push(reduce(dayValues))
  }
  return out
}

/** Every hourly value from every member, flattened — for the mean-based fields. */
function allHourlyValues(arrays: (number | null)[][], indices: number[]): number[] {
  const out: number[] = []
  for (const vals of arrays) {
    for (const i of indices) {
      const v = vals[i]
      if (v !== null && v !== undefined) out.push(v)
    }
  }
  return out
}

/**
 * The ensemble's central estimate for a per-member daily figure.
 *
 * **This is the change that matters for what a user reads.** `temp_c_max` used
 * to be `Math.max()` over every member *and* every hour — i.e. the single
 * hottest hour of the single hottest member. Against 139 live members on
 * 2026-08-26 that read **39.1 °C (102.4 °F)** for Red Rock while the median
 * member's daily high was **37.0 °C (98.6 °F)**: the screen was showing a worst
 * case and labelling it "High". Pooling four models instead of one would have
 * made that strictly worse, since the maximum can only rise as members are
 * added.
 *
 * Taking the median of each member's own daily extreme is the standard ensemble
 * central estimate and is robust to one wild member. `computePercentile` is
 * reused so the interpolation matches the precipitation quantiles.
 */
function ensembleMedian(perMember: number[], fallback: number): number {
  if (perMember.length === 0) return fallback
  return computePercentile([...perMember].sort((a, b) => a - b), 50)
}

export function parseEnsemble(hourly: Record<string, unknown>): OpenMeteoResult {
  const times: string[] = toStringArray(hourly['time'])
  const dateIndex = buildDateIndex(times)
  const dates = [...dateIndex.keys()].sort()

  const allKeys = Object.keys(hourly)

  /**
   * **All four models are pooled**, not just GFS (changed 2026-08-26 on the
   * user's call: "I want to be using all the models possible so we have
   * accuracy"). Live member counts: GFS 30, ECMWF 50, ICON 39, GEM 20, plus one
   * control run each — 143 members against 30 before.
   *
   * Members are pooled unweighted, so a model contributes in proportion to how
   * many members it runs and ECMWF carries the most weight. That is the ordinary
   * multi-model ensemble convention, and it is a deliberate choice rather than
   * an oversight — equal-weighting the four models would need a documented
   * reason to override member counts.
   *
   * Extract and validate each member array once: the same arrays are reused for
   * every date, so doing this inside the date loop would redo O(hours)
   * validation per date per key.
   */
  const byVariable = (variable: string): { model: string; arrays: (number | null)[][] }[] =>
    Object.entries(ENSEMBLE_MODEL_SUFFIXES)
      .map(([model, suffix]) => ({
        model,
        arrays: memberArraysFor(hourly, allKeys, variable, suffix),
      }))
      .filter((entry) => entry.arrays.length > 0)

  const precipByModel = byVariable('precipitation')
  const flatten = (variable: string): (number | null)[][] =>
    byVariable(variable).flatMap((entry) => entry.arrays)

  const precipArrs = precipByModel.flatMap((entry) => entry.arrays)
  const tempArrs = flatten('temperature_2m')
  const windArrs = flatten('windspeed_10m')
  const humidArrs = flatten('relativehumidity_2m')
  const dewpointArrs = flatten('dewpoint_2m')
  const shortwaveArrs = flatten('shortwave_radiation')

  /**
   * **What was actually read, never what was asked for.**
   *
   * Rendered verbatim in the Mini App's sources footer and the bot reply, and
   * §3 forbids naming a source that did not contribute. Derived from the models
   * that yielded **precipitation** members specifically — not the union across
   * variables — so a model missing from a partial upstream response drops out of
   * the attribution instead of being claimed. Precipitation is the right axis to
   * key on: it is the variable the score leans on hardest, and under-claiming a
   * model that returned only temperature is the safe direction of error.
   *
   * It previously listed ECMWF, ICON and GEM whenever their keys were merely
   * *present*, while every extraction filtered to GFS — three models named that
   * moved no number on screen. Now they genuinely do.
   */
  const model_sources: string[] = precipByModel.map((entry) => entry.model)

  const days: DailyForecast[] = []

  for (const date of dates) {
    const indices = dateIndex.get(date) ?? []
    if (indices.length === 0) continue

    // Daily precip total per member, pooled across models → percentiles. The
    // p10/p90 spread is what `confidenceFromSpread` reads, so a genuine
    // multi-model disagreement now shows up as lower confidence instead of
    // being hidden behind one model's internal agreement.
    const memberDailySums: number[] = precipArrs.map((vals) =>
      indices.reduce((acc, i) => acc + (vals[i] ?? 0), 0),
    )
    memberDailySums.sort((a, b) => a - b)

    const memberHighs = perMemberDaily(tempArrs, indices, (v) => Math.max(...v))
    const memberLows = perMemberDaily(tempArrs, indices, (v) => Math.min(...v))
    const memberPeakWinds = perMemberDaily(windArrs, indices, (v) => Math.max(...v))

    const humids = allHourlyValues(humidArrs, indices)
    const dewpoints = allHourlyValues(dewpointArrs, indices)
    const shortwaves = allHourlyValues(shortwaveArrs, indices)

    days.push({
      date,
      precip_mm_p10: computePercentile(memberDailySums, 10),
      precip_mm_p50: computePercentile(memberDailySums, 50),
      precip_mm_p90: computePercentile(memberDailySums, 90),
      temp_c_min: ensembleMedian(memberLows, 0),
      temp_c_max: ensembleMedian(memberHighs, 0),
      wind_kmh_max: ensembleMedian(memberPeakWinds, 0),
      humidity_pct: mean(humids, 50),
      dewpoint_c: mean(dewpoints, 0),
      shortwave_wm2: mean(shortwaves, 0),
    })
  }

  // Offset is filled in by the caller, which is the only place the envelope is
  // visible. `parseEnsemble` is given `hourly` alone so it stays directly
  // testable against a fixture.
  return { days, model_sources, utc_offset_seconds: 0 }
}

function applyLapseRate(
  days: DailyForecast[],
  cragElevation: number | null,
  modelElevation: number | undefined,
): void {
  if (cragElevation === null || modelElevation === undefined) return
  const elevationDelta = cragElevation - modelElevation
  if (elevationDelta === 0) return
  for (const day of days) {
    day.temp_c_min -= elevationDelta * LAPSE_RATE_C_PER_M
    day.temp_c_max -= elevationDelta * LAPSE_RATE_C_PER_M
  }
}

/**
 * Fetch the multi-model ensemble forecast and reduce it to daily values.
 *
 * @throws {Error} on HTTP failure after exhausting fetchWithRetry's 4 attempts, or
 * immediately on a non-retryable non-ok status. No internal fallback — callers must catch.
 */
export async function fetchEnsemble(location: ForecastLocation): Promise<OpenMeteoResult> {
  const url = new URL(ENSEMBLE_URL)
  url.searchParams.set('latitude', String(location.lat))
  url.searchParams.set('longitude', String(location.lon))
  url.searchParams.set('models', ENSEMBLE_MODELS)
  url.searchParams.set('hourly', HOURLY_VARS)
  /**
   * **Local days, resolved from the coordinates** (issue #33).
   *
   * This requested `timezone=UTC` until 2026-08-26, so every daily bucket was a
   * UTC day: for anywhere in the Americas "today" rolled over in the late
   * afternoon local time and the screen relabelled tomorrow's high as today's.
   * `timezone=auto` makes Open-Meteo bucket the hourly series into the
   * location's own calendar days and report `utc_offset_seconds` back.
   *
   * `auto` rather than the stored `locations.timezone` deliberately: it needs no
   * timezone database in-process, and it is the only option that also works for
   * `GET /preview`, where there is no saved row to read a timezone from.
   */
  url.searchParams.set('timezone', 'auto')

  logger.debug({ lat: location.lat, lon: location.lon }, '[openMeteo] fetching ensemble forecast')

  const res = await fetchWithRetry(url.toString())
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    logger.debug(
      { statusCode: res.status, body: body.slice(0, 200) },
      '[openMeteo] ensemble error response',
    )
    throw new Error(`Open-Meteo ensemble API returned ${res.status}`)
  }

  const raw = (await res.json()) as EnsembleResponse
  const parsed = parseEnsemble(raw.hourly)
  applyLapseRate(parsed.days, location.elevation_m, raw.elevation)
  // Falls back to 0 (i.e. UTC) rather than guessing. A missing offset with local
  // day buckets would misidentify "today" by at most one day, which is the old
  // behaviour — not worse than it, and never a fabricated timezone.
  parsed.utc_offset_seconds =
    typeof raw.utc_offset_seconds === 'number' && Number.isFinite(raw.utc_offset_seconds)
      ? raw.utc_offset_seconds
      : 0
  return parsed
}

/**
 * The location's current calendar date, given its offset from UTC.
 *
 * Shifting the epoch and then reading the **UTC** date of the shifted instant is
 * what makes this correct without a timezone database: it is exactly what
 * Open-Meteo did to bucket the hourly series, so the string this returns matches
 * one of the `date` values in the same response.
 */
export function localDateString(now: Date, utcOffsetSeconds: number): string {
  // A non-finite offset would make the shifted Date invalid and `toISOString()`
  // throw — or, if it were merely sliced, put the literal "Invalid Date" into a
  // forecast_date comparison. Treat anything unusable as UTC: that is the old
  // behaviour, which is wrong by at most a day, rather than a crash.
  const offset = Number.isFinite(utcOffsetSeconds) ? utcOffsetSeconds : 0
  return new Date(now.getTime() + offset * 1000).toISOString().slice(0, 10)
}

/**
 * Fetch the NBM daily forecast.
 *
 * Returns null only for shape problems (missing daily payload, missing p10/p90
 * quantiles, empty time axis) so the caller can fall back to the ensemble.
 *
 * @throws {Error} on HTTP failure after exhausting fetchWithRetry's 4 attempts, or
 * immediately on a non-retryable non-ok status. No internal fallback — callers must catch.
 */
export async function fetchNBM(
  location: ForecastLocation,
): Promise<OpenMeteoResult | null> {
  const url = new URL(FORECAST_URL)
  url.searchParams.set('latitude', String(location.lat))
  url.searchParams.set('longitude', String(location.lon))
  url.searchParams.set('models', 'ncep_nbm_conus')
  url.searchParams.set('daily', NBM_DAILY_VARS)
  url.searchParams.set('timezone', 'UTC')

  logger.debug({ lat: location.lat, lon: location.lon }, '[openMeteo] fetching NBM forecast')

  const res = await fetchWithRetry(url.toString())
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    logger.debug(
      { statusCode: res.status, body: body.slice(0, 200) },
      '[openMeteo] NBM error response',
    )
    throw new Error(`Open-Meteo NBM API returned ${res.status}`)
  }

  const raw = (await res.json()) as NbmResponse
  const daily = raw.daily
  if (!daily) {
    logger.debug({}, '[openMeteo] NBM response had no daily payload — falling back to ensemble')
    return null
  }

  // Decision rule: return null if either quantile key is missing.
  if (!Array.isArray(daily['precipitation_p10']) || !Array.isArray(daily['precipitation_p90'])) {
    logger.debug(
      {},
      '[openMeteo] NBM response missing precipitation_p10/p90 — falling back to ensemble',
    )
    return null
  }

  const times: string[] = toStringArray(daily['time'])
  if (times.length === 0) return null

  const p10 = toNullableNumberArray(daily, 'precipitation_p10')
  const p50Arr = toNullableNumberArray(daily, 'precipitation_p50')
  const p50Fallback = toNullableNumberArray(daily, 'precipitation_sum')
  const p90 = toNullableNumberArray(daily, 'precipitation_p90')
  const tMin = toNullableNumberArray(daily, 'temperature_2m_min')
  const tMax = toNullableNumberArray(daily, 'temperature_2m_max')
  const wind = toNullableNumberArray(daily, 'wind_speed_10m_max')
  const humid = toNullableNumberArray(daily, 'relative_humidity_2m_mean')
  const dew = toNullableNumberArray(daily, 'dewpoint_2m_mean')
  const shortwave = toNullableNumberArray(daily, 'shortwave_radiation_sum')

  const days: DailyForecast[] = []
  for (let i = 0; i < times.length; i++) {
    const date = times[i]
    if (!date) continue
    const p50Val = p50Arr[i] ?? p50Fallback[i] ?? 0
    days.push({
      date,
      precip_mm_p10: p10[i] ?? 0,
      precip_mm_p50: p50Val,
      precip_mm_p90: p90[i] ?? 0,
      temp_c_min: tMin[i] ?? 0,
      temp_c_max: tMax[i] ?? 0,
      wind_kmh_max: wind[i] ?? 0,
      humidity_pct: humid[i] ?? 50,
      dewpoint_c: dew[i] ?? 0,
      shortwave_wm2: shortwave[i] ?? 0,
    })
  }

  applyLapseRate(days, location.elevation_m, raw.elevation)

  // NBM is unused (issue #22). It kept requesting timezone=UTC, so 0 is the
  // honest offset for the buckets it would produce.
  return { days, model_sources: ['nbm'], utc_offset_seconds: 0 }
}

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'

export type ArchiveDailyPrecip = {
  date: string // YYYY-MM-DD
  precip_mm: number
}

/**
 * Fetch daily precipitation totals from Open-Meteo's historical archive, for
 * locations with no nearby ASOS station (see fetchPrecipHistory in acis.ts,
 * which is preferred when a station is available).
 *
 * @throws {Error} on HTTP failure after exhausting fetchWithRetry's 4 attempts, or
 * immediately on a non-retryable non-ok status.
 */
export async function fetchArchivePrecip(
  lat: number,
  lon: number,
  fromDate: string,
  toDate: string,
): Promise<ArchiveDailyPrecip[]> {
  const url = new URL(ARCHIVE_URL)
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('start_date', fromDate)
  url.searchParams.set('end_date', toDate)
  url.searchParams.set('daily', 'precipitation_sum')
  // Local days, matching the forecast call. A rain "day" must mean the same
  // thing on both sides of the drying model: bucketing rainfall by UTC day while
  // the forecast is bucketed locally would put an evening shower on the wrong
  // date and shift hours-since-rain by up to a day.
  url.searchParams.set('timezone', 'auto')

  logger.debug({ lat, lon, fromDate, toDate }, '[openMeteo] fetching archive precip history')

  const res = await fetchWithRetry(url.toString())
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    logger.debug(
      { statusCode: res.status, body: body.slice(0, 200) },
      '[openMeteo] archive error response',
    )
    throw new Error(`Open-Meteo archive API returned ${res.status}`)
  }

  const raw = (await res.json()) as { daily?: Record<string, unknown> }
  const daily = raw.daily
  if (!daily) return []

  const times = toStringArray(daily['time'])
  const precip = toNullableNumberArray(daily, 'precipitation_sum')

  const out: ArchiveDailyPrecip[] = []
  for (let i = 0; i < times.length; i++) {
    const date = times[i]
    const mm = precip[i]
    if (!date || mm === null || mm === undefined) continue
    out.push({ date, precip_mm: mm })
  }
  return out
}
