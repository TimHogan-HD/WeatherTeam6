import { Router, type Request, type Response } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations } from '../db/schema.js'
import { isUuid, sendServerError } from '../lib/http.js'
import { computeLiveForecast } from '../lib/scoring/liveForecast.js'
import { toWindowedForecast } from '../lib/scoring/forecastWindow.js'
import type { ApiResponse, ForecastSnapshot } from '@weatherteam6/types'

export const forecastRouter = Router()

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
        // Selected only to decide whether a score may be attached at all. The
        // scorer itself never sees it — `computeLiveForecast` does not branch on
        // it and will score a city if asked.
        is_climbing_location: locations.is_climbing_location,
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

    // `todayStr` comes back from the compute rather than being derived here: it
    // is the *location's* local day, which this route has no way to know (#33).
    const { snapshots, scores, todayStr, scoreUnavailable } = await computeLiveForecast(location)

    // A city gets weather and nothing else. The merge argument is simply not
    // passed, so no score field appears on any row — there is no flag to forget
    // and no `is_climbing_location` check anywhere downstream.
    const withWindow = location.is_climbing_location
      ? toWindowedForecast(snapshots, todayStr, {
          scores,
          unavailableReason: scoreUnavailable ?? null,
        })
      : toWindowedForecast(snapshots, todayStr)

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
