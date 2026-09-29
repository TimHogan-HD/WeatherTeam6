import { logger } from '../logger.js'
import { DETERMINISTIC_MODELS, fetchWithRetry, type DeterministicModel } from './openMeteo.js'

/**
 * Which of Open-Meteo's published datasets feed each run we store, so
 * `collect-runs` can skip a model that has not published since our copy.
 *
 * ## The mapping is ours, not Open-Meteo's
 *
 * Open-Meteo publishes a small `meta.json` per **dataset** (`ncep_gfs013`,
 * `dwd_icon_d2`) giving when its last run became available. The names we fetch
 * (`gfs_seamless`, `icon_seamless`) are **blends** of several datasets, and
 * Open-Meteo does not document which. A blend counts as changed when any one of
 * its parts changed, so a part missing from this table makes a blend look
 * frozen. Listing a part that never reaches a point (`dwd_icon_d2` outside
 * central Europe) only costs a refetch — the safe direction.
 *
 * ## The names drift
 *
 * `cmc_gem_gdps` and `cmc_gem_rdps` both stopped updating in May 2026 while the
 * models carried on as `cmc_gem_gdps_15km` and `cmc_gem_rdps_10km` (measured
 * 2026-09-28). A retired name reads as "no new run, ever". Two things stop that
 * from freezing a forecast: `REFETCH_BACKSTOP_MS` refetches regardless, and
 * `staleSources` names the entry on every collection so the rename shows up in
 * the cron's own response rather than in a forecast someone notices is old.
 */

export type MetadataHost = 'forecast' | 'ensemble'

export type MetadataSource = { readonly host: MetadataHost; readonly dataset: string }

/** The pooled ensemble is stored as one run under this name — `ENSEMBLE_RUN_MODEL`. */
export type CollectedModel = DeterministicModel | 'ensemble'

const f = (dataset: string): MetadataSource => ({ host: 'forecast', dataset })
const e = (dataset: string): MetadataSource => ({ host: 'ensemble', dataset })

/**
 * `gfs_seamless` includes HRRR over the US (Open-Meteo's docs say so), which is
 * why it changes hourly there. The ensemble is one request pooling four
 * models, so it is one entry holding every part of all four.
 */
export const MODEL_SOURCES: Readonly<Record<CollectedModel, readonly MetadataSource[]>> = {
  gfs_seamless: [f('ncep_gfs013'), f('ncep_gfs025'), f('ncep_hrrr_conus')],
  ecmwf_ifs025: [f('ecmwf_ifs025')],
  icon_seamless: [f('dwd_icon'), f('dwd_icon_eu'), f('dwd_icon_d2')],
  gem_seamless: [f('cmc_gem_gdps_15km'), f('cmc_gem_rdps_10km'), f('cmc_gem_hrdps')],
  ncep_hrrr_conus: [f('ncep_hrrr_conus')],
  ncep_nbm_conus: [f('ncep_nbm_conus')],
  ensemble: [
    e('ncep_gefs025'),
    e('ncep_gefs05'),
    e('ecmwf_ifs025_ensemble'),
    e('dwd_icon_eps'),
    e('dwd_icon_eu_eps'),
    e('dwd_icon_d2_eps'),
    e('cmc_gem_geps'),
  ],
}

export const COLLECTED_MODELS: readonly CollectedModel[] = [...DETERMINISTIC_MODELS, 'ensemble']

/**
 * Refetch a model this long after our copy was fetched, whatever the metadata
 * says. The slowest parts publish every 12 h and most every 6, so a model
 * skipped for longer than this is more likely a wrong mapping than a quiet
 * model. It also keeps every newest run well inside `pruneRuns`' 2-day window.
 */
export const REFETCH_BACKSTOP_MS = 6 * 60 * 60 * 1000

/**
 * A dataset whose last run is older than this is reported as stale. Twice the
 * slowest cadence in the table (12 h), plus room for one late run.
 */
export const STALE_AFTER_MS = 36 * 60 * 60 * 1000

export type DatasetRun = {
  /** When Open-Meteo made the dataset's latest data available. */
  readonly availableAt: Date
}

/** Keyed by `sourceKey`. A source that could not be read is absent. */
export type Availability = ReadonlyMap<string, DatasetRun>

export function sourceKey(source: MetadataSource): string {
  return `${source.host}:${source.dataset}`
}

const HOSTS: Record<MetadataHost, string> = {
  forecast: 'https://api.open-meteo.com',
  ensemble: 'https://ensemble-api.open-meteo.com',
}

export function metadataUrl(source: MetadataSource): string {
  return `${HOSTS[source.host]}/data/${source.dataset}/static/meta.json`
}

/**
 * `last_run_availability_time` is Unix seconds. Anything else is unreadable,
 * and an unreadable source must fall back to fetching, so it returns null.
 */
export function parseDatasetRun(body: unknown): DatasetRun | null {
  if (typeof body !== 'object' || body === null) return null
  const seconds = (body as Record<string, unknown>)['last_run_availability_time']
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null
  return { availableAt: new Date(seconds * 1000) }
}

/**
 * Read every dataset in `MODEL_SOURCES` once. Open-Meteo does not count
 * metadata requests against the API limits.
 *
 * Never throws: a failed read leaves that source out, and `needsFetch` treats
 * an absent source as changed. Two attempts rather than four — this runs
 * inside the collection's `maxDuration`, and the cost of giving up is one
 * ordinary fetch.
 */
export async function fetchAvailability(): Promise<{ runs: Availability; unreadable: string[] }> {
  const sources = new Map<string, MetadataSource>()
  for (const list of Object.values(MODEL_SOURCES)) {
    for (const s of list) sources.set(sourceKey(s), s)
  }

  const settled = await Promise.allSettled(
    [...sources].map(async ([key, source]) => {
      const res = await fetchWithRetry(metadataUrl(source), 2)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const run = parseDatasetRun(await res.json())
      if (run === null) throw new Error('no last_run_availability_time')
      return [key, run] as const
    }),
  )

  const out = new Map<string, DatasetRun>()
  const unreadable: string[] = []
  settled.forEach((entry, i) => {
    if (entry.status === 'fulfilled') out.set(entry.value[0], entry.value[1])
    else unreadable.push([...sources.keys()][i] ?? 'unknown')
  })
  if (unreadable.length > 0) {
    logger.warn({ unreadable: unreadable.join(',') }, '[modelMetadata] metadata unreadable')
  }
  return { runs: out, unreadable: unreadable.sort() }
}

/**
 * Whether `collect-runs` must fetch this model again.
 *
 * Every uncertain case answers yes: no stored copy, a copy past the backstop,
 * or any part whose metadata could not be read. Only "every part was read and
 * none published after our copy" skips.
 */
export function needsFetch(
  model: CollectedModel,
  lastFetchedAt: Date | null,
  availability: Availability,
  now: Date,
): boolean {
  if (lastFetchedAt === null) return true
  if (now.getTime() - lastFetchedAt.getTime() >= REFETCH_BACKSTOP_MS) return true
  return MODEL_SOURCES[model].some((source) => {
    const run = availability.get(sourceKey(source))
    return run === undefined || run.availableAt.getTime() > lastFetchedAt.getTime()
  })
}

/** Sources whose metadata was read and whose last run is older than `STALE_AFTER_MS`. */
export function staleSources(availability: Availability, now: Date): string[] {
  const out: string[] = []
  for (const [key, run] of availability) {
    if (now.getTime() - run.availableAt.getTime() > STALE_AFTER_MS) out.push(key)
  }
  return out.sort()
}

export type CollectionPlan = {
  /** Models to fetch this collection. */
  readonly fetch: readonly CollectedModel[]
  /** Stored runs that are still the newest upstream, to be stamped checked. */
  readonly confirm: readonly { model: CollectedModel; fetched_at: Date }[]
}

/**
 * Split one point's models into those to fetch and those whose stored run is
 * still current. `stored` maps each model to its newest stored `fetched_at`.
 */
export function planCollection(
  stored: ReadonlyMap<string, Date>,
  availability: Availability,
  now: Date,
): CollectionPlan {
  const fetch: CollectedModel[] = []
  const confirm: { model: CollectedModel; fetched_at: Date }[] = []
  for (const model of COLLECTED_MODELS) {
    const fetchedAt = stored.get(model) ?? null
    if (fetchedAt === null || needsFetch(model, fetchedAt, availability, now)) fetch.push(model)
    else confirm.push({ model, fetched_at: fetchedAt })
  }
  return { fetch, confirm }
}
