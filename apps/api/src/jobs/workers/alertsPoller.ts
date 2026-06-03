import { Worker, type Job } from 'bullmq'
import { and, eq, notInArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { locations, weatherAlerts } from '../../db/schema.js'
import { logger } from '../../lib/logger.js'
import { fetchNwsAlerts } from '../../lib/weather/nwsAlerts.js'
import { bullConnection } from '../connection.js'

export const alertsPollerWorker = new Worker(
  'alerts-poller',
  async (_job: Job) => {
    logger.info('[alerts-poller] job started')

    const allLocations = await db.select().from(locations)
    if (allLocations.length === 0) {
      logger.info('[alerts-poller] no locations to process')
      return
    }

    const errors: Error[] = []

    for (const loc of allLocations) {
      try {
        const alerts = await fetchNwsAlerts(parseFloat(loc.lat), parseFloat(loc.lon))

        if (alerts === null) {
          logger.warn(
            { locationId: loc.id },
            '[alerts-poller] NWS fetch unavailable, skipping location',
          )
          continue
        }

        if (alerts.length > 0) {
          for (const alert of alerts) {
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
          }

          const activeIds = alerts.map((a) => a.nws_alert_id)
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

        logger.info(
          { locationId: loc.id, alertCount: alerts.length },
          '[alerts-poller] location processed',
        )
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        logger.error({ locationId: loc.id, err: e.message }, '[alerts-poller] location failed')
        errors.push(e)
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `[alerts-poller] ${errors.length} location(s) failed: ${errors.map((e) => e.message).join('; ')}`,
      )
    }

    logger.info('[alerts-poller] job completed')
  },
  { connection: bullConnection, concurrency: 1 },
)

alertsPollerWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'alerts-poller job failed')
})
