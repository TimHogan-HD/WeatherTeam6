import { Router, type Request, type Response } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations } from '../db/schema.js'
import { isUuid, sendServerError } from '../lib/http.js'
import { getHourlySeries, type ScoringLocation } from '../lib/runs/fetchHourlySeries.js'
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
        is_climbing_location: locations.is_climbing_location,
        rock_type: locations.rock_type,
        cliff_angle: locations.cliff_angle,
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

    /**
     * **The readings reach the response only because this argument was passed.**
     * A location that is not a crag gets `not_a_climbing_location` and no
     * reading, and there is no `is_climbing_location` check further down to
     * forget — the same protection `GET /forecast/:id` uses for its per-day
     * scores, and for the same reason: the model itself does not branch on the
     * flag and would happily score a city.
     *
     * **Two fallbacks, and nothing in the response marks either of them.**
     * `qualified` covers one thing only — whether the sun could have changed
     * this hour's answer — and it says nothing about a rock type nobody
     * recorded or a wall angle nobody set. A reading derived from these is
     * indistinguishable from one derived from real crag data, which is the
     * strongest argument for Phase 4 and a gap Phase 3's copy has to cover
     * until it lands.
     *
     * - **`rock_type` is null on a location whose kind was never recorded**, and
     *   `unknown` means exactly that. It is not "average rock" — it takes the
     *   slower drying window, so it reads as caution rather than as a guess.
     * - **`cliff_angle` is null on every user-added location, because nothing
     *   writes it.** 45 is what the rest of the app already substitutes and
     *   changing that here would move scores for a reason unrelated to this
     *   phase. Phase 4 is the screen that makes it real; until then it is a
     *   placeholder and `compare:hourly-v2` prints it as one.
     */
    const scoring: ScoringLocation = location.is_climbing_location
      ? {
          rockType: location.rock_type ?? 'unknown',
          cliffAngleDeg: location.cliff_angle === null ? 45 : parseNumericRequired(location.cliff_angle),
        }
      : null

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
      { allModels, scoring },
    )

    const response: ApiResponse<HourlySeries> = { data: series, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /hourly/:locationId')
  }
})
