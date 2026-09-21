import { and, eq, gt, ilike, isNull, or } from 'drizzle-orm'
import { parseNumeric, parseNumericRequired } from '@weatherteam6/types'
import { db } from '../../db/index.js'
import { locations, weatherAlerts } from '../../db/schema.js'
import { describeError } from '../http.js'
import { logger } from '../logger.js'
import {
  NOT_A_CRAG_READINGS,
  READINGS_UNAVAILABLE,
  toConditionsReadings,
} from '../runs/conditionsReadings.js'
import { getHourlySeries, type ScoringLocation } from '../runs/fetchHourlySeries.js'
import { pointKeyForLocation } from '../runs/pointKey.js'
import { computeLiveForecast, type LiveForecastLocation } from '../scoring/liveForecast.js'
import {
  formatConditionsReply,
  formatLocationNotFound,
  type ConditionsReplyInput,
} from './conditionsMessage.js'

/**
 * Data-gathering half of the conditions reply. All the copy decisions — and
 * every test covering them — live in `conditionsMessage.ts`, which is pure and
 * has no database import.
 *
 * Two entry points read the same location shape and run the same gather, so the
 * typed `/conditions <name>` reply and the tapped panel cannot drift on what
 * they say about the same location.
 */

const LOCATION_COLUMNS = {
  id: locations.id,
  name: locations.name,
  lat: locations.lat,
  lon: locations.lon,
  elevation_m: locations.elevation_m,
  rock_type: locations.rock_type,
  cliff_angle: locations.cliff_angle,
  aspect: locations.aspect,
  asos_station: locations.asos_station,
  // §7 rule 8: selected here rather than in a second query. Without it the
  // bot reports a rock-drying score for a city, which the Mini App is
  // already forbidden from doing.
  is_climbing_location: locations.is_climbing_location,
}

/**
 * `LiveForecastLocation` plus the two columns the copy needs. Derived from the
 * schema row rather than restated, so a column that changes type breaks here
 * instead of arriving as a surprise at runtime.
 */
export type ConditionsLocation = LiveForecastLocation &
  Pick<typeof locations.$inferSelect, 'name' | 'is_climbing_location'>

export async function findLocationByName(
  userId: string,
  name: string,
): Promise<ConditionsLocation | null> {
  const rows = await db
    .select(LOCATION_COLUMNS)
    .from(locations)
    .where(and(eq(locations.user_id, userId), ilike(locations.name, `%${name}%`)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Scoped by `user_id` as well as id: an id that belongs to someone else reads as
 * missing rather than opening their location.
 */
export async function findLocationById(
  userId: string,
  locationId: string,
): Promise<ConditionsLocation | null> {
  const rows = await db
    .select(LOCATION_COLUMNS)
    .from(locations)
    .where(and(eq(locations.user_id, userId), eq(locations.id, locationId)))
    .limit(1)
  return rows[0] ?? null
}

/** Everything `formatConditionsReply` and the conditions panel need, gathered once. */
export async function buildConditionsInput(
  location: ConditionsLocation,
): Promise<ConditionsReplyInput> {
  const now = new Date()

  /**
   * **The readings reach the panel only because this argument was passed** —
   * the same protection the two routes use, and the model itself does not
   * branch on the flag. The two placeholders behind it (`unknown` rock, a 45°
   * wall) are the ones `GET /hourly/:id` documents; Phase 4 makes them real.
   */
  const scoring: ScoringLocation = location.is_climbing_location
    ? {
        rockType: location.rock_type ?? 'unknown',
        cliffAngleDeg:
          location.cliff_angle === null ? 45 : parseNumericRequired(location.cliff_angle),
      }
    : null

  const [{ snapshots, scores, todayStr, scoreUnavailable }, activeAlerts, series] = await Promise.all([
    computeLiveForecast(location),
    db
      .select({
        event: weatherAlerts.event,
        severity: weatherAlerts.severity,
        headline: weatherAlerts.headline,
      })
      .from(weatherAlerts)
      .where(
        and(
          eq(weatherAlerts.location_id, location.id),
          or(isNull(weatherAlerts.expires), gt(weatherAlerts.expires, now)),
        ),
      ),
    /**
     * Concurrent with the live compute, and **caught rather than allowed to
     * reject.** Both can reach Open-Meteo on a cold path and `fetchWithRetry`
     * sleeps 1s + 2s + 4s per attempt; a panel is rendered inside a callback
     * the Telegram client abandons at ~15 s, so two retry ladders in sequence
     * is the whole budget. A failed hourly run must not cost the reader the
     * weather and the alerts as well.
     *
     * **Not asked at all for a non-crag**, for the same reason — the whole
     * output would be a sentinel, and it is a round trip inside that budget.
     */
    scoring === null
      ? null
      : getHourlySeries(
          {
            id: location.id,
            lat: parseNumericRequired(location.lat),
            lon: parseNumericRequired(location.lon),
            elevation_m: parseNumeric(location.elevation_m),
          },
          pointKeyForLocation(location.id),
          { allModels: false, now, scoring },
        ).catch((err: unknown) => {
          logger.warn(
            { locationId: location.id, err: describeError(err) },
            'conditions panel: hourly readings unavailable',
          )
          return null
        }),
  ])

  return {
    locationName: location.name,
    isClimbingLocation: location.is_climbing_location,
    // The location's local day, decided server-side — this used to derive its
    // own UTC date, the same #33 bug the Mini App had.
    today: snapshots.find((s) => s.is_today === true) ?? null,
    todayScore: scores.find((s) => s.forecast_date === todayStr) ?? null,
    // The bot and the Mini App must say the same thing about the same location,
    // so the withheld-score case is passed through rather than reading as "no
    // conditions yet" on one surface and something else on the other (#34).
    scoreUnavailable: scoreUnavailable ?? null,
    // The same run of the same model the Mini App reads, sliced by the same
    // rule — `toConditionsReadings` is shared with `GET /conditions/:id`, so
    // the panel and the card cannot pick different hours as "now". The two
    // sentinels are shared too: "saved as a place" and "the model didn't
    // answer" must not read the same on one surface and differently on another.
    readings:
      scoring === null
        ? NOT_A_CRAG_READINGS
        : series === null
          ? READINGS_UNAVAILABLE
          : toConditionsReadings(series, todayStr, now),
    activeAlerts,
  }
}

/** The `/conditions <name>` reply text. Unchanged in substance. */
export async function buildConditionsReply(userId: string, name: string): Promise<string> {
  const location = await findLocationByName(userId, name)
  if (!location) return formatLocationNotFound(name)
  return formatConditionsReply(await buildConditionsInput(location))
}
