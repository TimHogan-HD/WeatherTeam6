import { Router, type Request, type Response } from 'express'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { locations } from '../db/schema.js'
import { MAX_NAME_LENGTH, isUuid, sendServerError } from '../lib/http.js'
import { insertGeneralLocation } from '../lib/locations/createLocation.js'
import { deleteLocationCascade } from '../lib/locations/deleteLocation.js'
import { parseLocationUpdate, planLocationUpdate } from '../lib/locations/updateLocation.js'
import { isRockType, parseNumeric, ROCK_TYPES, wallAngleFromCliffAngle } from '@weatherteam6/types'
import type { ApiResponse, Location, CreateLocationInput } from '@weatherteam6/types'

export const locationsRouter = Router()

type LocationRow = typeof locations.$inferSelect

/** The longest IANA zone name is 30 characters; this only bounds junk. */
const MAX_TIMEZONE_LENGTH = 64

/**
 * **Derived from `ROCK_TYPES`.** The message was a hand-written sentence, so
 * adding a rock type anywhere else in the app left this route rejecting it with
 * a 400 that still named the old five — which reads like the caller's mistake.
 */
const ROCK_TYPE_ERROR = `rock_type must be one of ${ROCK_TYPES.join(', ')}`

/** Elevations outside this range are data errors, not places. */
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
 * it would silently fall back to `unknown` (the slowest drying window) — the
 * single largest lever on the score.
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
  if (raw.name.trim().length > MAX_NAME_LENGTH) {
    return { error: `name must be at most ${MAX_NAME_LENGTH} characters` }
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

  if (
    raw.timezone !== undefined &&
    raw.timezone !== null &&
    (typeof raw.timezone !== 'string' || raw.timezone.length > MAX_TIMEZONE_LENGTH)
  ) {
    return { error: `timezone must be a string of at most ${MAX_TIMEZONE_LENGTH} characters` }
  }

  if (raw.is_climbing_location !== undefined && typeof raw.is_climbing_location !== 'boolean') {
    return { error: 'is_climbing_location must be a boolean' }
  }
  const isClimbing = raw.is_climbing_location ?? false

  let rockType: Location['rock_type'] = null
  if (raw.rock_type !== undefined && raw.rock_type !== null) {
    if (!isRockType(raw.rock_type)) {
      return { error: ROCK_TYPE_ERROR }
    }
    rockType = raw.rock_type
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
    known_crag: row.known_crag,
    aspect: row.aspect,
    cliff_angle: parseNumeric(row.cliff_angle),
    wall_angle_deg: wallAngleFromCliffAngle(parseNumeric(row.cliff_angle)),
    asos_station: row.asos_station,
    asos_network: row.asos_network,
    nws_office: row.nws_office,
    nws_grid_x: row.nws_grid_x,
    nws_grid_y: row.nws_grid_y,
    timezone: row.timezone,
    alerts_checked_at: row.alerts_checked_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at?.toISOString() ?? null,
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

locationsRouter.post('/locations', async (req: Request, res: Response) => {
  const body = req.body as Partial<CreateLocationInput>

  if ('name' in body && 'lat' in body && 'lon' in body) {
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
      const row = await insertGeneralLocation({
        user_id: req.userId,
        name: parsed.name,
        lat: parsed.lat,
        lon: parsed.lon,
        elevation_m: parsed.elevation_m,
        timezone: parsed.timezone,
        is_climbing_location: parsed.is_climbing_location,
        rock_type: parsed.rock_type,
      })
      const response: ApiResponse<Location> = { data: mapLocation(row), error: null, status: 201 }
      res.status(201).json(response)
    } catch (err) {
      sendServerError(res, err, 'POST /locations (general)')
    }
  } else {
    const response: ApiResponse<null> = { data: null, error: 'Must provide name+lat+lon', status: 400 }
    res.status(400).json(response)
  }
})

/**
 * Unsave a location. A save flow without this is a trap — one mistyped search
 * result would be permanent; `PATCH` edits the wall, not where it is.
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

/**
 * **Edit a saved crag's wall: aspect, angle, and an unlocked rock type** —
 * scoring Phase 4b. The body is `UpdateLocationInput`; the rules live in
 * `lib/locations/updateLocation.ts` so they can be tested without a database.
 *
 * 400 for a malformed body, 404 for a location that is missing or someone
 * else's (existence is not disclosed, as on DELETE), 409 for a well-formed
 * change the row refuses — a locked rock type, or wall facts on a location that
 * is not a crag. The response is the whole updated `Location`.
 *
 * Read-then-write rather than one statement, because the plan depends on the
 * row. The only other writer of `known_crag` is the operator's lock script,
 * and it applies `resolveRockType` to the same coordinates this plan does, so
 * a write racing it reaches the same lock rather than undoing it.
 */
locationsRouter.patch('/locations/:id', async (req: Request, res: Response) => {
  const id = req.params['id']
  if (!id || !isUuid(id)) {
    const response: ApiResponse<null> = { data: null, error: 'Location not found', status: 404 }
    res.status(404).json(response)
    return
  }

  const parsed = parseLocationUpdate(req.body)
  if ('error' in parsed) {
    const response: ApiResponse<null> = { data: null, error: parsed.error, status: 400 }
    res.status(400).json(response)
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

    const plan = planLocationUpdate(
      {
        lat: parseFloat(row.lat),
        lon: parseFloat(row.lon),
        is_climbing_location: row.is_climbing_location,
        rock_type: row.rock_type ?? null,
        known_crag: row.known_crag,
      },
      parsed,
    )
    if (!plan.ok) {
      const response: ApiResponse<null> = { data: null, error: plan.error, status: plan.status }
      res.status(plan.status).json(response)
      return
    }

    const updated = await db
      .update(locations)
      .set({ ...plan.columns, updated_at: new Date() })
      .where(and(eq(locations.id, id), eq(locations.user_id, req.userId)))
      .returning()
    const saved = updated[0]
    if (!saved) {
      // Deleted between the read and the write.
      const response: ApiResponse<null> = { data: null, error: 'Location not found', status: 404 }
      res.status(404).json(response)
      return
    }

    const response: ApiResponse<Location> = { data: mapLocation(saved), error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'PATCH /locations/:id')
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
