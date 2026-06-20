import { Worker, type Job } from 'bullmq'
import { eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { locations, rainfallHistory, locationNormals, cragClimbabilityHistory } from '../../db/schema.js'
import { logger } from '../../lib/logger.js'
import { fetchPrecipHistory } from '../../lib/weather/acis.js'
import { fetchGriddedNormals, fetchGriddedPrecipHistory } from '../../lib/weather/acisNormals.js'
import { computeClimbabilityHistory } from '../../lib/scoring/climbabilityHistory.js'
import { rainfallHistoryQueue } from '../queues.js'
import { bullConnection } from '../connection.js'

const LOOKBACK_DAYS = 7

async function runBackfill(locationId: string): Promise<void> {
  const locationRows = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1)
  const loc = locationRows[0]
  if (!loc) {
    logger.warn({ locationId }, '[rainfall-history] backfill: location not found')
    return
  }

  const now = new Date()
  const toDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const tenYearsAgo = new Date(now)
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10)
  const fromDate = tenYearsAgo.toISOString().slice(0, 10)

  const lat = parseFloat(loc.lat)
  const lon = parseFloat(loc.lon)

  logger.info({ locationId, lat, lon, fromDate, toDate }, '[rainfall-history] backfill: fetching 10yr precip')

  const dailyRows = await fetchGriddedPrecipHistory(lat, lon, fromDate, toDate)
  const monthly = computeClimbabilityHistory(dailyRows, loc.rock_type)

  if (monthly.length === 0) {
    logger.warn({ locationId }, '[rainfall-history] backfill: no monthly data computed')
    return
  }

  await db
    .insert(cragClimbabilityHistory)
    .values(
      monthly.map((m) => ({
        location_id: locationId,
        month: m.month,
        year: m.year,
        climbable_days: m.climbable_days,
        total_days: m.total_days,
      })),
    )
    .onConflictDoUpdate({
      target: [cragClimbabilityHistory.location_id, cragClimbabilityHistory.month, cragClimbabilityHistory.year],
      set: {
        climbable_days: sql`excluded.climbable_days`,
        total_days: sql`excluded.total_days`,
      },
    })

  logger.info({ locationId, monthCount: monthly.length }, '[rainfall-history] backfill: complete')
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export const rainfallHistoryWorker = new Worker(
  'rainfall-history',
  async (job: Job) => {
    // Backfill branch: targeted single-location history population
    if (job.data?.type === 'backfill') {
      const { locationId } = job.data as { type: 'backfill'; locationId: string }
      logger.info({ locationId }, '[rainfall-history] backfill job started')
      await runBackfill(locationId)
      return
    }

    logger.info('[rainfall-history] job started')

    const allLocations = await db.select().from(locations)
    if (allLocations.length === 0) {
      logger.info('[rainfall-history] no locations to process')
      return
    }

    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const startDate = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    const fromDate = toDateString(startDate)
    const toDate = toDateString(yesterday)

    const errors: Error[] = []

    for (const loc of allLocations) {
      if (!loc.asos_station) {
        logger.debug({ locationId: loc.id }, '[rainfall-history] no asos_station, skipping')
        continue
      }

      try {
        const rows = await fetchPrecipHistory(loc.asos_station, fromDate, toDate)

        if (rows.length === 0) {
          logger.warn(
            { locationId: loc.id, station: loc.asos_station, fromDate, toDate },
            '[rainfall-history] ACIS returned no rows — skipping (do not fall back to ASOS for daily totals)',
          )
          continue
        }

        // Single batch upsert per location. ON CONFLICT DO UPDATE rejects a batch that
        // touches the same row twice, and ACIS one-row-per-station-day uniqueness is a
        // wire-format expectation, not a code guarantee — so dedupe by date first
        // (last write wins, matching the old per-row loop). sql`excluded.*` is
        // Drizzle's documented pattern for referencing per-row conflict values — it
        // cannot be expressed otherwise.
        const uniqueRows = [...new Map(rows.map((row) => [row.date, row])).values()]
        await db
          .insert(rainfallHistory)
          .values(
            uniqueRows.map((row) => ({
              location_id: loc.id,
              date: row.date,
              precip_mm: String(row.precip_mm),
              source: 'acis' as const,
              station_id: loc.asos_station,
              verified: true,
            })),
          )
          .onConflictDoUpdate({
            target: [rainfallHistory.location_id, rainfallHistory.date],
            set: {
              precip_mm: sql`excluded.precip_mm`,
              source: sql`excluded.source`,
              station_id: sql`excluded.station_id`,
              verified: sql`excluded.verified`,
            },
          })

        logger.info(
          { locationId: loc.id, station: loc.asos_station, rowCount: uniqueRows.length },
          '[rainfall-history] location processed',
        )
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        logger.error(
          { locationId: loc.id, station: loc.asos_station, err: e.message },
          '[rainfall-history] location failed',
        )
        errors.push(e)
      }
    }

    // Backfill climatological normals for locations that don't have all 12 months stored yet.
    // Normals are static (1991-2020 NCEI baseline) so we fetch once per location, not per run.
    // All locations qualify — normals only require lat/lon, not an asos_station.
    // Single batch query to find which locations already have all 12 months — avoids N+1.
    const fullyPopulated = await db
      .select({ location_id: locationNormals.location_id })
      .from(locationNormals)
      .groupBy(locationNormals.location_id)
      .having(sql`count(*) >= 12`)
    const populatedSet = new Set(fullyPopulated.map((r) => r.location_id))

    for (const loc of allLocations) {
      if (populatedSet.has(loc.id)) continue

      try {
        const normals = await fetchGriddedNormals(parseFloat(loc.lat), parseFloat(loc.lon))

        await db
          .insert(locationNormals)
          .values(
            normals.map((n) => ({
              location_id: loc.id,
              month: n.month,
              precip_normal_mm: String(n.precip_normal_mm),
              temp_max_normal_c: String(n.temp_max_normal_c),
              temp_min_normal_c: String(n.temp_min_normal_c),
              source: n.source,
            })),
          )
          .onConflictDoNothing()

        logger.info({ locationId: loc.id }, '[rainfall-history] normals stored for location')
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        logger.error({ locationId: loc.id, err: e.message }, '[rainfall-history] normals fetch failed')
        errors.push(e)
      }
    }

    // Safety-net: dispatch backfill for any climbing location with no history yet.
    // Catches seeded locations on first run and any locations missed by the on-save trigger.
    const locationsWithHistory = await db
      .selectDistinct({ location_id: cragClimbabilityHistory.location_id })
      .from(cragClimbabilityHistory)

    const withHistorySet = new Set(locationsWithHistory.map((r) => r.location_id))
    const needsBackfill = allLocations.filter(
      (loc) => loc.is_climbing_location && !withHistorySet.has(loc.id),
    )

    for (const loc of needsBackfill) {
      await rainfallHistoryQueue.add('backfill', { type: 'backfill', locationId: loc.id })
      logger.info({ locationId: loc.id }, '[rainfall-history] queued backfill for location without history')
    }

    if (errors.length > 0) {
      throw new Error(
        `[rainfall-history] ${errors.length} location(s) failed: ${errors.map((e) => e.message).join('; ')}`,
      )
    }

    logger.info('[rainfall-history] job completed')
  },
  { connection: bullConnection, concurrency: 1 },
)

rainfallHistoryWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'rainfall-history job failed')
})
