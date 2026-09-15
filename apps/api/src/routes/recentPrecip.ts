import { Router, type Request, type Response } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations } from '../db/schema.js'
import { isUuid, sendServerError } from '../lib/http.js'
import { fetchRecentHourlyPrecip } from '../lib/weather/openMeteo.js'
import { trimToObservedHours } from '../lib/weather/recentPrecipWindow.js'
import { parseNumericRequired } from '@weatherteam6/types'
import type { ApiResponse, RecentPrecip } from '@weatherteam6/types'

export const recentPrecipRouter = Router()

/**
 * How many days back the window covers.
 *
 * Five, matching the mockup's "recent rain · past 5 days". Long enough to hold
 * the storm a sandstone crag is still drying out from, short enough that one
 * bar per hour still has width at phone size — 120 of them across a card is
 * about two pixels each.
 *
 * **The client does not assume this number.** It measures the span of what came
 * back and captions the chart with that, so shortening the window here changes
 * the heading on its own.
 */
const PAST_DAYS = 5

/**
 * Hourly rainfall over the past few days for a saved location.
 *
 * **A thin proxy, deliberately.** `fetchRecentHourlyPrecip` already existed for
 * the bot's rain panel; this exposes it so the Mini App can draw the same
 * record. The client never calls Open-Meteo itself — that would bypass
 * `fetchWithRetry` and the `{ data, error, status }` contract both
 * (architecture rule, § External APIs are proxied).
 *
 * **Why it is worth a round trip at all:** the conditions score says "climbable
 * in ~10h", and this is the rainfall behind that sentence. Without it the
 * reader has to take the number on trust and cannot tell one afternoon storm
 * from three days of drizzle.
 *
 * Its own endpoint rather than a field on `/conditions/:id` so its upstream
 * call cannot delay the rest of the screen — the same rule the detail view's
 * sections already follow.
 */
recentPrecipRouter.get('/recent-precip/:locationId', async (req: Request, res: Response) => {
  const locationId = req.params['locationId']
  if (!locationId) {
    res.status(400).json({ data: null, error: 'Missing locationId', status: 400 })
    return
  }
  // A non-uuid reaches Postgres as a malformed input and comes back as a
  // generic 500 rather than the 404 it actually is.
  if (!isUuid(locationId)) {
    const response: ApiResponse<null> = { data: null, error: 'Location not found', status: 404 }
    res.status(404).json(response)
    return
  }

  try {
    const rows = await db
      .select({ lat: locations.lat, lon: locations.lon })
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.user_id, req.userId)))
      .limit(1)

    const location = rows[0]
    if (!location) {
      const response: ApiResponse<null> = { data: null, error: 'Location not found', status: 404 }
      res.status(404).json(response)
      return
    }

    // `lat`/`lon` are numeric columns and arrive from the driver as strings.
    const fetched = await fetchRecentHourlyPrecip(
      parseNumericRequired(location.lat),
      parseNumericRequired(location.lon),
      PAST_DAYS,
    )

    // The fetch reaches a day into the forecast (the bot needs rain that is
    // falling now); "recent rain" must not include hours that have not
    // happened. See `trimToObservedHours`.
    const recent: RecentPrecip = trimToObservedHours(fetched, new Date())

    const response: ApiResponse<RecentPrecip> = { data: recent, error: null, status: 200 }
    res.json(response)
  } catch (err) {
    // Never `err.message` into the response — a driver error can carry the
    // connection string. `sendServerError` logs through `describeError`.
    sendServerError(res, err, '[recent-precip] failed')
  }
})
