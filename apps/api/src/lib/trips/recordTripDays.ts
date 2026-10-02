import { eq, gte, sql } from 'drizzle-orm'
import { parseNumeric, parseNumericRequired } from '@weatherteam6/types'
import { db } from '../../db/index.js'
import { locations, tripDayRecords, tripLocations, trips } from '../../db/schema.js'
import { describeError } from '../http.js'
import { logger } from '../logger.js'
import { tempRangeFor } from '../preferences/preferences.js'
import { getHourlySeries } from '../runs/fetchHourlySeries.js'
import { scoringLocationFor } from '../runs/scoringLocation.js'
import { fetchOutlook } from '../weather/ensembleOutlook.js'
import { tripDayRows, type TripDayRow, type TripRange } from './tripDayRows.js'

export type RecordTripsResult = {
  /** Distinct locations on trips that had not ended. */
  locations: number
  rowsWritten: number
  /**
   * Location ids where a read failed, so nothing was written for them. Named so a
   * partial run cannot read as a complete one (see `CollectResult`).
   */
  failed: string[]
}

type LocationRow = {
  id: string
  user_id: string
  lat: string
  lon: string
  elevation_m: string | null
  is_climbing_location: boolean
  rock_type: (typeof locations.$inferSelect)['rock_type']
  aspect: string | null
  cliff_angle: string | null
}

/**
 * Record what the forecast says about every upcoming trip day, per location.
 *
 * Safe to rerun and to overlap: each row is an upsert on (location, day, hour).
 * **A location writes nothing unless every source it needs answered**: a failed
 * outlook or missing readings would otherwise replace this hour's figures with
 * nulls that read as "no rain" or "no score".
 */
export async function recordTripDays(now: Date = new Date()): Promise<RecordTripsResult> {
  // A day of slack under UTC's date: the exact cut is each location's own today,
  // applied in `tripDayRows` once the outlook has said what that is.
  const cutoff = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10)
  const rows = await db
    .select({
      start: trips.start_date,
      end: trips.end_date,
      location: {
        id: locations.id,
        user_id: locations.user_id,
        lat: locations.lat,
        lon: locations.lon,
        elevation_m: locations.elevation_m,
        is_climbing_location: locations.is_climbing_location,
        rock_type: locations.rock_type,
        aspect: locations.aspect,
        cliff_angle: locations.cliff_angle,
      },
    })
    .from(tripLocations)
    .innerJoin(trips, eq(trips.id, tripLocations.trip_id))
    .innerJoin(locations, eq(locations.id, tripLocations.location_id))
    .where(gte(trips.end_date, cutoff))

  const byLocation = new Map<string, { location: LocationRow; ranges: TripRange[] }>()
  for (const row of rows) {
    const entry = byLocation.get(row.location.id) ?? { location: row.location, ranges: [] }
    entry.ranges.push({ start: row.start, end: row.end })
    byLocation.set(row.location.id, entry)
  }
  const entries = [...byLocation.values()]

  const settled = await Promise.allSettled(
    entries.map(({ location, ranges }) => recordLocation(location, ranges, now)),
  )

  const result: RecordTripsResult = { locations: entries.length, rowsWritten: 0, failed: [] }
  settled.forEach((entry, i) => {
    const id = entries[i]?.location.id ?? 'unknown'
    if (entry.status === 'fulfilled') {
      result.rowsWritten += entry.value
      return
    }
    result.failed.push(id)
    logger.error({ locationId: id, err: describeError(entry.reason) }, '[recordTripDays] location failed')
  })

  if (result.failed.length > 0) {
    logger.warn({ ...result, failed: result.failed.length }, '[recordTripDays] incomplete')
  } else {
    logger.info(result, '[recordTripDays] done')
  }
  return result
}

async function recordLocation(location: LocationRow, ranges: TripRange[], now: Date): Promise<number> {
  const point = {
    lat: parseNumericRequired(location.lat),
    lon: parseNumericRequired(location.lon),
    elevation_m: parseNumeric(location.elevation_m),
  }

  // A location row belongs to one user, so its readings are judged against that
  // user's temperature range.
  const [outlook, series] = await Promise.all([
    fetchOutlook(point, now),
    location.is_climbing_location
      ? tempRangeFor(location.user_id).then((range) =>
          getHourlySeries(
            { id: location.id, ...point },
            { allModels: true, now, scoring: scoringLocationFor(location, range) },
          ),
        )
      : Promise.resolve(null),
  ])

  if (series !== null && series.readings.unavailable_reason !== null) {
    throw new Error(`readings unavailable: ${series.readings.unavailable_reason}`)
  }

  const scoredRun = series?.models?.find((m) => m.model === series.readings.model)
  const values: TripDayRow[] = tripDayRows({
    locationId: location.id,
    now,
    ranges,
    outlook,
    readings: series?.readings.days ?? null,
    scoredRunFetchedAt: scoredRun?.fetched_at ? new Date(scoredRun.fetched_at) : null,
  })
  if (values.length === 0) return 0

  await db
    .insert(tripDayRecords)
    .values(values)
    .onConflictDoUpdate({
      target: [tripDayRecords.location_id, tripDayRecords.local_date, tripDayRecords.recorded_at],
      set: {
        lead_days: sql`excluded.lead_days`,
        scored_run_fetched_at: sql`excluded.scored_run_fetched_at`,
        score: sql`excluded.score`,
        dryness: sql`excluded.dryness`,
        friction: sql`excluded.friction`,
        temp_c_max: sql`excluded.temp_c_max`,
        temp_c_min: sql`excluded.temp_c_min`,
        members_wet: sql`excluded.members_wet`,
        member_count: sql`excluded.member_count`,
        precip_mm_mean: sql`excluded.precip_mm_mean`,
      },
    })
  return values.length
}
