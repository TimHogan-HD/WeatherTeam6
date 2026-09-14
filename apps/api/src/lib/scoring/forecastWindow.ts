import type { ConditionsScore, ForecastSnapshot } from '@weatherteam6/types'

export type ForecastWindow = 'pre' | 'early' | 'decision'

/**
 * The forecast-window state machine from `.claude/rules/architecture.md`:
 * >14 days out is climatological only, 7-14 is low-confidence, <7 is the full
 * decision window. Computed at read time from the date pair, never stored.
 *
 * Lives here rather than in a route file because two endpoints label snapshots
 * with it — GET /forecast/:locationId and GET /preview — and they must not drift.
 */
export function forecastWindow(forecastDate: string, todayStr: string): ForecastWindow {
  const today = new Date(todayStr + 'T00:00:00Z')
  const forecast = new Date(forecastDate + 'T00:00:00Z')
  const daysOut = Math.round((forecast.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (daysOut > 14) return 'pre'
  if (daysOut >= 7) return 'early'
  return 'decision'
}

/**
 * How the per-day score reaches a snapshot, when it is allowed to at all.
 *
 * **Omit this and no score field appears on any row.** That is the whole
 * mechanism protecting the two rules below — there is no flag to forget, only an
 * argument not passed:
 *
 * - **A non-climbing location gets no score anywhere.** `computeLiveForecast`
 *   does not branch on `is_climbing_location` and will score a city on request,
 *   so `GET /forecast/:id` passes this only when the location is a crag.
 * - **`GET /preview` never scores.** Nothing has been classified yet at that
 *   point, so it passes no scores and keeps the weather-only shape it has now.
 */
export type ScoreMerge = {
  /** What `computeLiveForecast` returned. Matched to snapshots by `forecast_date`. */
  scores: readonly ConditionsScore[]
  /**
   * `computeLiveForecast`'s `scoreUnavailable`, verbatim.
   *
   * When set, `scores` is empty and **every** day is marked withheld rather than
   * simply unscored. The two look identical in the data and read very
   * differently to a person: "we could not measure this" against "this date is
   * beyond the scoring window".
   */
  unavailableReason?: 'rainfall_unavailable' | null
}

/**
 * Drop past days, order ascending, label each with its window, and — only when
 * `merge` is given — attach that day's score.
 *
 * The join is on `forecast_date`, not array position. `scores` is built by
 * mapping over the ensemble's daily rows and `snapshots` by a different path, so
 * positional alignment is an assumption that holds until the first day one side
 * drops and then silently attributes every score to the wrong date.
 */
export function toWindowedForecast(
  snapshots: ForecastSnapshot[],
  todayStr: string,
  merge?: ScoreMerge,
): ForecastSnapshot[] {
  const byDate = new Map<string, ConditionsScore>()
  if (merge) for (const s of merge.scores) byDate.set(s.forecast_date, s)

  return snapshots
    .filter((s) => s.forecast_date >= todayStr)
    .sort((a, b) => a.forecast_date.localeCompare(b.forecast_date))
    .map((s) => {
      const row: ForecastSnapshot = { ...s, window: forecastWindow(s.forecast_date, todayStr) }
      if (!merge) return row

      const scored = byDate.get(s.forecast_date)
      if (scored === undefined) {
        // No row for this date. Either it is outside the scoring window, or the
        // whole computation was withheld — `unavailableReason` is what tells the
        // reader which, and it must not be invented here when it is absent.
        return {
          ...row,
          score: null,
          unavailable_reason: merge.unavailableReason ?? null,
          component_drying_time: null,
          component_upcoming_rain: null,
          component_wind: null,
          component_temp: null,
          component_humidity: null,
        }
      }

      return {
        ...row,
        score: scored.score,
        confidence: scored.confidence,
        // Carried through rather than defaulted: a scored row can itself be
        // withheld, and `?? null` on a field that is already null is not a
        // decision anyone needs to re-make downstream.
        unavailable_reason: scored.unavailable_reason ?? null,
        component_drying_time: scored.component_drying_time,
        component_upcoming_rain: scored.component_upcoming_rain,
        component_wind: scored.component_wind,
        component_temp: scored.component_temp,
        component_humidity: scored.component_humidity,
      }
    })
}
