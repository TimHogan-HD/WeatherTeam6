import { Router, type Request, type Response } from 'express'
import { and, eq, asc, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { trips, tripLocations } from '../db/schema.js'
import { isUuid, sendServerError } from '../lib/http.js'
import type { ApiResponse, Trip, TripLocation, CreateTripInput } from '@weatherteam6/types'

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
    const rows = await db
      .delete(trips)
      .where(and(eq(trips.id, tripId), eq(trips.user_id, req.userId)))
      .returning()

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
