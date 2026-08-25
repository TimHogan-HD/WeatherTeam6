import { Router, type Request, type Response } from 'express'
import { sendServerError } from '../lib/http.js'
import { MIN_QUERY_LENGTH, searchPlaces } from '../lib/weather/geocode.js'
import type { ApiResponse, GeocodeResult } from '@weatherteam6/types'

export const geocodeRouter = Router()

/**
 * Place-name search for the add-location flow (§12.2). Proxied server-side, not
 * called from the client, so it obeys the same retry/backoff and response-shape
 * rules as every other external call.
 *
 * A too-short query is an empty 200, not a 400 — the client calls this as the
 * user types, and the first keystroke is not a client error. Matches how
 * GET /locations/search handles the same case.
 */
geocodeRouter.get('/geocode', async (req: Request, res: Response) => {
  const raw = req.query['q']
  const q = typeof raw === 'string' ? raw.trim() : ''

  if (q.length < MIN_QUERY_LENGTH) {
    const response: ApiResponse<GeocodeResult[]> = { data: [], error: null, status: 200 }
    res.status(200).json(response)
    return
  }

  try {
    const results = await searchPlaces(q)
    const response: ApiResponse<GeocodeResult[]> = { data: results, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /geocode')
  }
})
