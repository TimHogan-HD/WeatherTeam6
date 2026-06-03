import { Router, type Request, type Response } from 'express'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations, weatherAlerts } from '../db/schema.js'
import type { ApiResponse, WeatherAlert } from '@weatherteam6/types'

export const alertsRouter = Router()

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
    effective: row.effective?.toISOString() ?? null,
    expires: row.expires?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
  }
}

alertsRouter.get('/alerts/:locationId', async (req: Request, res: Response) => {
  const locationId = req.params['locationId']
  if (!locationId) {
    res.status(400).json({ data: null, error: 'Missing locationId', status: 400 })
    return
  }

  try {
    const loc = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.user_id, req.userId)))
      .limit(1)

    if (loc.length === 0) {
      const response: ApiResponse<null> = { data: null, error: 'Location not found', status: 404 }
      res.status(404).json(response)
      return
    }

    const now = new Date()
    const rows = await db
      .select()
      .from(weatherAlerts)
      .where(
        and(
          eq(weatherAlerts.location_id, locationId),
          or(isNull(weatherAlerts.expires), gt(weatherAlerts.expires, now)),
        ),
      )

    const response: ApiResponse<WeatherAlert[]> = {
      data: rows.map(mapAlert),
      error: null,
      status: 200,
    }
    res.status(200).json(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const response: ApiResponse<null> = { data: null, error: message, status: 500 }
    res.status(500).json(response)
  }
})
