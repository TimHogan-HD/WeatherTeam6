import type { ReverseGeocode } from '@weatherteam6/types'
import { logger } from '../logger.js'
import { describeError } from '../http.js'
import { fetchWithRetry } from './openMeteo.js'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse'
const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation'

/**
 * Nominatim's usage policy asks for an identifying User-Agent, at most one
 * request a second, and no bulk use. One lookup per tap on "Use my current
 * location" is well inside that; the policy is also why it gets two attempts
 * rather than `fetchWithRetry`'s four.
 */
const NOMINATIM_HEADERS = { 'User-Agent': 'WeatherTeam6/1.0 (https://weatherteam6.vercel.app)' }
const NOMINATIM_ATTEMPTS = 2

/** Elevations outside this range are data errors, not places. Mirrors POST /locations. */
const MIN_ELEVATION_M = -500
const MAX_ELEVATION_M = 9000

/**
 * The settlement a point is in, most specific first. Measured 2026-09-30 at
 * `zoom=14`: downtown Minneapolis answers with `name: "Downtown West"` (a
 * neighbourhood) and `address.city: "Minneapolis"` — the city is what a reader
 * calls the place, so the address wins over `name`.
 */
const SETTLEMENT_KEYS = ['city', 'town', 'village', 'hamlet', 'municipality'] as const

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/** Nominatim `format=jsonv2` → name, state and country. Anything unexpected is null, never a guess. */
export function parseNominatimPlace(raw: unknown): Pick<ReverseGeocode, 'name' | 'admin1' | 'country'> {
  const none = { name: null, admin1: null, country: null }
  if (typeof raw !== 'object' || raw === null) return none
  const body = raw as Record<string, unknown>
  // Open water or the middle of nowhere is a 200 with `{ error: "Unable to geocode" }`.
  if ('error' in body) return none
  const address = typeof body['address'] === 'object' && body['address'] !== null
    ? (body['address'] as Record<string, unknown>)
    : {}
  const settlement = SETTLEMENT_KEYS.map((k) => str(address[k])).find((v) => v !== null) ?? null
  return {
    name: settlement ?? str(body['name']),
    admin1: str(address['state']),
    country: str(address['country']),
  }
}

/** Open-Meteo `/v1/elevation` → metres, or null for a missing or implausible value. */
export function parseElevation(raw: unknown): number | null {
  const values = (raw as { elevation?: unknown } | null)?.elevation
  if (!Array.isArray(values)) return null
  const m: unknown = values[0]
  if (typeof m !== 'number' || !Number.isFinite(m)) return null
  return m >= MIN_ELEVATION_M && m <= MAX_ELEVATION_M ? m : null
}

async function fetchPlace(lat: number, lon: number): Promise<Pick<ReverseGeocode, 'name' | 'admin1' | 'country'>> {
  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lon))
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('zoom', '14')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('accept-language', 'en')
  const res = await fetchWithRetry(url.toString(), NOMINATIM_ATTEMPTS, NOMINATIM_HEADERS)
  if (!res.ok) throw new Error(`Nominatim returned ${res.status}`)
  return parseNominatimPlace(await res.json())
}

async function fetchElevation(lat: number, lon: number): Promise<number | null> {
  const url = new URL(ELEVATION_URL)
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  const res = await fetchWithRetry(url.toString())
  if (!res.ok) throw new Error(`Open-Meteo elevation returned ${res.status}`)
  return parseElevation(await res.json())
}

/**
 * Name and elevation for a GPS fix, looked up side by side. Either lookup
 * failing leaves its own fields null and the other standing: a fix with no name
 * is still a place to save, and a missing elevation withholds the lapse-rate
 * correction exactly as a hand-entered coordinate does.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<ReverseGeocode> {
  const [place, elevation] = await Promise.allSettled([fetchPlace(lat, lon), fetchElevation(lat, lon)])
  if (place.status === 'rejected') {
    logger.warn({ err: describeError(place.reason) }, '[reverse-geocode] place lookup failed')
  }
  if (elevation.status === 'rejected') {
    logger.warn({ err: describeError(elevation.reason) }, '[reverse-geocode] elevation lookup failed')
  }
  const named = place.status === 'fulfilled' ? place.value : { name: null, admin1: null, country: null }
  return { ...named, elevation_m: elevation.status === 'fulfilled' ? elevation.value : null }
}
