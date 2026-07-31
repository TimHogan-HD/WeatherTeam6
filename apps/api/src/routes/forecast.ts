import { Router, type Request, type Response } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations } from '../db/schema.js'
import { isUuid, sendServerError } from '../lib/http.js'
import { computeLiveForecast } from '../lib/scoring/liveForecast.js'
import type { ApiResponse, ForecastSnapshot } from '@weatherteam6/types'

export const forecastRouter = Router()

function forecastWindow(forecastDate: string, todayStr: string): 'pre' | 'early' | 'decision' {
  const today = new Date(todayStr + 'T00:00:00Z')
  const forecast = new Date(forecastDate + 'T00:00:00Z')
  const daysOut = Math.round((forecast.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (daysOut > 14) return 'pre'
  if (daysOut >= 7) return 'early'
  return 'decision'
}

forecastRouter.get('/forecast/:locationId', async (req: Request, res: Response) => {
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
      .select({
        id: locations.id,
        lat: locations.lat,
        lon: locations.lon,
        elevation_m: locations.elevation_m,
        rock_type: locations.rock_type,
        cliff_angle: locations.cliff_angle,
        aspect: locations.aspect,
        asos_station: locations.asos_station,
      })
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.user_id, req.userId)))
      .limit(1)

    const location = loc[0]
    if (!location) {
      const response: ApiResponse<null> = { data: null, error: 'Location not found', status: 404 }
      res.status(404).json(response)
      return
    }

    const todayStr = new Date().toISOString().slice(0, 10)
    const { snapshots } = await computeLiveForecast(location)
    const withWindow = snapshots
      .filter((s) => s.forecast_date >= todayStr)
      .sort((a, b) => a.forecast_date.localeCompare(b.forecast_date))
      .map((s) => ({ ...s, window: forecastWindow(s.forecast_date, todayStr) }))

    const response: ApiResponse<ForecastSnapshot[]> = {
      data: withWindow,
      error: null,
      status: 200,
    }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /forecast/:locationId')
  }
})
