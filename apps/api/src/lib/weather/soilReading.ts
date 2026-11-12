import { SOIL_HISTORY_DAYS, type SoilReading, type SoilStation } from '@weatherteam6/types'
import { fetchHourlyRain, fetchSoilPoints, localDatesBetween, logUscrnFailure, soilRainDays, USCRN_BUDGET_MS } from './uscrn.js'

const DAY_MS = 24 * 3_600_000

export type SoilFetchers = { soil: typeof fetchSoilPoints; rain: typeof fetchHourlyRain }
const LIVE: SoilFetchers = { soil: fetchSoilPoints, rain: fetchHourlyRain }

/**
 * A crag's NOAA station over the last `SOIL_HISTORY_DAYS` (#589 part 2): its
 * soil, hour by hour, and its own rain by local day for the Ground tab's
 * bars. Two Range requests to NCEI in parallel under one deadline.
 *
 * **Never throws for an upstream failure.** A failed soil read is
 * `answered: false` with no points, which the card shows as a gap, never as
 * dry ground; a failed rain read leaves `rain_days` empty and the chart
 * draws no bars.
 */
export async function soilReading(station: SoilStation, nowMs: number, fetchers: SoilFetchers = LIVE): Promise<SoilReading> {
  const fromMs = nowMs - SOIL_HISTORY_DAYS * DAY_MS
  const deadline = Date.now() + USCRN_BUDGET_MS
  const [soil, rain] = await Promise.allSettled([
    fetchers.soil(station, fromMs, nowMs, deadline),
    fetchers.rain(station, fromMs - DAY_MS, nowMs, deadline),
  ])
  if (soil.status === 'rejected') logUscrnFailure('soil', station.wban, soil.reason)
  if (rain.status === 'rejected') logUscrnFailure('rain', station.wban, rain.reason)
  const dates = localDatesBetween(fromMs, nowMs, station.tz, station.lon)
  return {
    station: {
      wban: station.wban,
      name: station.name,
      distance_km: station.distance_km,
      direction: station.direction,
      setting: station.setting,
    },
    answered: soil.status === 'fulfilled',
    points: soil.status === 'fulfilled' ? soil.value : [],
    rain_days: rain.status === 'fulfilled' ? soilRainDays(rain.value, dates, station.tz, station.lon) : [],
  }
}
