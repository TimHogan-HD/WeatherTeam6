import { Router, type Request, type Response } from 'express'
import { and, asc, eq, gte } from 'drizzle-orm'
import { db } from '../db/index.js'
import { forecastSnapshots, locations } from '../db/schema.js'
import { parseNumeric } from '@weatherteam6/types'
import type { ApiResponse, ForecastSnapshot } from '@weatherteam6/types'

export const forecastRouter = Router()

type SnapshotRow = typeof forecastSnapshots.$inferSelect

function forecastWindow(forecastDate: string, todayStr: string): 'pre' | 'early' | 'decision' {
  const today = new Date(todayStr + 'T00:00:00Z')
  const forecast = new Date(forecastDate + 'T00:00:00Z')
  const daysOut = Math.round((forecast.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (daysOut > 14) return 'pre'
  if (daysOut >= 7) return 'early'
  return 'decision'
}

function mapSnapshot(row: SnapshotRow, todayStr: string): ForecastSnapshot {
  return {
    id: row.id,
    location_id: row.location_id,
    captured_at: row.captured_at.toISOString(),
    forecast_date: row.forecast_date,
    precip_mm_p10: parseNumeric(row.precip_mm_p10),
    precip_mm_p50: parseNumeric(row.precip_mm_p50),
    precip_mm_p90: parseNumeric(row.precip_mm_p90),
    temp_c_min: parseNumeric(row.temp_c_min),
    temp_c_max: parseNumeric(row.temp_c_max),
    wind_kmh_max: parseNumeric(row.wind_kmh_max),
    humidity_pct: parseNumeric(row.humidity_pct),
    model_sources: row.model_sources ?? null,
    created_at: row.created_at.toISOString(),
    window: forecastWindow(row.forecast_date, todayStr),
  }
}

forecastRouter.get('/forecast/:locationId', async (req: Request, res: Response) => {
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

    const todayStr = new Date().toISOString().slice(0, 10)
    const rows = await db
      .select()
      .from(forecastSnapshots)
      .where(
        and(
          eq(forecastSnapshots.location_id, locationId),
          gte(forecastSnapshots.forecast_date, todayStr),
        ),
      )
      .orderBy(asc(forecastSnapshots.forecast_date))

    const response: ApiResponse<ForecastSnapshot[]> = {
      data: rows.map((row) => mapSnapshot(row, todayStr)),
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
