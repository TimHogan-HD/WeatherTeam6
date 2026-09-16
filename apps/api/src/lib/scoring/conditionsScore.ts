import { TEMP_BAND_C } from '@weatherteam6/types'
import type { ScoreInput, ScoreOutput, ScoreBreakdown } from '@weatherteam6/types'

type RockType = ScoreInput['rockType']

/**
 * **A second copy of `dryingModel.ts`'s `MAX_HOURS`, and the two must agree.**
 * `dryingModel` decides `estimated_dry`; this one scales the 0-40 drying
 * component. They are separate tables for no recorded reason, and a value that
 * differs between them would report a wall as dry while scoring it as wet.
 *
 * Both are `Record<RockType, number>`, so neither can silently omit a rock type —
 * adding one to `ROCK_TYPES` fails the typecheck here until it is given a number.
 * That is the only thing keeping them in step; the *values* are still matched by
 * hand. See the basalt note in `dryingModel.ts` for why there are three of them.
 */
const MAX_HOURS: Record<RockType, number> = {
  sandstone: 72,
  limestone: 24,
  granite: 12,
  basalt: 48,
  basalt_dense: 8,
  basalt_vesicular: 48,
  unknown: 48,
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function confidenceFromSpread(
  p10: number,
  p90: number,
  daysOut: number,
): 'low' | 'medium' | 'high' {
  if (daysOut >= 7) return 'low'
  const spread = p90 - p10
  if (spread <= 2) return 'high'
  if (spread <= 8) return 'medium'
  return 'low'
}

export function conditionsScore(input: ScoreInput): ScoreOutput {
  const { forecastDateDaysOut } = input

  const window: 'pre' | 'early' | 'decision' =
    forecastDateDaysOut > 14 ? 'pre' : forecastDateDaysOut >= 7 ? 'early' : 'decision'

  const confidence = confidenceFromSpread(
    input.forecastRain72hP10,
    input.forecastRain72hP90,
    forecastDateDaysOut,
  )

  if (window === 'pre') {
    return {
      score: null,
      confidence,
      window,
      components: { drying_time: 0, upcoming_rain: 0, wind: 0, temp: 0, humidity: 0 },
      breakdown: null,
    }
  }

  // Step 1: Drying time (0-40)
  // angleFactor: slab (90°) dries 30% slower than vertical wall (0°)
  // windFactor: >20 km/h reduces required drying time by 20%
  // humidityFactor: >80% RH increases required drying time by 30%
  const angleFactor = 1.0 + (input.cliffAngle / 90) * 0.3
  const windFactor = input.currentWindKmh > 20 ? 0.8 : 1.0
  const humidityFactor = input.currentHumidityPct > 80 ? 1.3 : 1.0
  const maxDry = MAX_HOURS[input.rockType] * angleFactor * windFactor * humidityFactor

  let dryingRaw: number
  if (input.hoursSinceRain >= maxDry) dryingRaw = 40
  else if (input.hoursSinceRain <= 0) dryingRaw = 0
  else dryingRaw = (input.hoursSinceRain / maxDry) * 40

  const hours_remaining = Math.max(0, maxDry - input.hoursSinceRain)

  // Step 2: Upcoming rain (0-25)
  let rainRaw: number
  if (input.forecastRain72hMm <= 0) rainRaw = 25
  else if (input.forecastRain72hMm >= 10) rainRaw = 0
  else rainRaw = 25 * (1 - input.forecastRain72hMm / 10)

  // Step 3: Wind (0-15)
  let windRaw: number
  if (input.maxWindKmh24h <= 15) windRaw = 15
  else if (input.maxWindKmh24h >= 50) windRaw = 0
  else windRaw = 15 * (1 - (input.maxWindKmh24h - 15) / 35)

  // Step 4: Temperature (0-12)
  //
  // The breakpoints are `TEMP_BAND_C` in `packages/types` rather than literals,
  // because the Mini App's diverging temperature ramp is centred on the same
  // band. Two copies would let the chart paint an hour neutral on a day the
  // score docked for being too warm, and nothing would detect it.
  const temp = input.forecastHighC
  const { min, idealMin, idealMax, max } = TEMP_BAND_C
  let tempRaw: number
  if (temp < min || temp > max) tempRaw = 0
  else if (temp >= idealMin && temp <= idealMax) tempRaw = 12
  else if (temp < idealMin) tempRaw = ((temp - min) / (idealMin - min)) * 12
  // idealMax–max: linear scale 12→6
  else tempRaw = 12 - ((temp - idealMax) / (max - idealMax)) * 6

  // Step 5: Humidity (0-8)
  let humidityRaw: number
  if (input.currentHumidityPct <= 50) humidityRaw = 8
  else if (input.currentHumidityPct >= 90) humidityRaw = 0
  else humidityRaw = 8 * (1 - (input.currentHumidityPct - 50) / 40)

  const drying_score = Math.round(dryingRaw)
  const rain_score = Math.round(rainRaw)
  const wind_score = Math.round(windRaw)
  const temp_score = Math.round(tempRaw)
  const humidity_score = Math.round(humidityRaw)

  // Sum the already-rounded components so breakdown scores always add up to total.
  const total = clamp(drying_score + rain_score + wind_score + temp_score + humidity_score, 0, 100)

  const breakdown: ScoreBreakdown = {
    drying: {
      score: drying_score,
      hours_since_rain: input.hoursSinceRain,
      hours_remaining,
      rock_type: input.rockType,
      modifiers: { angle: angleFactor, wind: windFactor, humidity: humidityFactor },
    },
    rain: { score: rain_score, forecast_72h_mm: input.forecastRain72hMm },
    wind: { score: wind_score, max_kmh: input.maxWindKmh24h },
    temp: { score: temp_score, temp_c: temp },
    humidity: { score: humidity_score, pct: input.currentHumidityPct },
    total,
    confidence,
    computed_at: new Date().toISOString(),
  }

  return {
    score: total,
    confidence,
    window,
    components: {
      drying_time: drying_score,
      upcoming_rain: rain_score,
      wind: wind_score,
      temp: temp_score,
      humidity: humidity_score,
    },
    breakdown,
  }
}
