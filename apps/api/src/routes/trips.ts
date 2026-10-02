import { Router, type Request, type Response } from 'express'
import { and, eq, asc, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { trips, tripLocations, locations } from '../db/schema.js'
import { MAX_NAME_LENGTH, describeError, isIsoDate, isUuid, sendServerError } from '../lib/http.js'
import { logger } from '../lib/logger.js'
import { fetchOutlook, type Outlook } from '../lib/weather/ensembleOutlook.js'
import { summarizeTripOutlook } from '../lib/trips/tripOutlook.js'
import { parseNumeric, parseNumericRequired } from '@weatherteam6/types'
import type { ApiResponse, Trip, TripLocation, CreateTripInput, TripOutlook } from '@weatherteam6/types'

export const tripsRouter = Router()

/** A trip is a handful of crags; this only bounds the size of one insert. */
const MAX_TRIP_LOCATIONS = 50

type TripRow = typeof trips.$inferSelect
type TripLocationRow = typeof tripLocations.$inferSelect

function mapTripLocation(row: TripLocationRow): TripLocation {
  return {
    id: row.id,
    tripId: row.trip_id,
    locationId: row.location_id,
    createdAt: row.created_at.toISOString(),
  }
}

function mapTrip(row: TripRow, locs?: TripLocation[]): Trip {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
    ...(locs !== undefined ? { locations: locs } : {}),
  }
}

tripsRouter.get('/trips', async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(trips)
      .where(eq(trips.user_id, req.userId))
      .orderBy(asc(trips.start_date))

    const tripIds = rows.map(r => r.id)
    let locRows: TripLocationRow[] = []
    if (tripIds.length > 0) {
      locRows = await db
        .select()
        .from(tripLocations)
        .where(inArray(tripLocations.trip_id, tripIds))
    }

    const locsByTrip = new Map<string, TripLocation[]>()
    for (const loc of locRows) {
      const mapped = mapTripLocation(loc)
      const existing = locsByTrip.get(loc.trip_id) ?? []
      existing.push(mapped)
      locsByTrip.set(loc.trip_id, existing)
    }

    const data = rows.map(r => mapTrip(r, locsByTrip.get(r.id) ?? []))
    const response: ApiResponse<Trip[]> = { data, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /trips')
  }
})

tripsRouter.post('/trips', async (req: Request, res: Response) => {
  const body = req.body as Partial<CreateTripInput>
  const { name, startDate, endDate, cragIds } = body

  if (
    typeof name !== 'string' ||
    name.trim() === '' ||
    name.trim().length > MAX_NAME_LENGTH ||
    !isIsoDate(startDate) ||
    !isIsoDate(endDate) ||
    endDate < startDate ||
    !Array.isArray(cragIds) ||
    cragIds.length === 0 ||
    cragIds.length > MAX_TRIP_LOCATIONS ||
    !cragIds.every(id => typeof id === 'string' && isUuid(id))
  ) {
    const response: ApiResponse<null> = { data: null, error: 'Invalid trip data', status: 400 }
    res.status(400).json(response)
    return
  }

  // Despite the name these are location ids, and every one must be the
  // caller's own. Without this check a trip could hold another user's
  // location, and GET /trips/:tripId/forecast would then compute and return
  // that location's forecast — a cross-user read by id.
  const locationIds = [...new Set(cragIds)]

  try {
    const result = await db.transaction(async tx => {
      const owned = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(and(inArray(locations.id, locationIds), eq(locations.user_id, req.userId)))
      if (owned.length !== locationIds.length) return null

      const tripRows = await tx
        .insert(trips)
        .values({
          user_id: req.userId,
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
        })
        .returning()

      const tripRow = tripRows[0]
      if (!tripRow) throw new Error('Trip insert returned no row')

      const locInserts = locationIds.map(locationId => ({
        trip_id: tripRow.id,
        location_id: locationId,
      }))
      const locRows = await tx.insert(tripLocations).values(locInserts).returning()

      return { tripRow, locRows }
    })

    if (result === null) {
      // 404, not 403: whether someone else's location id exists is not disclosed.
      const response: ApiResponse<null> = { data: null, error: 'Location not found', status: 404 }
      res.status(404).json(response)
      return
    }

    const locs = result.locRows.map(mapTripLocation)
    const trip = mapTrip(result.tripRow, locs)
    const response: ApiResponse<Trip> = { data: trip, error: null, status: 201 }
    res.status(201).json(response)
  } catch (err) {
    sendServerError(res, err, 'POST /trips')
  }
})

tripsRouter.get('/trips/:tripId', async (req: Request, res: Response) => {
  const tripId = req.params['tripId']
  if (!tripId || !isUuid(tripId)) {
    const response: ApiResponse<null> = { data: null, error: 'Trip not found', status: 404 }
    res.status(404).json(response)
    return
  }

  try {
    const rows = await db
      .select()
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.user_id, req.userId)))

    const tripRow = rows[0]
    if (!tripRow) {
      const response: ApiResponse<null> = { data: null, error: 'Trip not found', status: 404 }
      res.status(404).json(response)
      return
    }

    const locRows = await db
      .select()
      .from(tripLocations)
      .where(eq(tripLocations.trip_id, tripId))

    const locs = locRows.map(mapTripLocation)
    const response: ApiResponse<Trip> = { data: mapTrip(tripRow, locs), error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /trips/:tripId')
  }
})

tripsRouter.delete('/trips/:tripId', async (req: Request, res: Response) => {
  const tripId = req.params['tripId']
  if (!tripId || !isUuid(tripId)) {
    const response: ApiResponse<null> = { data: null, error: 'Trip not found', status: 404 }
    res.status(404).json(response)
    return
  }

  try {
    // `trip_locations.trip_id` references `trips` and no FK in the schema
    // declares `onDelete`, so deleting the trip row directly raised a
    // foreign-key violation for any trip that had locations — i.e. every trip,
    // since POST /trips requires at least one. It surfaced as a generic 500.
    //
    // Same shape as `deleteLocationCascade`: clear dependents first, in one
    // transaction, so a mid-way failure leaves the trip whole rather than
    // stripped of its locations.
    const rows = await db.transaction(async (tx) => {
      const owned = await tx
        .select({ id: trips.id })
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.user_id, req.userId)))
        .limit(1)

      if (!owned[0]) return []

      await tx.delete(tripLocations).where(eq(tripLocations.trip_id, tripId))

      return tx
        .delete(trips)
        .where(and(eq(trips.id, tripId), eq(trips.user_id, req.userId)))
        .returning()
    })

    if (rows.length === 0) {
      const response: ApiResponse<null> = { data: null, error: 'Trip not found', status: 404 }
      res.status(404).json(response)
      return
    }

    const response: ApiResponse<null> = { data: null, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'DELETE /trips/:tripId')
  }
})

tripsRouter.get('/trips/:tripId/forecast', async (req: Request, res: Response) => {
  const tripId = req.params['tripId']
  if (!tripId || !isUuid(tripId)) {
    const response: ApiResponse<null> = { data: null, error: 'Trip not found', status: 404 }
    res.status(404).json(response)
    return
  }

  try {
    // Verify trip belongs to the requesting user
    const tripRows = await db
      .select({ id: trips.id, start_date: trips.start_date, end_date: trips.end_date })
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.user_id, req.userId)))

    const tripRow = tripRows[0]
    if (!tripRow) {
      const response: ApiResponse<null> = { data: null, error: 'Trip not found', status: 404 }
      res.status(404).json(response)
      return
    }

    const locRows = await db
      .select()
      .from(tripLocations)
      .where(eq(tripLocations.trip_id, tripId))

    const locationIds = locRows.map(r => r.location_id)

    const locationRows = locationIds.length > 0
      ? await db
          .select({
            id: locations.id,
            lat: locations.lat,
            lon: locations.lon,
            elevation_m: locations.elevation_m,
          })
          .from(locations)
          // Scoped to the caller as well as to the trip: a trip_locations row
          // written before POST /trips checked ownership must not become a
          // way to read another user's location.
          .where(and(inArray(locations.id, locationIds), eq(locations.user_id, req.userId)))
      : []

    // In parallel, each settled on its own: one location's failed fetch must not
    // sink the trip, and serialised retries across locations would outrun maxDuration.
    const now = new Date()
    const results = await Promise.allSettled(
      locationRows.map((location) =>
        fetchOutlook(
          {
            lat: parseNumericRequired(location.lat),
            lon: parseNumericRequired(location.lon),
            elevation_m: parseNumeric(location.elevation_m),
          },
          now,
        ),
      ),
    )

    const outlookById = new Map<string, Outlook>()
    for (const [i, result] of results.entries()) {
      const id = locationRows[i]?.id
      if (id === undefined) continue
      if (result.status === 'fulfilled') {
        outlookById.set(id, result.value)
      } else {
        logger.warn(
          { locationId: id, err: describeError(result.reason) },
          'GET /trips/:tripId/forecast: outlook failed for location',
        )
      }
    }

    const data: TripOutlook[] = locationIds.map((locationId) =>
      summarizeTripOutlook(
        locationId,
        outlookById.get(locationId) ?? null,
        tripRow.start_date,
        tripRow.end_date,
      ),
    )

    const response: ApiResponse<TripOutlook[]> = { data, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /trips/:tripId/forecast')
  }
})
