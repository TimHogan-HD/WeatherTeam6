import { aspectToDegrees } from '@weatherteam6/types'
import type { ConditionsScore, ForecastSnapshot } from '@weatherteam6/types'
import { logger } from '../logger.js'
import { fetchPrecipHistory } from '../weather/acis.js'
import {
  fetchArchivePrecip,
  fetchEnsemble,
  localDateString,
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

  /**
   * The ensemble is the only forecast source. NBM used to be tried first and is
   * no longer called — see issue #22, diagnosed 2026-08-26.
   *
   * `fetchNBM` requests `precipitation_p10` / `_p50` / `_p90`, and Open-Meteo
   * does not define those as daily variables. Verified against the live API:
   * every other variable in that list returns 200 on its own and each quantile
   * returns 400 with *"Cannot initialize ForecastVariableDaily from invalid
   * String value precipitation_p10"*. No renamed equivalent exists either —
   * `precipitation_sum_p10`, `precipitation_percentile_10` and the hourly forms
   * are all 400; the only probabilistic variable NBM exposes is
   * `precipitation_probability`, which is not a quantile.
   *
   * So the NBM branch has never once returned data, and calling it spent one
   * wasted round trip per request plus a `logger.warn` that read like an
   * intermittent upstream problem rather than a permanent misconfiguration.
   * Removing it changes no response — the ensemble already served 100% of them
   * — and drops upstream fetches per request from three to two.
   *
   * **`fetchNBM` is deliberately left in place**, tested and unused. Restoring
   * it is a one-line change *if* Open-Meteo ever exposes NBM quantiles; without
   * them NBM offers nothing the ensemble does not, since p10/p90 are the whole
   * reason it was preferred.
   */
  const forecast: OpenMeteoResult = await fetchEnsemble(locCoords)

  if (forecast.days.length === 0) {
    return { snapshots: [], scores: [], todayStr: '' }
  }

  /**
   * "Today" is now the **location's** calendar day, not UTC (issue #33).
   *
   * `fetchEnsemble` requests `timezone=auto`, so `day.date` is a local date and
   * `utc_offset_seconds` is what Open-Meteo resolved for these coordinates.
   * Deriving the date the same way it did is what makes this string match one of
   * the buckets in the same response. The rainfall window uses the same offset
   * so a rain "day" means the same thing on both sides of the drying model.
   */
  const todayStr = localDateString(now, forecast.utc_offset_seconds)
  const thirtyDaysAgoStr = localDateString(
    new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    forecast.utc_offset_seconds,
  )

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
    // Marked server-side so no client has to work out which row is "today" from
    // a date it derived itself. That duplication is what made this wrong: the
    // API bucketed by UTC day and the Mini App matched against its own UTC day,
    // so both were consistently wrong together and neither could detect it.
    is_today: day.date === todayStr,
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
      // Not cosmetic, but note the direction: these fallbacks INFLATE the score,
      // they don't zero it. 0 km/h wind sits inside conditionsScore's `<= 15`
      // band (full 15/15) and the 50% humidity default sits inside its `<= 50`
      // band (full 8/8), so every day comes back with no component zeroed and
      // nothing in the response marking it degraded. currentTempC is unaffected
      // either way — conditionsScore reads forecastHighC for the temp component
      // and never reads currentTempC at all. This warning is the only signal
      // that any of it happened.
      logger.warn(
        { locationId: location.id, todayStr },
        '[liveForecast] no forecast day matching today — forecast may start from tomorrow; wind/humidity proxies will fall back to full-credit defaults',
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
        // `currentWindKmh` and `currentHumidityPct` feed the *drying* modifiers,
        // which look backwards from now, so today's readings are the right
        // input for every day — the rock either dried or it did not.
        currentWindKmh,
        // The wind *component*, though, is meant to describe the day being
        // scored. It was fed `currentWindKmh` — today's wind — so a day-7 score
        // reported a wind rating measured six days earlier, and every day in the
        // response carried an identical wind component no matter what the
        // forecast said. Each day now scores its own wind.
        maxWindKmh24h: day.wind_kmh_max,
        currentTempC,
        forecastHighC: day.temp_c_max,
        // NOT changed to `day.humidity_pct`, deliberately. `ScoreInput` uses one
        // field for both the humidity component and the drying humidity
        // modifier, so making it per-day would silently move the drying
        // calculation too. Separating them is a `ScoreInput` change with its own
        // test implications — see the note in .claude/docs/plan.md.
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

  return { snapshots, scores, todayStr }
}
