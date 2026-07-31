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
const ENSEMBLE_MODELS = 'gfs_seamless,ecmwf_ifs025,icon_seamless_eps,gem_global'
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
const GFS_SUFFIX = '_ncep_gefs_seamless'
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

export function parseEnsemble(hourly: Record<string, unknown>): OpenMeteoResult {
  const times: string[] = toStringArray(hourly['time'])
  const dateIndex = buildDateIndex(times)
  const dates = [...dateIndex.keys()].sort()

  const allKeys = Object.keys(hourly)

  const gfsPrecipKeys = allKeys.filter(
    (k) => k.startsWith('precipitation_member') && k.endsWith(GFS_SUFFIX),
  )
  const gfsTempKeys = allKeys.filter(
    (k) => k.startsWith('temperature_2m_member') && k.endsWith(GFS_SUFFIX),
  )
  const gfsWindKeys = allKeys.filter(
    (k) => k.startsWith('windspeed_10m_member') && k.endsWith(GFS_SUFFIX),
  )
  const gfsHumidKeys = allKeys.filter(
    (k) => k.startsWith('relativehumidity_2m_member') && k.endsWith(GFS_SUFFIX),
  )
  const gfsDewpointKeys = allKeys.filter(
    (k) => k.startsWith('dewpoint_2m_member') && k.endsWith(GFS_SUFFIX),
  )
  const gfsShortwaveKeys = allKeys.filter(
    (k) => k.startsWith('shortwave_radiation_member') && k.endsWith(GFS_SUFFIX),
  )

  const model_sources: string[] = []
  if (gfsPrecipKeys.length > 0) model_sources.push('gfs_seamless')
  if (allKeys.some((k) => k.includes('ecmwf_ifs025') && k.includes('member')))
    model_sources.push('ecmwf_ifs025')
  if (
    allKeys.some(
      (k) => k.includes('icon') && k.includes('member') && !k.endsWith(GFS_SUFFIX),
    )
  )
    model_sources.push('icon_seamless_eps')
  if (
    allKeys.some(
      (k) => k.includes('gem') && k.includes('member') && !k.endsWith(GFS_SUFFIX),
    )
  )
    model_sources.push('gem_global')

  // Extract and validate each member array once — the same arrays are reused for
  // every date, so doing this inside the date loop would redo O(hours) validation
  // per date per key.
  const gfsPrecipArrs = gfsPrecipKeys.map((k) => toNullableNumberArray(hourly, k))
  const gfsTempArrs = gfsTempKeys.map((k) => toNullableNumberArray(hourly, k))
  const gfsWindArrs = gfsWindKeys.map((k) => toNullableNumberArray(hourly, k))
  const gfsHumidArrs = gfsHumidKeys.map((k) => toNullableNumberArray(hourly, k))
  const gfsDewpointArrs = gfsDewpointKeys.map((k) => toNullableNumberArray(hourly, k))
  const gfsShortwaveArrs = gfsShortwaveKeys.map((k) => toNullableNumberArray(hourly, k))

  const days: DailyForecast[] = []

  for (const date of dates) {
    const indices = dateIndex.get(date) ?? []
    if (indices.length === 0) continue

    // Daily precip sum per GFS member → percentiles
    const memberDailySums: number[] = []
    for (const vals of gfsPrecipArrs) {
      const sum = indices.reduce((acc, i) => acc + (vals[i] ?? 0), 0)
      memberDailySums.push(sum)
    }
    memberDailySums.sort((a, b) => a - b)

    // Temperature min/max across all GFS members and hours
    const temps: number[] = []
    for (const vals of gfsTempArrs) {
      for (const i of indices) {
        const v = vals[i]
        if (v !== null && v !== undefined) temps.push(v)
      }
    }

    // Wind max across all GFS members and hours
    const winds: number[] = []
    for (const vals of gfsWindArrs) {
      for (const i of indices) {
        const v = vals[i]
        if (v !== null && v !== undefined) winds.push(v)
      }
    }

    // Humidity mean across all GFS members and hours
    const humids: number[] = []
    for (const vals of gfsHumidArrs) {
      for (const i of indices) {
        const v = vals[i]
        if (v !== null && v !== undefined) humids.push(v)
      }
    }

    // Dewpoint mean across all GFS members and hours
    const dewpoints: number[] = []
    for (const vals of gfsDewpointArrs) {
      for (const i of indices) {
        const v = vals[i]
        if (v !== null && v !== undefined) dewpoints.push(v)
      }
    }

    // Shortwave mean across all GFS members and hours
    const shortwaves: number[] = []
    for (const vals of gfsShortwaveArrs) {
      for (const i of indices) {
        const v = vals[i]
        if (v !== null && v !== undefined) shortwaves.push(v)
      }
    }

    days.push({
      date,
      precip_mm_p10: computePercentile(memberDailySums, 10),
      precip_mm_p50: computePercentile(memberDailySums, 50),
      precip_mm_p90: computePercentile(memberDailySums, 90),
      temp_c_min: temps.length > 0 ? Math.min(...temps) : 0,
      temp_c_max: temps.length > 0 ? Math.max(...temps) : 0,
      wind_kmh_max: winds.length > 0 ? Math.max(...winds) : 0,
      humidity_pct: mean(humids, 50),
      dewpoint_c: mean(dewpoints, 0),
      shortwave_wm2: mean(shortwaves, 0),
    })
  }

  return { days, model_sources }
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
  return parsed
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

  return { days, model_sources: ['nbm'] }
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
  url.searchParams.set('timezone', 'UTC')

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
