import { and, inArray, isNotNull, lt } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { weatherEnsembleHours, weatherRunHours, weatherRuns } from '../../db/schema.js'
import { logger } from '../logger.js'

/**
 * Parsed hours are kept for 14 days; the raw upstream payload for 48 hours.
 *
 * The accepted consequence (plan, § Known cost): a trip four weeks out has no
 * run-to-run trend until it comes inside the window. Widening it is a retention
 * change, not a design change.
 */
export const PARSED_RETENTION_DAYS = 14
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
