import { Router, type Request, type Response } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations } from '../db/schema.js'
import { isUuid, sendServerError } from '../lib/http.js'
import { getHourlySeries } from '../lib/runs/fetchHourlySeries.js'
import { pointKeyForLocation } from '../lib/runs/pointKey.js'
import { parseNumeric, parseNumericRequired } from '@weatherteam6/types'
import type { ApiResponse, HourlySeries } from '@weatherteam6/types'

export const hourlyRouter = Router()

/**
 * Hourly forecast for a saved location — the deterministic model with the best measured
 * coverage, joined to the pooled ensemble's percentiles on the same instant.
 *
 * Reads stored runs first (`RUN_MAX_AGE_MINUTES`), so the common path costs one database
 * round trip and no upstream call. The cold path — a location added since the last
 * `collect-runs`, or an ad-hoc point — fetches and writes back, which is slow enough to
 * be worth knowing about but is the existing behaviour of every Telegram panel.
 *
 * `?models=all` adds every deterministic model that answered. The parameter exists now so
 * that building a model switcher never needs a second API change; the six do not reach
 * the same distance, so a client showing them must show where each one stops.
 */
hourlyRouter.get('/hourly/:locationId', async (req: Request, res: Response) => {
  const locationId = req.params['locationId']
  if (!locationId) {
    res.status(400).json({ data: null, error: 'Missing locationId', status: 400 })
    return
  }
  // A non-uuid reaches Postgres as a malformed input and comes back as a generic 500.
  if (!isUuid(locationId)) {
    const response: ApiResponse<null> = { data: null, error: 'Location not found', status: 404 }
    res.status(404).json(response)
    return
  }

  // Only `all` is accepted, and anything else is refused rather than ignored. A silently
  // dropped `?models=gfs_seamless` would return one model and look like it had worked,
  // which is the same class of failure as a swallowed fetch error.
  const modelsParam = req.query['models']
  if (modelsParam !== undefined && modelsParam !== 'all') {
    const response: ApiResponse<null> = {
      data: null,
      error: "Unsupported models parameter — the only accepted value is 'all'",
      status: 400,
    }
    res.status(400).json(response)
    return
  }
  const allModels = modelsParam === 'all'

  try {
    const rows = await db
      .select({
        id: locations.id,
        lat: locations.lat,
        lon: locations.lon,
        elevation_m: locations.elevation_m,
      })
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.user_id, req.userId)))
      .limit(1)

    const location = rows[0]
    if (!location) {
      const response: ApiResponse<null> = { data: null, error: 'Location not found', status: 404 }
      res.status(404).json(response)
      return
    }

    // `lat`/`lon` are numeric columns and arrive as strings; `elevation_m` is nullable and
    // must stay null rather than becoming 0 — sea level is a real elevation, and passing
    // it would silently skip the lapse-rate correction on a mountain.
    const series: HourlySeries = await getHourlySeries(
      {
        id: location.id,
        lat: parseNumericRequired(location.lat),
        lon: parseNumericRequired(location.lon),
        elevation_m: parseNumeric(location.elevation_m),
      },
      pointKeyForLocation(location.id),
      { allModels },
    )

    const response: ApiResponse<HourlySeries> = { data: series, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /hourly/:locationId')
  }
})
