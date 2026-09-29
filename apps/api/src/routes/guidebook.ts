import { Router, type Request, type Response } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations } from '../db/schema.js'
import { isUuid, sendServerError } from '../lib/http.js'
import { guidebookFor } from '../lib/guidebook/guidebook.js'
import { parseNumericRequired } from '@weatherteam6/types'
import type { ApiResponse, Guidebook } from '@weatherteam6/types'

export const guidebookRouter = Router()

/**
 * The OpenBeta crag a saved location sits on — its walls and routes — for the
 * Crag tab and the wall and route screens.
 *
 * **`data: null` with a 200 is an answer**: no OpenBeta crag within reach of
 * this location, which is every city and everywhere outside Minnesota today.
 * It is not a failure and a client must not render it as one.
 *
 * Nothing upstream is called: the routes are a generated snapshot
 * (`lib/guidebook/guidebookMn.ts`), because OpenBeta's API is too slow and too
 * often a 502 to sit behind a screen (`api-sources.md`).
 */
guidebookRouter.get('/guidebook/:locationId', async (req: Request, res: Response) => {
  const locationId = req.params['locationId']
  if (!locationId || !isUuid(locationId)) {
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
    const guidebook = guidebookFor(parseNumericRequired(location.lat), parseNumericRequired(location.lon))
    const response: ApiResponse<Guidebook> = { data: guidebook, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /guidebook/:locationId')
  }
})
