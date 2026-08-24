import { aspectToDegrees } from '@weatherteam6/types'
import type { ConditionsScore, ForecastSnapshot } from '@weatherteam6/types'
import { logger } from '../logger.js'
import { fetchPrecipHistory } from '../weather/acis.js'
import {
  fetchArchivePrecip,
  fetchEnsemble,
  fetchNBM,
  type ForecastLocation,
  type OpenMeteoResult,
} from '../weather/openMeteo.js'
import { conditionsScore } from './conditionsScore.js'
import { dryingModel } from './dryingModel.js'
import type { locations } from '../../db/schema.js'

export type LiveForecastLocation = Pick<
  typeof locations.$inferSelect,
  'id' | 'lat' | 'lon' | 'elevation_m' | 'rock_type' | 'cliff_angle' | 'aspect' | 'asos_station'
>

export type LiveForecastResult = {
  snapshots: ForecastSnapshot[]
  scores: ConditionsScore[]
}

function parseNum(v: string | null | undefined, fallback: number): number {
  if (v === null || v === undefined) return fallback
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Compute a location's forecast + conditions score live, on request — no
 * snapshot table involved. Replaces what the (removed) forecastSnapshot
 * BullMQ job used to precompute on a schedule; the scoring math itself
 * (dryingModel / conditionsScore) is unchanged.
 */
export async function computeLiveForecast(
  location: LiveForecastLocation,
  now: Date = new Date(),
): Promise<LiveForecastResult> {
  const lat = parseNum(location.lat, 0)
  const lon = parseNum(location.lon, 0)
  const elevM = location.elevation_m !== null ? parseNum(location.elevation_m, 0) : null
  const locCoords: ForecastLocation = { lat, lon, elevation_m: elevM }

  const todayStr = now.toISOString().slice(0, 10)
  const thirtyDaysAgoStr = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  let forecast: OpenMeteoResult | null = null
  try {
    forecast = await fetchNBM(locCoords)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(
      { locationId: location.id, err: msg },
      '[liveForecast] NBM fetch failed, falling back to ensemble',
    )
  }
  if (!forecast) {
    forecast = await fetchEnsemble(locCoords)
  }

  if (forecast.days.length === 0) {
    return { snapshots: [], scores: [] }
  }

  // Sort once, ascending by date — the 72h aggregates below assume this order.
  const days = [...forecast.days].sort((a, b) => a.date.localeCompare(b.date))
  const modelSources = forecast.model_sources

  const snapshots: ForecastSnapshot[] = days.map((day) => ({
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
    model_sources: modelSources,
    created_at: now.toISOString(),
  }))

  // Recent rainfall for the drying model: prefer the ASOS station reading when
  // the location has one (matches what the removed rainfallHistory job stored),
  // else fall back to Open-Meteo's archive API — both live-fetched per request
  // since there's no longer a rainfall_history table being kept warm by a job.
  let rainfallEvents: { date: string; precip_mm: number }[] = []
  try {
    rainfallEvents = location.asos_station
      ? await fetchPrecipHistory(location.asos_station, thirtyDaysAgoStr, todayStr)
      : await fetchArchivePrecip(lat, lon, thirtyDaysAgoStr, todayStr)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn(
      { locationId: location.id, err: msg },
      '[liveForecast] recent rainfall fetch failed — scoring drying time as no-recent-data',
    )
  }

  let scores: ConditionsScore[] = []
  try {
    const dryResult = dryingModel({
      rockType: location.rock_type ?? 'unknown',
      cliffAngle: parseNum(location.cliff_angle, 45),
      rainfallEvents,
      asOf: now,
    })
    const hoursSinceRain = dryResult.hours_since_significant_rain
    const lastRainMm = dryResult.last_rain_mm

    const todayDay = days.find((d) => d.date === todayStr)
    if (!todayDay) {
      // Not cosmetic: the ?? fallbacks below score EVERY day at 0 km/h wind and
      // 0 °C, and 0 °C zeroes the temp component outright. Without this warning
      // that degradation is invisible in the response.
      logger.warn(
        { locationId: location.id, todayStr },
        '[liveForecast] no forecast day matching today — forecast may start from tomorrow; current-condition proxies will use zero defaults',
      )
    }
    const currentWindKmh = todayDay?.wind_kmh_max ?? 0
    const currentTempC = ((todayDay?.temp_c_min ?? 0) + (todayDay?.temp_c_max ?? 0)) / 2
    const currentHumidityPct = todayDay?.humidity_pct ?? 50

    const rockType = location.rock_type ?? 'unknown'
    const cliffAngle = parseNum(location.cliff_angle, 45)
    const aspectDegrees = aspectToDegrees(location.aspect ?? '')
    const todayDate = new Date(todayStr + 'T00:00:00Z')

    scores = days.map((day, i) => {
      const forecastDate = new Date(day.date + 'T00:00:00Z')
      const forecastDateDaysOut = Math.round(
        (forecastDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24),
      )

      // 72h aggregate: sum this day + next 2 days
      const next3 = days.slice(i, i + 3)
      const forecastRain72hP10 = next3.reduce((sum, d) => sum + d.precip_mm_p10, 0)
      const forecastRain72hMm = next3.reduce((sum, d) => sum + d.precip_mm_p50, 0)
      const forecastRain72hP90 = next3.reduce((sum, d) => sum + d.precip_mm_p90, 0)

      const output = conditionsScore({
        rockType,
        aspectDegrees,
        cliffAngle,
        hoursSinceRain,
        lastRainMm,
        forecastRain72hMm,
        forecastRain72hP10,
        forecastRain72hP90,
        currentWindKmh,
        maxWindKmh24h: currentWindKmh,
        currentTempC,
        forecastHighC: day.temp_c_max,
        currentHumidityPct,
        forecastDateDaysOut,
      })

      const nowIso = now.toISOString()
      return {
        id: `${location.id}:${day.date}`,
        location_id: location.id,
        forecast_date: day.date,
        score: output.score,
        confidence: output.confidence,
        component_drying_time: output.components.drying_time,
        component_upcoming_rain: output.components.upcoming_rain,
        component_wind: output.components.wind,
        component_temp: output.components.temp,
        component_humidity: output.components.humidity,
        score_breakdown: output.breakdown,
        computed_at: nowIso,
        created_at: nowIso,
      }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error(
      { locationId: location.id, err: msg },
      '[liveForecast] score computation failed — returning snapshots without scores',
    )
    scores = []
  }

  return { snapshots, scores }
}
