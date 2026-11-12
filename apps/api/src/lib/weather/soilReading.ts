import {
  SOIL_HISTORY_DAYS,
  SOIL_RECENT_DAYS,
  type SoilReading,
  type SoilStation,
  type UscrnStation,
  type WisconetStation,
} from '@weatherteam6/types'
import { fetchHourlyRain, fetchSoilPoints, localDatesBetween, logUscrnFailure, soilRainDays, USCRN_BUDGET_MS } from './uscrn.js'
import { fetchWisconetHours, logWisconetFailure, range5, rankedSoilPoints, WISCONET_BUDGET_MS, wisconetRain } from './wisconet.js'

const DAY_MS = 24 * 3_600_000

export type SoilFetchers = { soil: typeof fetchSoilPoints; rain: typeof fetchHourlyRain; wisconet: typeof fetchWisconetHours }
const LIVE: SoilFetchers = { soil: fetchSoilPoints, rain: fetchHourlyRain, wisconet: fetchWisconetHours }

/**
 * The station to serve a caller, or null. **A Wisconet reading goes only to
 * a client that asks for `basis=recent`**: a build from before part 3 knows no
 * `basis`, so it would read a 30-day rank as a percentile for the date
 * ("Soaked for the date") and name NOAA as its source. Without the ask it
 * gets null, which it already reads as no station: no Ground tab.
 */
export function servedSoilStation(station: SoilStation | null, basisParam: unknown): SoilStation | null {
  if (station === null) return null
  return station.network === 'uscrn' || basisParam === 'recent' ? station : null
}

/**
 * A crag's soil station over the last `SOIL_HISTORY_DAYS` (#589): its soil,
 * hour by hour, and its own rain by local day for the Ground tab's bars.
 *
 * - **NOAA USCRN** (part 2): two Range requests to NCEI in parallel under one
 *   deadline; NCEI ranks each hour against the date across the years.
 * - **Wisconet** (part 3): one request for `SOIL_RECENT_DAYS`; each hour is
 *   ranked here against those days, and the 5 cm range they spanned rides
 *   along, because the station is too young for a climatology.
 *
 * **Never throws for an upstream failure.** A failed soil read is
 * `answered: false` with no points, which the card shows as a gap, never as
 * dry ground; a failed rain read leaves `rain_days` empty and the chart
 * draws no bars.
 */
export async function soilReading(station: SoilStation, nowMs: number, fetchers: SoilFetchers = LIVE): Promise<SoilReading> {
  return station.network === 'uscrn' ? uscrnReading(station, nowMs, fetchers) : wisconetReading(station, nowMs, fetchers)
}

function stationOf(s: SoilStation): SoilReading['station'] {
  return { network: s.network, name: s.name, distance_km: s.distance_km, direction: s.direction, setting: s.setting }
}

async function uscrnReading(station: UscrnStation, nowMs: number, fetchers: SoilFetchers): Promise<SoilReading> {
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
    station: stationOf(station),
    basis: { kind: 'date' },
    answered: soil.status === 'fulfilled',
    points: soil.status === 'fulfilled' ? soil.value : [],
    rain_days: rain.status === 'fulfilled' ? soilRainDays(rain.value, dates, station.tz, station.lon) : [],
  }
}

async function wisconetReading(station: WisconetStation, nowMs: number, fetchers: SoilFetchers): Promise<SoilReading> {
  const fromMs = nowMs - SOIL_HISTORY_DAYS * DAY_MS
  const recentFromMs = nowMs - SOIL_RECENT_DAYS * DAY_MS
  const dates = localDatesBetween(fromMs, nowMs, station.tz, station.lon)
  try {
    // The rain needs the station's hours from the midnight before the first date; the 30 days cover it.
    const hours = await fetchers.wisconet(station, recentFromMs, nowMs, Date.now() + WISCONET_BUDGET_MS)
    const { lo_5, hi_5 } = range5(hours)
    return {
      station: stationOf(station),
      basis: { kind: 'recent', days: SOIL_RECENT_DAYS, lo_5, hi_5 },
      answered: true,
      points: rankedSoilPoints(hours).filter((p) => Date.parse(p.at) > fromMs),
      rain_days: soilRainDays(wisconetRain(hours), dates, station.tz, station.lon),
    }
  } catch (err) {
    logWisconetFailure(station.id, err)
    return {
      station: stationOf(station),
      basis: { kind: 'recent', days: SOIL_RECENT_DAYS, lo_5: null, hi_5: null },
      answered: false,
      points: [],
      rain_days: [],
    }
  }
}
