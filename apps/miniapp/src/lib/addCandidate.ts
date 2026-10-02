import { matchKnownCrag, placeSubtitle, type GeocodeResult, type ReverseGeocode } from '@weatherteam6/types'
import type { Fix } from '../hooks/useCurrentPosition.js'
import { formatAccuracyFt } from './logbook.js'

/** A place picked on `/add` — from the geocoder, hand-entered coordinates, a GPS fix or a point on the map — before it is saved. */
export type Candidate = {
  name: string
  lat: number
  lon: number
  /** Null when nothing measured it; the lapse-rate correction is then skipped, never guessed. */
  elevationM: number | null
  timezone: string | null
  /** The line under the name on the save form, or null for none. */
  detail: string | null
}

export function fromGeocode(result: GeocodeResult): Candidate {
  return {
    name: result.name,
    lat: result.lat,
    lon: result.lon,
    elevationM: result.elevation_m,
    timezone: result.timezone,
    detail: placeSubtitle(result),
  }
}

/**
 * A GPS fix as a candidate. Named after the known crag it falls inside, else
 * the town OpenStreetMap puts it in, else "Current location" for the reader to
 * rename. `place` is null when the lookup itself failed; a failed lookup and a
 * nameless point both leave the fallback name and no elevation.
 *
 * The elevation is the terrain model's, never the phone's altitude, which is
 * often absent and measured against the ellipsoid rather than sea level.
 */
export function fromFix(fix: Fix, place: ReverseGeocode | null): Candidate {
  return fromPoint(fix, place, 'Current location', `Your location, ${formatAccuracyFt(fix.accuracy_m)}`)
}

/** A point on the globe with no accuracy of its own: one picked on the map. */
export type MapPoint = { lat: number; lon: number }

/** A point long-pressed on the Map tab, named by the same rules as a fix. */
export function fromMapPoint(point: MapPoint, place: ReverseGeocode | null): Candidate {
  return fromPoint(point, place, 'Dropped pin', 'Picked on the map')
}

function fromPoint(point: MapPoint, place: ReverseGeocode | null, fallbackName: string, how: string): Candidate {
  const region = [place?.admin1 ?? null, place?.country ?? null].filter((v) => v !== null).join(', ')
  const named = place?.name ?? null
  return {
    name: matchKnownCrag(point.lat, point.lon)?.name ?? named ?? fallbackName,
    lat: point.lat,
    lon: point.lon,
    elevationM: place?.elevation_m ?? null,
    timezone: null,
    detail: [
      how,
      region === '' ? null : region,
      // Nominatim's data is ODbL, so anything shown from it is credited. Not
      // "Place name ©": at a known crag the name is the crag's, and only the
      // region came from OpenStreetMap.
      named === null && region === '' ? null : '© OpenStreetMap contributors',
    ]
      .filter((v) => v !== null)
      .join(' · '),
  }
}

/** `/add` opened on a point picked on the map; `mapPointFromSearch` reads it back. */
export function addPathForPoint(point: MapPoint): string {
  return `/add?${new URLSearchParams({ lat: point.lat.toFixed(5), lon: point.lon.toFixed(5) }).toString()}`
}

/**
 * The point `/add` was opened on, or null for an ordinary visit. A value that
 * is missing, not a number, or off the globe is ignored rather than clamped:
 * the search opens as usual and nothing is named after a point nobody picked.
 */
export function mapPointFromSearch(search: URLSearchParams): MapPoint | null {
  const lat = finite(search.get('lat'))
  const lon = finite(search.get('lon'))
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

function finite(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** A point as the add card prints it: four decimals, about 11 m. */
export function formatPoint(point: MapPoint): string {
  return `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`
}
