import { and, eq, inArray } from 'drizzle-orm'
import type { UpdateTripInput } from '@weatherteam6/types'
import { db } from '../../db/index.js'
import { locations, tripLocations, tripRainRecords, trips } from '../../db/schema.js'
import { MAX_NAME_LENGTH, isIsoDate, isUuid } from '../http.js'

/** A trip is a handful of crags; this only bounds the size of one insert. */
export const MAX_TRIP_LOCATIONS = 50

const PATCH_KEYS = new Set<string>(['name', 'startDate', 'endDate', 'cragIds'])

export type TripPatch = {
  name?: string
  startDate?: string
  endDate?: string
  /** Deduplicated location ids. */
  cragIds?: string[]
}

/**
 * The body of `PATCH /trips/:tripId`, or `null` when it is not one. An unknown
 * key is refused rather than ignored, as `PATCH /locations/:id` does: a
 * misspelt field silently dropped would answer 200 and change nothing.
 */
export function parseTripPatch(body: unknown): TripPatch | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const input = body as Record<string, unknown>
  const keys = Object.keys(input)
  if (keys.length === 0 || keys.some((k) => !PATCH_KEYS.has(k))) return null

  const { name, startDate, endDate, cragIds } = input as UpdateTripInput & Record<string, unknown>
  const patch: TripPatch = {}
  if ('name' in input) {
    if (typeof name !== 'string' || name.trim() === '' || name.trim().length > MAX_NAME_LENGTH) return null
    patch.name = name.trim()
  }
  if ('startDate' in input) {
    if (!isIsoDate(startDate)) return null
    patch.startDate = startDate
  }
  if ('endDate' in input) {
    if (!isIsoDate(endDate)) return null
    patch.endDate = endDate
  }
  if ('cragIds' in input) {
    if (
      !Array.isArray(cragIds) ||
      cragIds.length === 0 ||
      cragIds.length > MAX_TRIP_LOCATIONS ||
      !cragIds.every((id) => typeof id === 'string' && isUuid(id))
    ) {
      return null
    }
    patch.cragIds = [...new Set(cragIds)]
  }
  return patch
}

export type UpdateTripResult =
  | { status: 'updated'; trip: typeof trips.$inferSelect; locations: (typeof tripLocations.$inferSelect)[] }
  | { status: 'trip_not_found' }
  | { status: 'location_not_found' }
  | { status: 'bad_dates' }

/**
 * Apply a patch to one of the caller's trips, in one transaction.
 *
 * **The trend is kept honest.** `trip_rain_records` holds rain totals over the
 * trip's days, so a change of dates leaves every earlier point totalling
 * different days: they are deleted and the trend starts again. A removed crag's
 * points go with it. `trip_day_records` is per crag and day, not per trip, and
 * is never touched here.
 */
export async function updateTrip(userId: string, tripId: string, patch: TripPatch): Promise<UpdateTripResult> {
  return db.transaction(async (tx) => {
    const current = (
      await tx
        .select()
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.user_id, userId)))
        .limit(1)
    )[0]
    if (!current) return { status: 'trip_not_found' }

    const start = patch.startDate ?? current.start_date
    const end = patch.endDate ?? current.end_date
    if (end < start) return { status: 'bad_dates' }

    if (patch.cragIds !== undefined) {
      const owned = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(and(inArray(locations.id, patch.cragIds), eq(locations.user_id, userId)))
      if (owned.length !== patch.cragIds.length) return { status: 'location_not_found' }
    }

    const updated = (
      await tx
        .update(trips)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          start_date: start,
          end_date: end,
          updated_at: new Date(),
        })
        .where(eq(trips.id, tripId))
        .returning()
    )[0]
    if (!updated) throw new Error('Trip update returned no row')

    if (start !== current.start_date || end !== current.end_date) {
      await tx.delete(tripRainRecords).where(eq(tripRainRecords.trip_id, tripId))
    }

    if (patch.cragIds !== undefined) {
      const before = await tx
        .select({ location_id: tripLocations.location_id })
        .from(tripLocations)
        .where(eq(tripLocations.trip_id, tripId))
      const removed = before.map((r) => r.location_id).filter((id) => !patch.cragIds?.includes(id))
      if (removed.length > 0) {
        await tx
          .delete(tripRainRecords)
          .where(and(eq(tripRainRecords.trip_id, tripId), inArray(tripRainRecords.location_id, removed)))
      }
      await tx.delete(tripLocations).where(eq(tripLocations.trip_id, tripId))
      await tx.insert(tripLocations).values(patch.cragIds.map((location_id) => ({ trip_id: tripId, location_id })))
    }

    const locs = await tx.select().from(tripLocations).where(eq(tripLocations.trip_id, tripId))
    return { status: 'updated', trip: updated, locations: locs }
  })
}
