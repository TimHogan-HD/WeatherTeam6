export type RockType = 'sandstone' | 'limestone' | 'granite' | 'basalt' | 'unknown'

export type DryingModelInput = {
  rockType: RockType
  cliffAngle: number
  rainfallEvents: { date: string; precip_mm: number }[]
  asOf: Date
}

export type DryingModelOutput = {
  hours_since_significant_rain: number
  last_rain_mm: number
  estimated_dry: boolean
  confidence: 'low' | 'medium' | 'high'
}

const MIN_HOURS: Record<RockType, number> = {
  sandstone: 24,
  limestone: 6,
  granite: 2,
  basalt: 12,
  unknown: 24,
}

const MAX_HOURS: Record<RockType, number> = {
  sandstone: 72,
  limestone: 24,
  granite: 12,
  basalt: 48,
  unknown: 48,
}

const SIGNIFICANT_RAIN_MM = 2
const NO_RECENT_RAIN_HOURS = 720 // 30 days — well past any rock type's maxDry

export function dryingModel(input: DryingModelInput): DryingModelOutput {
  const significant = input.rainfallEvents.filter((e) => e.precip_mm > SIGNIFICANT_RAIN_MM)

  if (significant.length === 0) {
    return {
      hours_since_significant_rain: NO_RECENT_RAIN_HOURS,
      last_rain_mm: 0,
      estimated_dry: true,
      confidence: 'high',
    }
  }

  // Most recent significant event by date string (ISO YYYY-MM-DD sorts correctly)
  let mostRecent = significant[0]!
  for (const e of significant) {
    if (e.date > mostRecent.date) mostRecent = e
  }

  // Measured from the END of the rain day. An event dated today therefore ends
  // in the future relative to `asOf`, which made the raw figure negative — about
  // -14h at midday. Clamped, because every consumer treats this as an elapsed
  // duration: `conditionsScore` already floors the drying component at
  // `hoursSinceRain <= 0`, so the clamp changes no score, and the display cap in
  // `formatHoursSinceRain` no longer has to render "no rain in -14h".
  const eventEnd = new Date(mostRecent.date + 'T23:59:59Z').getTime()
  const hoursSince = Math.max(0, (input.asOf.getTime() - eventEnd) / 3_600_000)

  // Cliff angle modifier: 0° vertical = base, 90° slab = 30% longer drying.
  // Steeper walls (lower angle) drain water faster, so get the base factor.
  const angleFactor = 1.0 + (input.cliffAngle / 90) * 0.3

  const maxDry = MAX_HOURS[input.rockType] * angleFactor
  const minDry = MIN_HOURS[input.rockType] * angleFactor

  const estimated_dry = hoursSince >= maxDry

  let confidence: 'low' | 'medium' | 'high'
  if (hoursSince >= maxDry) confidence = 'high'
  else if (hoursSince >= minDry) confidence = 'medium'
  else confidence = 'low'

  return {
    hours_since_significant_rain: hoursSince,
    last_rain_mm: mostRecent.precip_mm,
    estimated_dry,
    confidence,
  }
}
