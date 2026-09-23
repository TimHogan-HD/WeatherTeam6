import { Router, type Request, type Response } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations } from '../db/schema.js'
import { describeError, isUuid, sendServerError } from '../lib/http.js'
import { logger } from '../lib/logger.js'
import { computeLiveForecast } from '../lib/scoring/liveForecast.js'
import {
  NOT_A_CRAG_READINGS,
  READINGS_UNAVAILABLE,
  toConditionsReadings,
} from '../lib/runs/conditionsReadings.js'
import { getHourlySeries } from '../lib/runs/fetchHourlySeries.js'
import { scoringLocationFor } from '../lib/runs/scoringLocation.js'
import { pointKeyForLocation } from '../lib/runs/pointKey.js'
import { parseNumeric, parseNumericRequired } from '@weatherteam6/types'
import type { ApiResponse, ConditionsReadings, ConditionsScore } from '@weatherteam6/types'

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
        // §7 rule 8, and the same protection `GET /hourly/:id` uses: the v2
        // model does not branch on this flag and would score a city if asked,
        // so the flag decides whether it is asked at all.
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
     * — the same shape as `GET /hourly/:id` and `GET /forecast/:id`, and there
     * is no `is_climbing_location` check further down to forget.
     *
     * The two placeholders are the ones `/hourly` already documents and neither
     * is marked in the response: `rock_type` null means the kind was never
     * recorded (`unknown` takes the slower drying window, so it reads as
     * caution), and `cliff_angle` is null until someone records it — 45 is
     * substituted for drying and is never treated as a recorded wall. The one
     * implementation is `scoringLocationFor`, shared with `/hourly`.
     */
    const scoring = scoringLocationFor(location)

    /**
     * Both halves at once, and **neither may take the other down.**
     *
     * They are different models over different data: the five-component score
     * runs live off pooled daily aggregates, the v2 readings off stored hourly
     * runs. Each can reach Open-Meteo on a cold path, and `fetchWithRetry`
     * sleeps 1s + 2s + 4s per attempt — running them in sequence would put two
     * full retry ladders inside one request against the function's 60 s
     * ceiling, which is the failure that took `runAlertsCheck` down.
     *
     * **The hourly run is not fetched at all for a non-crag.** `scoring` being
     * null already means no reading comes back, so asking would be a second
     * upstream round trip whose entire output is a sentinel. The flag decides
     * whether the question is asked, not just what is done with the answer.
     *
     * The run is caught rather than allowed to reject: a location whose hourly
     * fetch failed still has weather, alerts and a rain record to show.
     */
    const [live, series] = await Promise.all([
      computeLiveForecast(location),
      scoring === null
        ? null
        : getHourlySeries(
            {
              id: location.id,
              lat: parseNumericRequired(location.lat),
              lon: parseNumericRequired(location.lon),
              // Nullable, and it must stay null rather than becoming 0 — sea
              // level is a real elevation, and passing it would silently skip
              // the lapse-rate correction on a mountain.
              elevation_m: parseNumeric(location.elevation_m),
            },
            pointKeyForLocation(location.id),
            { allModels: false, now, scoring },
          ).catch((err: unknown) => {
            logger.warn(
              { locationId: location.id, err: describeError(err) },
              'conditions: hourly readings unavailable',
            )
            return null
          }),
    ])

    // The location's local day, not this server's (#33).
    const { scores, todayStr, scoreUnavailable } = live
    const todayReadings: ConditionsReadings =
      scoring === null
        ? NOT_A_CRAG_READINGS
        : series === null
          ? READINGS_UNAVAILABLE
          : toConditionsReadings(series, todayStr, now)

    // A withheld score is reported as such, not as an absent one (#34). `data:
    // null` means "no row for today"; this means "we could not measure it", and
    // a client that cannot tell them apart says the wrong thing about both.
    //
    // **The readings still ride on it.** The two models fail independently: this
    // branch is a failed *rainfall* lookup, which the v2 readings never consult
    // — they run off stored hourly runs. Withholding them here would hide a good
    // reading behind an unrelated outage.
    if (scoreUnavailable) {
      const nowIso = now.toISOString()
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
        readings: todayReadings,
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

    /**
     * **A known limit of carrying the readings on a v1 row, and it is worth
     * naming.** With no row for today there is nowhere to hang them and `data`
     * stays `null`, so a client sees no readings even if the model had some.
     * Since #108 made day 0 exactly `now`, today always has a row unless the
     * whole live compute produced nothing — the case the branch above already
     * answers. Phase 5 removes the coupling when `data` stops being a v1 row.
     */
    const response: ApiResponse<ConditionsScore | null> = {
      data: todayScore === null ? null : { ...todayScore, readings: todayReadings },
      error: null,
      status: 200,
    }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /conditions/:locationId')
  }
})
