// Runtime helpers shared by apps/api and apps/miniapp. They live in their own
// modules and are re-exported here because package.json declares only a "."
// entry in its exports map — under NodeNext resolution a deep import such as
// `@weatherteam6/types/units` does not resolve.
import type { ScoreUnavailableReason } from './conditionsCopy.js'
import type { ConditionsReadings } from './hourly.js'

export * from './scoreComponents.js'
export * from './units.js'
export * from './conditionsCopy.js'
export * from './geocodeCopy.js'
export * from './hourly.js'
export * from './compass.js'
export * from './recentPrecip.js'
export * from './rockTypeCopy.js'
export * from './knownCrags.js'
export * from './readingsCopy.js'
export * from './wallAngle.js'

export type ApiResponse<T> = {
  data: T | null
  error: string | null
  status: number
}

/**
 * What `POST /api/v1/auth/login` returns on success, as the `data` of the
 * standard envelope.
 *
 * `expires_at` is ISO-8601 UTC and is **advisory** — the API re-derives the
 * expiry from the signed token on every request, so a client that ignores this
 * field is merely less polite, not more privileged. It exists so the app can
 * send the user back to the login screen before a call fails rather than after.
 */
export type AuthLoginResponse = {
  token: string
  expires_at: string
}

/**
 * Every rock type the app understands, in one place.
 *
 * **This array is the source and `RockType` is derived from it**, because the
 * list had been written out by hand in six places — this union, `ScoreInput`,
 * `dryingModel.ts`, `seed.ts`, the `VALID_ROCK_TYPES` gate in `routes/locations.ts`
 * and its error message. Adding a value used to mean finding all six, and the two
 * that are `Record<string, …>` lookups rather than typed maps fail *silently*
 * when one is missed: a rock type absent from `VALID_ROCK_TYPES` is rejected with
 * a 400 the picker can still offer, and one absent from `LOOKBACK_DAYS` takes a
 * `?? 3` default that looks like a decision.
 *
 * The Postgres enum in `db/schema.ts` must still spell the values out — Drizzle
 * needs literals — so that one is checked against this array by a type assertion
 * there rather than derived from it.
 *
 * **The full taxonomy of `rock-drying-research.md` §7, owner decision 2026-09-23.**
 * Each value's drying window is in `dryingModel.ts`; every one of them is
 * community convention rather than a measurement, and the table there says so.
 *
 * **Three values mean "the kind was not recorded"** — `sandstone`, `limestone`
 * and `basalt` — and `unknown` means the family was not either. They are kept
 * because rows hold them and because *"sandstone, not sure which"* is an answer
 * a climber can honestly give. Each takes the **slowest** window in its family,
 * so not knowing reads as caution rather than as an average.
 *
 * Order here is by family, and it is the order `ROCK_TYPE_GROUPS` presents.
 */
export const ROCK_TYPES = [
  'granite',
  'granite_weathered',
  'anorthosite',
  'syenite_porous',
  'rhyolite',
  'basalt_dense',
  'basalt',
  'basalt_vesicular',
  'tuff_welded',
  'tuff_nonwelded',
  'volcanic_breccia',
  'quartzite',
  'slate',
  'gneiss_schist',
  'sandstone',
  'sandstone_quartz_arenite',
  'sandstone_ferruginous',
  'sandstone_arkose',
  'sandstone_eolian',
  'sandstone_soft',
  'limestone',
  'limestone_dense',
  'limestone_porous',
  'dolomite',
  'carbonate_cherty',
  'conglomerate',
  'unknown',
] as const

export type RockType = (typeof ROCK_TYPES)[number]

/**
 * Whether an arbitrary string is a rock type this build knows.
 *
 * Exists so the places that receive one as a bare `string` — a `text` column, a
 * request body, an imported crag — narrow it by *asking the list* rather than by
 * casting or by keeping a second copy of the values. `routes/locations.ts` held
 * the only other copy, as a `Set<string>` whose drift would have shown up as the
 * picker offering a type the API answers 400 for.
 */
export function isRockType(value: unknown): value is RockType {
  return typeof value === 'string' && (ROCK_TYPES as readonly string[]).includes(value)
}

export type Location = {
  id: string
  user_id: string
  name: string
  lat: number
  lon: number
  elevation_m: number | null
  is_climbing_location: boolean
  rock_type: RockType | null
  /**
   * The `KNOWN_CRAGS` slug this location was matched to, or null. **When set,
   * `rock_type` came from the research, not from the user, and is locked** —
   * the API ignores a rock type sent for it. Optional because the API and the
   * client deploy separately; an absent field is "not known", never "matched".
   */
  known_crag?: string | null
  aspect: string | null
  /**
   * **Stored convention, which runs backwards from climbers'**: 0 vertical, 90 a
   * flat slab, negative overhanging. Read `wall_angle_deg` for anything a person
   * sees — see `wallAngle.ts`.
   */
  cliff_angle: number | null
  /**
   * Degrees past vertical, climbers' convention: negative slab, 0 vertical,
   * positive overhanging. Derived from `cliff_angle`; null when nobody recorded
   * one. Optional because the API and the client deploy separately — an absent
   * field is unknown, not vertical.
   */
  wall_angle_deg?: number | null
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

  /**
   * The day's conditions score, 0-100.
   *
   * **Three states, and they are not interchangeable:**
   *
   * - a number — the day was scored.
   * - `null` with no `unavailable_reason` — the date is outside the scoring
   *   window (`window: 'pre'`). Nothing was withheld; there is nothing to say.
   * - `null` **with** `unavailable_reason` — the day is deliberately unscored
   *   because an input could not be measured. See that field.
   *
   * Never `0` for either null case. `0` is a real score meaning conditions are
   * as bad as they get, and collapsing "unknown" into it is defect class 1.
   *
   * **Absent entirely for a non-climbing location.** `computeLiveForecast` does
   * not branch on `is_climbing_location` and will happily score a city, so the
   * route withholds it instead. A rock-drying score for Chicago is meaningless
   * and must not render anywhere.
   */
  score?: number | null
  confidence?: 'low' | 'medium' | 'high'
  /**
   * Withheld, not missing (issue #34). Same values and meaning as on
   * `ConditionsScore`: the rainfall lookup *failed*, and its 720-hour sentinel
   * is worth 40 of 100 points, so scoring anyway would credit a dry spell
   * nobody measured. Render `scoreUnavailableLine`, never a score.
   */
  unavailable_reason?: ScoreUnavailableReason | null

  /**
   * The five components behind `score`, same scales as on `ConditionsScore`.
   *
   * **Nothing reads these any more, and they are still sent.** They existed for
   * `summarizeConditions`, whose "limited by drying time" qualifier fired when a
   * component scored 0 — that function, `limitingComponent` and the whole ladder
   * were deleted in scoring v2 Phase 3b, and the surfaces read the v2 readings
   * instead. Phase 5 removes these fields with the scorer that fills them.
   *
   * `null` still means not measured, and a reader must not treat it as 0.
   */
  component_drying_time?: number | null
  component_upcoming_rain?: number | null
  component_wind?: number | null
  component_temp?: number | null
  component_humidity?: number | null
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
  /**
   * Why there is no score, when there is none for a reason other than the date
   * being outside the scoring window (issue #34).
   *
   * A failed rainfall lookup is indistinguishable in the data from a genuinely
   * dry month — `dryingModel` returns the same 720-hour sentinel for both — and
   * that sentinel is worth **40 of 100 points**, the heaviest component. So an
   * upstream outage used to *raise* the score, and a day could read "Dry,
   * settled" for rock nothing had checked.
   *
   * When set, `score` and every component are `null`: the day is not scored at
   * all rather than scored on a guess. Distinct from `score: null` with no
   * reason, which means the date is beyond the scoring window.
   */
  unavailable_reason?: ScoreUnavailableReason | null

  /**
   * **Today's v2 readings — what a surface actually renders.** Set by
   * `GET /conditions/:locationId` and by nothing else.
   *
   * Optional because this type is also built by `computeLiveForecast`, which
   * has no readings to give: the v2 model runs off stored hourly runs and the
   * five-component scorer runs off pooled daily aggregates. Making it required
   * would force every construction site to invent one.
   *
   * **A client must normalise it with `?? null` at the fetch boundary**, not at
   * each use. The API and the Mini App deploy separately, so every release that
   * adds a field has a window where the client is new and the response is not —
   * and `undefined` passes every `=== null` guard (architecture rule; it cost
   * a chart its rain whiskers in production).
   */
  readings?: ConditionsReadings
}

export type ScoreInput = {
  rockType: RockType
  /**
   * UNUSED — `conditionsScore` never reads this, and no component of the score
   * depends on sun, aspect or shade in any way. `liveForecast` derives it from
   * `locations.aspect` and passes it in; nothing on the other side looks at it.
   *
   * This is the same defect as `currentTempC` below, and the comment exists for
   * the same reason: the field is set, typed and plumbed, so a reader has every
   * reason to assume it is live. It is not. **Sun direction contributes zero
   * points today.** Do not reason about scoring behaviour from it.
   *
   * Two shipped competitors handle sun by feeding solar radiation into a "feels
   * like" temperature rather than by scoring an aspect field, and this repo
   * already fetches that radiation on every request (`shortwave_wm2` in
   * `openMeteo.ts`) and then drops it — nothing reads it, and its only column
   * sits on `forecast_snapshots`, which nothing writes. See §21.3 and §21.6 of
   * `.claude/docs/climbing-terminology-research.md` before designing anything here.
   */
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
  /** GeoNames feature code (`PPL`, `PRK`, `DAM`, ...) — feed to `geocodeKindLabel`
   *  for a plain-language kind. Without it, near-identical results across
   *  categories (a town, its dam, and a state park all named "Willow River")
   *  are indistinguishable in the picker — see issue #82. */
  feature_code: string | null
  /** Set only on a row from OpenBeta's climbing areas rather than the place
   *  geocoder; those rows lead the list. Optional because the API and the client
   *  deploy separately — absent means an ordinary place. */
  climbing_area?: { climbs: number; parent: string | null } | null
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
