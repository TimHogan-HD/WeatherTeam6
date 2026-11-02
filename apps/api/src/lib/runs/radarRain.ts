import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { locations, radarRainHours } from '../../db/schema.js'
import { logger } from '../logger.js'
import { fetchQpeHour, inMrmsGrid, publishedQpeHours } from '../weather/mrmsQpe.js'
import type { LatLon } from '../weather/mrmsGrib.js'
import { TRAILING_DAYS } from './deterministicFetch.js'
import { radarKeyFor } from './pointKey.js'

const HOUR_MS = 3_600_000

/** How far back the collector fills: the trailing history the drying clock walks. */
export const RADAR_LOOKBACK_HOURS = TRAILING_DAYS * 24

/** Rows older than this are pruned: the lookback plus a day, so a late walk never finds a hole. */
export const RADAR_RETENTION_MS = (TRAILING_DAYS + 1) * 24 * HOUR_MS

/**
 * Files fetched per run. One is ~0.9 MB and ~1 s to fetch and read (measured
 * 2026-11-02), so 12 fit `maxDuration: 60` with room for a slow S3. A first
 * run, or one after an outage, fills the newest hours first and the rest over
 * the following runs: 168 hours take 14 hourly runs.
 */
export const RADAR_FILES_PER_RUN = 12
const CONCURRENCY = 4

export type RadarCollectResult = {
  /** Distinct crag cells inside the MRMS grid. */
  cells: number
  hoursStored: number
  /** Hours whose file was listed but could not be fetched or read; the next run retries them. */
  hoursFailed: string[]
  /** Hours still missing after this run (published but over `RADAR_FILES_PER_RUN`). */
  hoursRemaining: number
  /** True when S3's listing failed, so nothing was fetched. Never read as "nothing published". */
  listingFailed: boolean
  /** Rows deleted past `RADAR_RETENTION_MS`, or null when the prune failed. */
  pruned: number | null
}

/**
 * Store MRMS Pass2 hourly rain at every saved crag inside the US grid
 * (`POST /api/cron/collect-radar`, hourly on cron-job.org).
 *
 * Fills the hours of the last `RADAR_LOOKBACK_HOURS` that any cell lacks,
 * newest first. One file serves every cell, so a missing hour is fetched once
 * and written for all of them.
 *
 * Idempotent: rows upsert on `(cell_key, valid_at)`, so an overlapping or
 * retried run rewrites the same values. The prune runs after the writes and
 * is caught on its own, so it can never cost a run its rows.
 */
export async function collectRadarRain(now: Date = new Date()): Promise<RadarCollectResult> {
  const saved = await db
    .select({ lat: locations.lat, lon: locations.lon })
    .from(locations)
    .where(eq(locations.is_climbing_location, true))

  const cells = new Map<string, LatLon>()
  for (const loc of saved) {
    const p = { lat: parseFloat(loc.lat), lon: parseFloat(loc.lon) }
    if (Number.isFinite(p.lat) && Number.isFinite(p.lon) && inMrmsGrid(p)) cells.set(radarKeyFor(p), p)
  }
  const result: RadarCollectResult = {
    cells: cells.size,
    hoursStored: 0,
    hoursFailed: [],
    hoursRemaining: 0,
    listingFailed: false,
    pruned: null,
  }

  if (cells.size > 0) {
    const to = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS
    const from = to - RADAR_LOOKBACK_HOURS * HOUR_MS
    const keys = [...cells.keys()]
    const points = [...cells.values()]

    const stored = await db
      .select({ cell_key: radarRainHours.cell_key, valid_at: radarRainHours.valid_at })
      .from(radarRainHours)
      .where(and(inArray(radarRainHours.cell_key, keys), gte(radarRainHours.valid_at, new Date(from))))
    const cellsAt = new Map<number, number>()
    for (const r of stored) cellsAt.set(r.valid_at.getTime(), (cellsAt.get(r.valid_at.getTime()) ?? 0) + 1)

    const published = await publishedQpeHours(from, to)
    if (published === null) {
      result.listingFailed = true
    } else {
      const missing = [...published].filter((t) => (cellsAt.get(t) ?? 0) < keys.length).sort((a, b) => b - a)
      const batch = missing.slice(0, RADAR_FILES_PER_RUN)
      result.hoursRemaining = missing.length - batch.length

      for (let i = 0; i < batch.length; i += CONCURRENCY) {
        const settled = await Promise.allSettled(
          batch.slice(i, i + CONCURRENCY).map(async (t) => {
            const values = await fetchQpeHour(new Date(t), points)
            if (values === null) throw new Error('unreadable')
            await db
              .insert(radarRainHours)
              .values(keys.map((cell_key, j) => ({ cell_key, valid_at: new Date(t), precip_mm: values[j] ?? null })))
              .onConflictDoUpdate({
                target: [radarRainHours.cell_key, radarRainHours.valid_at],
                set: { precip_mm: sql.raw('excluded."precip_mm"'), fetched_at: sql`now()` },
              })
            return t
          }),
        )
        settled.forEach((s, j) => {
          if (s.status === 'fulfilled') result.hoursStored++
          else result.hoursFailed.push(new Date(batch[i + j]!).toISOString())
        })
      }
    }
  }

  try {
    const deleted = await db
      .delete(radarRainHours)
      .where(lt(radarRainHours.valid_at, new Date(now.getTime() - RADAR_RETENTION_MS)))
      .returning({ cell_key: radarRainHours.cell_key })
    result.pruned = deleted.length
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, '[radarRain] prune failed')
  }

  if (result.listingFailed || result.hoursFailed.length > 0) {
    logger.warn(
      { listingFailed: result.listingFailed, hoursFailed: result.hoursFailed.length },
      '[radarRain] collection incomplete',
    )
  }
  return result
}

/**
 * The stored radar rain at a place, keyed by the hour's end in epoch ms, or
 * **null when the place is outside the grid or the read failed**. Either way
 * the drying clock reads the models' median, as it did before radar; a failed
 * read never becomes "radar saw no rain".
 */
export async function loadRadarRain(p: LatLon, now: Date = new Date()): Promise<ReadonlyMap<number, number | null> | null> {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || !inMrmsGrid(p)) return null
  try {
    const rows = await db
      .select({ valid_at: radarRainHours.valid_at, precip_mm: radarRainHours.precip_mm })
      .from(radarRainHours)
      .where(
        and(
          eq(radarRainHours.cell_key, radarKeyFor(p)),
          gte(radarRainHours.valid_at, new Date(now.getTime() - RADAR_RETENTION_MS)),
        ),
      )
    return new Map(rows.map((r) => [r.valid_at.getTime(), r.precip_mm]))
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, '[radarRain] read failed; models only')
    return null
  }
}
