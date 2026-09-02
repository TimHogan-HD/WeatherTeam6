import { db } from '../../db/index.js'
import { locations } from '../../db/schema.js'
import { logger } from '../logger.js'
import {
  DETERMINISTIC_MODELS,
  fetchDeterministicHourly,
  fetchEnsembleRun,
  type ForecastLocation,
} from '../weather/openMeteo.js'
import { pointKeyForLocation } from './pointKey.js'
import { storeDeterministicRun, storeEnsembleRun } from './storeRun.js'

export type CollectResult = {
  locations: number
  runsStored: number
  hoursStored: number
  /** Locations whose collection threw. Named so a partial run cannot read as a complete one. */
  failed: string[]
  /**
   * Locations whose **deterministic** fetch failed while the ensemble succeeded,
   * and the reverse.
   *
   * **`failed` alone reported a half-collection as a clean run.** It counts only
   * locations where *both* upstreams failed, so on 2026-09-02 production logged
   * `locations: 5, runsStored: 5, hoursStored: 840, failed: 0` and answered
   * 200 — while every deterministic fetch had failed and the only thing stored
   * was the ensemble. A collection missing half its models is not a success, and
   * a summary that cannot say so is defect class 2: a failure state that reads
   * as one.
   */
  deterministicFailed: string[]
  ensembleFailed: string[]
}

/**
 * Collect and persist one run for every saved location.
 *
 * Invoked by `POST /api/cron/collect-runs` on an external schedule
 * (cron-job.org). There is no queue in this project and nothing can run on an
 * in-process timer — the API is one serverless function.
 *
 * **Locations run under `Promise.allSettled`, never sequentially.**
 * `fetchWithRetry` sleeps 1s + 2s + 4s across its attempts, so a serial loop
 * multiplies an upstream outage by the number of locations and walks into the
 * function's `maxDuration: 60`. Concurrency is safe because each location writes
 * only its own `point_key`.
 *
 * Idempotent: the run row upserts on `(point_key, model, fetched_at)` and the
 * hours upsert on their primary key, so a retried or overlapping schedule leaves
 * one row per hour rather than duplicates.
 */
export async function collectWeatherRuns(): Promise<CollectResult> {
  const saved = await db
    .select({
      id: locations.id,
      name: locations.name,
      lat: locations.lat,
      lon: locations.lon,
      elevation_m: locations.elevation_m,
    })
    .from(locations)

  if (saved.length === 0) {
    logger.info('[collectRuns] no locations to collect')
    return {
      locations: 0,
      runsStored: 0,
      hoursStored: 0,
      failed: [],
      deterministicFailed: [],
      ensembleFailed: [],
    }
  }

  const settled = await Promise.allSettled(
    saved.map(async (loc) => {
      const point: ForecastLocation = {
        lat: parseFloat(loc.lat),
        lon: parseFloat(loc.lon),
        elevation_m: loc.elevation_m === null ? null : parseFloat(loc.elevation_m),
      }
      const point_key = pointKeyForLocation(loc.id)

      // The two upstream calls are independent, and one failing must not cost
      // the other: a deterministic outage should still leave the ensemble run
      // stored, and the reverse.
      const [deterministic, ensemble] = await Promise.allSettled([
        fetchDeterministicHourly(point, DETERMINISTIC_MODELS),
        fetchEnsembleRun(point),
      ])

      let runsStored = 0
      let hoursStored = 0

      if (deterministic.status === 'fulfilled') {
        const stored = await storeDeterministicRun(point_key, loc.id, deterministic.value)
        runsStored += stored.length
        hoursStored += stored.reduce((acc, s) => acc + s.hours, 0)
        if (deterministic.value.unavailable_models.length > 0) {
          logger.debug(
            { locationId: loc.id, unavailable: deterministic.value.unavailable_models.join(',') },
            '[collectRuns] models with no coverage at this point',
          )
        }
      } else {
        logger.warn(
          { locationId: loc.id, err: describe(deterministic.reason) },
          '[collectRuns] deterministic fetch failed',
        )
      }

      if (ensemble.status === 'fulfilled') {
        const stored = await storeEnsembleRun(point_key, loc.id, ensemble.value)
        if (stored) {
          runsStored += 1
          hoursStored += stored.hours
        }
      } else {
        logger.warn(
          { locationId: loc.id, err: describe(ensemble.reason) },
          '[collectRuns] ensemble fetch failed',
        )
      }

      // Both upstreams down for this location is a failure of the location, not
      // a quiet zero — the caller reports it and the response says so.
      if (deterministic.status === 'rejected' && ensemble.status === 'rejected') {
        throw new Error(`both fetches failed for location ${loc.id}`)
      }

      return {
        runsStored,
        hoursStored,
        deterministicOk: deterministic.status === 'fulfilled',
        ensembleOk: ensemble.status === 'fulfilled',
      }
    }),
  )

  const result: CollectResult = {
    locations: saved.length,
    runsStored: 0,
    hoursStored: 0,
    failed: [],
    deterministicFailed: [],
    ensembleFailed: [],
  }

  settled.forEach((entry, i) => {
    const loc = saved[i]
    if (entry.status === 'fulfilled') {
      result.runsStored += entry.value.runsStored
      result.hoursStored += entry.value.hoursStored
      // A location that stored *one* of its two runs is a partial collection,
      // and saying so is the whole point — see `CollectResult`.
      if (!entry.value.deterministicOk) result.deterministicFailed.push(loc?.id ?? 'unknown')
      if (!entry.value.ensembleOk) result.ensembleFailed.push(loc?.id ?? 'unknown')
      return
    }
    result.failed.push(loc?.id ?? 'unknown')
    logger.error(
      { locationId: loc?.id, err: describe(entry.reason) },
      '[collectRuns] location failed',
    )
  })

  const partial = result.deterministicFailed.length + result.ensembleFailed.length
  const summary = {
    ...result,
    failed: result.failed.length,
    deterministicFailed: result.deterministicFailed.length,
    ensembleFailed: result.ensembleFailed.length,
  }
  // **A half-collection logs at warn, not info.** It answered 200 and read as a
  // clean run for as long as nobody compared `hoursStored` against what a full
  // one produces.
  if (partial > 0 || result.failed.length > 0) {
    logger.warn(summary, '[collectRuns] collection incomplete')
  } else {
    logger.info(summary, '[collectRuns] collection complete')
  }
  return result
}

/**
 * Only the message, never the object.
 *
 * A rejection here can carry a database driver error, and those hold the
 * connection string on fields a wholesale serialisation would print.
 */
function describe(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
