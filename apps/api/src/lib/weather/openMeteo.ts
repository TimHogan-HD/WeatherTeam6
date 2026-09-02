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

/** One ensemble model's own view of the same days, and how many members it ran. */
export type EnsembleModelDays = {
  model: string
  /** Members that reported precipitation — the axis `model_sources` is keyed on. */
  member_count: number
  days: DailyForecast[]
}

export type OpenMeteoResult = {
  days: DailyForecast[]
  model_sources: string[]
  /**
   * The same days computed **per model** instead of pooled, for the bot's
   * model-disagreement views. `parseEnsemble` used to flatten the per-model
   * grouping it had already built and throw the attribution away.
   *
   * Absent on results that have no ensemble behind them at all (`fetchNBM`) —
   * **a missing value is unknown here, not "one model"**.
   */
  by_model?: EnsembleModelDays[]
  /**
   * Models that returned precipitation members but not all six variables, so no
   * honest daily row can be built for them. Named rather than dropped: silently
   * omitting one makes `by_model` look like the whole ensemble.
   */
  partial_models?: string[]
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

/** Member arrays for one variable, grouped by the model that produced them. */
type ModelArrays = { model: string; arrays: (number | null)[][] }

/** The six variables the daily reduction reads, each as a set of member arrays. */
type MemberArrays = {
  precip: (number | null)[][]
  temp: (number | null)[][]
  wind: (number | null)[][]
  humid: (number | null)[][]
  dewpoint: (number | null)[][]
  shortwave: (number | null)[][]
}

/**
 * Reduce a set of member arrays to one `DailyForecast` per local day.
 *
 * Extracted so the pooled ensemble and each individual model go through
 * **exactly** the same reduction — a per-model view computed by a second,
 * similar-looking loop is how two numbers that should agree drift apart.
 */
function computeDays(
  dates: string[],
  dateIndex: Map<string, number[]>,
  arrs: MemberArrays,
): DailyForecast[] {
  const days: DailyForecast[] = []

  for (const date of dates) {
    const indices = dateIndex.get(date) ?? []
    if (indices.length === 0) continue

    // Daily precip total per member → percentiles. Called with every model's
    // members pooled, the p10/p90 spread is what `confidenceFromSpread` reads,
    // so a genuine multi-model disagreement shows up as lower confidence instead
    // of being hidden behind one model's internal agreement. Called with one
    // model's members it is that model's own spread.
    const memberDailySums: number[] = arrs.precip.map((vals) =>
      indices.reduce((acc, i) => acc + (vals[i] ?? 0), 0),
    )
    memberDailySums.sort((a, b) => a - b)

    const memberHighs = perMemberDaily(arrs.temp, indices, (v) => Math.max(...v))
    const memberLows = perMemberDaily(arrs.temp, indices, (v) => Math.min(...v))
    const memberPeakWinds = perMemberDaily(arrs.wind, indices, (v) => Math.max(...v))

    const humids = allHourlyValues(arrs.humid, indices)
    const dewpoints = allHourlyValues(arrs.dewpoint, indices)
    const shortwaves = allHourlyValues(arrs.shortwave, indices)

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

  return days
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
  const tempByModel = byVariable('temperature_2m')
  const windByModel = byVariable('windspeed_10m')
  const humidByModel = byVariable('relativehumidity_2m')
  const dewpointByModel = byVariable('dewpoint_2m')
  const shortwaveByModel = byVariable('shortwave_radiation')

  const flatten = (entries: ModelArrays[]): (number | null)[][] =>
    entries.flatMap((entry) => entry.arrays)

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

  const days = computeDays(dates, dateIndex, {
    precip: flatten(precipByModel),
    temp: flatten(tempByModel),
    wind: flatten(windByModel),
    humid: flatten(humidByModel),
    dewpoint: flatten(dewpointByModel),
    shortwave: flatten(shortwaveByModel),
  })

  /**
   * The same reduction run per model, so a caller can say **which** models
   * disagree rather than only that the pooled spread is wide.
   *
   * A model is included only when it yielded members for all six variables.
   * `computeDays` falls back to 0 / 50 for a variable with no members — correct
   * for the pooled case, where the alternative is no row at all, but for one
   * model it would put a fabricated 0 °C high under that model's name. Models
   * that fail the test are named in `partial_models` instead of vanishing.
   */
  const arraysFor = (entries: ModelArrays[], model: string): (number | null)[][] =>
    entries.find((e) => e.model === model)?.arrays ?? []

  const by_model: EnsembleModelDays[] = []
  const partial_models: string[] = []

  for (const entry of precipByModel) {
    const model = entry.model
    const arrs: MemberArrays = {
      precip: entry.arrays,
      temp: arraysFor(tempByModel, model),
      wind: arraysFor(windByModel, model),
      humid: arraysFor(humidByModel, model),
      dewpoint: arraysFor(dewpointByModel, model),
      shortwave: arraysFor(shortwaveByModel, model),
    }
    if (Object.values(arrs).some((a) => a.length === 0)) {
      partial_models.push(model)
      continue
    }
    by_model.push({
      model,
      member_count: entry.arrays.length,
      days: computeDays(dates, dateIndex, arrs),
    })
  }

  // Offset is filled in by the caller, which is the only place the envelope is
  // visible. `parseEnsemble` is given `hourly` alone so it stays directly
  // testable against a fixture.
  return { days, model_sources, by_model, partial_models, utc_offset_seconds: 0 }
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
function buildEnsembleUrl(location: ForecastLocation): URL {
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
  return url
}

export async function fetchEnsemble(location: ForecastLocation): Promise<OpenMeteoResult> {
  const url = buildEnsembleUrl(location)

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

// ---------------------------------------------------------------------------
// Recent hourly rainfall — so "when did it last rain" can answer with a clock
// time instead of a calendar day.
// ---------------------------------------------------------------------------

/** One past hour of measured/reanalysed precipitation, stamped in local wall-clock time. */
export type RecentPrecipHour = {
  /** `YYYY-MM-DDTHH:mm`, local, exactly as Open-Meteo returned it under `timezone=auto`. */
  readonly valid_at_local: string
  readonly precip_mm: number
}

export type RecentPrecip = {
  readonly hours: readonly RecentPrecipHour[]
  readonly utc_offset_seconds: number
  /** The oldest local date the window covers, so a caller knows what a miss means. */
  readonly from_date: string | null
}

/**
 * Hourly precipitation over the past `pastDays`, from `/v1/forecast`'s
 * `past_days`.
 *
 * **Why this exists at all:** the rainfall record behind the drying model is a
 * *daily* series — ACIS day totals, or the archive API's `precipitation_sum` —
 * so the most it could ever say was "it rained today". That is useless to
 * someone deciding whether the rock has had time to dry: rain that stopped at
 * 3am and rain still falling at 5pm are the same sentence.
 *
 * **The timing and the amount must come from this same series.** The daily
 * lookup at a station can report a different total for the same day (a gauge
 * against a model reanalysis), and quoting one number beside the other's
 * timestamp would put two sources in one sentence — the attribution defect this
 * repo keeps shipping. The caller reports either this series or the daily one,
 * never halves of both.
 *
 * `past_days` is capped at 92 upstream. Anything older is the daily lookup's
 * job, and the caller falls back to it rather than reporting no rain.
 *
 * @throws {Error} on HTTP failure, like every other fetch here. A caller must
 *   distinguish that from "no rain in the window" (issue #34).
 */
export async function fetchRecentHourlyPrecip(
  lat: number,
  lon: number,
  pastDays: number,
): Promise<RecentPrecip> {
  const url = new URL(FORECAST_URL)
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('hourly', 'precipitation')
  url.searchParams.set('past_days', String(Math.max(1, Math.min(92, Math.trunc(pastDays)))))
  // One forecast day, not zero: the current hour lives in it, and rain that is
  // falling right now is the case this whole function exists for.
  url.searchParams.set('forecast_days', '1')
  // Local hours, matching every other call. Issue #33.
  url.searchParams.set('timezone', 'auto')

  logger.debug({ lat, lon, pastDays }, '[openMeteo] fetching recent hourly precip')

  const res = await fetchWithRetry(url.toString())
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    logger.debug(
      { statusCode: res.status, body: body.slice(0, 200) },
      '[openMeteo] recent hourly precip error response',
    )
    throw new Error(`Open-Meteo hourly precip returned ${res.status}`)
  }

  const raw = (await res.json()) as {
    hourly?: Record<string, unknown>
    utc_offset_seconds?: unknown
  }
  const hourly = raw.hourly
  const offset = typeof raw.utc_offset_seconds === 'number' ? raw.utc_offset_seconds : 0
  if (!hourly) return { hours: [], utc_offset_seconds: offset, from_date: null }

  const times = toStringArray(hourly['time'])
  const precip = toNullableNumberArray(hourly, 'precipitation')

  const hours: RecentPrecipHour[] = []
  for (let i = 0; i < times.length; i++) {
    const at = times[i]
    const mm = precip[i]
    // A null hour is not a dry hour. Dropping it is right here because the
    // caller only ever looks for the *last wet* hour — an absent reading can
    // never be that, and keeping it as 0 would assert a dry hour nobody measured.
    if (!at || mm === null || mm === undefined) continue
    hours.push({ valid_at_local: at, precip_mm: mm })
  }

  return {
    hours,
    utc_offset_seconds: offset,
    from_date: times[0]?.slice(0, 10) ?? null,
  }
}

// ---------------------------------------------------------------------------
// Deterministic hourly — the data layer behind the bot's per-model tables.
// ---------------------------------------------------------------------------

/**
 * The deterministic models the bot offers, spelled exactly as
 * `.claude/docs/model-matrix.md` measured them.
 *
 * **These are not the ensemble spellings.** The ensemble runs
 * `icon_seamless_eps` and `gem_global`; the deterministic `/v1/forecast`
 * endpoint runs `icon_seamless` and `gem_seamless`. One list for both is how a
 * model gets fetched and silently ignored.
 */
export const GLOBAL_DETERMINISTIC_MODELS = [
  'gfs_seamless',
  'ecmwf_ifs025',
  'icon_seamless',
  'gem_seamless',
] as const

/** CONUS-only. Outside their domain the API answers 400, never nulls. */
export const CONUS_DETERMINISTIC_MODELS = ['ncep_hrrr_conus', 'ncep_nbm_conus'] as const

export const DETERMINISTIC_MODELS = [
  ...GLOBAL_DETERMINISTIC_MODELS,
  ...CONUS_DETERMINISTIC_MODELS,
] as const

export type DeterministicModel = (typeof DETERMINISTIC_MODELS)[number]

/**
 * Every hourly variable the deterministic fetch asks for, in the spelling the
 * `/v1/forecast` endpoint uses (`dew_point_2m`, not the ensemble endpoint's
 * `dewpoint_2m`). Each one is a measured column in the model matrix — asking for
 * a name a model rejects fails the **whole** request, not that column.
 */
const DETERMINISTIC_HOURLY_VARS = [
  'temperature_2m',
  'dew_point_2m',
  'relative_humidity_2m',
  'precipitation',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'cloud_cover',
  'precipitation_probability',
  'surface_pressure',
] as const

/** One hour of one model's deterministic output. Every field is nullable on purpose. */
export type HourlyPoint = {
  /**
   * Local wall-clock time exactly as Open-Meteo returned it under
   * `timezone=auto` — `YYYY-MM-DDTHH:mm`, with no zone designator. Pair it with
   * `utc_offset_seconds` through `localTimeToUtc` before storing or comparing.
   */
  valid_at_local: string
  temp_c: number | null
  dewpoint_c: number | null
  humidity_pct: number | null
  precip_mm: number | null
  wind_kmh: number | null
  wind_gust_kmh: number | null
  wind_dir_deg: number | null
  cloud_pct: number | null
  precip_prob_pct: number | null
  pressure_hpa: number | null
}

export type ModelHourly = {
  model: string
  hours: HourlyPoint[]
  /**
   * **True when this model's `precipitation_probability` series is byte-identical
   * to another model's in the same response**, which means at most one of them is
   * that model's own field and neither can be attributed.
   *
   * Probe A measured exactly this for `ncep_hrrr_conus` and `ncep_nbm_conus`:
   * identical arrays, running 276h against HRRR's 54h horizon. A renderer must
   * not head a probability column with a model name when this is set — that is
   * the attribution defect (`defect-patterns.md` section 3), and it is derived
   * here rather than hardcoded because which models share a series is an
   * upstream decision that can change.
   */
  probability_is_shared: boolean
}

export type DeterministicResult = {
  models: ModelHourly[]
  /**
   * Requested models that returned no series at this point — the coverage signal
   * Phase 3's model row is built from. **Named, never dropped**: a silently
   * omitted model makes a table look like it read everything it asked for.
   */
  unavailable_models: string[]
  utc_offset_seconds: number
  /** The elevation Open-Meteo resolved for the point — one value for the whole request, not per model. */
  model_elevation_m: number | null
  /**
   * When this was fetched. **Not a run initialization time** — Probe A found the
   * API exposes none, so a header may say "fetched 14:05Z" and never "12Z run".
   */
  fetched_at: Date
}

type DeterministicResponse = {
  utc_offset_seconds?: number
  elevation?: number
  hourly?: Record<string, unknown>
}

/**
 * Convert a local wall-clock timestamp from a `timezone=auto` response into the
 * real UTC instant.
 *
 * Open-Meteo returns `2026-09-01T12:00` with no zone: parsing it directly is
 * implementation-defined, and parsing it as UTC is wrong by the offset. Reading
 * it as UTC and then subtracting the offset is the exact inverse of what
 * `localDateString` does, so a value stored through here and a day bucketed by
 * Open-Meteo describe the same instant.
 *
 * Returns null rather than an `Invalid Date` for an unparseable string — a
 * malformed slot is a gap, and a gap that becomes the epoch is a fabricated
 * measurement.
 */
export function localTimeToUtc(local: string, utcOffsetSeconds: number): Date | null {
  if (!local) return null
  const asUtc = Date.parse(`${local}Z`)
  if (!Number.isFinite(asUtc)) return null
  const offset = Number.isFinite(utcOffsetSeconds) ? utcOffsetSeconds : 0
  return new Date(asUtc - offset * 1000)
}

/**
 * Group one model's hourly arrays into per-hour points.
 *
 * `suffix` is empty when the response came back unsuffixed — see
 * `parseDeterministicHourly` for when that happens and why it is only safe for a
 * single-model request.
 */
function hoursForModel(
  hourly: Record<string, unknown>,
  times: string[],
  suffix: string,
): HourlyPoint[] {
  const col = (variable: string): (number | null)[] =>
    toNullableNumberArray(hourly, `${variable}${suffix}`)

  const temp = col('temperature_2m')
  const dew = col('dew_point_2m')
  const rh = col('relative_humidity_2m')
  const precip = col('precipitation')
  const wind = col('wind_speed_10m')
  const gust = col('wind_gusts_10m')
  const dir = col('wind_direction_10m')
  const cloud = col('cloud_cover')
  const pop = col('precipitation_probability')
  const pressure = col('surface_pressure')

  const out: HourlyPoint[] = []
  for (let i = 0; i < times.length; i++) {
    const valid_at_local = times[i]
    if (!valid_at_local) continue
    out.push({
      valid_at_local,
      // Nullish to null, never to 0: past a model's own horizon these arrays are
      // shorter than `time`, and a missing hour that reads as 0 is a temperature
      // of 0 degrees and a wind of 0 km/h that nothing can tell from a
      // measurement (`defect-patterns.md` section 1).
      temp_c: temp[i] ?? null,
      dewpoint_c: dew[i] ?? null,
      humidity_pct: rh[i] ?? null,
      precip_mm: precip[i] ?? null,
      wind_kmh: wind[i] ?? null,
      wind_gust_kmh: gust[i] ?? null,
      wind_dir_deg: dir[i] ?? null,
      cloud_pct: cloud[i] ?? null,
      precip_prob_pct: pop[i] ?? null,
      pressure_hpa: pressure[i] ?? null,
    })
  }
  return out
}

/** Which requested models the response actually carries a suffixed column for. */
function suffixedModels(hourly: Record<string, unknown>, requested: readonly string[]): string[] {
  const keys = new Set(Object.keys(hourly))
  return requested.filter((model) =>
    DETERMINISTIC_HOURLY_VARS.some((variable) => keys.has(`${variable}_${model}`)),
  )
}

function hasUnsuffixedColumns(hourly: Record<string, unknown>): boolean {
  const keys = new Set(Object.keys(hourly))
  return DETERMINISTIC_HOURLY_VARS.some((variable) => keys.has(variable))
}

export type ParsedDeterministic = {
  models: ModelHourly[]
  unavailable: string[]
  /**
   * True when the response cannot be attributed to the models that were
   * requested, so the caller must re-ask one model at a time.
   */
  ambiguous: boolean
}

/**
 * Attribute a multi-model `/v1/forecast` response to the models that were asked for.
 *
 * **Measured 2026-08-31, and it is the trap in this endpoint:** Open-Meteo
 * suffixes hourly keys with the model name (`temperature_2m_gfs_seamless`) only
 * while **more than one** requested model has coverage at the point. Ask for
 * `gfs_seamless,ncep_hrrr_conus` in Chamonix and the answer is a **200** whose
 * only key is a bare `temperature_2m` — HRRR is dropped with no mention of it,
 * and the surviving series is unlabelled. Ask for `ncep_hrrr_conus` alone there
 * and the whole request is a 400.
 *
 * So a bare column is attributable only when exactly one model was requested.
 * Anything else is reported `ambiguous` and re-asked per model, which costs
 * extra requests only in the degraded case.
 */
export function parseDeterministicHourly(
  hourly: Record<string, unknown>,
  requested: readonly string[],
): ParsedDeterministic {
  const times = toStringArray(hourly['time'])
  const withSuffix = suffixedModels(hourly, requested)

  if (withSuffix.length === 0) {
    if (!hasUnsuffixedColumns(hourly)) {
      return { models: [], unavailable: [...requested], ambiguous: false }
    }
    const only = requested.length === 1 ? requested[0] : undefined
    if (only === undefined) return { models: [], unavailable: [], ambiguous: true }
    return {
      models: [
        { model: only, hours: hoursForModel(hourly, times, ''), probability_is_shared: false },
      ],
      unavailable: [],
      ambiguous: false,
    }
  }

  const models: ModelHourly[] = withSuffix.map((model) => ({
    model,
    hours: hoursForModel(hourly, times, `_${model}`),
    probability_is_shared: false,
  }))

  return {
    models,
    unavailable: requested.filter((m) => !withSuffix.includes(m)),
    ambiguous: false,
  }
}

/**
 * Mark every model whose probability series is byte-identical to another's.
 *
 * Two independent models agreeing on several hundred integers to the digit does
 * not happen; a shared upstream series does, and Probe A caught it. Comparing
 * the values is what makes this a measurement rather than a hardcoded list of
 * the two models that happened to share it on the day the probe ran.
 *
 * A model with no probability values at all is left unmarked — an absent series
 * is not a shared one, and it already renders as a gap.
 */
export function markSharedProbability(models: ModelHourly[]): void {
  const seen = new Map<string, string[]>()
  for (const m of models) {
    const values = m.hours.map((h) => h.precip_prob_pct)
    if (values.every((v) => v === null)) continue
    const key = JSON.stringify(values)
    const bucket = seen.get(key)
    if (bucket) bucket.push(m.model)
    else seen.set(key, [m.model])
  }
  const shared = new Set<string>()
  for (const bucket of seen.values()) {
    if (bucket.length > 1) for (const model of bucket) shared.add(model)
  }
  for (const m of models) m.probability_is_shared = shared.has(m.model)
}

const NO_COVERAGE_REASON = 'No data is available for this location'

function buildDeterministicUrl(
  location: ForecastLocation,
  models: readonly string[],
  forecastDays: number,
): URL {
  const url = new URL(FORECAST_URL)
  url.searchParams.set('latitude', String(location.lat))
  url.searchParams.set('longitude', String(location.lon))
  url.searchParams.set('models', models.join(','))
  url.searchParams.set('hourly', DETERMINISTIC_HOURLY_VARS.join(','))
  url.searchParams.set('forecast_days', String(forecastDays))
  // Same reason as the ensemble call (issue #33): local days resolved from the
  // coordinates, so hour buckets and day buckets agree across every fetch here.
  url.searchParams.set('timezone', 'auto')
  return url
}

type DeterministicFetch = { kind: 'ok'; body: DeterministicResponse } | { kind: 'no-coverage' }

/**
 * One `/v1/forecast` request.
 *
 * A 400 whose reason is the coverage message is **not** an error: it is how the
 * API says none of these models reaches this point, and it is the only way it
 * says so. Every other non-ok status throws, as everywhere else in this file.
 */
async function requestDeterministic(
  location: ForecastLocation,
  models: readonly string[],
  forecastDays: number,
): Promise<DeterministicFetch> {
  const url = buildDeterministicUrl(location, models, forecastDays)
  const res = await fetchWithRetry(url.toString())

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status === 400 && body.includes(NO_COVERAGE_REASON)) {
      logger.debug(
        { models: models.join(','), lat: location.lat, lon: location.lon },
        '[openMeteo] no coverage for requested models',
      )
      return { kind: 'no-coverage' }
    }
    logger.debug(
      { statusCode: res.status, body: body.slice(0, 200) },
      '[openMeteo] deterministic error response',
    )
    throw new Error(`Open-Meteo forecast API returned ${res.status}`)
  }

  return { kind: 'ok', body: (await res.json()) as DeterministicResponse }
}

function offsetOf(body: DeterministicResponse): number {
  return typeof body.utc_offset_seconds === 'number' && Number.isFinite(body.utc_offset_seconds)
    ? body.utc_offset_seconds
    : 0
}

function elevationOf(body: DeterministicResponse): number | null {
  return typeof body.elevation === 'number' && Number.isFinite(body.elevation)
    ? body.elevation
    : null
}

/**
 * Fetch hourly deterministic output for a set of models at one point.
 *
 * Retains the hourly series rather than reducing it to daily values — that is
 * the whole point of this function, and why it exists alongside `fetchEnsemble`,
 * which scoring keeps consuming unchanged.
 *
 * **The upstream payload is not carried out.** Every variable requested becomes
 * a column on `HourlyPoint`, so the parsed hours lose nothing a re-derivation
 * would need — unlike the ensemble, where 143 members collapse into three
 * percentiles. Returning it would mean a multi-model response stored once per
 * model, six times over, to preserve nothing.
 *
 * @throws {Error} on an HTTP failure that is not the coverage 400.
 */
export async function fetchDeterministicHourly(
  location: ForecastLocation,
  models: readonly string[] = DETERMINISTIC_MODELS,
  forecastDays = 7,
): Promise<DeterministicResult> {
  const fetched_at = new Date()
  const empty = {
    models: [] as ModelHourly[],
    utc_offset_seconds: 0,
    model_elevation_m: null,
    fetched_at,
  }
  if (models.length === 0) return { ...empty, unavailable_models: [] }

  const first = await requestDeterministic(location, models, forecastDays)
  if (first.kind === 'no-coverage') return { ...empty, unavailable_models: [...models] }

  const parsed = parseDeterministicHourly(first.body.hourly ?? {}, models)

  if (!parsed.ambiguous) {
    markSharedProbability(parsed.models)
    return {
      models: parsed.models,
      unavailable_models: parsed.unavailable,
      utc_offset_seconds: offsetOf(first.body),
      model_elevation_m: elevationOf(first.body),
      fetched_at,
    }
  }

  /**
   * The degraded shape: one model survived and the response cannot say which.
   * Re-ask each model on its own, where a bare column is unambiguous and a 400
   * is a definite "does not reach here". `allSettled` so one model's transport
   * failure does not lose the models that answered — the same rule as
   * `runAlertsCheck`.
   */
  logger.debug(
    { models: models.join(',') },
    '[openMeteo] unsuffixed multi-model response — re-asking per model',
  )

  const settled = await Promise.allSettled(
    models.map(async (model) => ({
      model,
      result: await requestDeterministic(location, [model], forecastDays),
    })),
  )

  const out: ModelHourly[] = []
  const unavailable: string[] = []
  let offset = 0
  let elevation: number | null = null

  for (const entry of settled) {
    if (entry.status === 'rejected') continue
    const { model, result } = entry.value
    if (result.kind === 'no-coverage') {
      unavailable.push(model)
      continue
    }
    offset = offsetOf(result.body)
    elevation = elevationOf(result.body)
    const one = parseDeterministicHourly(result.body.hourly ?? {}, [model])
    out.push(...one.models)
    unavailable.push(...one.unavailable)
  }

  markSharedProbability(out)
  return {
    models: out,
    unavailable_models: unavailable,
    utc_offset_seconds: offset,
    model_elevation_m: elevation,
    fetched_at,
  }
}

// ---------------------------------------------------------------------------
// Ensemble, hour by hour
// ---------------------------------------------------------------------------

/** One hour of the pooled ensemble. Percentiles are null when no member reported. */
export type EnsembleHour = {
  valid_at_local: string
  precip_mm_p10: number | null
  precip_mm_p50: number | null
  precip_mm_p90: number | null
  temp_c_p10: number | null
  temp_c_p50: number | null
  temp_c_p90: number | null
  wind_kmh_p10: number | null
  wind_kmh_p50: number | null
  wind_kmh_p90: number | null
  /**
   * The ensemble **mean** hourly accumulation, over the members that reported.
   *
   * Kept alongside the percentiles because it is the only one of the four that
   * adds up: the mean of the members' daily totals is the sum of the hourly
   * means, whereas a sum of hourly medians is not the median of anything.
   * `/rain` totals a step or a day with this and reads the spread from the
   * percentiles.
   */
  precip_mm_mean: number | null
  /**
   * How many members have **measurable** precipitation this hour, i.e. at least
   * `MEASURABLE_PRECIP_MM`.
   *
   * `members_wet / member_count` is a probability computed from the members
   * themselves. It is not `precipitation_probability`, which Probe A measured to
   * be a blended field shared between models and attributable to none of them.
   */
  members_wet: number
  /** Members reporting precipitation at this hour — the count falls as models drop out. */
  member_count: number
  /** The same count split by model, so a reader can say which models still reach this hour. */
  model_member_counts: Record<string, number>
}

/**
 * The threshold a member has to cross to count as wet.
 *
 * 0.1 mm is Open-Meteo's own precipitation resolution, so anything below it is
 * a member reporting nothing rather than a member reporting a trace.
 */
export const MEASURABLE_PRECIP_MM = 0.1

/**
 * A percentile over the members that actually reported.
 *
 * `computePercentile` answers 0 for an empty array, which past a model's horizon
 * reads as "0 mm of rain, 0 degrees, 0 km/h" rather than "no members left" — the
 * null-as-a-plausible-value defect. This never returns a number it did not
 * compute.
 */
function percentileOrNull(values: number[], p: number): number | null {
  if (values.length === 0) return null
  return computePercentile([...values].sort((a, b) => a - b), p)
}

function valuesAtHour(arrays: (number | null)[][], i: number): number[] {
  const out: number[] = []
  for (const vals of arrays) {
    const v = vals[i]
    if (v !== null && v !== undefined) out.push(v)
  }
  return out
}

/**
 * Per-hour percentiles across every ensemble member, pooled over all four models.
 *
 * **Hourly percentiles must never be reused as daily figures.** `temp_c_max`
 * stays the median of each member's own daily extreme (`ensembleMedian`); the
 * p90 of one hour is a different statistic, and confusing the two is how a
 * 143-member median of 99F once reached the screen as 102F.
 */
export function parseEnsembleHourly(hourly: Record<string, unknown>): EnsembleHour[] {
  const times = toStringArray(hourly['time'])
  const allKeys = Object.keys(hourly)

  const byModel = (variable: string): { model: string; arrays: (number | null)[][] }[] =>
    Object.entries(ENSEMBLE_MODEL_SUFFIXES)
      .map(([model, suffix]) => ({
        model,
        arrays: memberArraysFor(hourly, allKeys, variable, suffix),
      }))
      .filter((entry) => entry.arrays.length > 0)

  const precipByModel = byModel('precipitation')
  const precipArrs = precipByModel.flatMap((e) => e.arrays)
  const tempArrs = byModel('temperature_2m').flatMap((e) => e.arrays)
  const windArrs = byModel('windspeed_10m').flatMap((e) => e.arrays)

  const out: EnsembleHour[] = []
  for (let i = 0; i < times.length; i++) {
    const valid_at_local = times[i]
    if (!valid_at_local) continue

    const precip = valuesAtHour(precipArrs, i)
    const temp = valuesAtHour(tempArrs, i)
    const wind = valuesAtHour(windArrs, i)

    const model_member_counts: Record<string, number> = {}
    for (const entry of precipByModel) {
      const n = valuesAtHour(entry.arrays, i).length
      if (n > 0) model_member_counts[entry.model] = n
    }

    out.push({
      valid_at_local,
      precip_mm_p10: percentileOrNull(precip, 10),
      precip_mm_p50: percentileOrNull(precip, 50),
      precip_mm_p90: percentileOrNull(precip, 90),
      temp_c_p10: percentileOrNull(temp, 10),
      temp_c_p50: percentileOrNull(temp, 50),
      temp_c_p90: percentileOrNull(temp, 90),
      wind_kmh_p10: percentileOrNull(wind, 10),
      wind_kmh_p50: percentileOrNull(wind, 50),
      wind_kmh_p90: percentileOrNull(wind, 90),
      // No members left past a model's horizon: a mean of nothing is null, not
      // 0 mm, and 0 wet of 0 members must not become a 0% chance of rain.
      precip_mm_mean: precip.length === 0 ? null : precip.reduce((a, b) => a + b, 0) / precip.length,
      members_wet: precip.filter((v) => v >= MEASURABLE_PRECIP_MM).length,
      member_count: precip.length,
      model_member_counts,
    })
  }
  return out
}

export type EnsembleRun = {
  daily: OpenMeteoResult
  hours: EnsembleHour[]
  fetched_at: Date
  /** The upstream payload, for the 48h raw retention. Never log or serialise this. */
  raw: unknown
}

/**
 * Fetch the ensemble once and keep **both** reductions — the daily figures
 * scoring already consumes, and the hourly percentiles the bot's spread views
 * need.
 *
 * Separate from `fetchEnsemble` so the per-request scoring path does not pay for
 * 384 hours of sorting it never reads.
 *
 * @throws {Error} on HTTP failure, exactly as `fetchEnsemble` does.
 */
export async function fetchEnsembleRun(location: ForecastLocation): Promise<EnsembleRun> {
  const fetched_at = new Date()
  const res = await fetchWithRetry(buildEnsembleUrl(location).toString())
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    logger.debug(
      { statusCode: res.status, body: body.slice(0, 200) },
      '[openMeteo] ensemble error response',
    )
    throw new Error(`Open-Meteo ensemble API returned ${res.status}`)
  }

  const raw = (await res.json()) as EnsembleResponse
  const daily = parseEnsemble(raw.hourly)
  applyLapseRate(daily.days, location.elevation_m, raw.elevation)
  daily.utc_offset_seconds =
    typeof raw.utc_offset_seconds === 'number' && Number.isFinite(raw.utc_offset_seconds)
      ? raw.utc_offset_seconds
      : 0

  return { daily, hours: parseEnsembleHourly(raw.hourly), fetched_at, raw }
}
