export type DryingModelInput = {
  rockType: 'sandstone' | 'limestone' | 'granite' | 'basalt' | 'unknown'
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

const MAX_DRY_HOURS: Record<string, number> = {
  sandstone: 72,
  limestone: 24,
  granite: 12,
  basalt: 48,
  unknown: 48,
}

// Threshold for "significant" rain per spec Resolution 1
const SIGNIFICANT_RAIN_MM = 2

// cliff_angle: 0 = vertical wall (fastest drying), 90 = flat slab (slowest)
// Modifier ranges from 0.7 (vertical) to 1.3 (flat)
function angleModifier(cliffAngle: number): number {
  const clamped = Math.max(0, Math.min(90, cliffAngle))
  return 0.7 + (clamped / 90) * 0.6
}

function deriveConfidence(
  eventCount: number,
): DryingModelOutput['confidence'] {
  if (eventCount >= 7) return 'high'
  if (eventCount >= 3) return 'medium'
  return 'low'
}

export function dryingModel(input: DryingModelInput): DryingModelOutput {
  const { rockType, cliffAngle, rainfallEvents, asOf } = input

  const maxDry = (MAX_DRY_HOURS[rockType] ?? MAX_DRY_HOURS['unknown']!) * angleModifier(cliffAngle)
  const confidence = deriveConfidence(rainfallEvents.length)

  const significantEvents = rainfallEvents
    .filter((e) => e.precip_mm > SIGNIFICANT_RAIN_MM)
    .sort((a, b) => b.date.localeCompare(a.date)) // most recent first

  if (significantEvents.length === 0) {
    // No significant rain found — estimate using how many days of data we have
    const hoursSince = rainfallEvents.length * 24
    return {
      hours_since_significant_rain: hoursSince,
      last_rain_mm: 0,
      estimated_dry: hoursSince >= maxDry,
      confidence,
    }
  }

  const lastEvent = significantEvents[0]!
  // Use noon UTC as a conservative midpoint for the rain day
  const lastRainDate = new Date(lastEvent.date + 'T12:00:00Z')
  const hoursSince = Math.max(
    0,
    (asOf.getTime() - lastRainDate.getTime()) / (1000 * 60 * 60),
  )

  return {
    hours_since_significant_rain: hoursSince,
    last_rain_mm: lastEvent.precip_mm,
    estimated_dry: hoursSince >= maxDry,
    confidence,
  }
}
