import { Router, type Request, type Response } from 'express'
import { and, eq, asc, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { trips, tripLocations, locations } from '../db/schema.js'
import { isUuid, sendServerError } from '../lib/http.js'
import { logger } from '../lib/logger.js'
import { computeLiveForecast } from '../lib/scoring/liveForecast.js'
import type { ApiResponse, Trip, TripLocation, CreateTripInput, TripForecast, ForecastSnapshot } from '@weatherteam6/types'

export const tripsRouter = Router()

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
    typeof startDate !== 'string' ||
    !startDate ||
    typeof endDate !== 'string' ||
    !endDate ||
    !Array.isArray(cragIds) ||
    cragIds.length === 0 ||
    !cragIds.every(id => typeof id === 'string' && isUuid(id))
  ) {
    const response: ApiResponse<null> = { data: null, error: 'Invalid trip data', status: 400 }
    res.status(400).json(response)
    return
  }

  try {
    const result = await db.transaction(async tx => {
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

      const locInserts = cragIds.map(locationId => ({
        trip_id: tripRow.id,
        location_id: locationId,
      }))
      const locRows = await tx.insert(tripLocations).values(locInserts).returning()

      return { tripRow, locRows }
    })

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
            rock_type: locations.rock_type,
            cliff_angle: locations.cliff_angle,
            aspect: locations.aspect,
            asos_station: locations.asos_station,
          })
          .from(locations)
          .where(inArray(locations.id, locationIds))
      : []

    // computeLiveForecast per trip location, filtered to the trip's date range —
    // there's no forecast_snapshots table being kept warm by a job anymore.
    //
    // Run in parallel: each call makes up to three retrying upstream fetches
    // (NBM, ensemble fallback, rainfall), so serializing them across a
    // multi-location trip stacks their backoff windows and risks a function
    // timeout. One location's failure must not sink the whole trip, so each
    // is settled independently and a failed location returns no forecasts.
    const results = await Promise.allSettled(
      locationRows.map(async (location) => {
        const { snapshots } = await computeLiveForecast(location)
        return {
          locationId: location.id,
          snapshots: snapshots.filter(
            (s) => s.forecast_date >= tripRow.start_date && s.forecast_date <= tripRow.end_date,
          ),
        }
      }),
    )

    const snapsByLocation = new Map<string, ForecastSnapshot[]>()
    for (const [i, result] of results.entries()) {
      if (result.status === 'fulfilled') {
        snapsByLocation.set(result.value.locationId, result.value.snapshots)
      } else {
        const failed = locationRows[i]
        logger.warn(
          {
            locationId: failed?.id,
            err: result.reason instanceof Error ? result.reason.message : String(result.reason),
          },
          'GET /trips/:tripId/forecast: live forecast failed for location',
        )
      }
    }

    const data: TripForecast[] = locationIds.map(locationId => ({
      locationId,
      forecasts: (snapsByLocation.get(locationId) ?? []).sort((a, b) =>
        a.forecast_date.localeCompare(b.forecast_date),
      ),
    }))

    const response: ApiResponse<TripForecast[]> = { data, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /trips/:tripId/forecast')
  }
})
