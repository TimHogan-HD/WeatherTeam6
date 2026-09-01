import { eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { weatherEnsembleHours, weatherRunHours, weatherRuns } from '../../db/schema.js'
import {
  localTimeToUtc,
  type DeterministicResult,
  type EnsembleHour,
  type EnsembleRun,
  type ModelHourly,
} from '../weather/openMeteo.js'

/**
 * Rows are written in chunks so one model's 384 hours never becomes a single
 * statement with thousands of bind parameters — Postgres caps those at 65535,
 * and a deterministic hour carries eleven columns.
 */
const INSERT_CHUNK = 400

function chunked<T>(rows: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

export type StoredRun = {
  run_id: string
  model: string
  hours: number
}

/**
 * An hour with no values at all is **not stored**.
 *
 * Open-Meteo pads every model's arrays out to the longest horizon in the
 * request, so a 54-hour HRRR run arrives with 330 empty trailing hours. An
 * absent row and an all-null row mean the same thing to every reader — no data
 * for that hour — and one of them costs 330 rows per run per model.
 */
function hasAnyValue(values: (number | null)[]): boolean {
  return values.some((v) => v !== null)
}

/**
 * Insert or update the parent run row and return its id.
 *
 * The unique key is `(point_key, model, fetched_at)`, so a cron that is retried
 * — or that overlaps itself — updates one row rather than accumulating
 * duplicates. `fetched_at` comes from the fetch, not from `now()`, which is what
 * makes the retry land on the same key.
 */
async function upsertRun(values: typeof weatherRuns.$inferInsert): Promise<string | null> {
  const inserted = await db
    .insert(weatherRuns)
    .values(values)
    .onConflictDoUpdate({
      target: [weatherRuns.point_key, weatherRuns.model, weatherRuns.fetched_at],
      set: {
        location_id: values.location_id ?? null,
        kind: values.kind,
        utc_offset_seconds: values.utc_offset_seconds,
        model_elevation_m: values.model_elevation_m ?? null,
        precip_prob_is_shared: values.precip_prob_is_shared ?? null,
        raw: values.raw ?? null,
      },
    })
    .returning({ id: weatherRuns.id })

  return inserted[0]?.id ?? null
}

async function storeOneModel(
  model: ModelHourly,
  base: Omit<typeof weatherRuns.$inferInsert, 'model' | 'kind' | 'precip_prob_is_shared'>,
  utcOffsetSeconds: number,
): Promise<StoredRun | null> {
  const runId = await upsertRun({
    ...base,
    model: model.model,
    kind: 'deterministic',
    precip_prob_is_shared: model.probability_is_shared,
  })
  if (!runId) return null

  const rows: (typeof weatherRunHours.$inferInsert)[] = []
  for (const h of model.hours) {
    const valid_at = localTimeToUtc(h.valid_at_local, utcOffsetSeconds)
    // A timestamp that would not parse is a gap, not hour zero. Dropping the row
    // loses one hour; storing it under the epoch corrupts every window query.
    if (valid_at === null) continue

    const values = [
      h.temp_c,
      h.dewpoint_c,
      h.humidity_pct,
      h.precip_mm,
      h.wind_kmh,
      h.wind_gust_kmh,
      h.wind_dir_deg,
      h.cloud_pct,
      h.precip_prob_pct,
      h.pressure_hpa,
    ]
    if (!hasAnyValue(values)) continue

    rows.push({
      run_id: runId,
      valid_at,
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
    })
  }

  for (const chunk of chunked(rows, INSERT_CHUNK)) {
    await db
      .insert(weatherRunHours)
      .values(chunk)
      // Same run, same hour, re-collected: overwrite rather than fail. The PK is
      // (run_id, valid_at), so this is the retry path, not a merge of two runs.
      .onConflictDoUpdate({
        target: [weatherRunHours.run_id, weatherRunHours.valid_at],
        set: {
          temp_c: sqlExcluded('temp_c'),
          dewpoint_c: sqlExcluded('dewpoint_c'),
          humidity_pct: sqlExcluded('humidity_pct'),
          precip_mm: sqlExcluded('precip_mm'),
          wind_kmh: sqlExcluded('wind_kmh'),
          wind_gust_kmh: sqlExcluded('wind_gust_kmh'),
          wind_dir_deg: sqlExcluded('wind_dir_deg'),
          cloud_pct: sqlExcluded('cloud_pct'),
          precip_prob_pct: sqlExcluded('precip_prob_pct'),
          pressure_hpa: sqlExcluded('pressure_hpa'),
        },
      })
  }

  return { run_id: runId, model: model.model, hours: rows.length }
}

/**
 * Persist one deterministic fetch — one `weather_runs` row **per model**, plus
 * that model's hours.
 *
 * Models the point does not reach are not stored: their absence is the coverage
 * signal, and `result.unavailable_models` is what names them to the caller. A
 * stored empty run would be indistinguishable from a model that answered with
 * nothing.
 *
 * `raw` stays null here. Every deterministic variable requested has a column on
 * `weather_run_hours`, so the parsed rows are the whole payload — and one
 * response covering six models would otherwise be stored six times to preserve
 * nothing. Only the ensemble keeps its raw payload, where three percentiles
 * genuinely discard 143 members.
 */
export async function storeDeterministicRun(
  point_key: string,
  location_id: string | null,
  result: DeterministicResult,
): Promise<StoredRun[]> {
  const base = {
    point_key,
    location_id,
    fetched_at: result.fetched_at,
    utc_offset_seconds: result.utc_offset_seconds,
    model_elevation_m: result.model_elevation_m,
    raw: null,
  }

  const stored: StoredRun[] = []
  for (const model of result.models) {
    const one = await storeOneModel(model, base, result.utc_offset_seconds)
    if (one) stored.push(one)
  }
  return stored
}

/** Persist one ensemble fetch as a single run whose hours are percentiles. */
export async function storeEnsembleRun(
  point_key: string,
  location_id: string | null,
  run: EnsembleRun,
): Promise<StoredRun | null> {
  const runId = await upsertRun({
    point_key,
    location_id,
    model: ENSEMBLE_RUN_MODEL,
    kind: 'ensemble',
    fetched_at: run.fetched_at,
    utc_offset_seconds: run.daily.utc_offset_seconds,
    model_elevation_m: null,
    // Not applicable to an ensemble run, and null here means exactly that.
    precip_prob_is_shared: null,
    raw: run.raw ?? null,
  })
  if (!runId) return null

  const rows: (typeof weatherEnsembleHours.$inferInsert)[] = []
  for (const h of run.hours) {
    const valid_at = localTimeToUtc(h.valid_at_local, run.daily.utc_offset_seconds)
    if (valid_at === null) continue
    // No members reported at this hour: every percentile is null and the row
    // would assert nothing. Past the 168h horizon that is most of them.
    if (h.member_count === 0) continue
    rows.push(ensembleRow(runId, valid_at, h))
  }

  for (const chunk of chunked(rows, INSERT_CHUNK)) {
    await db
      .insert(weatherEnsembleHours)
      .values(chunk)
      .onConflictDoUpdate({
        target: [weatherEnsembleHours.run_id, weatherEnsembleHours.valid_at],
        set: {
          precip_mm_p10: sqlExcluded('precip_mm_p10'),
          precip_mm_p50: sqlExcluded('precip_mm_p50'),
          precip_mm_p90: sqlExcluded('precip_mm_p90'),
          temp_c_p10: sqlExcluded('temp_c_p10'),
          temp_c_p50: sqlExcluded('temp_c_p50'),
          temp_c_p90: sqlExcluded('temp_c_p90'),
          wind_kmh_p10: sqlExcluded('wind_kmh_p10'),
          wind_kmh_p50: sqlExcluded('wind_kmh_p50'),
          wind_kmh_p90: sqlExcluded('wind_kmh_p90'),
          precip_mm_mean: sqlExcluded('precip_mm_mean'),
          members_wet: sqlExcluded('members_wet'),
          member_count: sqlExcluded('member_count'),
          model_member_counts: sqlExcluded('model_member_counts'),
        },
      })
  }

  return { run_id: runId, model: ENSEMBLE_RUN_MODEL, hours: rows.length }
}

function ensembleRow(
  run_id: string,
  valid_at: Date,
  h: EnsembleHour,
): typeof weatherEnsembleHours.$inferInsert {
  return {
    run_id,
    valid_at,
    precip_mm_p10: h.precip_mm_p10,
    precip_mm_p50: h.precip_mm_p50,
    precip_mm_p90: h.precip_mm_p90,
    temp_c_p10: h.temp_c_p10,
    temp_c_p50: h.temp_c_p50,
    temp_c_p90: h.temp_c_p90,
    wind_kmh_p10: h.wind_kmh_p10,
    wind_kmh_p50: h.wind_kmh_p50,
    wind_kmh_p90: h.wind_kmh_p90,
    precip_mm_mean: h.precip_mm_mean,
    members_wet: h.members_wet,
    member_count: h.member_count,
    model_member_counts: h.model_member_counts,
  }
}

/**
 * The `model` value an ensemble run is stored under.
 *
 * `weather_runs.model` holds a deterministic model name for every other row, so
 * the ensemble needs a name that cannot collide with one. It is a constant
 * rather than a literal at each call site because the unique key depends on it.
 */
export const ENSEMBLE_RUN_MODEL = 'ensemble'

/**
 * The `excluded.<column>` reference an upsert's `SET` clause needs.
 *
 * Drizzle exposes this as `sql`, and building it once here keeps the two upserts
 * above readable. The column name is interpolated as a raw identifier, so it is
 * only ever called with the literals in this file.
 */
function sqlExcluded(column: string): ReturnType<typeof sql.raw> {
  return sql.raw(`excluded."${column}"`)
}

/**
 * Delete every run for a point that is older than the cutoff, children first.
 *
 * Exported for the acceptance script, which needs to clean up after itself
 * without reaching into three tables by hand.
 */
export async function deleteRunsForPoint(point_key: string): Promise<number> {
  return db.transaction(async (tx) => {
    const runs = await tx
      .select({ id: weatherRuns.id })
      .from(weatherRuns)
      .where(eq(weatherRuns.point_key, point_key))
    if (runs.length === 0) return 0

    const ids = runs.map((r) => r.id)
    await tx.delete(weatherEnsembleHours).where(inArray(weatherEnsembleHours.run_id, ids))
    await tx.delete(weatherRunHours).where(inArray(weatherRunHours.run_id, ids))
    await tx.delete(weatherRuns).where(eq(weatherRuns.point_key, point_key))
    return ids.length
  })
}
