import { Router, type Request, type Response } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations } from '../db/schema.js'
import { isUuid, sendServerError } from '../lib/http.js'
import { fetchRiverPoints } from '../lib/weather/usgsRiver.js'
import { riverGaugesFor, type ApiResponse, type RiverGaugeReading } from '@weatherteam6/types'

export const riverGaugesRouter = Router()

/**
 * The river gauges a crag's climbing depends on (`RIVER_GAUGES`), each with its
 * last day of gage height. `[]` for a crag with no gauge; a gauge USGS did not
 * answer for comes back with no points, so the card can show the gap.
 */
riverGaugesRouter.get('/river-gauges/:locationId', async (req: Request, res: Response) => {
  const locationId = req.params['locationId']
  if (locationId === undefined || !isUuid(locationId)) {
    res.status(404).json({ data: null, error: 'Location not found', status: 404 })
    return
  }

  try {
    const loc = await db
      .select({ known_crag: locations.known_crag })
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.user_id, req.userId)))
      .limit(1)

    const row = loc[0]
    if (row === undefined) {
      res.status(404).json({ data: null, error: 'Location not found', status: 404 })
      return
    }

    const gauges = riverGaugesFor(row.known_crag)
    const now = Date.now()
    const data: RiverGaugeReading[] = await Promise.all(
      gauges.map(async (g) => ({ ...g, points: await fetchRiverPoints(g.site, now) })),
    )
    const response: ApiResponse<RiverGaugeReading[]> = { data, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /river-gauges/:locationId')
  }
})
