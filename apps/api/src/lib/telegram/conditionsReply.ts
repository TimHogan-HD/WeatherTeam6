import { and, eq, ilike } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { locations } from '../../db/schema.js'
import { computeLiveForecast } from '../scoring/liveForecast.js'

function statusLabel(score: number | null): string {
  if (score === null) return 'no score yet — this date is too far out for a reliable forecast'
  if (score >= 80) return 'looks great — go climb'
  if (score >= 60) return 'climbable, minor concerns'
  if (score >= 40) return 'marginal — check the details'
  return 'not recommended right now'
}

/** Builds the /conditions <name> reply text for the Telegram bot. */
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
    })
    .from(locations)
    .where(and(eq(locations.user_id, userId), ilike(locations.name, `%${name}%`)))
    .limit(1)

  const location = rows[0]
  if (!location) {
    return `I don't have a saved location matching "${name}". Save it in the app first.`
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  const { scores } = await computeLiveForecast(location)
  const todayScore = scores.find((s) => s.forecast_date === todayStr) ?? null

  return `<b>${location.name}</b>\n${statusLabel(todayScore?.score ?? null)}${todayScore ? ` (score ${todayScore.score ?? 'n/a'}, confidence ${todayScore.confidence})` : ''}`
}
