import { Worker, type Job } from 'bullmq'
import { sql } from 'drizzle-orm'
import { bullConnection } from '../connection.js'
import { db } from '../../db/index.js'
import { locations, rainfallHistory } from '../../db/schema.js'
import { logger } from '../../lib/logger.js'
import { fetchAcisRainfall } from '../../lib/weather/acis.js'
import { fetchHistoricalRainfall } from '../../lib/weather/openMeteo.js'

function dateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function offsetDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000)
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
    // Fetch yesterday through 7 days ago — ACIS lags ~1 day
    const edate = dateString(offsetDays(now, -1))
    const sdate = dateString(offsetDays(now, -7))

    const errors: Error[] = []

    for (const loc of allLocations) {
      try {
        type Entry = {
          date: string
          precip_mm: number
          source: 'acis' | 'open_meteo_historical'
          verified: boolean
          station_id: string | null
        }

        let entries: Entry[] = []
        // acisAttempted tracks whether the HTTP call completed (even if it returned no records).
        // Only fall back to open-meteo when the HTTP call itself failed — a successful HTTP 200
        // with no records means ACIS has communicated there is no verified data for this period.
        let acisAttempted = false

        if (loc.asos_station) {
          try {
            const acisData = await fetchAcisRainfall(loc.asos_station, sdate, edate)
            acisAttempted = true
            entries = acisData.map((e) => ({
              date: e.date,
              precip_mm: e.precip_mm,
              source: 'acis' as const,
              verified: true,
              station_id: loc.asos_station,
            }))
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            logger.warn({ locationId: loc.id, err: msg }, '[rainfall-history] ACIS failed, falling back to open-meteo historical')
          }
        }

        if (!acisAttempted) {
          const lat = parseFloat(loc.lat)
          const lon = parseFloat(loc.lon)
          try {
            const omData = await fetchHistoricalRainfall(lat, lon, sdate, edate)
            entries = omData.map((e) => ({
              date: e.date,
              precip_mm: e.precip_mm,
              source: 'open_meteo_historical' as const,
              verified: false,
              station_id: null,
            }))
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            logger.warn({ locationId: loc.id, err: msg }, '[rainfall-history] open-meteo historical also failed')
          }
        }

        if (entries.length === 0) {
          logger.warn({ locationId: loc.id }, '[rainfall-history] no data from any source')
          continue
        }

        // All entries for a location are always the same source (ACIS or open-meteo, never mixed),
        // so we can batch the entire set in one INSERT statement.
        if (entries[0]!.verified) {
          // ACIS is authoritative — batch upsert, overwriting any existing unverified rows
          await db
            .insert(rainfallHistory)
            .values(
              entries.map((e) => ({
                location_id: loc.id,
                date: e.date,
                precip_mm: String(e.precip_mm),
                source: e.source,
                verified: e.verified,
                station_id: e.station_id,
              })),
            )
            .onConflictDoUpdate({
              target: [rainfallHistory.location_id, rainfallHistory.date],
              set: {
                precip_mm: sql`excluded.precip_mm`,
                source: sql`excluded.source`,
                verified: sql`excluded.verified`,
                station_id: sql`excluded.station_id`,
              },
            })
        } else {
          // Open-Meteo fallback — batch insert, never overwrite existing rows (ACIS may be there)
          await db
            .insert(rainfallHistory)
            .values(
              entries.map((e) => ({
                location_id: loc.id,
                date: e.date,
                precip_mm: String(e.precip_mm),
                source: e.source,
                verified: e.verified,
                station_id: e.station_id,
              })),
            )
            .onConflictDoNothing()
        }

        logger.info(
          { locationId: loc.id, count: entries.length, source: entries[0]?.source },
          '[rainfall-history] location processed',
        )
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        logger.error({ locationId: loc.id, err: e.message }, '[rainfall-history] location failed')
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
