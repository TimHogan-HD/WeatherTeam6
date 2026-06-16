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

        // Sort once, ascending by date — the 72h aggregates below assume this order.
        const days = [...forecast.days].sort((a, b) => a.date.localeCompare(b.date))
        const modelSources = forecast.model_sources

        const snapshotValues: (typeof forecastSnapshots.$inferInsert)[] = days.map((day) => ({
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
          model_sources: modelSources,
        }))

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

        // Score computation is pure CPU and runs BEFORE the transaction: a scoring
        // failure must not discard a freshly fetched forecast — it degrades to
        // snapshots stored without scores.
        let scoreInserts: (typeof conditionsScores.$inferInsert)[] = []
        try {
          // Call dryingModel unconditionally — it returns the NO_RECENT_RAIN sentinel (720h)
          // when the events array is empty, so skipping it for empty rainfall would default
          // hoursSinceRain to 0 ("rained right now") which is wrong for new/data-gap locations.
          const dryResult = dryingModel({
            rockType: loc.rock_type ?? 'unknown',
            cliffAngle: parseNum(loc.cliff_angle, 45),
            rainfallEvents: rainfall.map((r) => ({
              date: r.date,
              precip_mm: parseFloat(r.precip_mm),
            })),
            asOf: now,
          })
          const hoursSinceRain = dryResult.hours_since_significant_rain
          const lastRainMm = dryResult.last_rain_mm

          // Current conditions from today's forecast day (proxy for live obs until Phase 4)
          const todayDay = days.find((d) => d.date === todayStr)
          if (!todayDay) {
            logger.warn(
              { locationId: loc.id, todayStr },
              '[forecast-snapshot] no forecast day matching today — forecast may start from tomorrow; current-condition proxies will use zero defaults',
            )
          }
          const currentWindKmh = todayDay?.wind_kmh_max ?? 0
          const currentTempC = ((todayDay?.temp_c_min ?? 0) + (todayDay?.temp_c_max ?? 0)) / 2
          const currentHumidityPct = todayDay?.humidity_pct ?? 50

          const rockType = loc.rock_type ?? 'unknown'
          const cliffAngle = parseNum(loc.cliff_angle, 45)
          const aspectDegrees = aspectToDegrees(loc.aspect ?? '')
          const todayDate = new Date(todayStr + 'T00:00:00Z')

          for (let i = 0; i < days.length; i++) {
            const day = days[i]
            if (!day) continue

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

            scoreInserts.push({
              location_id: loc.id,
              forecast_date: day.date,
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
        } catch (scoreErr) {
          const msg = scoreErr instanceof Error ? scoreErr.message : String(scoreErr)
          logger.error(
            { locationId: loc.id, err: msg },
            '[forecast-snapshot] score computation failed — storing snapshots without scores',
          )
          scoreInserts = []
        }

        // Idempotency: atomically purge existing snapshots and scores for this location
        // and replace them. The transaction guarantees a crash or BullMQ retry leaves
        // either the old set or the new set — never a gap or a mix.
        await db.transaction(async (tx) => {
          await tx
            .delete(forecastSnapshots)
            .where(
              and(eq(forecastSnapshots.location_id, loc.id), gte(forecastSnapshots.forecast_date, todayStr)),
            )
          await tx
            .delete(conditionsScores)
            .where(
              and(eq(conditionsScores.location_id, loc.id), gte(conditionsScores.forecast_date, todayStr)),
            )
          await tx.insert(forecastSnapshots).values(snapshotValues)
          if (scoreInserts.length > 0) {
            await tx.insert(conditionsScores).values(scoreInserts)
          }
        })

        logger.info(
          { locationId: loc.id, days: days.length },
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
