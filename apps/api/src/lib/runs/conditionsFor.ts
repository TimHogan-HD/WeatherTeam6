import { parseNumeric, parseNumericRequired } from '@weatherteam6/types'
import type { Conditions } from '@weatherteam6/types'
import type { locations } from '../../db/schema.js'
import { describeError } from '../http.js'
import { logger } from '../logger.js'
import { localDateString } from '../weather/openMeteo.js'
import { NOT_A_CRAG_READINGS, READINGS_UNAVAILABLE, skyToday, toConditionsReadings } from './conditionsReadings.js'
import { getHourlySeries } from './fetchHourlySeries.js'
import { scoringLocationFor, type ReaderScoring } from './scoringLocation.js'

export type ConditionsLocation = Pick<
  typeof locations.$inferSelect,
  'id' | 'lat' | 'lon' | 'elevation_m' | 'rock_type' | 'cliff_angle' | 'aspect' | 'is_climbing_location'
>

/**
 * **Today's Crag A readings, and nothing else**: `GET /conditions/:id` and
 * `GET /list`. The caller has already checked the location is the reader's.
 *
 * `reader` is asked only for a crag, and a failed read rejects (a reader's own
 * range must never silently become the default; `readerScoringFor`).
 *
 * **The readings reach the result only because `scoring` was built here from
 * `is_climbing_location`** — the same shape as `GET /hourly/:id`, and there is
 * no flag check further down to forget. The two placeholders are the ones
 * `/hourly` documents: `rock_type` null takes `unknown`'s slower drying window,
 * and an unrecorded `cliff_angle` is never treated as a recorded wall.
 */
export async function conditionsFor(
  location: ConditionsLocation,
  reader: () => Promise<ReaderScoring>,
  now: Date = new Date(),
): Promise<Conditions> {
  const scoring = location.is_climbing_location
    ? // No walls: this answer carries the crag's readings only, and scoring them costs a Wall A per wall.
      scoringLocationFor({ ...location, known_crag: null }, await reader())
    : null

  /**
   * **The hourly run is not fetched at all for a non-crag** — `scoring` being
   * null already means no reading comes back.
   *
   * The run is caught rather than allowed to reject: a failed hourly fetch is
   * `READINGS_UNAVAILABLE`, a gap the client names, not a 500 that costs the
   * list card its weather.
   */
  const series =
    scoring === null
      ? null
      : await getHourlySeries(
          {
            id: location.id,
            lat: parseNumericRequired(location.lat),
            lon: parseNumericRequired(location.lon),
            // Nullable, and it must stay null rather than becoming 0 — sea
            // level is a real elevation, and passing it would silently skip
            // the lapse-rate correction on a mountain.
            elevation_m: parseNumeric(location.elevation_m),
          },
          { allModels: false, now, scoring },
        ).catch((err: unknown) => {
          logger.warn({ locationId: location.id, err: describeError(err) }, 'conditions: hourly readings unavailable')
          return null
        })

  // The location's local day, from the clock the series itself carries (#33).
  const todayStr = series === null ? null : localDateString(now, series.utc_offset_seconds)

  return {
    location_id: location.id,
    forecast_date: todayStr,
    readings:
      scoring === null
        ? NOT_A_CRAG_READINGS
        : series === null || todayStr === null
          ? READINGS_UNAVAILABLE
          : toConditionsReadings(series, todayStr, now),
    sky_today: series === null || todayStr === null ? null : skyToday(series, todayStr),
  }
}
