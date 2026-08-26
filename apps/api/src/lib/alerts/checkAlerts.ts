import { and, eq, isNull, notInArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { locations, weatherAlerts } from '../../db/schema.js'
import { logger } from '../logger.js'
import { formatAlertMessage } from '../telegram/alertMessage.js'
import { alertKeyboard } from '../telegram/deepLink.js'
import { sendTelegramMessage, TelegramPermanentError } from '../telegram/sendMessage.js'
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

  /**
   * Locations run in parallel, not sequentially (issue #27 part 3).
   *
   * Each iteration makes an NWS call through `fetchWithRetry`, which sleeps
   * 1s + 2s + 4s across its four attempts. Serially, an NWS outage cost ~7s per
   * location: about ten locations would exceed the function's `maxDuration: 60`
   * and the request would die **before `notifyPendingAlerts()` ever ran**, so
   * already-pending alerts stayed undelivered across every retry. The failure
   * got worse precisely as more locations were added.
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

/**
 * Send one Telegram message per not-yet-notified weather_alerts row. Each row
 * is claimed with a conditional UPDATE (notified_at IS NULL -> now()) before
 * sending, so two overlapping cron invocations can't both read the same row
 * and double-send — only the invocation whose UPDATE actually matched a row
 * sends the message.
 */
export async function notifyPendingAlerts(): Promise<{ checked: number; notified: number }> {
  const unnotified = await db
    .select({
      id: weatherAlerts.id,
      // Carries the deep link. The alert names a location the user cannot
      // otherwise reach in one tap — the Mini App's menu button opens the list
      // and carries no `startapp` parameter.
      locationId: weatherAlerts.location_id,
      event: weatherAlerts.event,
      severity: weatherAlerts.severity,
      headline: weatherAlerts.headline,
      locationName: locations.name,
    })
    .from(weatherAlerts)
    .innerJoin(locations, eq(weatherAlerts.location_id, locations.id))
    .where(isNull(weatherAlerts.notified_at))

  let notified = 0
  for (const alert of unnotified) {
    const claimed = await db
      .update(weatherAlerts)
      .set({ notified_at: new Date() })
      .where(and(eq(weatherAlerts.id, alert.id), isNull(weatherAlerts.notified_at)))
      .returning({ id: weatherAlerts.id })

    if (claimed.length === 0) continue // another invocation already claimed this row

    try {
      await sendTelegramMessage(
        formatAlertMessage(alert.locationName, alert.event, alert.severity, alert.headline),
        alertKeyboard(alert.locationId),
      )
      notified++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error({ alertId: alert.id, err: msg }, '[checkAlerts] failed to notify alert')

      // A permanent rejection keeps its claim. Telegram answers a malformed
      // message — an unsupported HTML tag, a bad button URL — with a 400 on
      // every attempt, so releasing the claim meant this run's identical
      // message went out again on the next run, and the next, indefinitely.
      // Keeping the row claimed costs one alert; releasing it costs a loop that
      // only stops when someone notices.
      if (err instanceof TelegramPermanentError) {
        logger.error(
          { alertId: alert.id, statusCode: err.status },
          '[checkAlerts] Telegram rejected this alert permanently — leaving it claimed rather than re-sending forever',
        )
        continue
      }

      // Transient failure: release the claim so the next run retries the send.
      // Guarded — if the release itself fails we log and keep going, rather than
      // letting it escape and abort the remaining alerts in this run. Worst case
      // the row stays claimed and is skipped until an operator clears it.
      try {
        await db
          .update(weatherAlerts)
          .set({ notified_at: null })
          .where(eq(weatherAlerts.id, alert.id))
      } catch (releaseErr) {
        logger.error(
          {
            alertId: alert.id,
            err: releaseErr instanceof Error ? releaseErr.message : String(releaseErr),
          },
          '[checkAlerts] failed to release claim after send failure — row will stay claimed',
        )
      }
    }
  }

  return { checked: unnotified.length, notified }
}
