import type { ForecastSnapshot } from '@weatherteam6/types'
import { computeLiveForecast, type LiveForecastLocation } from './liveForecast.js'
import { toWindowedForecast } from './forecastWindow.js'

/**
 * The daily weather labelled by forecast window: `GET /forecast/:id` and
 * `GET /list`. `todayStr` comes back from the compute rather than being
 * derived here: it is the *location's* local day (#33).
 */
export async function windowedForecastFor(
  location: LiveForecastLocation,
  now: Date = new Date(),
): Promise<ForecastSnapshot[]> {
  const { snapshots, todayStr } = await computeLiveForecast(location, now)
  return toWindowedForecast(snapshots, todayStr)
}
