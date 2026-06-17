import { Worker, type Job } from 'bullmq'
import { sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { locations, rainfallHistory } from '../../db/schema.js'
import { logger } from '../../lib/logger.js'
import { fetchPrecipHistory } from '../../lib/weather/acis.js'
import { bullConnection } from '../connection.js'

const LOOKBACK_DAYS = 7

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export const rainfallHistoryWorker = new Worker(
  'rainfall-history',
  async (_job: Job) => {
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
