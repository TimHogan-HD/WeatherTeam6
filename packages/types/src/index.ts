// Runtime helpers shared by apps/api and apps/miniapp. They live in their own
// modules and are re-exported here because package.json declares only a "."
// entry in its exports map — under NodeNext resolution a deep import such as
// `@weatherteam6/types/units` does not resolve.
import type { ConditionsReadings } from './hourly.js'

export * from './scoreComponents.js'
export * from './units.js'
export * from './conditionsCopy.js'
export * from './geocodeCopy.js'
export * from './hourly.js'
export * from './compass.js'
export * from './recentPrecip.js'
export * from './rockTypeCopy.js'
export * from './rockGuide.js'
export * from './knownCrags.js'
export * from './readingsCopy.js'
export * from './wallAngle.js'
export * from './feedback.js'
export * from './guidebook.js'
export * from './logbook.js'
export * from './preferences.js'
export * from './tripCopy.js'

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
}

/**
 * `GET /conditions/:locationId` — **today's Crag A readings, and nothing else**.
 * It replaced the five-component `ConditionsScore` row in scoring Phase 5b
 * (2026-10-01), whose only field any surface still read was `readings`.
 */
export type Conditions = {
  location_id: string
  /** The location's local today, or null when no hourly run answered (and for a non-crag). */
  forecast_date: string | null
  /**
   * What a surface renders. **A client must still normalise it with `?? null`
   * at the fetch boundary**: the API and the web app deploy separately, and
   * `undefined` passes every `=== null` guard.
   */
  readings: ConditionsReadings
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

/**
 * One local day of the 16-day ensemble outlook: weather only, never a score.
 * Scores exist only where `/hourly` readings reach (7 days).
 *
 * Every figure is over the members that reached this day, so `member_count`
 * falls with distance as models run out. `members_wet / member_count` is the
 * chance of measurable rain; `members_wet` null (no members) withholds it.
 */
export type OutlookDay = {
  local_date: string
  /** Server-marked against the location's local today. */
  is_today: boolean
  /** Median of each member's own daily high, never the hottest member. */
  temp_c_max: number | null
  temp_c_min: number | null
  /** Mean of the members' daily totals. The only precipitation figure here that sums. */
  precip_mm_mean: number | null
  members_wet: number | null
  member_count: number
  /** The ensemble models with members on this day. */
  models: string[]
}

/**
 * The trip's rain, as a range: each member's own precipitation summed over the
 * trip days, then the mean and percentiles of those totals. Adding daily
 * percentiles would give a different, meaningless answer.
 *
 * **It covers `days_covered` days, not the whole trip** whenever the trip has
 * started already or runs past the horizon. Only members that reached every one
 * of those days are summed, so `member_count` can be smaller than any one day's.
 */
export type TripRainTotal = {
  mean_mm: number
  p10_mm: number
  p90_mm: number
  member_count: number
  days_covered: number
}

/**
 * `GET /trips/:tripId/forecast`, one per trip location: the outlook days inside
 * the trip's dates. **`days: null` means the outlook could not be read** for this
 * location; `[]` means none of the trip's days is inside the 16-day horizon yet.
 * `trip_days` is the trip's whole length, so a reader can see how much of it the
 * days and the rain total reach.
 */
export type TripOutlook =
  | {
      locationId: string
      utc_offset_seconds: number
      trip_days: number
      days: OutlookDay[]
      /** Null when no trip day is inside the horizon or no member reached them all. */
      rain_total: TripRainTotal | null
      /** The lowest and highest of the days' `temp_c_max`. Null when no day has one. */
      high_c_range: { min: number; max: number } | null
    }
  | {
      locationId: string
      utc_offset_seconds: null
      trip_days: number
      days: null
      rain_total: null
      high_c_range: null
    }

/**
 * One recording of a trip's rain total and warmest high at one location: a
 * point of the forecast trend. `recorded_at` is the cron firing's hour.
 *
 * **`days_covered < trip_days` marks a total over part of the trip**, and the
 * total jumps when the next day enters the horizon; a chart must mark such a
 * point rather than draw the jump as the forecast getting wetter. The rain
 * figures are null together when no member reached every covered day.
 */
export type TripTrendPoint = {
  recorded_at: string
  mean_mm: number | null
  p10_mm: number | null
  p90_mm: number | null
  days_covered: number | null
  trip_days: number
  high_c_max: number | null
}

/** `GET /trips/:tripId/trend`, one per trip location, points oldest first. `[]` before the first recording. */
export type TripTrend = {
  locationId: string
  points: TripTrendPoint[]
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

/** A state on `/add`'s browse list — GET /api/v1/climbing-areas. */
export type ClimbingStateSummary = {
  /** Two-letter code, the path segment for its level. */
  code: string
  name: string
  climbs: number
  /** Its top-level areas. */
  areas: number
}

/** One OpenBeta area while browsing. `place` is what picking it saves, the same shape search returns. */
export type ClimbingAreaEntry = {
  /** OpenBeta's id: names repeat, so browsing walks ids. */
  area_id: string
  /** The areas directly inside it; 0 means a leaf, picked rather than opened. */
  sub_areas: number
  place: GeocodeResult
}

/** One level of a state's tree — GET /api/v1/climbing-areas/:state[/:areaId]. */
export type ClimbingAreaLevel = {
  state: { code: string; name: string }
  /** The area this level opens, or null at the state itself. */
  area: ClimbingAreaEntry | null
  /** The areas between the state and `area`, outermost first, `area` excluded. */
  path: { area_id: string; name: string }[]
  /** Most climbs first. */
  children: ClimbingAreaEntry[]
}

/**
 * What GET /api/v1/geocode/reverse knows about a point — a GPS fix on `/add`.
 * The name is the town or city OpenStreetMap puts the point in; the elevation is
 * Open-Meteo's terrain model. Each is null when its lookup found nothing or
 * failed: a missing name leaves the reader to type one, and a missing elevation
 * skips the lapse-rate correction rather than guessing it.
 */
export type ReverseGeocode = {
  name: string | null
  admin1: string | null
  country: string | null
  elevation_m: number | null
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
