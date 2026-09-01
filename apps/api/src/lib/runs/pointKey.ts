/**
 * The identity of a forecast point, for `weather_runs.point_key`.
 *
 * A saved location and an ad-hoc geocoded point both need to accumulate runs,
 * but only one of them has a uuid. `point_key` is the shared axis: a saved
 * location's runs key on its id, an unsaved point's on its rounded coordinates.
 *
 * **The two spellings are built here and nowhere else.** A second call site that
 * rounds to a different number of places would silently start a new history for
 * the same crag, and nothing would look wrong until a trend query returned two
 * runs where it expected twenty.
 */

/** Four decimal places is ~11 m — finer than any forecast model's grid, coarse enough that a re-geocode lands on the same key. */
const COORD_PLACES = 4

export function pointKeyForLocation(locationId: string): string {
  if (!locationId) throw new Error('pointKeyForLocation: empty location id')
  return `loc:${locationId}`
}

/**
 * @throws {Error} when either coordinate is not a finite number — `toFixed` would
 * otherwise produce the key `pt:NaN,NaN`, under which every broken point on earth
 * would share one history.
 */
export function pointKeyForCoords(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('pointKeyForCoords: lat and lon must be finite')
  }
  return `pt:${lat.toFixed(COORD_PLACES)},${lon.toFixed(COORD_PLACES)}`
}
