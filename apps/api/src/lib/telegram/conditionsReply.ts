import { and, eq, gt, ilike, isNull, or } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { locations, weatherAlerts } from '../../db/schema.js'
import { computeLiveForecast } from '../scoring/liveForecast.js'
import { formatConditionsReply, formatLocationNotFound } from './conditionsMessage.js'

/**
 * Data-gathering half of the `/conditions <name>` reply. All the copy decisions
 * — and every test covering them — live in `conditionsMessage.ts`, which is
 * pure and has no database import.
 */
export async function buildConditionsReply(userId: string, name: string): Promise<string> {
  const rows = await db
    .select({
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
    })
    .from(locations)
    .where(and(eq(locations.user_id, userId), ilike(locations.name, `%${name}%`)))
    .limit(1)

  const location = rows[0]
  if (!location) return formatLocationNotFound(name)

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

  return formatConditionsReply({
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
  })
}
