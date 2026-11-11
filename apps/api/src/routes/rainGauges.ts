import { Router, type Request, type Response } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations } from '../db/schema.js'
import { isUuid, sendServerError } from '../lib/http.js'
import { rainGaugeReadings } from '../lib/weather/rainGauges.js'
import { parseNumericRequired, type ApiResponse, type RainGaugeReadings } from '@weatherteam6/types'

export const rainGaugesRouter = Router()

/**
 * The airport and volunteer rain gauges near a saved location, over its last
 * six complete days (#479): observed rain beside the models' on the Precip
 * tab. A place with no gauge in reach answers `airport: null` and no
 * volunteer stations without calling IEM. A failed IEM read is a 200 that
 * says which gauge did not answer, never a dry week.
 */
rainGaugesRouter.get('/rain-gauges/:locationId', async (req: Request, res: Response) => {
  const locationId = req.params['locationId']
  if (locationId === undefined || !isUuid(locationId)) {
    res.status(404).json({ data: null, error: 'Location not found', status: 404 })
    return
  }

  try {
    const rows = await db
      .select({ lat: locations.lat, lon: locations.lon })
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.user_id, req.userId)))
      .limit(1)

    const row = rows[0]
    if (row === undefined) {
      res.status(404).json({ data: null, error: 'Location not found', status: 404 })
      return
    }

    // `lat`/`lon` are numeric columns and arrive from the driver as strings.
    const data = await rainGaugeReadings(parseNumericRequired(row.lat), parseNumericRequired(row.lon), new Date())
    const response: ApiResponse<RainGaugeReadings> = { data, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /rain-gauges/:locationId')
  }
})
