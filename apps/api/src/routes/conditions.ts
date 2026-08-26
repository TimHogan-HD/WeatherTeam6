import { Router, type Request, type Response } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations } from '../db/schema.js'
import { isUuid, sendServerError } from '../lib/http.js'
import { computeLiveForecast } from '../lib/scoring/liveForecast.js'
import type { ApiResponse, ConditionsScore } from '@weatherteam6/types'

export const conditionsRouter = Router()

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

    // The location's local day, not this server's (#33).
    const { scores, todayStr, scoreUnavailable } = await computeLiveForecast(location)

    // A withheld score is reported as such, not as an absent one (#34). `data:
    // null` means "no row for today"; this means "we could not measure it", and
    // a client that cannot tell them apart says the wrong thing about both.
    if (scoreUnavailable) {
      const nowIso = new Date().toISOString()
      const unavailable: ConditionsScore = {
        id: `${location.id}:${todayStr}`,
        location_id: location.id,
        forecast_date: todayStr,
        score: null,
        confidence: 'low',
        component_drying_time: null,
        component_upcoming_rain: null,
        component_wind: null,
        component_temp: null,
        component_humidity: null,
        score_breakdown: null,
        computed_at: nowIso,
        created_at: nowIso,
        unavailable_reason: scoreUnavailable,
      }
      const response: ApiResponse<ConditionsScore> = {
        data: unavailable,
        error: null,
        status: 200,
      }
      res.status(200).json(response)
      return
    }

    const todayScore = scores.find((s) => s.forecast_date === todayStr) ?? null

    const response: ApiResponse<ConditionsScore | null> = {
      data: todayScore,
      error: null,
      status: 200,
    }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /conditions/:locationId')
  }
})
