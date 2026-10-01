import {
  DETERMINISTIC_MODELS,
  fetchDeterministicHourly,
  type DeterministicResult,
  type ForecastLocation,
} from '../weather/openMeteo.js'
import { RAIN_MODELS, rainMedian, type RainMedian } from '../weather/rainMedian.js'
import { THERMAL_MODEL } from './hourlyReadings.js'

/**
 * **How a place's deterministic runs are fetched — by `collect-runs` and by a
 * panel that found nothing stored.** One module so the two cannot differ.
 *
 * They did (issue #176): the panel's cold path asked for all six models with no
 * trailing days, stored that run, and `collect-runs` then treated it as current
 * until GFS next published. A crag added through the app read `Wet` with no
 * friction and no score for hours, because `T_mass` had no history to read.
 */

/** Forecast days requested. */
export const FORECAST_DAYS = 7

/**
 * **Days of already-observed weather stored alongside the forecast, for
 * `THERMAL_MODEL` alone.**
 *
 * Two readers need them:
 *
 * - **`T_mass`** — the multi-day temperature the rock has been sitting at —
 *   refuses a series shorter than 96 hours.
 * - **The drying clock** treats the series' first hour as fully soaked, because
 *   it cannot see the rain before it (`drynessTrack`). Replayed over 92 days
 *   (`npm run compare:trailing-days`, #176), 5 days read the slowest rock
 *   wetter than a 30-day series 3.3% of the time; 7 never did, and 10 and 14
 *   added nothing. That sample was July to September — cold rock dries slower,
 *   so rerun it in winter before trusting 7 there.
 *
 * **These hours are the model's own analysis, not station observations.** They
 * are the best trailing temperature available without a second API, and they
 * are not measurements — nothing may present them as such.
 *
 * **Stored for `THERMAL_MODEL` alone** — see `FORECAST_ONLY_MODELS` for the
 * measurement that forced the split. `check:runs-storage` is where to watch the
 * cost if more locations are added.
 *
 * **Requested for all of `RAIN_MODELS`**, because the drying clock reads their
 * hourly median rather than the thermal model's own rain (issue #209), and its
 * history needs theirs too. Only the thermal model's run is stored from that
 * request; the median rides on its hours as `rain_median_mm`, one column
 * rather than three more runs of trailing rows. It is refreshed when the
 * thermal model is, so it can lag another model's newer run by one cycle.
 */
export const TRAILING_DAYS = 7

/**
 * The five models fetched **without** trailing history.
 *
 * Only `THERMAL_MODEL` feeds `T_surface` and `T_mass`, so only its past hours
 * are ever read. Asking for `past_days` across all six looked simpler and was
 * measured at **+71% on `weather_run_hours`**, the largest table in a database
 * already at 239 MB of Neon's 512 MB cap — the same table whose growth took
 * production down with `could not extend file` in September. Splitting the
 * request costs one extra HTTP call per location and brings it to +12%.
 */
export const FORECAST_ONLY_MODELS = DETERMINISTIC_MODELS.filter((m) => m !== THERMAL_MODEL)

/** One deterministic request, ready to store: the runs, and the rain median that rides on the thermal run. */
export type FetchedRuns = {
  result: DeterministicResult
  rain: RainMedian | null
}

/**
 * **Neither request ever splits `precipitation_probability` into owned and
 * shared.** `markSharedProbability` can only tell a shared series from an owned
 * one by comparing every model in one response, and no request here carries all
 * six. A model alone in its response would read as owning a series it shares,
 * so the flag is stored as null — unknown — which is what a renderer must
 * withhold on.
 */
function withoutShareFlag(result: DeterministicResult): DeterministicResult {
  return {
    ...result,
    models: result.models.map((m) => ({ ...m, probability_is_shared: null })),
  }
}

/**
 * The thermal model's run with `TRAILING_DAYS` of history, and the rain median
 * of `RAIN_MODELS` over the same hours. Only the thermal model's run comes back
 * from the request; the others contributed only to the median.
 */
export async function fetchThermalRun(point: ForecastLocation): Promise<FetchedRuns> {
  const result = await fetchDeterministicHourly(point, RAIN_MODELS, FORECAST_DAYS, TRAILING_DAYS)
  const thermal = {
    ...result,
    models: result.models.filter((m) => m.model === THERMAL_MODEL),
    unavailable_models: result.unavailable_models.filter((m) => m === THERMAL_MODEL),
  }
  return { result: withoutShareFlag(thermal), rain: rainMedian(result) }
}

/** The forecast-only models asked for, with no history. */
export async function fetchForecastOnlyRuns(
  point: ForecastLocation,
  models: readonly string[] = FORECAST_ONLY_MODELS,
): Promise<FetchedRuns> {
  const result = await fetchDeterministicHourly(point, models, FORECAST_DAYS)
  return { result: withoutShareFlag(result), rain: null }
}
