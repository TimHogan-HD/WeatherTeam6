import type { GeocodeResult } from '@weatherteam6/types'
import { logger } from '../logger.js'
import { fetchWithRetry } from './openMeteo.js'

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'

/** Open-Meteo returns an empty result for a 1-character query, so don't spend a request on it. */
export const MIN_QUERY_LENGTH = 2
const DEFAULT_COUNT = 10
const MAX_COUNT = 20

type RawPlace = Record<string, unknown>

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Row-level validation, matching the element-validation rule the Open-Meteo
 * forecast parsers follow: a row missing a name or usable coordinates is dropped
 * rather than passed through with nulls, because every field the client needs to
 * *identify* a place would then be missing. `elevation` is different — it is
 * genuinely optional (applyLapseRate skips the correction when it is null), so a
 * row without it is still useful and is kept.
 */
export function parseGeocodeResults(raw: unknown): GeocodeResult[] {
  const results = (raw as { results?: unknown } | null)?.results
  if (!Array.isArray(results)) return []

  const out: GeocodeResult[] = []
  let dropped = 0
  for (const entry of results) {
    if (typeof entry !== 'object' || entry === null) {
      dropped++
      continue
    }
    const place = entry as RawPlace
    const name = str(place['name'])
    const lat = num(place['latitude'])
    const lon = num(place['longitude'])
    const id = num(place['id'])
    if (name === null || lat === null || lon === null || id === null) {
      dropped++
      continue
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      dropped++
      continue
    }
    out.push({
      id,
      name,
      lat,
      lon,
      elevation_m: num(place['elevation']),
      admin1: str(place['admin1']),
      country: str(place['country']),
      timezone: str(place['timezone']),
      feature_code: str(place['feature_code']),
    })
  }

  if (dropped > 0) {
    logger.warn({ dropped }, '[geocode] dropped unusable result rows')
  }
  return out
}

/**
 * Place-name search, proxied server-side so it obeys the same retry/backoff as
 * every other external call. Keyless — Open-Meteo geocoding needs no credential,
 * which is why it adds nothing to `.env.example` (§12.2).
 *
 * @throws {Error} on HTTP failure after exhausting fetchWithRetry's 4 attempts.
 */
export async function searchPlaces(query: string, count = DEFAULT_COUNT): Promise<GeocodeResult[]> {
  const q = query.trim()
  if (q.length < MIN_QUERY_LENGTH) return []

  const url = new URL(GEOCODE_URL)
  url.searchParams.set('name', q)
  url.searchParams.set('count', String(Math.min(Math.max(count, 1), MAX_COUNT)))
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')

  logger.debug({ q }, '[geocode] searching places')

  const res = await fetchWithRetry(url.toString())
  if (!res.ok) {
    // Body is logged at debug only, and truncated — same handling as the other
    // Open-Meteo callers, so a verbose upstream error can't land in prod logs.
    const body = await res.text().catch(() => '')
    logger.debug(
      { statusCode: res.status, body: body.slice(0, 200) },
      '[geocode] error response',
    )
    throw new Error(`Open-Meteo geocoding API returned ${res.status}`)
  }

  // A no-match search is a 200 with the `results` key absent entirely, not an
  // empty array — parseGeocodeResults treats both as [].
  return parseGeocodeResults(await res.json())
}
