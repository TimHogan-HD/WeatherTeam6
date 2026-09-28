/**
 * The identity of a forecast point, for `weather_runs.point_key`.
 *
 * **A run belongs to a place, not to a saved location.** Open-Meteo's answer
 * depends only on the coordinates and the elevation it was asked for, so two
 * users who save the same crag would otherwise store the same six models and
 * 143 ensemble members twice. On Neon's 512 MB free tier that duplication is the
 * difference between a few climbing partners fitting and not (measured
 * 2026-09-28: 218 MB for four locations).
 *
 * **The spelling is built here and nowhere else.** A second call site that
 * rounds differently would silently start a separate history for the same crag.
 */

/** Four decimal places is ~11 m — finer than any forecast model's grid, coarse enough that a re-geocode lands on the same key. */
const COORD_PLACES = 4

export type ForecastPlace = {
  readonly lat: number
  readonly lon: number
  /**
   * Part of the key because the fetch sends it: Open-Meteo applies a lapse-rate
   * correction to the elevation it is given, so the same coordinates at two
   * elevations are two different forecasts. Null (none recorded) is its own
   * key, never folded into 0 — sea level is a real elevation.
   */
  readonly elevation_m: number | null
}

/**
 * @throws {Error} when a coordinate or a non-null elevation is not a finite
 * number — `toFixed` would otherwise produce `pt:NaN,NaN`, under which every
 * broken point on earth would share one history.
 */
export function pointKeyForPlace(place: ForecastPlace): string {
  const { lat, lon, elevation_m } = place
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('pointKeyForPlace: lat and lon must be finite')
  }
  if (elevation_m !== null && !Number.isFinite(elevation_m)) {
    throw new Error('pointKeyForPlace: elevation must be finite or null')
  }
  const elevation = elevation_m === null ? 'none' : String(Math.round(elevation_m))
  return `pt:${lat.toFixed(COORD_PLACES)},${lon.toFixed(COORD_PLACES)}@${elevation}`
}
