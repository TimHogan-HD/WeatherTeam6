import { Router, type Request, type Response } from 'express'
import { sendServerError } from '../lib/http.js'
import { computePreviewForecast } from '../lib/scoring/previewForecast.js'
import type { ApiResponse, ForecastSnapshot } from '@weatherteam6/types'

export const previewRouter = Router()

/** Elevations outside this range are data errors, not places. */
const MIN_ELEVATION_M = -500
const MAX_ELEVATION_M = 9000

function parseFloatParam(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Weather for an unsaved location — step 2 of the add flow (§12.1). Returns the
 * same windowed `ForecastSnapshot[]` shape as GET /forecast/:locationId, so the
 * detail screen renders preview and saved modes with one code path.
 *
 * `elevation` is optional but not ignorable: passing the geocoder's value here
 * and persisting the same value on save is what keeps preview and detail
 * agreeing on temperature (§12.3 change 5). A malformed one is rejected rather
 * than dropped, because silently previewing uncorrected temperatures reproduces
 * exactly the bug that rule exists to prevent.
 */
previewRouter.get('/preview', async (req: Request, res: Response) => {
  const lat = parseFloatParam(req.query['lat'])
  const lon = parseFloatParam(req.query['lon'])

  if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    const response: ApiResponse<null> = {
      data: null,
      error: 'lat and lon are required and must be valid coordinates',
      status: 400,
    }
    res.status(400).json(response)
    return
  }

  const rawElevation = req.query['elevation']
  let elevationM: number | null = null
  if (rawElevation !== undefined && rawElevation !== '') {
    elevationM = parseFloatParam(rawElevation)
    if (elevationM === null || elevationM < MIN_ELEVATION_M || elevationM > MAX_ELEVATION_M) {
      const response: ApiResponse<null> = {
        data: null,
        error: 'elevation must be a number in metres between -500 and 9000',
        status: 400,
      }
      res.status(400).json(response)
      return
    }
  }

  try {
    const forecast = await computePreviewForecast({ lat, lon, elevationM })
    const response: ApiResponse<ForecastSnapshot[]> = {
      data: forecast,
      error: null,
      status: 200,
    }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /preview')
  }
})
