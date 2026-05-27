import { Worker, type Job } from 'bullmq'
import { and, eq, gte } from 'drizzle-orm'
import { aspectToDegrees } from '@weatherteam6/types'
import { db } from '../../db/index.js'
import { conditionsScores, forecastSnapshots, locations, rainfallHistory } from '../../db/schema.js'
import { logger } from '../../lib/logger.js'
import { conditionsScore } from '../../lib/scoring/conditionsScore.js'
import { dryingModel } from '../../lib/scoring/dryingModel.js'
import {
  fetchEnsemble,
  fetchNBM,
  type ForecastLocation,
  type OpenMeteoResult,
} from '../../lib/weather/openMeteo.js'
import { bullConnection } from '../connection.js'

type SnapshotRow = typeof forecastSnapshots.$inferSelect

function parseNum(v: string | null | undefined, fallback: number): number {
  if (v === null || v === undefined) return fallback
  const n = parseFloat(v)
  return isFinite(n) ? n : fallback
}

export const forecastSnapshotWorker = new Worker(
  'forecast-snapshot',
  async (_job: Job) => {
    logger.info('[forecast-snapshot] job started')

    const allLocations = await db.select().from(locations)
    if (allLocations.length === 0) {
      logger.info('[forecast-snapshot] no locations to process')
      return
    }

    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    const thirtyDaysAgoStr = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    const errors: Error[] = []

    for (const loc of allLocations) {
      try {
        const lat = parseNum(loc.lat, 0)
        const lon = parseNum(loc.lon, 0)
        const elevM = loc.elevation_m !== null ? parseNum(loc.elevation_m, 0) : null
        const locCoords: ForecastLocation = { lat, lon, elevation_m: elevM }

        let forecast: OpenMeteoResult | null = null
        try {
          forecast = await fetchNBM(locCoords)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          logger.warn(
            { locationId: loc.id, err: msg },
            '[forecast-snapshot] NBM fetch failed, falling back to ensemble',
          )
        }
        if (!forecast) {
          forecast = await fetchEnsemble(locCoords)
        }

        if (forecast.days.length === 0) {
          logger.warn({ locationId: loc.id }, '[forecast-snapshot] no forecast days returned')
          continue
        }

        if (forecast.model_sources.length === 0) {
          logger.warn({ locationId: loc.id }, '[forecast-snapshot] no recognizable model sources in response — key format may have changed')
        }

        // Batch insert all forecast_snapshots for this location
        const snapshotRows: SnapshotRow[] = await db
          .insert(forecastSnapshots)
          .values(
            forecast.days.map((day) => ({
              location_id: loc.id,
              captured_at: now,
              forecast_date: day.date,
              precip_mm_p10: String(day.precip_mm_p10),
              precip_mm_p50: String(day.precip_mm_p50),
              precip_mm_p90: String(day.precip_mm_p90),
              temp_c_min: String(day.temp_c_min),
              temp_c_max: String(day.temp_c_max),
              wind_kmh_max: String(day.wind_kmh_max),
              humidity_pct: String(day.humidity_pct),
              dewpoint_c: String(day.dewpoint_c),
              shortwave_wm2: String(day.shortwave_wm2),
              model_sources: forecast.model_sources,
            })),
          )
          .returning()

        // Sort by forecast_date ascending
        snapshotRows.sort((a, b) => a.forecast_date.localeCompare(b.forecast_date))

        // Query rainfall history for drying model
        const rainfall = await db
          .select({ date: rainfallHistory.date, precip_mm: rainfallHistory.precip_mm })
          .from(rainfallHistory)
          .where(
            and(
              eq(rainfallHistory.location_id, loc.id),
              gte(rainfallHistory.date, thirtyDaysAgoStr),
            ),
          )

        let hoursSinceRain = 0
        let lastRainMm = 0

        if (rainfall.length > 0) {
          const result = dryingModel({
            rockType: loc.rock_type ?? 'unknown',
            cliffAngle: parseNum(loc.cliff_angle, 45),
            rainfallEvents: rainfall.map((r) => ({
              date: r.date,
              precip_mm: parseFloat(r.precip_mm),
            })),
            asOf: now,
          })
          hoursSinceRain = result.hours_since_significant_rain
          lastRainMm = result.last_rain_mm
        }

        // Current conditions from today's snapshot (proxy for live obs until Phase 4)
        const todaySnap = snapshotRows.find((s) => s.forecast_date === todayStr)
        if (!todaySnap) {
          logger.warn(
            { locationId: loc.id, todayStr },
            '[forecast-snapshot] no snapshot matching today — forecast may start from tomorrow; current-condition proxies will use zero defaults',
          )
        }
        const currentWindKmh = parseNum(todaySnap?.wind_kmh_max, 0)
        const todayTempMin = parseNum(todaySnap?.temp_c_min, 0)
        const todayTempMax = parseNum(todaySnap?.temp_c_max, 0)
        const currentTempC = (todayTempMin + todayTempMax) / 2
        const currentHumidityPct = parseNum(todaySnap?.humidity_pct, 50)

        const rockType = loc.rock_type ?? 'unknown'
        const cliffAngle = parseNum(loc.cliff_angle, 45)
        const aspectDegrees = aspectToDegrees(loc.aspect ?? '')

        // Compute and insert one conditions_score row per forecast day
        for (let i = 0; i < snapshotRows.length; i++) {
          const snap = snapshotRows[i]
          if (!snap) continue

          const forecastDate = new Date(snap.forecast_date + 'T00:00:00Z')
          const todayDate = new Date(todayStr + 'T00:00:00Z')
          const forecastDateDaysOut = Math.round(
            (forecastDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24),
          )

          // 72h aggregate: sum this day + next 2 days
          const next3 = snapshotRows.slice(i, i + 3)
          const forecastRain72hP10 = next3.reduce(
            (sum, s) => sum + parseNum(s.precip_mm_p10, 0),
            0,
          )
          const forecastRain72hMm = next3.reduce(
            (sum, s) => sum + parseNum(s.precip_mm_p50, 0),
            0,
          )
          const forecastRain72hP90 = next3.reduce(
            (sum, s) => sum + parseNum(s.precip_mm_p90, 0),
            0,
          )

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
            forecastHighC: parseNum(snap.temp_c_max, currentTempC),
            currentHumidityPct,
            forecastDateDaysOut,
          })

          await db.insert(conditionsScores).values({
            location_id: loc.id,
            forecast_date: snap.forecast_date,
            score: output.score,
            confidence: output.confidence,
            component_drying_time: output.components.drying_time,
            component_upcoming_rain: output.components.upcoming_rain,
            component_wind: output.components.wind,
            component_temp: output.components.temp,
            component_humidity: output.components.humidity,
            score_breakdown: output.breakdown,
            computed_at: now,
          })
        }

        logger.info(
          { locationId: loc.id, days: snapshotRows.length },
          '[forecast-snapshot] location processed',
        )
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        logger.error({ locationId: loc.id, err: e.message }, '[forecast-snapshot] location failed')
        errors.push(e)
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `[forecast-snapshot] ${errors.length} location(s) failed: ${errors.map((e) => e.message).join('; ')}`,
      )
    }

    logger.info('[forecast-snapshot] job completed')
  },
  { connection: bullConnection, concurrency: 1 },
)

forecastSnapshotWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'forecast-snapshot job failed')
})
