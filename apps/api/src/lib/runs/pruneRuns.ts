import { and, inArray, isNotNull, lt } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { weatherEnsembleHours, weatherRunHours, weatherRuns } from '../../db/schema.js'
import { logger } from '../logger.js'

/**
 * Parsed hours are kept for 2 days; the raw upstream payload for 48 hours.
 *
 * **Cut from 14 days on 2026-09-10, because 14 never fitted.** Neon's free tier
 * caps a project at 512 MB, and production hit it: every write began failing
 * with `could not extend file because project size limit (512 MB) has been
 * exceeded`, stored runs went 11-16 hours stale, and `weather_runs` rows were
 * left with no `weather_run_hours` behind them. The storage failure is caught
 * and logged as a warning by `latestRuns` — correct for a panel render, which
 * should still show data it could not cache — so nothing surfaced until a
 * `check:hourly` run went looking.
 *
 * The arithmetic, so the next person can redo it before changing this number.
 * Six locations, hourly collection, six deterministic models each stored to its
 * own horizon (padding is dropped, so roughly 1,500 hours per location per run
 * across the six):
 *
 *     6 locations x 1,500 hours x 24 runs/day x 14 days ~ 3.0M rows
 *     3.0M x ~170 bytes with its primary-key index      ~ 510 MB
 *
 * That is the whole quota in `weather_run_hours` alone, before
 * `weather_ensemble_hours` and the raw payloads. At 2 days it is ~73 MB.
 *
 * **The cost is run-over-run trend history, and nothing renders it today.** The
 * ensemble spread that the Mini App's confidence band draws comes from *within*
 * a single run — percentiles across 143 members at each lead time — not from
 * comparing runs, so that is unaffected. What is lost is the ability to say how
 * a forecast for a given day changed between yesterday's run and today's.
 *
 * Raising this again means either a paid Neon plan or fewer stored hours per
 * run; it is a capacity decision, not a preference.
 */
export const PARSED_RETENTION_DAYS = 2
export const RAW_RETENTION_HOURS = 48

/**
 * A run is only pruned in chunks so a long-neglected schedule cannot build one
 * `DELETE ... IN (...)` with tens of thousands of ids.
 */
const PRUNE_BATCH = 200

export type PruneResult = {
  runsDeleted: number
  hoursDeleted: number
  ensembleHoursDeleted: number
  rawCleared: number
}

/**
 * Delete expired runs and their hours, then drop the raw payload from runs that
 * are still inside the parsed window but past the raw one.
 *
 * **Children before parents.** No FK in this schema declares `onDelete`, so
 * deleting a `weather_runs` row that still has `weather_run_hours` is a
 * foreign-key violation, and it surfaces as a generic 500 only once real data
 * exists. The child deletes are driven by a **subquery over the parent rows
 * being pruned**, not by the children's own timestamps — the hours carry
 * `valid_at`, which is a forecast time and runs into the future, so pruning
 * them by their own column would delete tomorrow's forecast and keep last
 * fortnight's.
 */
export async function pruneWeatherRuns(now: Date = new Date()): Promise<PruneResult> {
  const parsedCutoff = new Date(now.getTime() - PARSED_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const rawCutoff = new Date(now.getTime() - RAW_RETENTION_HOURS * 60 * 60 * 1000)

  const expired = await db
    .select({ id: weatherRuns.id })
    .from(weatherRuns)
    .where(lt(weatherRuns.fetched_at, parsedCutoff))

  const result: PruneResult = {
    runsDeleted: 0,
    hoursDeleted: 0,
    ensembleHoursDeleted: 0,
    rawCleared: 0,
  }

  for (let i = 0; i < expired.length; i += PRUNE_BATCH) {
    const ids = expired.slice(i, i + PRUNE_BATCH).map((r) => r.id)
    // One transaction per batch: a batch either loses its run and all its hours
    // or none of them, so an interrupted prune never leaves a run whose hours
    // are half gone.
    await db.transaction(async (tx) => {
      const ensembleGone = await tx
        .delete(weatherEnsembleHours)
        .where(inArray(weatherEnsembleHours.run_id, ids))
        .returning({ run_id: weatherEnsembleHours.run_id })
      const hoursGone = await tx
        .delete(weatherRunHours)
        .where(inArray(weatherRunHours.run_id, ids))
        .returning({ run_id: weatherRunHours.run_id })
      const runsGone = await tx
        .delete(weatherRuns)
        .where(inArray(weatherRuns.id, ids))
        .returning({ id: weatherRuns.id })

      result.ensembleHoursDeleted += ensembleGone.length
      result.hoursDeleted += hoursGone.length
      result.runsDeleted += runsGone.length
    })
  }

  // The raw payload is the re-derivation path for member-level views and is by
  // far the largest column here. Clearing it leaves the parsed hours intact.
  const cleared = await db
    .update(weatherRuns)
    .set({ raw: null })
    .where(and(lt(weatherRuns.fetched_at, rawCutoff), isNotNull(weatherRuns.raw)))
    .returning({ id: weatherRuns.id })
  result.rawCleared = cleared.length

  logger.info(result, '[pruneRuns] prune complete')
  return result
}
