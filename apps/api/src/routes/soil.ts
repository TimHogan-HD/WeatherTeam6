import { Router, type Request, type Response } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations } from '../db/schema.js'
import { isUuid, sendServerError } from '../lib/http.js'
import { soilReading } from '../lib/weather/soilReading.js'
import { soilStationFor, type ApiResponse, type SoilReading } from '@weatherteam6/types'

export const soilRouter = Router()

/**
 * The NOAA station's soil near a crag in `SOIL_STATIONS` (#589 part 2), for
 * the Gauges card's Ground tab. `data: null` for a crag without one, with no
 * call to NCEI. A failed read is a 200 with `answered: false`, never dry ground.
 */
soilRouter.get('/soil/:locationId', async (req: Request, res: Response) => {
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

    const station = soilStationFor(row.known_crag)
    const data = station === null ? null : await soilReading(station, Date.now())
    const response: ApiResponse<SoilReading | null> = { data, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /soil/:locationId')
  }
})
