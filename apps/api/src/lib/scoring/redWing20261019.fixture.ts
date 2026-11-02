/**
 * **Red Wing (Barn Bluff), 2026-10-19, for tests.** Owner visit: Winter Wall in
 * the sun too hot, jackets on the tree-shaded north side, and Crag A scored the
 * hour 100. Air, dew point and wind are Red Wing airport (RGK) METARs for that
 * day, repeated for six days so the rock mass and drying clock settle; the
 * shortwave is clear-sky (Haurwitz), as the sky was. The last day is the 19th;
 * local time is UTC-5.
 */
import { fToC, solarPosition } from '@weatherteam6/types'
import type { WeatherHour } from './hourlyConditions.js'

const HOUR_MS = 3_600_000

// Local hours 00-23 (UTC-5).
const AIR_F = [55.6, 51.6, 49.3, 46.2, 46, 46, 55.2, 49, 48, 46.4, 42.3, 40.6, 40.5, 40, 45.3, 50.5, 54.7, 57.6, 60, 62.6, 64, 66.2, 66.6, 63.7]
const DEW_F = [43.5, 43.7, 43, 42.6, 42.8, 44.2, 37.2, 37.4, 38, 38, 37.4, 37, 38, 37.2, 41.5, 43.5, 43.3, 42.8, 43, 42.6, 44, 44.2, 44.2, 43.7]
const WIND_KT = [0, 0, 3, 0, 3, 3, 0, 0, 3, 3, 0, 0, 0, 0, 0, 0, 3, 4, 6, 7, 7, 7, 5, 3]

/** The first hour's stamp: local midnight on 2026-10-14. */
export const RED_WING_START_MS = Date.parse('2026-10-14T05:00:00Z')
export const RED_WING_UTC_OFFSET_S = -5 * 3600
/** Index of the hour ending 1 PM local on the 19th. */
export const RED_WING_ONE_PM = 5 * 24 + 13

/** Six days of hours, sun placed at `lat`/`lon`. */
export function redWing20261019(lat: number, lon: number): WeatherHour[] {
  // The METARs are stamped in UTC; index them by the UTC hour (local + 5).
  const at = (utcHour: number) => (utcHour % 24 + 24) % 24
  return Array.from({ length: 6 * 24 }, (_, i) => {
    const t = RED_WING_START_MS + i * HOUR_MS
    const u = at(new Date(t).getUTCHours() - 1)
    const sun = solarPosition(new Date(t - HOUR_MS / 2), lat, lon)!
    const cz = Math.sin((sun.elevationDeg * Math.PI) / 180)
    return {
      valid_at: new Date(t).toISOString(),
      air_temp_c: fToC(AIR_F[u]!),
      dewpoint_c: fToC(DEW_F[u]!),
      wind_kmh: WIND_KT[u]! * 1.852,
      cloud_pct: 0,
      shortwave_wm2: cz > 0 ? 1098 * cz * Math.exp(-0.057 / cz) : 0,
      precip_mm: 0,
    }
  })
}
