import { matchKnownCrag, type GeocodeResult } from '@weatherteam6/types'
import type { Fix } from '../hooks/useCurrentPosition.js'

/** What an `/add` preview needs, from the geocoder, hand-entered coordinates or a GPS fix. */
export type Candidate = {
  name: string
  lat: number
  lon: number
  /** The geocoder supplies this; the coordinate and GPS paths cannot, and pass null. */
  elevationM: number | null
  timezone: string | null
  /** The phone's own accuracy estimate, for a candidate that came from GPS; null otherwise. */
  accuracyM: number | null
}

export function fromGeocode(result: GeocodeResult): Candidate {
  return {
    name: result.name,
    lat: result.lat,
    lon: result.lon,
    elevationM: result.elevation_m,
    timezone: result.timezone,
    accuracyM: null,
  }
}

/**
 * A GPS fix as a candidate. Named after the known crag it falls inside, if any,
 * otherwise "Current location" for the user to rename before saving. The phone's
 * altitude is not used as the elevation: it is often missing and, where present,
 * measured against the ellipsoid rather than sea level — so the lapse-rate
 * correction is skipped, exactly as on the coordinate path.
 */
export function fromFix(fix: Fix): Candidate {
  return {
    name: matchKnownCrag(fix.lat, fix.lon)?.name ?? 'Current location',
    lat: fix.lat,
    lon: fix.lon,
    elevationM: null,
    timezone: null,
    accuracyM: fix.accuracy_m,
  }
}
