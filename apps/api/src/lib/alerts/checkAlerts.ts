import { and, eq, notInArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { locations, weatherAlerts } from '../../db/schema.js'
import { logger } from '../logger.js'
import { fetchNwsAlerts } from '../weather/nwsAlerts.js'

/**
 * Fetch active NWS alerts for every saved location, upsert into weather_alerts,
 * and prune rows no longer in the active set. Same fetch/upsert/prune logic the
 * (removed) alertsPoller BullMQ job used to run on a schedule — now invoked
 * on demand by POST /api/cron/check-alerts instead.
 */
export async function runAlertsCheck(): Promise<void> {
  logger.info('[checkAlerts] run started')

  const allLocations = await db
    .select({ id: locations.id, lat: locations.lat, lon: locations.lon })
    .from(locations)
  if (allLocations.length === 0) {
    logger.info('[checkAlerts] no locations to process')
    return
  }

  const errors: Error[] = []

  for (const loc of allLocations) {
    try {
      const alerts = await fetchNwsAlerts(parseFloat(loc.lat), parseFloat(loc.lon))

      if (alerts === null) {
        logger.warn({ locationId: loc.id }, '[checkAlerts] NWS fetch unavailable, skipping location')
        continue
      }

      // Upsert each active alert individually, tolerating insert-level errors so
      // the pruning DELETE always runs with the full NWS-returned active set.
      const activeIds = alerts.map((a) => a.nws_alert_id)
      for (const alert of alerts) {
        try {
          await db
            .insert(weatherAlerts)
            .values({
              location_id: loc.id,
              nws_alert_id: alert.nws_alert_id,
              event: alert.event,
              severity: alert.severity,
              certainty: alert.certainty,
              headline: alert.headline,
              description: alert.description,
              effective: alert.effective ? new Date(alert.effective) : null,
              expires: alert.expires ? new Date(alert.expires) : null,
            })
            .onConflictDoUpdate({
              target: [weatherAlerts.location_id, weatherAlerts.nws_alert_id],
              set: {
                event: alert.event,
                severity: alert.severity,
                certainty: alert.certainty,
                headline: alert.headline,
                description: alert.description,
                effective: alert.effective ? new Date(alert.effective) : null,
                expires: alert.expires ? new Date(alert.expires) : null,
              },
            })
        } catch (insertErr) {
          const e = insertErr instanceof Error ? insertErr : new Error(String(insertErr))
          logger.warn(
            { locationId: loc.id, nws_alert_id: alert.nws_alert_id, err: e.message },
            '[checkAlerts] alert upsert failed',
          )
          errors.push(e)
        }
      }

      // Prune rows no longer in the NWS active set, using the full set returned
      // by NWS (not just the successfully upserted subset) so we don't retain
      // alerts that NWS has since cancelled.
      if (activeIds.length > 0) {
        await db
          .delete(weatherAlerts)
          .where(
            and(
              eq(weatherAlerts.location_id, loc.id),
              notInArray(weatherAlerts.nws_alert_id, activeIds),
            ),
          )
      } else {
        await db.delete(weatherAlerts).where(eq(weatherAlerts.location_id, loc.id))
      }

      logger.info({ locationId: loc.id, alertCount: alerts.length }, '[checkAlerts] location processed')
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      logger.error({ locationId: loc.id, err: e.message }, '[checkAlerts] location failed')
      errors.push(e)
    }
  }

  if (errors.length > 0) {
    throw new Error(`[checkAlerts] ${errors.length} error(s): ${errors.map((e) => e.message).join('; ')}`)
  }

  logger.info('[checkAlerts] run completed')
}
