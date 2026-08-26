// Runtime helpers shared by apps/api and apps/miniapp. They live in their own
// modules and are re-exported here because package.json declares only a "."
// entry in its exports map — under NodeNext resolution a deep import such as
// `@weatherteam6/types/units` does not resolve.
export * from './scoreComponents.js'
export * from './units.js'
export * from './conditionsCopy.js'

export type ApiResponse<T> = {
  data: T | null
  error: string | null
  status: number
}

export type RockType = 'sandstone' | 'limestone' | 'granite' | 'basalt' | 'unknown'

export type Location = {
  id: string
  user_id: string
  name: string
  lat: number
  lon: number
  elevation_m: number | null
  is_climbing_location: boolean
  rock_type: RockType | null
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
  /**
   * Whether this row is the location's **local** today, decided server-side.
   *
   * `forecast_date` is a local calendar day (Open-Meteo `timezone=auto`), so a
   * client cannot identify today from its own clock — which is exactly what the
   * Mini App used to do, matching a UTC date against UTC buckets. Both sides
   * were wrong in the same direction, so neither could detect it and today's
   * high became tomorrow's every afternoon in the Americas (issue #33).
   *
   * Optional only for backward compatibility with a cached response from before
   * this shipped; treat a missing value as "unknown", never as `false`.
   */
  is_today?: boolean
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
  /**
   * UNUSED — `conditionsScore` never reads this. The temperature component is
   * computed from `forecastHighC` alone. Kept only to avoid churning every
   * call site and test fixture; do not reason about scoring behaviour from it.
   * A B0 design-spec draft assumed this field drove the temp component and
   * derived a suppression rule that would have hidden a 103 °F heat warning.
   */
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

export type WeatherAlert = {
  id: string
  location_id: string
  nws_alert_id: string
  event: string
  severity: string
  certainty: string
  headline: string | null
  description: string | null
  effective: string | null
  expires: string | null
  created_at: string
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

export type Wall = {
  id: string
  locationId: string
  name: string
  aspectDeg: number
  aspectSource: 'terrain' | 'manual'
  angleDeg: number
  angleBand: 'slab' | 'vertical' | 'steep' | 'roof'
  routeCount: number | null
  createdAt: string
}

export type CreateWallInput = {
  locationId: string
  name: string
  aspectDeg: number
  aspectSource: 'terrain' | 'manual'
  angleDeg: number
  angleBand: 'slab' | 'vertical' | 'steep' | 'roof'
  routeCount?: number
}

export type TripLocation = {
  id: string
  tripId: string
  locationId: string
  createdAt: string
}

export type Trip = {
  id: string
  userId: string
  name: string
  startDate: string
  endDate: string
  notes: string | null
  createdAt: string
  updatedAt: string | null
  locations?: TripLocation[]
}

export type CreateTripInput = {
  name: string
  startDate: string
  endDate: string
  cragIds: string[]
}

export type TripForecast = {
  locationId: string
  forecasts: ForecastSnapshot[]
}

export type CreateLocationInput =
  | { cragId: string }
  | {
      name: string
      lat: number
      lon: number
      // Carried through from the geocoder, or null on the manual-coordinate path.
      // Without it applyLapseRate returns early and a saved location reports
      // different temperatures than its own pre-save preview did.
      elevation_m?: number | null
      timezone?: string | null
      is_climbing_location?: boolean
      // Only meaningful when is_climbing_location is true. Left unset it resolves
      // to 'unknown' — 48h drying — see miniapp-design-v1.md §12.1.
      rock_type?: RockType | null
    }

/** One place from GET /api/v1/geocode — Open-Meteo's geocoding API, proxied server-side. */
export type GeocodeResult = {
  /** Open-Meteo's own place id. Unique within a response; use it as the list key. */
  id: number
  name: string
  lat: number
  lon: number
  elevation_m: number | null
  /** Secondary line in the result list. Near-identical place names are common,
   *  so admin1 + country are not optional decoration — see §12.2. */
  admin1: string | null
  country: string | null
  timezone: string | null
}

export type LocationNormal = {
  id: string
  locationId: string
  month: number
  precipNormalMm: number
  tempMaxNormalC: number
  tempMinNormalC: number
  source: string
  fetchedAt: string
}

export type RadarFrame = {
  time: number
  path: string
}

export type RadarFramesResponse = {
  generated: number
  host: string
  tileUrlTemplate: string
  past: RadarFrame[]
  nowcast: RadarFrame[]
}

export type ClimbabilityHistory = {
  month: number // 1–12
  avg_climbable_days: number
  years_of_data: number
}
