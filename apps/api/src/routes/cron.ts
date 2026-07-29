import { createHash, timingSafeEqual } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { eq, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations, weatherAlerts } from '../db/schema.js'
import { sendServerError } from '../lib/http.js'
import { logger } from '../lib/logger.js'
import { runAlertsCheck } from '../lib/alerts/checkAlerts.js'
import { sendTelegramMessage } from '../lib/telegram/sendMessage.js'
import type { ApiResponse } from '@weatherteam6/types'

export const cronRouter = Router()

// Fixed-length digest comparison so a mismatched CRON_SECRET can't be brute-forced
// via response-time differences — this header is the only guard on a public URL.
function isValidCronSecret(provided: string | undefined, expected: string): boolean {
  if (!provided) return false
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

function formatAlertMessage(locationName: string, event: string, severity: string, headline: string | null): string {
  const tier = severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase()
  const reason = headline ?? event
  return `⚠️ <b>${tier} alert</b> — ${locationName}\n${event}: ${reason}`
}

cronRouter.post('/check-alerts', async (req: Request, res: Response) => {
  const expected = process.env['CRON_SECRET']
  if (!expected) {
    res.status(503).json({ data: null, error: 'Cron endpoint unavailable: CRON_SECRET is not configured', status: 503 })
    return
  }
  if (!isValidCronSecret(req.headers['x-cron-secret'] as string | undefined, expected)) {
    res.status(401).json({ data: null, error: 'Unauthorized', status: 401 })
    return
  }

  try {
    await runAlertsCheck()

    const unnotified = await db
      .select({
        id: weatherAlerts.id,
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
      try {
        await sendTelegramMessage(
          formatAlertMessage(alert.locationName, alert.event, alert.severity, alert.headline),
        )
        await db
          .update(weatherAlerts)
          .set({ notified_at: new Date() })
          .where(eq(weatherAlerts.id, alert.id))
        notified++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error({ alertId: alert.id, err: msg }, '[cron] failed to notify alert')
      }
    }

    const response: ApiResponse<{ checked: number; notified: number }> = {
      data: { checked: unnotified.length, notified },
      error: null,
      status: 200,
    }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'POST /api/cron/check-alerts')
  }
})
