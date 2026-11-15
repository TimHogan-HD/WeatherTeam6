import { Router, type Request, type Response } from 'express'
import { asc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations } from '../db/schema.js'
import { sendServerError } from '../lib/http.js'
import { activeAlertsFor } from '../lib/alerts/activeAlerts.js'
import { buildList } from '../lib/list/buildList.js'
import { readerScoringFor } from '../lib/preferences/preferences.js'
import { conditionsFor } from '../lib/runs/conditionsFor.js'
import type { ReaderScoring } from '../lib/runs/scoringLocation.js'
import { windowedForecastFor } from '../lib/scoring/windowedForecast.js'
import { rainNowFor } from '../lib/weather/mrmsRate.js'
import type { ApiResponse, ListResponse } from '@weatherteam6/types'

export const listRouter = Router()

/**
 * **The Conditions list and the Map in one request** (#606): what
 * `/forecast/:id`, `/alerts/:id` and `/conditions/:id` answer for every one of
 * the reader's places, and `/rain-now`, through the same lib functions those
 * routes call. One serverless start does what ~19 did, which was most of the
 * API's CPU (#598). Each part is its own envelope (`buildList`).
 *
 * Every location comes from `req.userId`'s own rows, so no id the caller
 * supplies is trusted.
 */
listRouter.get('/list', async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: locations.id,
        lat: locations.lat,
        lon: locations.lon,
        elevation_m: locations.elevation_m,
        rock_type: locations.rock_type,
        cliff_angle: locations.cliff_angle,
        aspect: locations.aspect,
        is_climbing_location: locations.is_climbing_location,
      })
      .from(locations)
      .where(eq(locations.user_id, req.userId))
      .orderBy(asc(locations.created_at))

    // Read once for every crag, and only if there is one. A failed read is an
    // error on every crag's conditions part, never the default range.
    let reader: Promise<ReaderScoring> | undefined
    const readerOnce = () => (reader ??= readerScoringFor(req.userId))

    const now = new Date()
    const data = await buildList(rows, {
      forecast: (location) => windowedForecastFor(location, now),
      alerts: (locationId) => activeAlertsFor(locationId, now),
      conditions: (location) => conditionsFor(location, readerOnce, now),
      rainNow: (places) => rainNowFor(places, now),
    })
    const response: ApiResponse<ListResponse> = { data, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /list')
  }
})
