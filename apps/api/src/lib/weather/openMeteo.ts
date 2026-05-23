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
}

export type OpenMeteoResult = {
  days: DailyForecast[]
  model_sources: string[]
}

type EnsembleResponse = {
  latitude: number
  longitude: number
  hourly: Record<string, unknown>
}

const ENSEMBLE_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble'
const MODELS = 'gfs_seamless,ecmwf_ifs025,icon_seamless_eps,gem_global'
const HOURLY_VARS = 'precipitation,temperature_2m,windspeed_10m,relativehumidity_2m'
const GFS_SUFFIX = '_ncep_gefs_seamless'

async function fetchWithRetry(url: string, maxAttempts = 4): Promise<Response> {
  let lastErr: Error = new Error('no attempts made')
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url)
      if (res.ok) return res
      if (res.status !== 429 && res.status < 500) return res
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
    }
    const delay = Math.pow(2, attempt) * 1000
    await new Promise<void>((r) => setTimeout(r, delay))
  }
  throw lastErr
}

function safeNumberArray(hourly: Record<string, unknown>, key: string): (number | null)[] {
  const val = hourly[key]
  if (!Array.isArray(val)) return []
  return val as (number | null)[]
}

function buildDateIndex(times: string[]): Map<string, number[]> {
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

function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  const a = sorted[lo] ?? 0
  const b = sorted[hi] ?? 0
  return a + (b - a) * (idx - lo)
}

function parseEnsemble(hourly: Record<string, unknown>): OpenMeteoResult {
  const rawTimes = hourly['time']
  const times: string[] = Array.isArray(rawTimes) ? (rawTimes as string[]) : []
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

  const days: DailyForecast[] = []

  for (const date of dates) {
    const indices = dateIndex.get(date) ?? []
    if (indices.length === 0) continue

    // Daily precip sum per GFS member → percentiles
    const memberDailySums: number[] = []
    for (const key of gfsPrecipKeys) {
      const vals = safeNumberArray(hourly, key)
      const sum = indices.reduce((acc, i) => acc + (vals[i] ?? 0), 0)
      memberDailySums.push(sum)
    }
    memberDailySums.sort((a, b) => a - b)

    // Temperature min/max across all GFS members and hours
    const temps: number[] = []
    for (const key of gfsTempKeys) {
      const vals = safeNumberArray(hourly, key)
      for (const i of indices) {
        const v = vals[i]
        if (v !== null && v !== undefined) temps.push(v)
      }
    }

    // Wind max across all GFS members and hours
    const winds: number[] = []
    for (const key of gfsWindKeys) {
      const vals = safeNumberArray(hourly, key)
      for (const i of indices) {
        const v = vals[i]
        if (v !== null && v !== undefined) winds.push(v)
      }
    }

    // Humidity mean across all GFS members and hours
    const humids: number[] = []
    for (const key of gfsHumidKeys) {
      const vals = safeNumberArray(hourly, key)
      for (const i of indices) {
        const v = vals[i]
        if (v !== null && v !== undefined) humids.push(v)
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
      humidity_pct:
        humids.length > 0 ? humids.reduce((a, b) => a + b, 0) / humids.length : 50,
    })
  }

  return { days, model_sources }
}

export async function fetchEnsembleForecast(
  lat: number,
  lon: number,
): Promise<OpenMeteoResult> {
  const url = new URL(ENSEMBLE_URL)
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('models', MODELS)
  url.searchParams.set('hourly', HOURLY_VARS)

  logger.debug({ lat, lon }, '[openMeteo] fetching ensemble forecast')

  const res = await fetchWithRetry(url.toString())
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Open-Meteo ensemble API returned ${res.status}: ${body}`)
  }

  const raw = (await res.json()) as EnsembleResponse
  return parseEnsemble(raw.hourly)
}
