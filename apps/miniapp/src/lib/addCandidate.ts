import { matchKnownCrag, placeSubtitle, type GeocodeResult, type ReverseGeocode } from '@weatherteam6/types'
import type { Fix } from '../hooks/useCurrentPosition.js'
import { formatAccuracyFt } from './logbook.js'

/** A place picked on `/add` — from the geocoder, hand-entered coordinates or a GPS fix — before it is saved. */
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
  const region = [place?.admin1 ?? null, place?.country ?? null].filter((v) => v !== null).join(', ')
  const named = place?.name ?? null
  return {
    name: matchKnownCrag(fix.lat, fix.lon)?.name ?? named ?? 'Current location',
    lat: fix.lat,
    lon: fix.lon,
    elevationM: place?.elevation_m ?? null,
    timezone: null,
    detail: [
      `Your location, ${formatAccuracyFt(fix.accuracy_m)}`,
      region === '' ? null : region,
      // Nominatim's data is ODbL; its usage policy asks for this wherever a name is shown.
      named === null ? null : 'Place name © OpenStreetMap',
    ]
      .filter((v) => v !== null)
      .join(' · '),
  }
}
