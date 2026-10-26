import { logger } from '../logger.js'
import { fetchWithRetry } from './openMeteo.js'
import { readMrmsPoints, type LatLon } from './mrmsGrib.js'
import { RAIN_NOW_MAX_AGE_MS } from '@weatherteam6/types'

/**
 * NOAA MRMS radar rain rate (PrecipRate, mm/hr), a CONUS frame every 2 minutes
 * on AWS Open Data, landing about 3 minutes after its valid time. Owner
 * decision on #313 (2026-10-26): "raining now" is said from radar, never from
 * the forecast.
 */
const BUCKET = 'https://noaa-mrms-pds.s3.amazonaws.com'
const PRODUCT = 'CONUS/PrecipRate_00.00'

/** How far back the listing starts; wide enough to find a frame when the newest few are late. */
const LIST_WINDOW_MS = 20 * 60_000
/** A fetched frame serves every request on this instance for this long; the next frame is 2 minutes away. */
const REUSE_MS = 2 * 60_000

type Frame = { validAt: Date; file: Buffer; fetchedAt: number }
let cached: Frame | null = null

const KEY_TIME = /_(\d{8})-(\d{6})\.grib2\.gz$/

function keyFor(t: Date): string {
  const iso = t.toISOString()
  const stamp = `${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}`
  return `${PRODUCT}/${stamp.slice(0, 8)}/MRMS_PrecipRate_00.00_${stamp}.grib2.gz`
}

export function validTimeOfKey(key: string): Date | null {
  const m = KEY_TIME.exec(key)
  if (!m) return null
  const [d, t] = [m[1]!, m[2]!]
  const time = Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4)}Z`)
  return Number.isFinite(time) ? new Date(time) : null
}

/** The newest frame's key, or null when the listing failed or held nothing recent. */
async function newestKey(now: Date): Promise<string | null> {
  const from = keyFor(new Date(now.getTime() - LIST_WINDOW_MS))
  const prefix = from.slice(0, from.lastIndexOf('/') + 1)
  const url = `${BUCKET}/?list-type=2&prefix=${encodeURIComponent(prefix)}&start-after=${encodeURIComponent(from)}`
  const res = await fetchWithRetry(url, 3)
  if (!res.ok) {
    logger.warn({ statusCode: res.status }, '[mrmsRate] listing non-ok')
    return null
  }
  const keys = [...(await res.text()).matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]!).filter((k) => KEY_TIME.test(k))
  return keys.sort().at(-1) ?? null
}

async function latestFrame(now: Date): Promise<Frame | null> {
  if (cached !== null && now.getTime() - cached.fetchedAt < REUSE_MS) return cached
  const key = await newestKey(now)
  const validAt = key === null ? null : validTimeOfKey(key)
  if (key === null || validAt === null) return null
  if (cached !== null && cached.validAt.getTime() === validAt.getTime()) {
    cached = { ...cached, fetchedAt: now.getTime() }
    return cached
  }
  const res = await fetchWithRetry(`${BUCKET}/${key}`, 3)
  if (!res.ok) {
    logger.warn({ statusCode: res.status }, '[mrmsRate] frame non-ok')
    return null
  }
  cached = { validAt, file: Buffer.from(await res.arrayBuffer()), fetchedAt: now.getTime() }
  return cached
}

export type RainRates = {
  validAt: Date
  /** mm/hr at each point, in order; null where radar has no coverage. */
  ratesMmH: (number | null)[]
}

/**
 * Radar rain rate at each point from the newest frame, or null when there is
 * no frame younger than `RAIN_NOW_MAX_AGE_MS` — "no radar", never "no rain".
 */
export async function fetchRainRates(points: readonly LatLon[], now: Date = new Date()): Promise<RainRates | null> {
  let frame: Frame | null
  try {
    frame = await latestFrame(now)
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, '[mrmsRate] fetch failed after retries')
    return null
  }
  if (frame === null || now.getTime() - frame.validAt.getTime() > RAIN_NOW_MAX_AGE_MS) return null
  let values: (number | null)[]
  try {
    values = readMrmsPoints(frame.file, points)
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, '[mrmsRate] frame unreadable')
    cached = null
    return null
  }
  // MRMS marks "no coverage" and "missing" with negatives.
  return { validAt: frame.validAt, ratesMmH: values.map((v) => (v === null || v < 0 ? null : v)) }
}

/** Tests only. */
export function clearRainRateCache(): void {
  cached = null
}
