import { Router, type Request, type Response } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations } from '../db/schema.js'
import { isUuid, sendServerError } from '../lib/http.js'
import { areaExists, guidebookFor } from '../lib/guidebook/guidebook.js'
import { parsePositionInput } from '../lib/logbook/parseLogbook.js'
import { positionsFor, recordPosition } from '../lib/logbook/logbook.js'
import { parseNumericRequired } from '@weatherteam6/types'
import type { ApiResponse, AreaPosition, Guidebook } from '@weatherteam6/types'

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
    const positions = guidebook === null ? null : await positionsFor(guidebook.walls.map((w) => w.id))
    const data =
      guidebook === null || positions === null
        ? null
        : { ...guidebook, walls: guidebook.walls.map((w) => ({ ...w, position: positions.get(w.id) ?? null })) }
    const response: ApiResponse<Guidebook> = { data, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /guidebook/:locationId')
  }
})

/**
 * Record where a wall or boulder is, from the phone of someone standing at it.
 * **Shared by every account** and replaces any earlier recording, so the client
 * asks before it sends. The area only has to be in the snapshot — a position
 * describes a boulder, not anyone's saved copy of the crag.
 */
guidebookRouter.put('/guidebook/areas/:areaId/position', async (req: Request, res: Response) => {
  const areaId = req.params['areaId']
  if (!areaId || !areaExists(areaId)) {
    const response: ApiResponse<null> = { data: null, error: 'Area not found', status: 404 }
    res.status(404).json(response)
    return
  }
  const fix = parsePositionInput(req.body)
  if ('error' in fix) {
    const response: ApiResponse<null> = { data: null, error: fix.error, status: 400 }
    res.status(400).json(response)
    return
  }
  try {
    const response: ApiResponse<AreaPosition> = {
      data: await recordPosition(req.userId, areaId, fix),
      error: null,
      status: 200,
    }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'PUT /guidebook/areas/:areaId/position')
  }
})
