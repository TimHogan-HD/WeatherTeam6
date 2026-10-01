import { Router, type Request, type Response } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations } from '../db/schema.js'
import { describeError, isUuid, sendServerError } from '../lib/http.js'
import { logger } from '../lib/logger.js'
import { localDateString } from '../lib/weather/openMeteo.js'
import {
  NOT_A_CRAG_READINGS,
  READINGS_UNAVAILABLE,
  toConditionsReadings,
} from '../lib/runs/conditionsReadings.js'
import { getHourlySeries } from '../lib/runs/fetchHourlySeries.js'
import { scoringLocationFor } from '../lib/runs/scoringLocation.js'
import { tempRangeFor } from '../lib/preferences/preferences.js'
import { parseNumeric, parseNumericRequired } from '@weatherteam6/types'
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

    const now = new Date()

    /**
     * **The readings reach the response only because this argument was passed**
     * — the same shape as `GET /hourly/:id`, and there is no
     * `is_climbing_location` check further down to forget. A crag's readings are
     * judged against the reader's own temperature range.
     *
     * The two placeholders are the ones `/hourly` documents and neither is
     * marked in the response: `rock_type` null takes `unknown`'s slower drying
     * window, and an unrecorded `cliff_angle` is never treated as a recorded
     * wall. The one implementation is `scoringLocationFor`, shared with `/hourly`.
     */
    const scoring = location.is_climbing_location
      ? scoringLocationFor(location, await tempRangeFor(req.userId))
      : null

    /**
     * **The hourly run is not fetched at all for a non-crag** — `scoring` being
     * null already means no reading comes back.
     *
     * The run is caught rather than allowed to reject: a failed hourly fetch is
     * `READINGS_UNAVAILABLE`, a gap the client names, not a 500 that costs the
     * list card its weather.
     */
    const series =
      scoring === null
        ? null
        : await getHourlySeries(
            {
              id: location.id,
              lat: parseNumericRequired(location.lat),
              lon: parseNumericRequired(location.lon),
              // Nullable, and it must stay null rather than becoming 0 — sea
              // level is a real elevation, and passing it would silently skip
              // the lapse-rate correction on a mountain.
              elevation_m: parseNumeric(location.elevation_m),
            },
            { allModels: false, now, scoring },
          ).catch((err: unknown) => {
            logger.warn(
              { locationId: location.id, err: describeError(err) },
              'conditions: hourly readings unavailable',
            )
            return null
          })

    // The location's local day, from the clock the series itself carries (#33).
    const todayStr = series === null ? null : localDateString(now, series.utc_offset_seconds)

    const conditions: Conditions = {
      location_id: location.id,
      forecast_date: todayStr,
      readings:
        scoring === null
          ? NOT_A_CRAG_READINGS
          : series === null || todayStr === null
            ? READINGS_UNAVAILABLE
            : toConditionsReadings(series, todayStr, now),
    }
    const response: ApiResponse<Conditions> = { data: conditions, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /conditions/:locationId')
  }
})
