import type { ForecastSnapshot } from '@weatherteam6/types'
import { computeLiveForecast, type LiveForecastLocation } from './liveForecast.js'
import { toWindowedForecast } from './forecastWindow.js'

export type PreviewInput = {
  lat: number
  lon: number
  /** From the geocoder. Null on the manual-coordinate path — the lapse-rate
   *  correction is then skipped here exactly as it will be after saving. */
  elevationM: number | null
}

/**
 * Placeholder id for the synthetic location. `computeLiveForecast` uses
 * `location.id` only for log lines and snapshot ids, so nothing keys on it —
 * and nothing is written, so it never reaches the database.
 */
export const PREVIEW_LOCATION_ID = 'preview'

/**
 * Weather for a location that has no row and no UUID yet — step 2 of the add
 * flow (§12.1). `/conditions/:id` and `/forecast/:id` both key on a saved id,
 * so neither can serve this.
 *
 * **Nothing is persisted.**
 *
 * Scores are deliberately not returned. Unsaved mode shows no score section at
 * all (§12.1) — nothing has been classified as a climbing location yet, and a
 * drying score computed against `rock_type: null` would be a guess presented as
 * a measurement. The synthetic location therefore carries no rock type, aspect,
 * or cliff angle either.
 *
 * A previewed location has no `asos_station`, so recent rainfall always takes
 * `liveForecast`'s Open-Meteo archive fallback rather than the ACIS path.
 */
export async function computePreviewForecast(
  input: PreviewInput,
  now: Date = new Date(),
): Promise<ForecastSnapshot[]> {
  const synthetic: LiveForecastLocation = {
    id: PREVIEW_LOCATION_ID,
    lat: String(input.lat),
    lon: String(input.lon),
    elevation_m: input.elevationM === null ? null : String(input.elevationM),
    rock_type: null,
    cliff_angle: null,
    aspect: null,
    asos_station: null,
  }

  // The previewed place's own local day (#33). This is the path that could not
  // have used `locations.timezone` even if it were read — there is no saved row
  // yet — which is why the offset is resolved from the coordinates upstream.
  const { snapshots, todayStr } = await computeLiveForecast(synthetic, now)
  return toWindowedForecast(snapshots, todayStr)
}
