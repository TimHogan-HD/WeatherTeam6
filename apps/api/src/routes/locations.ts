import { Router, type Request, type Response } from 'express'
import { and, asc, avg, count, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations, crags, locationNormals, cragClimbabilityHistory } from '../db/schema.js'
import { isUuid, sendServerError } from '../lib/http.js'
import { logger } from '../lib/logger.js'
import { rainfallHistoryQueue } from '../jobs/queues.js'
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

function mapLocation(row: LocationRow): Location {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    lat: parseFloat(row.lat),
    lon: parseFloat(row.lon),
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

      // Fire-and-forget: populate 10-year climbability history in the background.
      // Wrapped in .catch() so Redis failure never affects the 201 response.
      rainfallHistoryQueue
        .add('backfill', { type: 'backfill', locationId: row.id })
        .catch((err: unknown) => {
          logger.warn(
            { locationId: row.id, err: err instanceof Error ? err.message : String(err) },
            'POST /locations: failed to queue history backfill',
          )
        })
    } catch (err) {
      sendServerError(res, err, 'POST /locations (crag)')
    }
  } else if ('name' in body && 'lat' in body && 'lon' in body) {
    // Save a general weather location
    const { name, lat, lon } = body as { name: string; lat: number; lon: number }
    if (typeof name !== 'string' || name.trim() === '' || typeof lat !== 'number' || typeof lon !== 'number') {
      const response: ApiResponse<null> = { data: null, error: 'Invalid location data', status: 400 }
      res.status(400).json(response)
      return
    }

    try {
      const inserted = await db
        .insert(locations)
        .values({
          user_id: req.userId,
          name: name.trim(),
          lat: String(lat),
          lon: String(lon),
          is_climbing_location: false,
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
