import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { weatherEnsembleHours, weatherRunHours, weatherRuns } from '../../db/schema.js'
import { logger } from '../logger.js'
import {
  DETERMINISTIC_MODELS,
  fetchDeterministicHourly,
  fetchEnsembleRun,
  localTimeToUtc,
  type EnsembleHour,
  type ForecastLocation,
  type HourlyPoint,
} from '../weather/openMeteo.js'
import { pointKeyForPlace } from './pointKey.js'
import { ENSEMBLE_RUN_MODEL, storeDeterministicRun, storeEnsembleRun } from './storeRun.js'

/**
 * The read side of `weather_runs` — what a panel renders from.
 *
 * A panel is redrawn on **every** button tap: paging a day, switching a model,
 * changing the interval or the units all re-render from scratch. Fetching six
 * models and 143 ensemble members again for each of those would put an upstream
 * round trip inside a tap the client abandons at ~15 seconds, so a stored run
 * younger than `RUN_MAX_AGE_MINUTES` is used as-is and the age is printed on the
 * panel.
 *
 * When there is no fresh run — no cron registered yet, a location added since
 * the last collection, an ad-hoc point — the fetch happens here and the result
 * is written back. That write is **best effort**: a panel that rendered real
 * upstream data must not fail because the row could not be stored.
 *
 * Hours come back keyed by a real UTC instant rather than Open-Meteo's local
 * wall-clock string, so the stored path and the live path are the same shape and
 * the renderers cannot tell them apart. `utc_offset_seconds` travels with them
 * for the local-day bucketing.
 */

/**
 * When the most recently checked stored model is older than this, the
 * collection is not running and a panel fetches live. `collect-runs` checks
 * every model hourly, so a healthy database always clears it.
 */
export const RUN_MAX_AGE_MINUTES = 60

/**
 * A stored model not checked within this is left out and named unavailable.
 *
 * **Longer than `RUN_MAX_AGE_MINUTES` on purpose (issue #179).** One model's
 * fetch failing in one collection must not blank it for the next hour while
 * the previous hour's copy is still sitting there — the rock readings hang off
 * a single model, and losing it withheld every score at the crag. Three hours
 * tolerates two missed collections; the age travels with the model.
 */
export const STORED_MODEL_MAX_AGE_MINUTES = 180

/** One hour of one deterministic model, at a real instant. */
export type RunHour = Omit<HourlyPoint, 'valid_at_local'> & { valid_at: Date }

export type ModelRun = {
  readonly model: string
  readonly hours: readonly RunHour[]
  /**
   * **`null` means unknown, not "no".** A stored row that predates the flag, or
   * any run whose response did not answer the question, leaves it null, and a
   * renderer must then withhold the model's name from the probability column
   * rather than claim the field is that model's own.
   */
  readonly probability_is_shared: boolean | null
  /** When this model's run was fetched from upstream. */
  readonly fetched_at: Date
  /** When this run was last confirmed the newest upstream — see `weather_runs.checked_at`. */
  readonly checked_at: Date
}

export type DeterministicRuns = {
  readonly models: readonly ModelRun[]
  /**
   * Requested models with nothing to show at this point — no coverage from a
   * live fetch, no stored run from the cache. **Named on the panel, never
   * dropped**: a model that silently disappears makes the table look like it
   * read everything it asked for.
   */
  readonly unavailable_models: readonly string[]
  readonly utc_offset_seconds: number
  /**
   * The **oldest** `fetched_at` across `models` — **not** a model initialization
   * time. Models are fetched only when upstream changes, so this is routinely
   * hours old for a current forecast; `checked_at` is the freshness claim.
   */
  readonly fetched_at: Date | null
  /** The oldest `checked_at` across `models`: every one was current as of this. */
  readonly checked_at: Date | null
}

/**
 * One hour of the pooled ensemble, at a real instant.
 *
 * `members_wet` widens to nullable here and nowhere else: a freshly parsed hour
 * always has a wet count, but a stored row written before the column existed
 * does not, and **that is unknown rather than zero**. A 0 there would be a 0%
 * chance of rain nobody computed.
 */
export type EnsembleRunHour = Omit<EnsembleHour, 'valid_at_local' | 'members_wet'> & {
  valid_at: Date
  members_wet: number | null
}

export type EnsembleRuns = {
  readonly hours: readonly EnsembleRunHour[]
  readonly utc_offset_seconds: number
  readonly fetched_at: Date | null
  readonly checked_at: Date | null
}

function cutoffFrom(now: Date, maxAgeMinutes: number): Date {
  return new Date(now.getTime() - maxAgeMinutes * 60_000)
}

/** A run with no `checked_at` was last known current when it was fetched. */
const checkedAt = sql<Date>`coalesce(${weatherRuns.checked_at}, ${weatherRuns.fetched_at})`

type StoredRunRow = {
  id: string
  model: string
  shared: boolean | null
  offset: number
  fetched_at: Date
  checked_at: Date
}

/**
 * The newest run of each model at a point that was checked at or after
 * `cutoff`.
 *
 * **Per model, not per batch.** Models are fetched only when upstream changes,
 * so one point's current runs carry different `fetched_at`s by design, and a
 * collection whose fetch failed for one model must not hide that model's
 * previous copy (issue #179). Each model carries its own age instead.
 */
async function newestRunPerModel(
  pointKey: string,
  kind: 'deterministic' | 'ensemble',
  cutoff: Date,
): Promise<StoredRunRow[]> {
  const rows = await db
    .selectDistinctOn([weatherRuns.model], {
      id: weatherRuns.id,
      model: weatherRuns.model,
      shared: weatherRuns.precip_prob_is_shared,
      offset: weatherRuns.utc_offset_seconds,
      fetched_at: weatherRuns.fetched_at,
      checked_at: checkedAt,
    })
    .from(weatherRuns)
    .where(
      and(
        eq(weatherRuns.point_key, pointKey),
        eq(weatherRuns.kind, kind),
        gte(checkedAt, cutoff),
      ),
    )
    .orderBy(weatherRuns.model, desc(weatherRuns.fetched_at))

  // A raw `sql` column comes back as the driver's string, not a Date.
  return rows.map((r) => ({ ...r, checked_at: new Date(r.checked_at) }))
}

function oldest(dates: readonly Date[]): Date | null {
  let out: Date | null = null
  for (const d of dates) if (out === null || d.getTime() < out.getTime()) out = d
  return out
}

function newest(dates: readonly Date[]): Date | null {
  let out: Date | null = null
  for (const d of dates) if (out === null || d.getTime() > out.getTime()) out = d
  return out
}

/**
 * The newest stored run of each deterministic model checked at or after
 * `cutoff`, or `null` when there is none.
 *
 * Exported for `npm run check:weather-runs`, which is the only thing that can
 * see this at all: vitest never opens a connection, so the per-model
 * selection, the cutoff and the nulls surviving as nulls are invisible to the
 * test suite.
 */
export async function loadStoredDeterministic(
  pointKey: string,
  cutoff: Date,
): Promise<DeterministicRuns | null> {
  const runs = await newestRunPerModel(pointKey, 'deterministic', cutoff)
  if (runs.length === 0) return null

  const hours = await db
    .select()
    .from(weatherRunHours)
    .where(
      inArray(
        weatherRunHours.run_id,
        runs.map((r) => r.id),
      ),
    )
    .orderBy(asc(weatherRunHours.valid_at))

  const byRun = new Map<string, RunHour[]>()
  for (const h of hours) {
    const bucket = byRun.get(h.run_id)
    const row: RunHour = {
      valid_at: h.valid_at,
      temp_c: h.temp_c,
      dewpoint_c: h.dewpoint_c,
      humidity_pct: h.humidity_pct,
      precip_mm: h.precip_mm,
      wind_kmh: h.wind_kmh,
      wind_gust_kmh: h.wind_gust_kmh,
      wind_dir_deg: h.wind_dir_deg,
      cloud_pct: h.cloud_pct,
      precip_prob_pct: h.precip_prob_pct,
      pressure_hpa: h.pressure_hpa,
      shortwave_wm2: h.shortwave_wm2,
    }
    if (bucket) bucket.push(row)
    else byRun.set(h.run_id, [row])
  }

  const models: ModelRun[] = runs.map((r) => ({
    model: r.model,
    hours: byRun.get(r.id) ?? [],
    probability_is_shared: r.shared,
    fetched_at: r.fetched_at,
    checked_at: r.checked_at,
  }))
  const present = new Set(models.map((m) => m.model))

  return {
    models,
    // Derived from what is actually stored. A model with no recent run was
    // either out of coverage or failing to fetch — both mean nothing can be
    // shown for it, which is what the panel says.
    unavailable_models: DETERMINISTIC_MODELS.filter((m) => !present.has(m)),
    utc_offset_seconds: runs[0]?.offset ?? 0,
    fetched_at: oldest(runs.map((r) => r.fetched_at)),
    checked_at: oldest(runs.map((r) => r.checked_at)),
  }
}

/**
 * Whether a stored read can be served without fetching: something in it was
 * checked inside `RUN_MAX_AGE_MINUTES`, so the collection is running. Models
 * checked earlier than that are still served, with their age.
 */
function collectionIsRunning(latestCheck: Date | null, now: Date): boolean {
  return latestCheck !== null && latestCheck.getTime() >= cutoffFrom(now, RUN_MAX_AGE_MINUTES).getTime()
}

/**
 * A stored read that fails is treated as nothing stored, so the caller fetches
 * live — the same tolerance the write-back already has. Without it a database
 * fault fails the whole request while a working upstream sits one call away.
 */
async function storedOrNull<T>(pointKey: string, load: () => Promise<T | null>): Promise<T | null> {
  try {
    return await load()
  } catch (err) {
    logger.warn(
      { pointKey, err: err instanceof Error ? err.message : String(err) },
      '[latestRuns] could not read stored runs — fetching live',
    )
    return null
  }
}

/**
 * The newest deterministic run of each model for a point: stored while the
 * collection is running, fetched and written back otherwise.
 *
 * @throws {Error} only when the upstream fetch fails and there was nothing
 * stored inside `STORED_MODEL_MAX_AGE_MINUTES`. A storage failure is logged and
 * the live data is still returned.
 */
export async function getDeterministicRuns(
  point: ForecastLocation,
  now: Date = new Date(),
): Promise<DeterministicRuns> {
  const pointKey = pointKeyForPlace(point)
  const stored = await storedOrNull(pointKey, () =>
    loadStoredDeterministic(pointKey, cutoffFrom(now, STORED_MODEL_MAX_AGE_MINUTES)),
  )
  if (stored !== null && collectionIsRunning(newest(stored.models.map((m) => m.checked_at)), now)) {
    return stored
  }

  let result: Awaited<ReturnType<typeof fetchDeterministicHourly>>
  try {
    result = await fetchDeterministicHourly(point, DETERMINISTIC_MODELS)
  } catch (err) {
    // Older stored runs, each labelled with its own age, beat an error page.
    if (stored !== null) return stored
    throw err
  }

  try {
    await storeDeterministicRun(pointKey, result)
  } catch (err) {
    logger.warn(
      { pointKey, err: err instanceof Error ? err.message : String(err) },
      '[latestRuns] could not persist a deterministic run — rendering it anyway',
    )
  }

  return {
    models: result.models.map((m) => ({
      model: m.model,
      hours: toRunHours(m.hours, result.utc_offset_seconds),
      probability_is_shared: m.probability_is_shared,
      fetched_at: result.fetched_at,
      checked_at: result.fetched_at,
    })),
    unavailable_models: result.unavailable_models,
    utc_offset_seconds: result.utc_offset_seconds,
    fetched_at: result.fetched_at,
    checked_at: result.fetched_at,
  }
}

/**
 * An unparseable local timestamp drops its hour rather than becoming the epoch —
 * the same rule `storeRun` applies, so what is rendered live and what is
 * rendered from storage stay identical.
 */
function toRunHours(hours: readonly HourlyPoint[], utcOffsetSeconds: number): RunHour[] {
  const out: RunHour[] = []
  for (const h of hours) {
    const valid_at = localTimeToUtc(h.valid_at_local, utcOffsetSeconds)
    if (valid_at === null) continue
    const { valid_at_local: _local, ...values } = h
    out.push({ valid_at, ...values })
  }
  return out
}

/** The freshest stored ensemble run, or `null`. Exported for the acceptance script, as above. */
export async function loadStoredEnsemble(
  pointKey: string,
  cutoff: Date,
): Promise<EnsembleRuns | null> {
  const runs = await newestRunPerModel(pointKey, 'ensemble', cutoff)
  const run = runs.find((r) => r.model === ENSEMBLE_RUN_MODEL)
  if (!run) return null

  const rows = await db
    .select()
    .from(weatherEnsembleHours)
    .where(eq(weatherEnsembleHours.run_id, run.id))
    .orderBy(asc(weatherEnsembleHours.valid_at))

  return {
    hours: rows.map((r) => ({
      valid_at: r.valid_at,
      precip_mm_p10: r.precip_mm_p10,
      precip_mm_p50: r.precip_mm_p50,
      precip_mm_p90: r.precip_mm_p90,
      temp_c_p10: r.temp_c_p10,
      temp_c_p50: r.temp_c_p50,
      temp_c_p90: r.temp_c_p90,
      wind_kmh_p10: r.wind_kmh_p10,
      wind_kmh_p50: r.wind_kmh_p50,
      wind_kmh_p90: r.wind_kmh_p90,
      precip_mm_mean: r.precip_mm_mean,
      // A row stored before the column existed. Null is carried through as
      // unknown so the odds are withheld rather than shown as 0%.
      members_wet: r.members_wet,
      member_count: r.member_count,
      model_member_counts: asCounts(r.model_member_counts),
    })),
    utc_offset_seconds: run.offset,
    fetched_at: run.fetched_at,
    checked_at: run.checked_at,
  }
}

/**
 * `jsonb` is `unknown` to the driver. Anything that is not a record of finite
 * numbers becomes an empty map — the counts name which models still reach an
 * hour, and a malformed value must not be able to name one that did not.
 */
function asCounts(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [model, count] of Object.entries(value)) {
    if (typeof count === 'number' && Number.isFinite(count)) out[model] = count
  }
  return out
}

/**
 * The freshest ensemble run for a point, with the same stored-or-fetch rule.
 *
 * `members_wet` on a row that is `null` stays null all the way to the renderer:
 * "no wet count recorded" and "no member expects rain" are different facts and
 * only one of them is a 0% chance.
 *
 * @throws {Error} only when the upstream fetch fails with nothing stored inside
 * `STORED_MODEL_MAX_AGE_MINUTES`.
 */
export async function getEnsembleRuns(
  point: ForecastLocation,
  now: Date = new Date(),
): Promise<EnsembleRuns> {
  const pointKey = pointKeyForPlace(point)
  const stored = await storedOrNull(pointKey, () =>
    loadStoredEnsemble(pointKey, cutoffFrom(now, STORED_MODEL_MAX_AGE_MINUTES)),
  )
  if (stored !== null && collectionIsRunning(stored.checked_at, now)) return stored

  let run: Awaited<ReturnType<typeof fetchEnsembleRun>>
  try {
    run = await fetchEnsembleRun(point)
  } catch (err) {
    if (stored !== null) return stored
    throw err
  }

  try {
    await storeEnsembleRun(pointKey, run)
  } catch (err) {
    logger.warn(
      { pointKey, err: err instanceof Error ? err.message : String(err) },
      '[latestRuns] could not persist an ensemble run — rendering it anyway',
    )
  }

  const offset = run.daily.utc_offset_seconds
  const hours: EnsembleRunHour[] = []
  for (const h of run.hours) {
    const valid_at = localTimeToUtc(h.valid_at_local, offset)
    if (valid_at === null) continue
    const { valid_at_local: _local, ...values } = h
    hours.push({ valid_at, ...values })
  }

  return { hours, utc_offset_seconds: offset, fetched_at: run.fetched_at, checked_at: run.fetched_at }
}
