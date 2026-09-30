import { Router, type Request, type Response } from 'express'
import { MAX_QUERY_LENGTH, sendServerError } from '../lib/http.js'
import { MIN_QUERY_LENGTH, searchPlaces } from '../lib/weather/geocode.js'
import { reverseGeocode } from '../lib/weather/reverseGeocode.js'
import type { ApiResponse, GeocodeResult, ReverseGeocode } from '@weatherteam6/types'

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
  // Truncated rather than refused, for the same as-you-type reason as the
  // short-query case below; the bound keeps an arbitrary string off the
  // upstream request line.
  const q = typeof raw === 'string' ? raw.trim().slice(0, MAX_QUERY_LENGTH) : ''

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

function coordinate(value: unknown, limit: number): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null
}

/**
 * Name and elevation for a GPS fix on `/add`. The name comes from
 * OpenStreetMap's Nominatim and the elevation from Open-Meteo; either may be
 * null, and the client treats a null name as "type one" rather than an error.
 */
geocodeRouter.get('/geocode/reverse', async (req: Request, res: Response) => {
  const lat = coordinate(req.query['lat'], 90)
  const lon = coordinate(req.query['lon'], 180)
  if (lat === null || lon === null) {
    const response: ApiResponse<null> = {
      data: null,
      error: 'lat and lon are required and must be valid coordinates',
      status: 400,
    }
    res.status(400).json(response)
    return
  }

  try {
    const response: ApiResponse<ReverseGeocode> = { data: await reverseGeocode(lat, lon), error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /geocode/reverse')
  }
})
