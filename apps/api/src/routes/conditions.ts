import { Router, type Request, type Response } from 'express'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { conditionsScores, locations } from '../db/schema.js'
import { isUuid, sendServerError } from '../lib/http.js'
import type { ApiResponse, ConditionsScore, ScoreBreakdown } from '@weatherteam6/types'

export const conditionsRouter = Router()

type ScoreRow = typeof conditionsScores.$inferSelect

function mapScore(row: ScoreRow): ConditionsScore {
  return {
    id: row.id,
    location_id: row.location_id,
    forecast_date: row.forecast_date,
    score: row.score,
    confidence: row.confidence,
    component_drying_time: row.component_drying_time,
    component_upcoming_rain: row.component_upcoming_rain,
    component_wind: row.component_wind,
    component_temp: row.component_temp,
    component_humidity: row.component_humidity,
    score_breakdown: row.score_breakdown as ScoreBreakdown | null,
    computed_at: row.computed_at.toISOString(),
    created_at: row.created_at.toISOString(),
  }
}

conditionsRouter.get('/conditions/:locationId', async (req: Request, res: Response) => {
  const locationId = req.params['locationId']
  if (!locationId) {
    res.status(400).json({ data: null, error: 'Missing locationId', status: 400 })
    return
  }
  if (!isUuid(locationId)) {
    res.status(404).json({ data: null, error: 'Location not found', status: 404 })
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

    const today = new Date().toISOString().slice(0, 10)
    const rows = await db
      .select()
      .from(conditionsScores)
      .where(
        and(
          eq(conditionsScores.location_id, locationId),
          eq(conditionsScores.forecast_date, today),
        ),
      )
      .orderBy(desc(conditionsScores.computed_at))
      .limit(1)

    const response: ApiResponse<ConditionsScore | null> = {
      data: rows[0] ? mapScore(rows[0]) : null,
      error: null,
      status: 200,
    }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /conditions/:locationId')
  }
})
