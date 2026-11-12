import { Router, type Request, type Response } from 'express'
import { and, asc, eq, gte } from 'drizzle-orm'
import { db } from '../db/index.js'
import { feedback, locations } from '../db/schema.js'
import { isUuid, sendServerError } from '../lib/http.js'
import { isObservedConditions, VISIT_WINDOW_DAYS, type ApiResponse, type Visit } from '@weatherteam6/types'

export const visitsRouter = Router()

/** More than anyone checks one crag in 15 days; a cap, not a page. */
const VISIT_LIMIT = 50

/**
 * The caller's own visits to a location over the last `VISIT_WINDOW_DAYS`
 * (#589): their forecast checks there, resolved or not, oldest first. The
 * Gauges card marks them on its charts and lists them. A location that is not
 * the caller's is a 404, never someone else's checks.
 */
visitsRouter.get('/visits/:locationId', async (req: Request, res: Response) => {
  const locationId = req.params['locationId']
  if (locationId === undefined || !isUuid(locationId)) {
    res.status(404).json({ data: null, error: 'Location not found', status: 404 })
    return
  }

  try {
    const loc = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.user_id, req.userId)))
      .limit(1)
    if (loc[0] === undefined) {
      res.status(404).json({ data: null, error: 'Location not found', status: 404 })
      return
    }

    const since = new Date(Date.now() - VISIT_WINDOW_DAYS * 86_400_000)
    const rows = await db
      .select({
        id: feedback.id,
        observed_at: feedback.observed_at,
        observed_conditions: feedback.observed_conditions,
        message: feedback.message,
      })
      .from(feedback)
      .where(
        and(
          eq(feedback.user_id, req.userId),
          eq(feedback.kind, 'forecast'),
          eq(feedback.location_id, locationId),
          gte(feedback.observed_at, since),
        ),
      )
      .orderBy(asc(feedback.observed_at))
      .limit(VISIT_LIMIT)

    // The table's CHECK makes both non-null for a forecast check; a row that
    // somehow is not is left out rather than drawn at an invented time.
    const data: Visit[] = rows.flatMap((r) =>
      r.observed_at === null || !isObservedConditions(r.observed_conditions)
        ? []
        : [
            {
              id: r.id,
              observed_at: r.observed_at.toISOString(),
              observed_conditions: r.observed_conditions,
              message: r.message === null || r.message.trim() === '' ? null : r.message,
            },
          ],
    )
    const response: ApiResponse<Visit[]> = { data, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /visits/:locationId')
  }
})
