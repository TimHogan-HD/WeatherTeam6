import { desc, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { locations, weatherRuns } from '../../db/schema.js'
import { logger } from '../logger.js'
import {
  fetchAvailability,
  planCollection,
  staleSources,
  type CollectedModel,
} from '../weather/modelMetadata.js'
import { fetchEnsembleRun, type ForecastLocation } from '../weather/openMeteo.js'
import { FORECAST_ONLY_MODELS, fetchForecastOnlyRuns, fetchThermalRun } from './deterministicFetch.js'
import { THERMAL_MODEL } from './hourlyReadings.js'
import { pointKeyForPlace } from './pointKey.js'
import { confirmRuns, storeDeterministicRun, storeEnsembleRun } from './storeRun.js'

export type CollectResult = {
  locations: number
  runsStored: number
  hoursStored: number
  /** Distinct places fetched. Fewer than `locations` when users saved the same crag. */
  points: number
  /**
   * Model runs not fetched because upstream had published nothing since our
   * copy, and stamped as still current instead.
   */
  runsConfirmed: number
  /** Point keys where every fetch attempted failed. Named so a partial run cannot read as a complete one. */
  failed: string[]
  /**
   * Point keys whose **deterministic** fetch failed while the ensemble succeeded,
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
  /**
   * Metadata sources whose last run is older than `STALE_AFTER_MS`, and those
   * that could not be read. **Either one means `MODEL_SOURCES` needs looking
   * at** — Open-Meteo has renamed datasets before, and a retired name reads as a
   * model that never publishes. The backstop keeps the forecast moving; this is
   * what says why it is refetching on a timer.
   */
  staleMetadata: string[]
  unreadableMetadata: string[]
}

/** Each point's newest stored `fetched_at` per model. */
async function newestFetches(pointKeys: string[]): Promise<Map<string, Map<string, Date>>> {
  const rows = await db
    .selectDistinctOn([weatherRuns.point_key, weatherRuns.model], {
      point_key: weatherRuns.point_key,
      model: weatherRuns.model,
      fetched_at: weatherRuns.fetched_at,
    })
    .from(weatherRuns)
    .where(inArray(weatherRuns.point_key, pointKeys))
    .orderBy(weatherRuns.point_key, weatherRuns.model, desc(weatherRuns.fetched_at))

  const out = new Map<string, Map<string, Date>>()
  for (const r of rows) {
    const byModel = out.get(r.point_key) ?? new Map<string, Date>()
    byModel.set(r.model, r.fetched_at)
    out.set(r.point_key, byModel)
  }
  return out
}

/**
 * Collect and persist the runs that changed upstream, for every distinct place
 * a location is saved at.
 *
 * Invoked by `POST /api/cron/collect-runs` on an external schedule
 * (cron-job.org). There is no queue in this project and nothing can run on an
 * in-process timer — the API is one serverless function.
 *
 * **Only models whose upstream published since our copy are fetched.** The
 * metadata Open-Meteo publishes per dataset is read once for the whole
 * collection and does not count against the API limits; `planCollection`
 * decides per point, and a skipped model's stored run is stamped `checked_at`
 * so readers know it is still current. See `modelMetadata.ts` for the mapping
 * and its backstop.
 *
 * **Locations run under `Promise.allSettled`, never sequentially.**
 * `fetchWithRetry` sleeps 1s + 2s + 4s across its attempts, so a serial loop
 * multiplies an upstream outage by the number of locations and walks into the
 * function's `maxDuration: 60`. Concurrency is safe because each place writes
 * only its own `point_key`.
 *
 * Idempotent: the run row upserts on `(point_key, model, fetched_at)` and the
 * hours upsert on their primary key, so a retried or overlapping schedule leaves
 * one row per hour rather than duplicates. A confirmation only moves
 * `checked_at` forward.
 */
export async function collectWeatherRuns(now: Date = new Date()): Promise<CollectResult> {
  const saved = await db
    .select({
      lat: locations.lat,
      lon: locations.lon,
      elevation_m: locations.elevation_m,
    })
    .from(locations)

  const result: CollectResult = {
    locations: saved.length,
    points: 0,
    runsStored: 0,
    hoursStored: 0,
    runsConfirmed: 0,
    failed: [],
    deterministicFailed: [],
    ensembleFailed: [],
    staleMetadata: [],
    unreadableMetadata: [],
  }

  if (saved.length === 0) {
    logger.info('[collectRuns] no locations to collect')
    return result
  }

  // Two users' copies of one crag are one place, fetched and stored once.
  const places = new Map<string, ForecastLocation>()
  for (const loc of saved) {
    const point: ForecastLocation = {
      lat: parseFloat(loc.lat),
      lon: parseFloat(loc.lon),
      elevation_m: loc.elevation_m === null ? null : parseFloat(loc.elevation_m),
    }
    places.set(pointKeyForPlace(point), point)
  }
  const points = [...places]
  result.points = points.length

  const [availability, stored] = await Promise.all([
    fetchAvailability(),
    newestFetches(points.map(([key]) => key)),
  ])
  result.staleMetadata = staleSources(availability.runs, now)
  result.unreadableMetadata = availability.unreadable

  const settled = await Promise.allSettled(
    points.map(async ([point_key, point]) => {
      const plan = planCollection(stored.get(point_key) ?? new Map(), availability.runs, now)
      const wanted = new Set<CollectedModel>(plan.fetch)
      const others = FORECAST_ONLY_MODELS.filter((m) => wanted.has(m))

      // The three upstream calls are independent, and one failing must not
      // cost the others. A request that is not needed resolves to null.
      const [thermalRun, otherRuns, ensemble] = await Promise.allSettled([
        wanted.has(THERMAL_MODEL) ? fetchThermalRun(point) : null,
        others.length > 0 ? fetchForecastOnlyRuns(point, others) : null,
        wanted.has('ensemble') ? fetchEnsembleRun(point) : null,
      ])

      let runsStored = 0
      let hoursStored = 0
      let deterministicOk = true

      for (const [label, run] of [
        ['thermal', thermalRun],
        ['forecast-only', otherRuns],
      ] as const) {
        if (run.status === 'rejected') {
          deterministicOk = false
          logger.warn(
            { pointKey: point_key, request: label, err: describe(run.reason) },
            '[collectRuns] deterministic fetch failed',
          )
          continue
        }
        if (run.value === null) continue
        const storedRuns = await storeDeterministicRun(point_key, run.value.result, run.value.rain)
        runsStored += storedRuns.length
        hoursStored += storedRuns.reduce((acc, s) => acc + s.hours, 0)
        if (run.value.result.unavailable_models.length > 0) {
          logger.debug(
            { pointKey: point_key, unavailable: run.value.result.unavailable_models.join(',') },
            '[collectRuns] models with no coverage at this point',
          )
        }
      }

      if (ensemble.status === 'fulfilled') {
        if (ensemble.value !== null) {
          const storedRun = await storeEnsembleRun(point_key, ensemble.value)
          if (storedRun) {
            runsStored += 1
            hoursStored += storedRun.hours
          }
        }
      } else {
        logger.warn(
          { pointKey: point_key, err: describe(ensemble.reason) },
          '[collectRuns] ensemble fetch failed',
        )
      }

      // Stamped as of the metadata read: at that moment nothing newer existed.
      const runsConfirmed = await confirmRuns(point_key, plan.confirm, now)

      // Every attempted fetch failing is a failure of the point, not a quiet
      // zero. A point with nothing to fetch attempted nothing and is fine.
      const attempted = [thermalRun, otherRuns, ensemble].filter(
        (r) => r.status === 'rejected' || r.value !== null,
      )
      if (attempted.length > 0 && attempted.every((r) => r.status === 'rejected')) {
        throw new Error(`every fetch failed for point ${point_key}`)
      }

      return {
        runsStored,
        hoursStored,
        runsConfirmed,
        deterministicOk,
        ensembleOk: ensemble.status === 'fulfilled',
      }
    }),
  )

  settled.forEach((entry, i) => {
    const key = points[i]?.[0] ?? 'unknown'
    if (entry.status === 'fulfilled') {
      result.runsStored += entry.value.runsStored
      result.hoursStored += entry.value.hoursStored
      result.runsConfirmed += entry.value.runsConfirmed
      // A location that stored *one* of its two runs is a partial collection,
      // and saying so is the whole point — see `CollectResult`.
      if (!entry.value.deterministicOk) result.deterministicFailed.push(key)
      if (!entry.value.ensembleOk) result.ensembleFailed.push(key)
      return
    }
    result.failed.push(key)
    logger.error(
      { pointKey: key, err: describe(entry.reason) },
      '[collectRuns] point failed',
    )
  })

  const problems =
    result.failed.length +
    result.deterministicFailed.length +
    result.ensembleFailed.length +
    result.staleMetadata.length +
    result.unreadableMetadata.length
  const summary = {
    ...result,
    failed: result.failed.length,
    deterministicFailed: result.deterministicFailed.length,
    ensembleFailed: result.ensembleFailed.length,
    staleMetadata: result.staleMetadata.join(','),
    unreadableMetadata: result.unreadableMetadata.join(','),
  }
  // **A half-collection logs at warn, not info.** It answered 200 and read as a
  // clean run for as long as nobody compared `hoursStored` against what a full
  // one produces.
  if (problems > 0) {
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
