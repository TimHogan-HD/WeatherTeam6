import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  numeric,
  integer,
  timestamp,
  date,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core'

// Enum types
export const rockTypeEnum = pgEnum('rock_type', [
  'sandstone',
  'limestone',
  'granite',
  'basalt',
  'unknown',
])

export const rainfallSourceEnum = pgEnum('rainfall_source', [
  'acis',
  'open_meteo_historical',
  'iem_asos',
])

export const confidenceEnum = pgEnum('confidence_level', ['low', 'medium', 'high'])

export const overallStatusEnum = pgEnum('overall_status', ['dry', 'damp', 'wet', 'mixed'])

// Tables

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  lat: numeric('lat').notNull(),
  lon: numeric('lon').notNull(),
  elevation_m: numeric('elevation_m'),
  is_climbing_location: boolean('is_climbing_location').default(false).notNull(),
  rock_type: rockTypeEnum('rock_type'),
  aspect: text('aspect'),
  cliff_angle: numeric('cliff_angle'),
  asos_station: text('asos_station'),
  asos_network: text('asos_network'),
  nws_office: text('nws_office'),
  nws_grid_x: integer('nws_grid_x'),
  nws_grid_y: integer('nws_grid_y'),
  timezone: text('timezone'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }),
})

export const crags = pgTable('crags', {
  id: uuid('id').primaryKey().defaultRandom(),
  openbeta_id: text('openbeta_id').notNull().unique(),
  name: text('name').notNull(),
  lat: numeric('lat').notNull(),
  lon: numeric('lon').notNull(),
  rock_type: text('rock_type'),
  area_name: text('area_name'),
  state: text('state'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const rainfallHistory = pgTable(
  'rainfall_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    location_id: uuid('location_id')
      .notNull()
      .references(() => locations.id),
    date: date('date').notNull(),
    precip_mm: numeric('precip_mm').notNull(),
    source: rainfallSourceEnum('source').notNull(),
    station_id: text('station_id'),
    verified: boolean('verified').default(false).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.location_id, t.date)],
)

export const forecastSnapshots = pgTable('forecast_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  location_id: uuid('location_id')
    .notNull()
    .references(() => locations.id),
  captured_at: timestamp('captured_at', { withTimezone: true }).notNull(),
  forecast_date: date('forecast_date').notNull(),
  precip_mm_p10: numeric('precip_mm_p10'),
  precip_mm_p50: numeric('precip_mm_p50'),
  precip_mm_p90: numeric('precip_mm_p90'),
  temp_c_min: numeric('temp_c_min'),
  temp_c_max: numeric('temp_c_max'),
  wind_kmh_max: numeric('wind_kmh_max'),
  humidity_pct: numeric('humidity_pct'),
  dewpoint_c: numeric('dewpoint_c'),
  shortwave_wm2: numeric('shortwave_wm2'),
  model_sources: text('model_sources').array(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// No unique constraint — multiple rows per (location_id, forecast_date) accumulate
// for score evolution tracking across job runs.
export const conditionsScores = pgTable('conditions_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  location_id: uuid('location_id')
    .notNull()
    .references(() => locations.id),
  forecast_date: date('forecast_date').notNull(),
  score: integer('score'),
  confidence: confidenceEnum('confidence').notNull(),
  component_drying_time: integer('component_drying_time'),
  component_upcoming_rain: integer('component_upcoming_rain'),
  component_wind: integer('component_wind'),
  component_temp: integer('component_temp'),
  component_humidity: integer('component_humidity'),
  score_breakdown: jsonb('score_breakdown'),
  computed_at: timestamp('computed_at', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const trips = pgTable('trips', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  target_date: date('target_date').notNull(),
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }),
})

export const tripLocations = pgTable('trip_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  trip_id: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  location_id: uuid('location_id')
    .notNull()
    .references(() => locations.id),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const cragClimbabilityHistory = pgTable(
  'crag_climbability_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    location_id: uuid('location_id')
      .notNull()
      .references(() => locations.id),
    month: integer('month').notNull(),
    year: integer('year').notNull(),
    climbable_days: integer('climbable_days').notNull().default(0),
    total_days: integer('total_days').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.location_id, t.month, t.year)],
)

export const conditionsReports = pgTable('conditions_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  location_id: uuid('location_id')
    .notNull()
    .references(() => locations.id),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id),
  reported_at: timestamp('reported_at', { withTimezone: true }).defaultNow().notNull(),
  visited_at: date('visited_at'),
  overall_status: overallStatusEnum('overall_status'),
  rating: integer('rating'),
  notes: text('notes'),
  photo_urls: text('photo_urls').array(),
  forecast_matched: boolean('forecast_matched'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const premiumPulls = pgTable('premium_pulls', {
  id: uuid('id').primaryKey().defaultRandom(),
  location_id: uuid('location_id')
    .notNull()
    .references(() => locations.id),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id),
  pulled_at: timestamp('pulled_at', { withTimezone: true }).defaultNow().notNull(),
  raw_response: jsonb('raw_response'),
  cost_usd: numeric('cost_usd'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const pushTokens = pgTable('push_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id),
  token: text('token').notNull().unique(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const userPreferences = pgTable('user_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id),
  temp_unit: text('temp_unit').default('F').notNull(),
  precip_unit: text('precip_unit').default('in').notNull(),
  default_rock_type: text('default_rock_type'),
  alert_enabled: boolean('alert_enabled').default(true).notNull(),
  alert_min_score: integer('alert_min_score').default(70).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }),
})
