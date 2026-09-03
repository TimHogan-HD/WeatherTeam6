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
  doublePrecision,
  primaryKey,
  index,
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

// Adding a table with a `location_id` FK? Add it to DEPENDENT_TABLES in
// `lib/locations/deleteLocation.ts` too. No FK here declares `onDelete`, so a
// dependent table left off that list turns DELETE /locations/:id into a
// foreign-key violation — a 500 that only appears once real data exists.
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
  start_date: date('start_date').notNull(),
  end_date: date('end_date').notNull(),
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

export const locationNormals = pgTable(
  'location_normals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    location_id: uuid('location_id')
      .notNull()
      .references(() => locations.id),
    month: integer('month').notNull(),
    precip_normal_mm: numeric('precip_normal_mm').notNull(),
    temp_max_normal_c: numeric('temp_max_normal_c').notNull(),
    temp_min_normal_c: numeric('temp_min_normal_c').notNull(),
    source: text('source').notNull().default('acis_grid_91_20'),
    fetched_at: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.location_id, t.month)],
)

export const pushTokens = pgTable('push_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id),
  token: text('token').notNull().unique(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const weatherAlerts = pgTable(
  'weather_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    location_id: uuid('location_id')
      .notNull()
      .references(() => locations.id),
    nws_alert_id: text('nws_alert_id').notNull(),
    event: text('event').notNull(),
    severity: text('severity').notNull(),
    certainty: text('certainty').notNull(),
    headline: text('headline'),
    description: text('description'),
    effective: timestamp('effective', { withTimezone: true }),
    expires: timestamp('expires', { withTimezone: true }),
    notified_at: timestamp('notified_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.location_id, t.nws_alert_id)],
)

export const walls = pgTable('walls', {
  id: uuid('id').primaryKey().defaultRandom(),
  location_id: uuid('location_id')
    .notNull()
    .references(() => locations.id),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  aspect_deg: integer('aspect_deg').notNull(),
  aspect_source: text('aspect_source').notNull(),
  angle_deg: integer('angle_deg').notNull(),
  angle_band: text('angle_band').notNull(),
  route_count: integer('route_count'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }),
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

/**
 * One row per bot panel message — the state behind the buttons on it.
 *
 * The `callback_data` field Telegram gives a button is 64 bytes, which cannot
 * carry a view, a model, an interval, a day offset, a column set, units and a
 * mode. The button therefore carries an 8-character id into this table and one
 * field to change; everything else is read back from the row.
 *
 * `location_id` is nullable because a panel may point at an unsaved geocoded
 * point (Phase 5), which is what `lat` / `lon` / `place_name` are for. It is a
 * real FK, so **`panel_states` is in `DEPENDENT_TABLES`** — a location with a
 * panel open would otherwise fail to delete with a foreign-key violation
 * surfacing as a generic 500.
 *
 * `elevation_m` and `feature_code` are Phase 5's, for the same unsaved-point
 * case: the `/weather <place>` preview needs elevation so its temperature
 * agrees with the location it becomes after Save (`applyLapseRate` returns
 * early when it is null), and `feature_code` is what lets the preview panel
 * name the kind of place it is (`geocodeKindLabel`) — the same disambiguation
 * issue #82 fixed for the Mini App's picker.
 *
 * Named `interval_hours` and `column_set` rather than the plan's `interval` and
 * `columns`: both of those are Postgres keywords that only work quoted, and a
 * column that must always be quoted is a trap for the first raw statement
 * anyone writes against it.
 *
 * Rows are pruned after 7 days (`prunePanelStates`). A button whose row is gone
 * says "expired" — it never guesses at the state it lost.
 */
export const panelStates = pgTable('panel_states', {
  /** 8 lowercase hex characters, generated by `panelState.ts` — not a uuid, because it has to fit in `callback_data`. */
  id: text('id').primaryKey(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id),
  location_id: uuid('location_id').references(() => locations.id),
  lat: numeric('lat'),
  lon: numeric('lon'),
  place_name: text('place_name'),
  elevation_m: numeric('elevation_m'),
  feature_code: text('feature_code'),
  view: text('view').notNull(),
  model: text('model'),
  interval_hours: integer('interval_hours'),
  day_offset: integer('day_offset').default(0).notNull(),
  column_set: text('column_set'),
  units: text('units').default('imperial').notNull(),
  mode: text('mode').default('simple').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

/**
 * One fetch of one model at one point — the parent of every stored hour.
 *
 * `point_key` is what makes an ad-hoc `/weather <place>` lookup storable: it is
 * `loc:<uuid>` for a saved location and `pt:<lat4>,<lon4>` for a geocoded point
 * that has no row (`pointKey()` in `lib/runs/pointKey.ts` is the only place that
 * spelling is built). `location_id` is set as well whenever there is one, because
 * that is the FK a location delete has to walk.
 *
 * `fetched_at` is when **this process asked**, not when the model initialized.
 * Probe A found Open-Meteo exposes no run time under any name, so nothing here
 * may be labelled "12Z run".
 *
 * `raw` holds the upstream payload for 48 hours and is the re-derivation path
 * for anything the parsed rows dropped. **Never log it or serialise it into an
 * error** — go through `describeError`.
 */
export const weatherRuns = pgTable(
  'weather_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** `loc:<uuid>` or `pt:<lat4>,<lon4>`. Present even when `location_id` is. */
    point_key: text('point_key').notNull(),
    location_id: uuid('location_id').references(() => locations.id),
    /** A deterministic model name, or `'ensemble'` for the pooled ensemble run. */
    model: text('model').notNull(),
    /** `'deterministic'` or `'ensemble'` — which child table carries this run's hours. */
    kind: text('kind').notNull(),
    fetched_at: timestamp('fetched_at', { withTimezone: true }).notNull(),
    utc_offset_seconds: integer('utc_offset_seconds').notNull(),
    /** Open-Meteo's resolved elevation for the point — one value per request, not per model. */
    model_elevation_m: doublePrecision('model_elevation_m'),
    /**
     * True when this model's `precipitation_probability` series was byte-identical
     * to another model's in the same response, so the column cannot be attributed
     * to it. **Null means the question does not apply** (an ensemble run), not
     * "no" — a renderer must treat null as unknown and withhold the model name.
     */
    precip_prob_is_shared: boolean('precip_prob_is_shared'),
    raw: jsonb('raw'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Re-collecting the same point/model at the same instant is the retry case:
    // the write is an upsert on this key, so a cron that runs twice leaves one row.
    unique('weather_runs_point_model_fetch').on(t.point_key, t.model, t.fetched_at),
    // Both the prune and "the most recent run for this point" read this way.
    index('weather_runs_point_fetched_at_idx').on(t.point_key, t.fetched_at),
    index('weather_runs_fetched_at_idx').on(t.fetched_at),
  ],
)

/**
 * One hour of one deterministic run.
 *
 * **Every value is nullable and that is the point.** Past a model's own horizon
 * the upstream arrays simply stop, and NBM returns 384 nulls for
 * `surface_pressure` at every point measured. A null stored as 0 is a
 * temperature of 0 °C, a wind of 0 km/h and a pressure of 0 mb that no reader
 * can tell from a measurement.
 *
 * `valid_at` is a real UTC instant, converted from the response's local
 * wall-clock strings through `localTimeToUtc`. Storing the local string would
 * make two points in different zones incomparable.
 *
 * Keyed off `run_id`, **not** `location_id`, so this table is unreachable by
 * `DEPENDENT_TABLES` in `deleteLocation.ts` — see the ordered cascade there.
 */
export const weatherRunHours = pgTable(
  'weather_run_hours',
  {
    run_id: uuid('run_id')
      .notNull()
      .references(() => weatherRuns.id),
    valid_at: timestamp('valid_at', { withTimezone: true }).notNull(),
    temp_c: doublePrecision('temp_c'),
    dewpoint_c: doublePrecision('dewpoint_c'),
    humidity_pct: doublePrecision('humidity_pct'),
    precip_mm: doublePrecision('precip_mm'),
    wind_kmh: doublePrecision('wind_kmh'),
    wind_gust_kmh: doublePrecision('wind_gust_kmh'),
    wind_dir_deg: doublePrecision('wind_dir_deg'),
    cloud_pct: doublePrecision('cloud_pct'),
    /** Not necessarily this model's own field — see `weather_runs.precip_prob_is_shared`. */
    precip_prob_pct: doublePrecision('precip_prob_pct'),
    pressure_hpa: doublePrecision('pressure_hpa'),
  },
  (t) => [primaryKey({ columns: [t.run_id, t.valid_at] })],
)

/**
 * One hour of the pooled ensemble, as percentiles rather than members.
 *
 * **Not per-member rows.** 143 members across 384 hours is ~55,000 rows per run;
 * the 48-hour `weather_runs.raw` payload is the re-derivation path if a member
 * level view is ever needed.
 *
 * `member_count` falls as models reach their horizons, and
 * `model_member_counts` splits it by model so a reader can say *which* models
 * still reach an hour — naming a model that contributed nothing is the
 * attribution defect this repo keeps shipping.
 *
 * These are **hourly** percentiles. They are not the daily figures: `temp_c_max`
 * stays the median of each member's own daily extreme.
 */
export const weatherEnsembleHours = pgTable(
  'weather_ensemble_hours',
  {
    run_id: uuid('run_id')
      .notNull()
      .references(() => weatherRuns.id),
    valid_at: timestamp('valid_at', { withTimezone: true }).notNull(),
    precip_mm_p10: doublePrecision('precip_mm_p10'),
    precip_mm_p50: doublePrecision('precip_mm_p50'),
    precip_mm_p90: doublePrecision('precip_mm_p90'),
    temp_c_p10: doublePrecision('temp_c_p10'),
    temp_c_p50: doublePrecision('temp_c_p50'),
    temp_c_p90: doublePrecision('temp_c_p90'),
    wind_kmh_p10: doublePrecision('wind_kmh_p10'),
    wind_kmh_p50: doublePrecision('wind_kmh_p50'),
    wind_kmh_p90: doublePrecision('wind_kmh_p90'),
    /**
     * The ensemble mean hourly accumulation — the only precipitation figure here
     * that can be added up. A step or a day total comes from summing this;
     * summing `precip_mm_p50` would be the median of nothing.
     */
    precip_mm_mean: doublePrecision('precip_mm_mean'),
    /**
     * Members at or above 0.1 mm this hour. With `member_count` this is a
     * probability of measurable rain derived from the members themselves —
     * unlike `weather_run_hours.precip_prob_pct`, which is a blended upstream
     * field no single model owns.
     *
     * **Nullable, and null means unknown**: a row written before this column
     * existed has no wet count, and a reader must withhold the probability
     * rather than render 0%.
     */
    members_wet: integer('members_wet'),
    member_count: integer('member_count').notNull(),
    /** `{ gfs_seamless: 31, ecmwf_ifs025: 51, ... }` for this hour. */
    model_member_counts: jsonb('model_member_counts').notNull(),
  },
  (t) => [primaryKey({ columns: [t.run_id, t.valid_at] })],
)
