import type { ForecastSnapshot } from '@weatherteam6/types'
import { localDateString, type ForecastLocation } from '../weather/openMeteo.js'
import { getEnsembleDaily, type EnsembleDaily } from '../runs/latestRuns.js'
import type { locations } from '../../db/schema.js'

export type LiveForecastLocation = Pick<typeof locations.$inferSelect, 'id' | 'lat' | 'lon' | 'elevation_m'>

export type LiveForecastResult = {
  snapshots: ForecastSnapshot[]
  /**
   * The location's **local** calendar date, resolved from the offset Open-Meteo
   * returned for these coordinates (issue #33).
   *
   * Every caller must use this rather than deriving its own date. Until
   * 2026-08-26 each route computed `new Date().toISOString().slice(0, 10)`
   * independently and the buckets were UTC days, so anywhere west of Greenwich
   * "today" rolled over during the afternoon and the screen relabelled
   * tomorrow's high as today's.
   *
   * `''` when the forecast came back empty and there was no offset to resolve.
   */
  todayStr: string
}

function parseNum(v: string | null | undefined, fallback: number): number {
  if (v === null || v === undefined) return fallback
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

/**
 * A location's daily forecast, on request — **weather only**. The
 * five-component score this used to compute beside it was retired in scoring
 * Phase 5b (2026-10-01), and with it the 30-day rainfall lookup that fed only
 * that score's drying clock. Crag A's score is `/hourly`'s readings.
 *
 * **Read from the stored run when `collect-runs` has one that starts today**,
 * fetched otherwise (`getEnsembleDaily`). The stored days are `parseEnsemble`'s
 * output from the same request a live fetch makes, so the figures are the same.
 *
 * The ensemble is the only forecast source. NBM is not called: Open-Meteo
 * defines no NBM precipitation quantiles under any name (issue #22), so the NBM
 * branch never returned data. `fetchNBM` is left in place, tested and unused.
 */
export async function computeLiveForecast(
  location: LiveForecastLocation,
  now: Date = new Date(),
): Promise<LiveForecastResult> {
  const locCoords: ForecastLocation = {
    lat: parseNum(location.lat, 0),
    lon: parseNum(location.lon, 0),
    elevation_m: location.elevation_m !== null ? parseNum(location.elevation_m, 0) : null,
  }

  const forecast: EnsembleDaily = await getEnsembleDaily(locCoords, now)
  if (forecast.days.length === 0) return { snapshots: [], todayStr: '' }

  /**
   * "Today" is the **location's** calendar day, not UTC (issue #33). The
   * ensemble request sets `timezone=auto`, so `day.date` is a local date and
   * `utc_offset_seconds` is what Open-Meteo resolved for these coordinates.
   */
  const todayStr = localDateString(now, forecast.utc_offset_seconds)

  const snapshots: ForecastSnapshot[] = [...forecast.days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({
      id: `${location.id}:${day.date}`,
      location_id: location.id,
      captured_at: now.toISOString(),
      forecast_date: day.date,
      precip_mm_p10: day.precip_mm_p10,
      precip_mm_p50: day.precip_mm_p50,
      precip_mm_p90: day.precip_mm_p90,
      temp_c_min: day.temp_c_min,
      temp_c_max: day.temp_c_max,
      wind_kmh_max: day.wind_kmh_max,
      humidity_pct: day.humidity_pct,
      model_sources: forecast.model_sources,
      // Marked server-side so no client has to work out which row is "today"
      // from a date it derived itself (#33).
      is_today: day.date === todayStr,
      created_at: now.toISOString(),
    }))

  return { snapshots, todayStr }
}
