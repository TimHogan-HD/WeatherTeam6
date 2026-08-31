import { and, eq, gt, ilike, isNull, or } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { locations, weatherAlerts } from '../../db/schema.js'
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

  const [{ snapshots, scores, todayStr, scoreUnavailable }, activeAlerts] = await Promise.all([
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
  ])

  return {
    locationName: location.name,
    isClimbingLocation: location.is_climbing_location,
    asosStation: location.asos_station,
    // The location's local day, decided server-side — this used to derive its
    // own UTC date, the same #33 bug the Mini App had.
    today: snapshots.find((s) => s.is_today === true) ?? null,
    todayScore: scores.find((s) => s.forecast_date === todayStr) ?? null,
    // The bot and the Mini App must say the same thing about the same location,
    // so the withheld-score case is passed through rather than reading as "no
    // conditions yet" on one surface and something else on the other (#34).
    scoreUnavailable: scoreUnavailable ?? null,
    activeAlerts,
    snapshots,
  }
}

/** The `/conditions <name>` reply text. Unchanged in substance. */
export async function buildConditionsReply(userId: string, name: string): Promise<string> {
  const location = await findLocationByName(userId, name)
  if (!location) return formatLocationNotFound(name)
  return formatConditionsReply(await buildConditionsInput(location))
}
