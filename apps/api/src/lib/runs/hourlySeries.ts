import type {
  HourlyDay,
  HourlyModel,
  HourlyModelSample,
  HourlySample,
  HourlySeries,
} from '@weatherteam6/types'
import { localDateString } from '../weather/openMeteo.js'
import type {
  DeterministicRuns,
  EnsembleRunHour,
  EnsembleRuns,
  ModelRun,
  RunHour,
} from './latestRuns.js'

/**
 * The shape of `GET /api/v1/hourly/:locationId`, built from data that is already in hand.
 *
 * **Everything here is pure, and the import of `latestRuns` above is deliberately
 * type-only.** That module reaches `db/index.ts`, which throws at import time when
 * `DATABASE_URL` is unset — so a value import would make this file, and every test of it,
 * unloadable under vitest. `forecastTable.ts` is type-only against the same module for
 * the same reason. The fetching half lives in `fetchHourlySeries.ts`.
 *
 * What that buys: model selection, the instant join, local-day bucketing and the window
 * are all reachable from the test suite. What it does not: nothing here proves a row
 * round-trips through Postgres with its nulls intact — that is `npm run check:hourly`.
 */

/** How many local days the window covers, counting the location's today as the first. */
export const WINDOW_DAYS = 7

/**
 * Whether this hour carries anything the named model actually said.
 *
 * The same rule as `dayHasData` in `lib/telegram/forecastTable.ts`, and it excludes
 * `precip_prob_pct` for the same measured reason: that series runs past the horizon of
 * the model it was requested with — Probe A saw it at 276 h against HRRR's 54 h — so it
 * cannot be the evidence that the model answered. Counting it would call 200 hours of
 * em dashes a forecast.
 */
export function hourHasModelData(h: RunHour): boolean {
  return (
    h.temp_c != null ||
    h.dewpoint_c != null ||
    h.humidity_pct != null ||
    h.precip_mm != null ||
    h.wind_kmh != null ||
    h.wind_gust_kmh != null ||
    h.wind_dir_deg != null ||
    h.cloud_pct != null ||
    h.pressure_hpa != null
  )
}

function ensembleHourHasData(h: EnsembleRunHour): boolean {
  return (
    h.temp_c_p50 != null ||
    h.temp_c_p10 != null ||
    h.temp_c_p90 != null ||
    h.wind_kmh_p50 != null ||
    h.precip_mm_mean != null
  )
}

/**
 * The deterministic model with the most hours that carry real values, or `null`.
 *
 * **By measured coverage, never by request order.** The models reach different distances
 * and Open-Meteo pads them all to the longest horizon in the request, so "the first model
 * in the list" and "the model that answered" are different models at most points. Ties
 * break by the order in `models`, which is `DETERMINISTIC_MODELS` order, so the choice is
 * deterministic rather than dependent on however the rows came back from Postgres.
 *
 * A model with zero usable hours never wins — `null` is returned instead, and the caller
 * leaves every deterministic column null rather than borrowing another model's numbers.
 */
export function selectModelByCoverage(models: readonly ModelRun[]): ModelRun | null {
  let best: ModelRun | null = null
  let bestCount = 0

  for (const m of models) {
    let count = 0
    for (const h of m.hours) if (hourHasModelData(h)) count++
    // Strictly greater, so an earlier model in DETERMINISTIC_MODELS order wins a tie.
    if (count > bestCount) {
      best = m
      bestCount = count
    }
  }

  return bestCount > 0 ? best : null
}

/**
 * The local calendar dates the window covers: the location's today, then the next
 * `WINDOW_DAYS - 1`.
 *
 * Derived by walking UTC days forward from the local midnight of today rather than by
 * string arithmetic on `YYYY-MM-DD`, so month and year rollover come from `Date` instead
 * of from hand-written modulo.
 */
export function windowDates(now: Date, utcOffsetSeconds: number, days = WINDOW_DAYS): string[] {
  const out: string[] = []
  const DAY_MS = 24 * 60 * 60 * 1000
  for (let i = 0; i < days; i++) {
    out.push(localDateString(new Date(now.getTime() + i * DAY_MS), utcOffsetSeconds))
  }
  return out
}

/**
 * Members at or above the measurable threshold, as a whole percent of the members that
 * reached this hour.
 *
 * **Null means unknown and must survive as null.** `members_wet` is null on any row
 * stored before the column existed, and `member_count` is 0 for an hour no member
 * reached — dividing either would produce a confident 0% that nobody computed.
 */
export function precipChancePct(membersWet: number | null, memberCount: number | null): number | null {
  if (membersWet === null || memberCount === null || memberCount <= 0) return null
  return Math.round((membersWet / memberCount) * 100)
}

/**
 * The **older** of the two runs behind the joined series, skipping a null.
 *
 * The response is one object built from two runs that are cached and refetched
 * independently (`RUN_MAX_AGE_MINUTES` each), so they can be up to an hour apart. A
 * surface printing this as "fetched N min ago" is making a freshness claim about what the
 * reader is looking at, and the older run is what bounds that: preferring the deterministic
 * one — which is what this did until 2026-09-15 — let a chart drawn entirely from ensemble
 * columns report the age of a run it does not draw.
 */
export function olderFetch(a: Date | null, b: Date | null): Date | null {
  if (a === null) return b
  if (b === null) return a
  return a.getTime() <= b.getTime() ? a : b
}

function toSample(
  validAt: Date,
  localDate: string,
  det: RunHour | undefined,
  ens: EnsembleRunHour | undefined,
): HourlySample {
  return {
    valid_at: validAt.toISOString(),
    local_date: localDate,

    temp_c: det?.temp_c ?? null,
    dewpoint_c: det?.dewpoint_c ?? null,
    humidity_pct: det?.humidity_pct ?? null,
    precip_mm: det?.precip_mm ?? null,
    wind_kmh: det?.wind_kmh ?? null,
    wind_gust_kmh: det?.wind_gust_kmh ?? null,
    wind_dir_deg: det?.wind_dir_deg ?? null,
    cloud_pct: det?.cloud_pct ?? null,
    pressure_hpa: det?.pressure_hpa ?? null,

    temp_c_p10: ens?.temp_c_p10 ?? null,
    temp_c_p50: ens?.temp_c_p50 ?? null,
    temp_c_p90: ens?.temp_c_p90 ?? null,
    wind_kmh_p10: ens?.wind_kmh_p10 ?? null,
    wind_kmh_p50: ens?.wind_kmh_p50 ?? null,
    wind_kmh_p90: ens?.wind_kmh_p90 ?? null,
    precip_mm_mean: ens?.precip_mm_mean ?? null,
    // The spread behind the mean. Stored per hour since the column existed;
    // exposed here so a chart can draw it. See the type for why they must never
    // be summed.
    precip_mm_p10: ens?.precip_mm_p10 ?? null,
    precip_mm_p90: ens?.precip_mm_p90 ?? null,
    precip_chance_pct:
      ens === undefined ? null : precipChancePct(ens.members_wet, ens.member_count),
    member_count: ens?.member_count ?? null,
  }
}

function toModelSample(validAt: Date, det: RunHour | undefined): HourlyModelSample {
  return {
    valid_at: validAt.toISOString(),
    temp_c: det?.temp_c ?? null,
    dewpoint_c: det?.dewpoint_c ?? null,
    humidity_pct: det?.humidity_pct ?? null,
    precip_mm: det?.precip_mm ?? null,
    wind_kmh: det?.wind_kmh ?? null,
    wind_gust_kmh: det?.wind_gust_kmh ?? null,
    wind_dir_deg: det?.wind_dir_deg ?? null,
    cloud_pct: det?.cloud_pct ?? null,
    pressure_hpa: det?.pressure_hpa ?? null,
  }
}

export type BuildInput = {
  locationId: string
  deterministic: DeterministicRuns
  ensemble: EnsembleRuns
  /** Whether to include every model that answered. `?models=all`. */
  allModels: boolean
  now: Date
}

/**
 * Join one deterministic model and the pooled ensemble onto a single time axis, windowed
 * to the location's next `WINDOW_DAYS` local days.
 *
 * Pure. Every input is data and every output is data — which is the only reason any of
 * this is reachable from the test suite.
 */
export function buildHourlySeries(input: BuildInput): HourlySeries {
  const { locationId, deterministic, ensemble, allModels, now } = input

  // Bucket by the deterministic batch's offset when there *is* one, and fall back to the
  // ensemble's only when no model was stored at all.
  //
  // Keyed on `models.length`, not on the offset being truthy: `loadStoredDeterministic`
  // returns 0 for "no rows", and 0 is also the real offset of every location on UTC —
  // Iceland, Ghana, Britain in winter. A `||` here would silently take the ensemble's
  // offset for those, which is the same class of defect as a null rendering as a value.
  const offset =
    deterministic.models.length > 0
      ? deterministic.utc_offset_seconds
      : ensemble.utc_offset_seconds

  const chosen = selectModelByCoverage(deterministic.models)
  const dates = windowDates(now, offset)
  const inWindow = new Set(dates)

  const detByInstant = new Map<number, RunHour>()
  if (chosen !== null) for (const h of chosen.hours) detByInstant.set(h.valid_at.getTime(), h)

  const ensByInstant = new Map<number, EnsembleRunHour>()
  for (const h of ensemble.hours) ensByInstant.set(h.valid_at.getTime(), h)

  // The axis is the union of both sources, so an hour present in only one keeps nulls on
  // the other side rather than being dropped.
  const instants: number[] = []
  const seen = new Set<number>()
  for (const t of [...detByInstant.keys(), ...ensByInstant.keys()]) {
    if (seen.has(t)) continue
    seen.add(t)
    if (inWindow.has(localDateString(new Date(t), offset))) instants.push(t)
  }
  instants.sort((a, b) => a - b)

  const hours: HourlySample[] = []
  const detDates = new Set<string>()
  const ensDates = new Set<string>()

  for (const t of instants) {
    const at = new Date(t)
    const localDate = localDateString(at, offset)
    const det = detByInstant.get(t)
    const ens = ensByInstant.get(t)

    // A day counts as covered only when a value was actually returned for it — an hour
    // padded out past a model's horizon carries nulls and must not mark the day.
    if (det !== undefined && hourHasModelData(det)) detDates.add(localDate)
    if (ens !== undefined && ensembleHourHasData(ens)) ensDates.add(localDate)

    hours.push(toSample(at, localDate, det, ens))
  }

  const days: HourlyDay[] = dates.map((local_date) => ({
    local_date,
    has_deterministic: detDates.has(local_date),
    has_ensemble: ensDates.has(local_date),
  }))

  const series: HourlySeries = {
    location_id: locationId,
    utc_offset_seconds: offset,
    fetched_at: olderFetch(deterministic.fetched_at, ensemble.fetched_at)?.toISOString() ?? null,
    model: chosen?.model ?? null,
    unavailable_models: [...deterministic.unavailable_models],
    hours,
    days,
  }

  if (allModels) {
    series.models = deterministic.models.map((m): HourlyModel => {
      const byInstant = new Map<number, RunHour>()
      for (const h of m.hours) byInstant.set(h.valid_at.getTime(), h)

      let withData = 0
      const modelHours = instants.map((t) => {
        const h = byInstant.get(t)
        if (h !== undefined && hourHasModelData(h)) withData++
        return toModelSample(new Date(t), h)
      })

      return {
        model: m.model,
        probability_is_shared: m.probability_is_shared,
        hours_with_data: withData,
        hours: modelHours,
      }
    })
  }

  return series
}
