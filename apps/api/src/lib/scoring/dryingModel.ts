// Stub — real implementation built in Phase 4.
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

export function dryingModel(_input: DryingModelInput): DryingModelOutput {
  return {
    hours_since_significant_rain: 0,
    last_rain_mm: 0,
    estimated_dry: false,
    confidence: 'low',
  }
}
