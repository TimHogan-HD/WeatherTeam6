import { eq, gte, sql } from 'drizzle-orm'
import { parseNumeric, parseNumericRequired } from '@weatherteam6/types'
import type { ClimbHours, HourlySeries, PastReadingsDay, ReadingsDay } from '@weatherteam6/types'
import { db } from '../../db/index.js'
import {
  locations,
  tripDayGauges,
  tripDayOutcomes,
  tripDayRecords,
  tripDayVolunteerGauges,
  tripLocations,
  tripRainRecords,
  trips,
} from '../../db/schema.js'
import { describeError } from '../http.js'
import { logger } from '../logger.js'
import { readerScoringFor } from '../preferences/preferences.js'
import { getHourlySeries } from '../runs/fetchHourlySeries.js'
import { getEnsembleDaily } from '../runs/latestRuns.js'
import { scoringLocationFor } from '../runs/scoringLocation.js'
import { fetchGaugeDays, nearestGauge } from '../weather/asosGauge.js'
import { fetchVolunteerReports, nearestVolunteerGauges } from '../weather/cocorahsGauge.js'
import { fetchOutlook } from '../weather/ensembleOutlook.js'
import { localDateString } from '../weather/openMeteo.js'
import { recordingHour, tripDayRows, type TripDayRow } from './tripDayRows.js'
import { tripRainRows, type DatedTrip } from './tripRainRows.js'
import { OUTCOME_DAYS, tripOutcomeRows, type TripOutcomeRow } from './tripOutcomeRows.js'
import { climbHoursNeeded, daysUnderTripHours, tripClimbHours, type HoursTrip } from './tripClimbHours.js'

export type RecordTripsResult = {
  /** Distinct locations on trips that had not ended, or ended inside `OUTCOME_DAYS`. */
  locations: number
  rowsWritten: number
  /** `trip_rain_records` rows: one per trip and location with a day inside the horizon. */
  trendRowsWritten: number
  /** `trip_day_outcomes` rows: one per trip day that is over and still being looked back on. */
  outcomeRowsWritten: number
  /**
   * `trip_day_gauges` rows: the nearest gauge's day for each outcome row. A
   * failed gauge read costs only these, and is not in `failed`.
   */
  gaugeRowsWritten: number
  /**
   * `trip_day_volunteer_gauges` rows: the reports of each outcome crag's
   * nearest volunteer gauges. Failures cost only these, like `gaugeRowsWritten`.
   */
  volunteerRowsWritten: number
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

type RecordedTrip = DatedTrip & HoursTrip

/**
 * Record what the forecast says about every upcoming trip day, per location.
 *
 * Beside the day rows, one `trip_rain_records` point per trip at the location:
 * the trip's rain total and warmest high, for the trip screen's trend.
 *
 * Once a trip day is over, its `trip_day_outcomes` row: how it turned out, from
 * the model's look back, rewritten for `OUTCOME_DAYS` and then left alone. A
 * trip that ended longer ago than that is not read at all: nothing pulls for it.
 *
 * Safe to rerun and to overlap: each row is an upsert on (location, day, hour),
 * each trend point on (trip, location, hour).
 * **A location writes nothing unless every source it needs answered**: a failed
 * outlook or missing readings would otherwise replace this hour's figures with
 * nulls that read as "no rain" or "no score".
 */
export async function recordTripDays(now: Date = new Date()): Promise<RecordTripsResult> {
  // A day of slack under UTC's date: the exact cut is each location's own today,
  // applied in `tripDayRows` and `tripOutcomeRows` once a source has said what that is.
  const cutoff = new Date(now.getTime() - (OUTCOME_DAYS + 1) * 86_400_000).toISOString().slice(0, 10)
  const rows = await db
    .select({
      tripId: trips.id,
      start: trips.start_date,
      end: trips.end_date,
      climb_first_hour: trips.climb_first_hour,
      climb_last_hour: trips.climb_last_hour,
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

  const byLocation = new Map<string, { location: LocationRow; trips: RecordedTrip[] }>()
  for (const row of rows) {
    const entry = byLocation.get(row.location.id) ?? { location: row.location, trips: [] }
    entry.trips.push({ id: row.tripId, start: row.start, end: row.end, climbHours: tripClimbHours(row) })
    byLocation.set(row.location.id, entry)
  }
  const entries = [...byLocation.values()]

  const settled = await Promise.allSettled(
    entries.map(({ location, trips: dated }) => recordLocation(location, dated, now)),
  )

  const result: RecordTripsResult = {
    locations: entries.length,
    rowsWritten: 0,
    trendRowsWritten: 0,
    outcomeRowsWritten: 0,
    gaugeRowsWritten: 0,
    volunteerRowsWritten: 0,
    failed: [],
  }
  settled.forEach((entry, i) => {
    const id = entries[i]?.location.id ?? 'unknown'
    if (entry.status === 'fulfilled') {
      result.rowsWritten += entry.value.days
      result.trendRowsWritten += entry.value.trend
      result.outcomeRowsWritten += entry.value.outcomes
      result.gaugeRowsWritten += entry.value.gauges
      result.volunteerRowsWritten += entry.value.volunteers
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

/**
 * A crag's readings for its trip dates. The location belongs to one user, so
 * they are judged against that user's temperature range, and each date against
 * the climbing hours of the trip covering it (`climbHoursOn`): one series per
 * distinct hours, usually one. Any series without readings fails the location.
 */
async function readTripReadings(
  location: LocationRow,
  point: { lat: number; lon: number; elevation_m: number | null },
  dated: RecordedTrip[],
  now: Date,
): Promise<{ days: ReadingsDay[]; pastDays: PastReadingsDay[]; utcOffsetSeconds: number; fetchedAt: Date | null }> {
  const reader = await readerScoringFor(location.user_id)
  const read: { hours: ClimbHours; series: HourlySeries }[] = []
  // In turn rather than together: a location with no stored run fetches and
  // stores one on the first call, so the rest score that same run.
  for (const hours of climbHoursNeeded(dated, reader.climbHours)) {
    const series = await getHourlySeries(
      { id: location.id, ...point },
      // No walls: a trip records the crag's score only.
      { allModels: true, now, scoring: scoringLocationFor({ ...location, known_crag: null }, { ...reader, climbHours: hours }) },
    )
    if (series.readings.unavailable_reason !== null) {
      throw new Error(`readings unavailable: ${series.readings.unavailable_reason}`)
    }
    read.push({ hours, series })
  }

  const fetchedAts = new Set(
    read.map(({ series }) => series.models?.find((m) => m.model === series.readings.model)?.fetched_at ?? null),
  )
  const [first] = read
  if (first === undefined) throw new Error('no climbing hours to read')
  // One `scored_run_fetched_at` names every row, so every score must come from that run.
  if (fetchedAts.size > 1) throw new Error('the climbing-hours series scored different runs')
  const [fetchedAt] = fetchedAts

  return {
    days: daysUnderTripHours(
      read.map(({ hours, series }) => ({ hours, days: series.readings.days })),
      dated,
      reader.climbHours,
    ),
    pastDays: daysUnderTripHours(
      read.map(({ hours, series }) => ({ hours, days: series.readings.past_days ?? [] })),
      dated,
      reader.climbHours,
    ),
    utcOffsetSeconds: first.series.utc_offset_seconds,
    fetchedAt: fetchedAt ? new Date(fetchedAt) : null,
  }
}

async function recordLocation(
  location: LocationRow,
  dated: RecordedTrip[],
  now: Date,
): Promise<{ days: number; trend: number; outcomes: number; gauges: number; volunteers: number }> {
  const point = {
    lat: parseNumericRequired(location.lat),
    lon: parseNumericRequired(location.lon),
    elevation_m: parseNumeric(location.elevation_m),
  }

  // Only trips with a day still to come need the outlook; one that is over is
  // only looked back on. A day of slack, as in the trip query.
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10)
  const ahead = dated.filter((t) => t.end >= yesterday)

  const [outlook, readings] = await Promise.all([
    ahead.length > 0 ? fetchOutlook(point, now) : Promise.resolve(null),
    location.is_climbing_location ? readTripReadings(location, point, dated, now) : Promise.resolve(null),
  ])

  // The stricter rain chance, from the ensemble run `collect-runs` stores
  // (days 0-6), so it costs no request of its own when that run is fresh.
  // Shown on no screen, so a failure costs only its own columns, and it is read
  // after the sources above so it is never in their way. Only when a trip day
  // falls inside the days it reaches (a day of slack, as above).
  const weekOut = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10)
  const rewet =
    outlook !== null && ahead.some((t) => t.start <= weekOut)
      ? await getEnsembleDaily(point, now).then(
          (daily) => daily.rewet ?? null,
          (err: unknown) => {
            logger.warn({ locationId: location.id, err: describeError(err) }, '[recordTripDays] rewet chance failed')
            return null
          },
        )
      : null

  const values: TripDayRow[] =
    outlook === null
      ? []
      : tripDayRows({
          locationId: location.id,
          now,
          ranges: ahead,
          outlook,
          readings: readings?.days ?? null,
          scoredRunFetchedAt: readings?.fetchedAt ?? null,
          rewet,
        })
  const trend = outlook === null ? [] : tripRainRows({ locationId: location.id, now, trips: ahead, outlook })
  const outcomes =
    readings === null
      ? []
      : tripOutcomeRows({
          locationId: location.id,
          now,
          today: localDateString(now, readings.utcOffsetSeconds),
          ranges: dated,
          pastDays: readings.pastDays,
        })
  if (values.length === 0 && trend.length === 0 && outcomes.length === 0) {
    return { days: 0, trend: 0, outcomes: 0, gauges: 0, volunteers: 0 }
  }

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
            members_rewet: sql`excluded.members_rewet`,
            rewet_member_count: sql`excluded.rewet_member_count`,
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
    if (outcomes.length > 0) await writeOutcomes(tx, outcomes)
  })
  // After the transaction and outside it, like the rewet chance: a gauge is a
  // second, independent observation, so its failure costs only its own rows.
  const lookedBack = outcomes.map((o) => o.local_date)
  const [gauges, volunteers] =
    outcomes.length === 0
      ? [0, 0]
      : await Promise.all([
          recordGauge(location.id, point, lookedBack, now),
          recordVolunteerGauges(location.id, point, lookedBack, now),
        ])
  return { days: values.length, trend: trend.length, outcomes: outcomes.length, gauges, volunteers }
}

/**
 * The reports of the crag's nearest volunteer gauges that could stand for the
 * days just looked back on (`trip_day_volunteer_gauges`). Every candidate is
 * read, because which one reported is only known from the reports; the summary
 * picks per day. Returns the rows written. Each station's failure is logged
 * and costs only its rows, never a dry day.
 */
async function recordVolunteerGauges(
  locationId: string,
  point: { lat: number; lon: number },
  dates: string[],
  now: Date,
): Promise<number> {
  const candidates = nearestVolunteerGauges(point.lat, point.lon)
  if (candidates.length === 0) return 0
  const settled = await Promise.allSettled(candidates.map((g) => fetchVolunteerReports(g.station, dates)))
  const reports = settled.flatMap((s, i) => {
    if (s.status === 'fulfilled') return s.value
    logger.warn(
      { locationId, station: candidates[i]?.station, err: describeError(s.reason) },
      '[recordTripDays] volunteer gauge failed',
    )
    return []
  })
  if (reports.length === 0) return 0
  try {
    await writeVolunteerReports(
      db,
      reports.map((r) => ({ ...r, recorded_at: recordingHour(now) })),
    )
    return reports.length
  } catch (err) {
    logger.warn({ locationId, err: describeError(err) }, '[recordTripDays] volunteer gauge write failed')
    return 0
  }
}

/**
 * Upsert volunteer reports. A volunteer can correct a report, so a later read
 * replaces the stored one. A report later withdrawn keeps its row: the
 * recorder only ever writes reports it read. Exported for `check:record-trips`.
 */
export async function writeVolunteerReports(
  executor: Pick<typeof db, 'insert'>,
  rows: (typeof tripDayVolunteerGauges.$inferInsert)[],
): Promise<void> {
  await executor
    .insert(tripDayVolunteerGauges)
    .values(rows)
    .onConflictDoUpdate({
      target: [tripDayVolunteerGauges.station, tripDayVolunteerGauges.report_date],
      set: {
        station_name: sql`excluded.station_name`,
        obs_hour: sql`excluded.obs_hour`,
        recorded_at: sql`excluded.recorded_at`,
        rain_mm: sql`excluded.rain_mm`,
      },
    })
}

/**
 * The nearest gauge's measured rain for the days just looked back on
 * (`trip_day_gauges`). Returns the rows written. A crag with no gauge in reach
 * writes none, and a failure is logged and writes none, never a dry day.
 */
async function recordGauge(
  locationId: string,
  point: { lat: number; lon: number },
  dates: string[],
  now: Date,
): Promise<number> {
  const gauge = nearestGauge(point.lat, point.lon)
  if (gauge === null) return 0
  try {
    const days = await fetchGaugeDays(gauge, dates)
    if (days.length === 0) return 0
    await writeGaugeDays(
      db,
      days.map((d) => ({ station: gauge.station, recorded_at: recordingHour(now), ...d })),
    )
    return days.length
  } catch (err) {
    logger.warn({ locationId, station: gauge.station, err: describeError(err) }, '[recordTripDays] gauge failed')
    return 0
  }
}

/**
 * Upsert gauge days. A later read that heard from fewer hours than the stored
 * row (an archive hiccup) leaves the row alone, so a complete total is never
 * replaced by a short one. Exported for `check:record-trips`.
 */
export async function writeGaugeDays(
  executor: Pick<typeof db, 'insert'>,
  rows: (typeof tripDayGauges.$inferInsert)[],
): Promise<void> {
  await executor
    .insert(tripDayGauges)
    .values(rows)
    .onConflictDoUpdate({
      target: [tripDayGauges.station, tripDayGauges.local_date],
      set: {
        recorded_at: sql`excluded.recorded_at`,
        rain_mm: sql`excluded.rain_mm`,
        hours_reported: sql`excluded.hours_reported`,
        hours_expected: sql`excluded.hours_expected`,
      },
      setWhere: sql`excluded.hours_reported >= ${tripDayGauges.hours_reported}`,
    })
}

/**
 * Upsert outcome rows. Exported for `check:record-trips`, which proves against
 * Postgres that a later gap keeps the stored figure.
 */
export async function writeOutcomes(executor: Pick<typeof db, 'insert'>, outcomes: TripOutcomeRow[]): Promise<void> {
  await executor
    .insert(tripDayOutcomes)
    .values(outcomes)
    .onConflictDoUpdate({
      target: [tripDayOutcomes.location_id, tripDayOutcomes.local_date],
      // A later firing's gap keeps the stored figure rather than erasing it.
      // Score and dryness move together, and so do the high and low, so
      // neither pair mixes two firings.
      set: {
        recorded_at: sql`excluded.recorded_at`,
        score: sql`case when excluded.score is null and excluded.dryness is null then ${tripDayOutcomes.score} else excluded.score end`,
        dryness: sql`case when excluded.score is null and excluded.dryness is null then ${tripDayOutcomes.dryness} else excluded.dryness end`,
        rain_mm: sql`coalesce(excluded.rain_mm, ${tripDayOutcomes.rain_mm})`,
        temp_c_max: sql`case when excluded.temp_c_max is null and excluded.temp_c_min is null then ${tripDayOutcomes.temp_c_max} else excluded.temp_c_max end`,
        temp_c_min: sql`case when excluded.temp_c_max is null and excluded.temp_c_min is null then ${tripDayOutcomes.temp_c_min} else excluded.temp_c_min end`,
      },
    })
}
