import { Router, type Request, type Response } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations } from '../db/schema.js'
import { isUuid, sendServerError, routeParam } from '../lib/http.js'
import { conditionsFor } from '../lib/runs/conditionsFor.js'
import { readerScoringFor } from '../lib/preferences/preferences.js'
import type { ApiResponse, Conditions } from '@weatherteam6/types'

export const conditionsRouter = Router()

/**
 * **Today's Crag A readings, and nothing else** — the list card and the crag
 * screen's Now block. The five-component score that used to be the body of this
 * response was retired in scoring Phase 5b (2026-10-01); the readings it carried
 * are now the whole of it, so there is no longer a "no row for today" that hides
 * a good reading.
 */
conditionsRouter.get('/conditions/:locationId', async (req: Request, res: Response) => {
  const locationId = routeParam(req, 'locationId')
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
        // §7 rule 8, and the same protection `GET /hourly/:id` uses: the model
        // does not branch on this flag and would score a city if asked, so the
        // flag decides whether it is asked at all.
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

    const conditions = await conditionsFor(location, () => readerScoringFor(req.userId))
    const response: ApiResponse<Conditions> = { data: conditions, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /conditions/:locationId')
  }
})
