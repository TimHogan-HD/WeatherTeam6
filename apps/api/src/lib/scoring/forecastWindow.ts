import type { ForecastSnapshot } from '@weatherteam6/types'

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

/** Drop past days, order ascending, and label each with its window. */
export function toWindowedForecast(
  snapshots: ForecastSnapshot[],
  todayStr: string,
): ForecastSnapshot[] {
  return snapshots
    .filter((s) => s.forecast_date >= todayStr)
    .sort((a, b) => a.forecast_date.localeCompare(b.forecast_date))
    .map((s) => ({ ...s, window: forecastWindow(s.forecast_date, todayStr) }))
}
