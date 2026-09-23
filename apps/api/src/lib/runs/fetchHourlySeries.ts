import type { HourlySeries } from '@weatherteam6/types'
import type { ForecastLocation } from '../weather/openMeteo.js'
import { getDeterministicRuns, getEnsembleRuns } from './latestRuns.js'
import { buildHourlySeries } from './hourlySeries.js'

/**
 * The impure half of the hourly series: fetch both runs for a point, then hand them to
 * the pure builder.
 *
 * **Separate from `hourlySeries.ts` because this file reaches the database.**
 * `latestRuns` imports `db/index.ts`, which throws at import time without `DATABASE_URL`,
 * so anything importing it is unloadable under vitest. Keeping the join, the model
 * selection and the day bucketing on the other side of that line is what makes them
 * testable at all.
 */

export type HourlyLocation = ForecastLocation & { id: string }

export type { ScoringLocation } from './scoringLocation.js'
import type { ScoringLocation } from './scoringLocation.js'

/**
 * The freshest hourly series for a location.
 *
 * Both reads are stored-first — `getDeterministicRuns` and `getEnsembleRuns` return a run
 * younger than `RUN_MAX_AGE_MINUTES` as-is and only fetch when there is none — so the
 * common path costs no upstream call.
 *
 * They run under `Promise.all` rather than in sequence, and that matters on the cold
 * path: each one can reach Open-Meteo, and `fetchWithRetry` sleeps 1s + 2s + 4s across
 * its attempts. Serialising them would put two full retry ladders inside one request
 * against the function's 60 s ceiling — the same failure that took `runAlertsCheck` down
 * before it was made concurrent.
 *
 * @throws {Error} only when a fetch fails and nothing was stored — the contract
 *   `getDeterministicRuns` and `getEnsembleRuns` already have. A storage failure is
 *   logged there and the live data is still returned.
 */
export async function getHourlySeries(
  location: HourlyLocation,
  pointKey: string,
  opts: { allModels: boolean; now?: Date; scoring: ScoringLocation },
): Promise<HourlySeries> {
  const now = opts.now ?? new Date()

  const [deterministic, ensemble] = await Promise.all([
    getDeterministicRuns(location, pointKey, location.id, now),
    getEnsembleRuns(location, pointKey, location.id, now),
  ])

  return buildHourlySeries({
    locationId: location.id,
    deterministic,
    ensemble,
    allModels: opts.allModels,
    now,
    scoring: opts.scoring,
  })
}
