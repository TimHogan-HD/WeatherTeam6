export type ApiResponse<T> = {
  data: T | null
  error: string | null
  status: number
}

export type Location = {
  id: string
  user_id: string
  name: string
  lat: number
  lon: number
  is_climbing_location: boolean
  rock_type: 'sandstone' | 'limestone' | 'granite' | 'basalt' | 'unknown' | null
  aspect: string | null
  cliff_angle: number | null
  asos_station: string | null
  asos_network: string | null
  nws_office: string | null
  nws_grid_x: number | null
  nws_grid_y: number | null
  timezone: string | null
  created_at: string
  updated_at: string | null
}

export type Crag = {
  id: string
  openbeta_id: string
  name: string
  lat: number
  lon: number
  rock_type: string | null
  area_name: string | null
  state: string | null
  created_at: string
}

export type ForecastSnapshot = {
  id: string
  location_id: string
  captured_at: string
  forecast_date: string
  precip_mm_p10: number | null
  precip_mm_p50: number | null
  precip_mm_p90: number | null
  temp_c_min: number | null
  temp_c_max: number | null
  wind_kmh_max: number | null
  humidity_pct: number | null
  model_sources: string[] | null
  created_at: string
  window?: 'pre' | 'early' | 'decision'
}

export type ConditionsScore = {
  id: string
  location_id: string
  forecast_date: string
  score: number | null
  confidence: 'low' | 'medium' | 'high'
  component_drying_time: number | null
  component_upcoming_rain: number | null
  component_wind: number | null
  component_temp: number | null
  component_humidity: number | null
  score_breakdown: ScoreBreakdown | null
  computed_at: string
  created_at: string
}

export type ScoreInput = {
  rockType: 'sandstone' | 'limestone' | 'granite' | 'basalt' | 'unknown'
  aspectDegrees: number
  cliffAngle: number
  hoursSinceRain: number
  lastRainMm: number
  forecastRain72hMm: number
  forecastRain72hP10: number
  forecastRain72hP90: number
  currentWindKmh: number
  maxWindKmh24h: number
  currentTempC: number
  forecastHighC: number
  currentHumidityPct: number
  forecastDateDaysOut: number
}

export type ScoreOutput = {
  score: number | null
  confidence: 'low' | 'medium' | 'high'
  window: 'pre' | 'early' | 'decision'
  components: {
    drying_time: number
    upcoming_rain: number
    wind: number
    temp: number
    humidity: number
  }
  breakdown: ScoreBreakdown | null
}

export type ScoreBreakdown = {
  drying: {
    score: number
    hours_since_rain: number
    hours_remaining: number
    rock_type: string
    modifiers: { angle: number; wind: number; humidity: number }
  }
  rain: { score: number; forecast_72h_mm: number }
  wind: { score: number; max_kmh: number }
  temp: { score: number; temp_c: number }
  humidity: { score: number; pct: number }
  total: number
  confidence: string
  computed_at: string
}

const ASPECT_MAP: Record<string, number> = {
  N: 0,
  NNE: 22,
  NE: 45,
  ENE: 67,
  E: 90,
  ESE: 112,
  SE: 135,
  SSE: 157,
  S: 180,
  SSW: 202,
  SW: 225,
  WSW: 247,
  W: 270,
  WNW: 292,
  NW: 315,
  NNW: 337,
}

export function aspectToDegrees(aspect: string): number {
  return ASPECT_MAP[aspect.toUpperCase()] ?? 180
}

// Drizzle's numeric() columns are returned as strings by postgres-js.
// Use these helpers in API response mappers when converting DB rows to
// Location, ForecastSnapshot, or any other type with number fields.
export function parseNumeric(value: string | null): number | null {
  if (value === null) return null
  return parseFloat(value)
}

export function parseNumericRequired(value: string): number {
  return parseFloat(value)
}
