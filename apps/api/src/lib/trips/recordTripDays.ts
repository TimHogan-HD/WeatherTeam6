import { eq, gte, sql } from 'drizzle-orm'
import { parseNumeric, parseNumericRequired } from '@weatherteam6/types'
import { db } from '../../db/index.js'
import { locations, tripDayRecords, tripLocations, tripRainRecords, trips } from '../../db/schema.js'
import { describeError } from '../http.js'
import { logger } from '../logger.js'
import { tempRangeFor } from '../preferences/preferences.js'
import { getHourlySeries } from '../runs/fetchHourlySeries.js'
import { scoringLocationFor } from '../runs/scoringLocation.js'
import { fetchOutlook } from '../weather/ensembleOutlook.js'
import { tripDayRows, type TripDayRow } from './tripDayRows.js'
import { tripRainRows, type DatedTrip } from './tripRainRows.js'

export type RecordTripsResult = {
  /** Distinct locations on trips that had not ended. */
  locations: number
  rowsWritten: number
  /** `trip_rain_records` rows: one per trip and location with a day inside the horizon. */
  trendRowsWritten: number
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
 * Beside the day rows, one `trip_rain_records` point per trip at the location:
 * the trip's rain total and warmest high, for the trip screen's trend.
 *
 * Safe to rerun and to overlap: each row is an upsert on (location, day, hour),
 * each trend point on (trip, location, hour).
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
      tripId: trips.id,
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

  const byLocation = new Map<string, { location: LocationRow; trips: DatedTrip[] }>()
  for (const row of rows) {
    const entry = byLocation.get(row.location.id) ?? { location: row.location, trips: [] }
    entry.trips.push({ id: row.tripId, start: row.start, end: row.end })
    byLocation.set(row.location.id, entry)
  }
  const entries = [...byLocation.values()]

  const settled = await Promise.allSettled(
    entries.map(({ location, trips: dated }) => recordLocation(location, dated, now)),
  )

  const result: RecordTripsResult = { locations: entries.length, rowsWritten: 0, trendRowsWritten: 0, failed: [] }
  settled.forEach((entry, i) => {
    const id = entries[i]?.location.id ?? 'unknown'
    if (entry.status === 'fulfilled') {
      result.rowsWritten += entry.value.days
      result.trendRowsWritten += entry.value.trend
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

async function recordLocation(
  location: LocationRow,
  dated: DatedTrip[],
  now: Date,
): Promise<{ days: number; trend: number }> {
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
    ranges: dated,
    outlook,
    readings: series?.readings.days ?? null,
    scoredRunFetchedAt: scoredRun?.fetched_at ? new Date(scoredRun.fetched_at) : null,
  })
  const trend = tripRainRows({ locationId: location.id, now, trips: dated, outlook })
  if (values.length === 0 && trend.length === 0) return { days: 0, trend: 0 }

  // One transaction, so a failed second write cannot leave this hour's day
  // records beside last hour's trend point.
  await db.transaction(async (tx) => {
    if (values.length > 0) {
      await tx
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
    }
    if (trend.length > 0) {
      await tx
        .insert(tripRainRecords)
        .values(trend)
        .onConflictDoUpdate({
          target: [tripRainRecords.trip_id, tripRainRecords.location_id, tripRainRecords.recorded_at],
          set: {
            mean_mm: sql`excluded.mean_mm`,
            p10_mm: sql`excluded.p10_mm`,
            p90_mm: sql`excluded.p90_mm`,
            member_count: sql`excluded.member_count`,
            days_covered: sql`excluded.days_covered`,
            trip_days: sql`excluded.trip_days`,
            high_c_max: sql`excluded.high_c_max`,
          },
        })
    }
  })
  return { days: values.length, trend: trend.length }
}
