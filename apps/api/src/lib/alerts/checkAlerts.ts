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
 *
 * **This module collects alerts and no longer delivers any.**
 * `notifyPendingAlerts` was deleted with the Telegram bot in migration Phase 3
 * and alerts are parked, so `weather_alerts.notified_at` is dormant: nothing
 * writes it and nothing reads it. The column is kept on purpose — whatever
 * replaces the bot will want exactly that claim-before-send mechanism — but
 * until then it is null on every row and **must not be read as "not yet sent"**.
 *
 * What still depends on this running: `GET /api/v1/alerts`, and the Severe+
 * suppression of the score in `summarizeReadings`. A stale alert table is worse
 * than an empty one, which is why the schedule stays registered.
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

  /**
   * Locations run in parallel, not sequentially (issue #27 part 3).
   *
   * Each iteration makes an NWS call through `fetchWithRetry`, which sleeps
   * 1s + 2s + 4s across its four attempts. Serially, an NWS outage cost ~7s per
   * location: about ten locations would exceed the function's `maxDuration: 60`
   * and the request would die partway through the list, so the locations after
   * the slow one kept whatever rows they had from the previous run — and the
   * failure got worse precisely as more locations were added. (It also killed
   * the delivery step that used to follow this one, which is how it was found.)
   *
   * `Promise.allSettled` so one location's failure cannot sink the others —
   * the same shape as `GET /trips/:tripId/forecast`, where this was fixed and
   * then not carried across.
   *
   * Safe to run concurrently: each location only ever touches its own rows
   * (`weather_alerts` is unique on `location_id, nws_alert_id`), so no two
   * iterations contend for the same row.
   */
  const settled = await Promise.allSettled(
    allLocations.map(async (loc) => {
      const errors: Error[] = []
      const alerts = await fetchNwsAlerts(parseFloat(loc.lat), parseFloat(loc.lon))

      if (alerts === null) {
        logger.warn({ locationId: loc.id }, '[checkAlerts] NWS fetch unavailable, skipping location')
        return errors
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
      return errors
    }),
  )

  // Upsert-level errors are carried out of each task as a list; a task that
  // threw outright is a rejection. Both still make the run report failure, so
  // the cron response's `refreshFailed` flag keeps meaning what it did.
  const errors: Error[] = []
  for (const [i, result] of settled.entries()) {
    if (result.status === 'fulfilled') {
      errors.push(...result.value)
    } else {
      const e =
        result.reason instanceof Error ? result.reason : new Error(String(result.reason))
      logger.error(
        { locationId: allLocations[i]?.id, err: e.message },
        '[checkAlerts] location failed',
      )
      errors.push(e)
    }
  }

  if (errors.length > 0) {
    throw new Error(`[checkAlerts] ${errors.length} error(s): ${errors.map((e) => e.message).join('; ')}`)
  }

  logger.info('[checkAlerts] run completed')
}
