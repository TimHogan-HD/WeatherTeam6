import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { weatherAlerts } from '../../db/schema.js'
import type { WeatherAlert } from '@weatherteam6/types'

type AlertRow = typeof weatherAlerts.$inferSelect

function mapAlert(row: AlertRow): WeatherAlert {
  return {
    id: row.id,
    location_id: row.location_id,
    nws_alert_id: row.nws_alert_id,
    event: row.event,
    severity: row.severity,
    certainty: row.certainty,
    headline: row.headline,
    description: row.description,
    instruction: row.instruction,
    effective: row.effective?.toISOString() ?? null,
    expires: row.expires?.toISOString() ?? null,
    ends: row.ends?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
  }
}

/**
 * The stored alerts for a location that have not expired: `GET /alerts/:id`
 * and `GET /list`. **The caller has already checked the location is the
 * reader's** — `weather_alerts` has no `user_id` (architecture.md § Auth).
 *
 * A failed read throws. `[]` means "no active alerts", so it is never the
 * answer to a fault (defect class 2).
 */
export async function activeAlertsFor(locationId: string, now: Date = new Date()): Promise<WeatherAlert[]> {
  const rows = await db
    .select()
    .from(weatherAlerts)
    .where(
      and(
        eq(weatherAlerts.location_id, locationId),
        or(isNull(weatherAlerts.expires), gt(weatherAlerts.expires, now)),
      ),
    )
  return rows.map(mapAlert)
}
