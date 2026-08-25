import { Router, type Request, type Response } from 'express'
import { and, asc, avg, count, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations, crags, locationNormals, cragClimbabilityHistory } from '../db/schema.js'
import { isUuid, sendServerError } from '../lib/http.js'
import { deleteLocationCascade } from '../lib/locations/deleteLocation.js'
import { parseNumeric } from '@weatherteam6/types'
import type { ApiResponse, Location, Crag, CreateLocationInput, LocationNormal, ClimbabilityHistory } from '@weatherteam6/types'

export const locationsRouter = Router()

type LocationRow = typeof locations.$inferSelect
type CragRow = typeof crags.$inferSelect

const VALID_ROCK_TYPES = new Set<string>(['sandstone', 'limestone', 'granite', 'basalt', 'unknown'])
function parseRockType(v: string | null | undefined): Location['rock_type'] {
  if (v && VALID_ROCK_TYPES.has(v)) return v as Location['rock_type']
  return null
}

/** Elevations outside this range are data errors, not places. Mirrors GET /preview. */
const MIN_ELEVATION_M = -500
const MAX_ELEVATION_M = 9000

type GeneralLocationInput = {
  name: string
  lat: number
  lon: number
  elevation_m: number | null
  timezone: string | null
  is_climbing_location: boolean
  rock_type: Location['rock_type']
}

/**
 * Validate the `{name, lat, lon}` branch of POST /locations.
 *
 * Coordinates are range-checked, not merely type-checked: this branch now
 * carries hand-entered lat/lon from the add flow's "enter coordinates instead"
 * affordance, and an out-of-range pair inserts happily and then produces
 * nonsense forecasts rather than an error.
 *
 * An unrecognised `rock_type` is rejected rather than coerced to null. Coercing
 * it would silently fall back to `unknown` (48h drying) — the single largest
 * lever on the score, and with no edit screen there is no way to notice or
 * correct it later.
 */
function parseGeneralLocationInput(
  body: Partial<CreateLocationInput>,
): GeneralLocationInput | { error: string } {
  const raw = body as {
    name?: unknown
    lat?: unknown
    lon?: unknown
    elevation_m?: unknown
    timezone?: unknown
    is_climbing_location?: unknown
    rock_type?: unknown
  }

  if (typeof raw.name !== 'string' || raw.name.trim() === '') {
    return { error: 'Invalid location data' }
  }
  if (typeof raw.lat !== 'number' || !Number.isFinite(raw.lat) || raw.lat < -90 || raw.lat > 90) {
    return { error: 'lat must be a number between -90 and 90' }
  }
  if (typeof raw.lon !== 'number' || !Number.isFinite(raw.lon) || raw.lon < -180 || raw.lon > 180) {
    return { error: 'lon must be a number between -180 and 180' }
  }

  let elevation: number | null = null
  if (raw.elevation_m !== undefined && raw.elevation_m !== null) {
    if (
      typeof raw.elevation_m !== 'number' ||
      !Number.isFinite(raw.elevation_m) ||
      raw.elevation_m < MIN_ELEVATION_M ||
      raw.elevation_m > MAX_ELEVATION_M
    ) {
      return { error: 'elevation_m must be a number in metres between -500 and 9000' }
    }
    elevation = raw.elevation_m
  }

  if (raw.timezone !== undefined && raw.timezone !== null && typeof raw.timezone !== 'string') {
    return { error: 'timezone must be a string' }
  }

  if (raw.is_climbing_location !== undefined && typeof raw.is_climbing_location !== 'boolean') {
    return { error: 'is_climbing_location must be a boolean' }
  }
  const isClimbing = raw.is_climbing_location ?? false

  let rockType: Location['rock_type'] = null
  if (raw.rock_type !== undefined && raw.rock_type !== null) {
    if (typeof raw.rock_type !== 'string' || !VALID_ROCK_TYPES.has(raw.rock_type)) {
      return { error: 'rock_type must be one of sandstone, limestone, granite, basalt, unknown' }
    }
    rockType = raw.rock_type as Location['rock_type']
  }

  return {
    name: raw.name.trim(),
    lat: raw.lat,
    lon: raw.lon,
    elevation_m: elevation,
    timezone: typeof raw.timezone === 'string' && raw.timezone.trim() !== '' ? raw.timezone : null,
    is_climbing_location: isClimbing,
    // A rock type on a non-climbing location would be dead data that the drying
    // model never reads; drop it rather than store a contradiction.
    rock_type: isClimbing ? rockType : null,
  }
}

function mapLocation(row: LocationRow): Location {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    lat: parseFloat(row.lat),
    lon: parseFloat(row.lon),
    elevation_m: parseNumeric(row.elevation_m),
    is_climbing_location: row.is_climbing_location,
    rock_type: row.rock_type ?? null,
    aspect: row.aspect,
    cliff_angle: parseNumeric(row.cliff_angle),
    asos_station: row.asos_station,
    asos_network: row.asos_network,
    nws_office: row.nws_office,
    nws_grid_x: row.nws_grid_x,
    nws_grid_y: row.nws_grid_y,
    timezone: row.timezone,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at?.toISOString() ?? null,
  }
}

function mapCrag(row: CragRow): Crag {
  return {
    id: row.id,
    openbeta_id: row.openbeta_id,
    name: row.name,
    lat: parseFloat(row.lat),
    lon: parseFloat(row.lon),
    rock_type: row.rock_type ?? null,
    area_name: row.area_name ?? null,
    state: row.state ?? null,
    created_at: row.created_at.toISOString(),
  }
}

locationsRouter.get('/locations', async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(locations).where(eq(locations.user_id, req.userId))
    const response: ApiResponse<Location[]> = { data: rows.map(mapLocation), error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /locations')
  }
})

// Must be registered before GET /locations/:id — Express matches in declaration order
locationsRouter.get('/locations/search', async (req: Request, res: Response) => {
  const q = typeof req.query['q'] === 'string' ? req.query['q'].trim() : ''
  const latStr = typeof req.query['lat'] === 'string' ? req.query['lat'] : null
  const lonStr = typeof req.query['lon'] === 'string' ? req.query['lon'] : null

  if (q.length < 1 && (!latStr || !lonStr)) {
    const response: ApiResponse<Crag[]> = { data: [], error: null, status: 200 }
    res.status(200).json(response)
    return
  }

  try {
    let rows: CragRow[]

    if (q.length >= 1) {
      rows = await db
        .select()
        .from(crags)
        .where(or(ilike(crags.name, `%${q}%`), ilike(crags.area_name, `%${q}%`), ilike(crags.state, `%${q}%`)))
        .limit(20)
    } else {
      // Nearby search: sort by Haversine distance from provided lat/lon
      const lat = parseFloat(latStr!)
      const lon = parseFloat(lonStr!)
      if (!isFinite(lat) || !isFinite(lon)) {
        const response: ApiResponse<Crag[]> = { data: [], error: null, status: 200 }
        res.status(200).json(response)
        return
      }
      rows = await db
        .select()
        .from(crags)
        .orderBy(
          sql`(
            6371 * acos(
              cos(radians(${lat})) * cos(radians(${crags.lat}::float)) *
              cos(radians(${crags.lon}::float) - radians(${lon})) +
              sin(radians(${lat})) * sin(radians(${crags.lat}::float))
            )
          )`
        )
        .limit(20)
    }

    const response: ApiResponse<Crag[]> = { data: rows.map(mapCrag), error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /locations/search')
  }
})

locationsRouter.post('/locations', async (req: Request, res: Response) => {
  const body = req.body as Partial<CreateLocationInput>

  if ('cragId' in body && body.cragId) {
    // Save a climbing location from the crags table
    const cragId = body.cragId
    if (!isUuid(cragId)) {
      const response: ApiResponse<null> = { data: null, error: 'Invalid crag id', status: 400 }
      res.status(400).json(response)
      return
    }

    try {
      const cragRows = await db.select().from(crags).where(eq(crags.id, cragId)).limit(1)
      const crag = cragRows[0]
      if (!crag) {
        const response: ApiResponse<null> = { data: null, error: 'Crag not found', status: 404 }
        res.status(404).json(response)
        return
      }

      const inserted = await db
        .insert(locations)
        .values({
          user_id: req.userId,
          name: crag.name,
          lat: crag.lat,
          lon: crag.lon,
          is_climbing_location: true,
          rock_type: parseRockType(crag.rock_type),
        })
        .returning()
      const row = inserted[0]
      if (!row) throw new Error('Insert returned no row')
      const response: ApiResponse<Location> = { data: mapLocation(row), error: null, status: 201 }
      res.status(201).json(response)
    } catch (err) {
      sendServerError(res, err, 'POST /locations (crag)')
    }
  } else if ('name' in body && 'lat' in body && 'lon' in body) {
    // Save a location from the add flow: a geocoder result, or hand-entered
    // coordinates. Climbing is a property of the saved location, not a
    // precondition for saving one — see miniapp-design-v1.md §12.
    const parsed = parseGeneralLocationInput(body)
    if ('error' in parsed) {
      const response: ApiResponse<null> = { data: null, error: parsed.error, status: 400 }
      res.status(400).json(response)
      return
    }

    try {
      const inserted = await db
        .insert(locations)
        .values({
          user_id: req.userId,
          name: parsed.name,
          lat: String(parsed.lat),
          lon: String(parsed.lon),
          // Persisted so the saved location and its own pre-save preview agree
          // on temperature: applyLapseRate returns early when this is null, so
          // dropping it shifts every reading by the full lapse-rate correction.
          elevation_m: parsed.elevation_m === null ? null : String(parsed.elevation_m),
          timezone: parsed.timezone,
          is_climbing_location: parsed.is_climbing_location,
          rock_type: parsed.rock_type,
        })
        .returning()
      const row = inserted[0]
      if (!row) throw new Error('Insert returned no row')
      const response: ApiResponse<Location> = { data: mapLocation(row), error: null, status: 201 }
      res.status(201).json(response)
    } catch (err) {
      sendServerError(res, err, 'POST /locations (general)')
    }
  } else {
    const response: ApiResponse<null> = { data: null, error: 'Must provide cragId or name+lat+lon', status: 400 }
    res.status(400).json(response)
  }
})

/**
 * Unsave a location. A save flow without this is a trap — one mistyped search
 * result would be permanent, and there is no edit screen either (§12.4).
 *
 * A location owned by someone else returns 404, not 403: existence is not
 * disclosed. Deleting also removes every dependent row (alerts, reports, walls,
 * trip memberships) in one transaction — see deleteLocationCascade.
 */
locationsRouter.delete('/locations/:id', async (req: Request, res: Response) => {
  const id = req.params['id']
  if (!id || !isUuid(id)) {
    const response: ApiResponse<null> = { data: null, error: 'Location not found', status: 404 }
    res.status(404).json(response)
    return
  }

  try {
    const deleted = await deleteLocationCascade(id, req.userId)
    if (!deleted) {
      const response: ApiResponse<null> = { data: null, error: 'Location not found', status: 404 }
      res.status(404).json(response)
      return
    }

    const response: ApiResponse<null> = { data: null, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'DELETE /locations/:id')
  }
})

locationsRouter.get('/locations/:id/normals', async (req: Request, res: Response) => {
  const locationId = req.params['id']
  if (!locationId || !isUuid(locationId)) {
    const response: ApiResponse<null> = { data: null, error: 'Location not found', status: 404 }
    res.status(404).json(response)
    return
  }

  try {
    const ownerCheck = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.user_id, req.userId)))
      .limit(1)

    if (!ownerCheck[0]) {
      const response: ApiResponse<null> = { data: null, error: 'Location not found', status: 404 }
      res.status(404).json(response)
      return
    }

    const rows = await db
      .select()
      .from(locationNormals)
      .where(eq(locationNormals.location_id, locationId))
      .orderBy(asc(locationNormals.month))

    const data: LocationNormal[] = rows.map((r) => ({
      id: r.id,
      locationId: r.location_id,
      month: r.month,
      precipNormalMm: parseFloat(r.precip_normal_mm),
      tempMaxNormalC: parseFloat(r.temp_max_normal_c),
      tempMinNormalC: parseFloat(r.temp_min_normal_c),
      source: r.source,
      fetchedAt: r.fetched_at.toISOString(),
    }))

    const response: ApiResponse<LocationNormal[]> = { data, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /locations/:id/normals')
  }
})

// Must be registered before GET /locations/:id — Express matches in declaration order
locationsRouter.get('/locations/:id/history', async (req: Request, res: Response) => {
  const { id } = req.params
  if (!id || !isUuid(id)) {
    const response: ApiResponse<null> = { data: null, error: 'Location not found', status: 404 }
    res.status(404).json(response)
    return
  }

  try {
    const rows = await db
      .select({
        month: cragClimbabilityHistory.month,
        avg_climbable_days: avg(cragClimbabilityHistory.climbable_days),
        years_of_data: count(cragClimbabilityHistory.year),
      })
      .from(cragClimbabilityHistory)
      .where(eq(cragClimbabilityHistory.location_id, id))
      .groupBy(cragClimbabilityHistory.month)
      .orderBy(asc(cragClimbabilityHistory.month))

    const data: ClimbabilityHistory[] = rows.map((r) => ({
      month: r.month,
      avg_climbable_days: parseFloat(r.avg_climbable_days ?? '0'),
      years_of_data: r.years_of_data,
    }))

    const response: ApiResponse<ClimbabilityHistory[]> = { data, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /locations/:id/history')
  }
})

locationsRouter.get('/locations/:id', async (req: Request, res: Response) => {
  const id = req.params['id']
  if (!id || !isUuid(id)) {
    const response: ApiResponse<null> = { data: null, error: 'Location not found', status: 404 }
    res.status(404).json(response)
    return
  }

  try {
    const rows = await db
      .select()
      .from(locations)
      .where(and(eq(locations.id, id), eq(locations.user_id, req.userId)))
      .limit(1)
    const row = rows[0]
    if (!row) {
      const response: ApiResponse<null> = { data: null, error: 'Location not found', status: 404 }
      res.status(404).json(response)
      return
    }
    const response: ApiResponse<Location> = { data: mapLocation(row), error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /locations/:id')
  }
})
