import type { FEEDBACK_KINDS, FORECAST_VERDICTS, FrictionLevel, OBSERVED_CONDITIONS, RockLevel, RockType } from '@weatherteam6/types'
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
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// Enum types

/**
 * **Spelled out, and then checked against `ROCK_TYPES`.** Drizzle needs literals
 * here — it reads this array to generate the migration, so a spread of an
 * imported constant produces an enum with no members. The `satisfies` below is
 * what stops that literal drifting from the shared list: adding a value to
 * `ROCK_TYPES` without adding it here fails the typecheck rather than shipping a
 * type the database will reject on insert.
 *
 * **Order is append-only.** `ALTER TYPE … ADD VALUE` puts new members at the end
 * of the Postgres type unless told otherwise, and the migration is generated from
 * the diff of this array, so reordering it would produce a migration that
 * recreates the type rather than extends it. The human-facing order lives in
 * `ROCK_TYPES`; this one is history.
 */
const ROCK_TYPE_ENUM_VALUES = [
  'sandstone',
  'limestone',
  'granite',
  'basalt',
  'unknown',
  'basalt_dense',
  'basalt_vesicular',
  // The rest of rock-drying-research.md §7, migration 0015. Appended, never
  // reordered: a Postgres enum's order is its declaration order.
  'granite_weathered',
  'anorthosite',
  'syenite_porous',
  'rhyolite',
  'tuff_welded',
  'tuff_nonwelded',
  'volcanic_breccia',
  'quartzite',
  'slate',
  'gneiss_schist',
  'sandstone_quartz_arenite',
  'sandstone_ferruginous',
  'sandstone_arkose',
  'sandstone_eolian',
  'sandstone_soft',
  'limestone_dense',
  'limestone_porous',
  'dolomite',
  'carbonate_cherty',
  'conglomerate',
] as const satisfies readonly RockType[]

export const rockTypeEnum = pgEnum('rock_type', ROCK_TYPE_ENUM_VALUES)

/**
 * The drift guard promised above, and it has to run in both directions because
 * each catches a different failure.
 *
 * The `satisfies` on the array covers one way: a value here that is not a
 * `RockType` is a database state the app can never produce, and it fails on the
 * line above.
 *
 * This covers the other way, which is the dangerous one — a value in
 * `ROCK_TYPES` and *not* in the enum compiles perfectly and then fails at
 * runtime, as a Postgres `invalid input value for enum` on insert, for the one
 * rock type nobody tested. `Exclude` is `never` when the enum covers everything,
 * and the call fails with the missing value named when it does not.
 */
function assertEveryRockTypeIsInTheEnum<_T extends never>(): void {}
assertEveryRockTypeIsInTheEnum<Exclude<RockType, (typeof ROCK_TYPE_ENUM_VALUES)[number]>>()

export const rainfallSourceEnum = pgEnum('rainfall_source', [
  'acis',
  'open_meteo_historical',
  'iem_asos',
])

export const overallStatusEnum = pgEnum('overall_status', ['dry', 'damp', 'wet', 'mixed'])

export const feedbackKindEnum = pgEnum('feedback_kind', ['app', 'forecast'])

export const forecastVerdictEnum = pgEnum('forecast_verdict', ['matched', 'partly', 'missed'])

// Tables

/**
 * `username` and `password_hash` are both nullable, and **a row with either one
 * null cannot log in.** That is the intended reading, not an oversight: the
 * seeded owner row predates them and needs no backfill, and a user created by
 * some future path without a passphrase must not become reachable by presenting
 * an empty one. `lib/auth/credentials.ts` requires both to be present and the
 * lookup is the single place that decision is made.
 *
 * There is no signup flow and should not be one — `npm run user:add` creates a
 * row, per `docs/handoffs/leave-telegram-v1.md` § Phase 1.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name'),
  username: text('username').unique(),
  password_hash: text('password_hash'),
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
  /**
   * A `KNOWN_CRAGS` slug (`packages/types/src/knownCrags.ts`) when this
   * location sits on a crag whose rock the research has established. **Set, it
   * means `rock_type` is locked** — written from the research at save time, and
   * never from a request body. Text rather than an enum because the list lives
   * in TypeScript and grows without a migration; a slug this build no longer
   * knows reads as unlocked, not as an error.
   */
  known_crag: text('known_crag'),
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

/**
 * What the forecast said about one trip day at one location, as of one cron
 * firing: the trend a trip screen plots as the day approaches.
 *
 * **Keyed per location, not per trip**: two trips to one crag share the record,
 * and a trip's dates or crags can change without losing it. `recorded_at` is the
 * firing's hour, so a rerun inside the hour replaces its own row and never adds one.
 *
 * Every value is nullable. A score exists only for days `/hourly` readings reach
 * and only at a climbing location; past that, a row is weather only.
 */
export const tripDayRecords = pgTable(
  'trip_day_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    location_id: uuid('location_id')
      .notNull()
      .references(() => locations.id),
    /** The forecast day, local to the location. */
    local_date: date('local_date').notNull(),
    /** The firing, truncated to the hour. */
    recorded_at: timestamp('recorded_at', { withTimezone: true }).notNull(),
    /** Local days from the location's today at recording to `local_date`; 0 is today. */
    lead_days: integer('lead_days').notNull(),
    /**
     * When the stored run the score came from was fetched: the same value on two
     * rows means the same model run read twice. Null when no score was read.
     * The outlook is a live fetch with no run identity, so its figures have none.
     */
    scored_run_fetched_at: timestamp('scored_run_fetched_at', { withTimezone: true }),
    score: integer('score'),
    dryness: text('dryness').$type<RockLevel>(),
    friction: text('friction').$type<FrictionLevel>(),
    temp_c_max: doublePrecision('temp_c_max'),
    temp_c_min: doublePrecision('temp_c_min'),
    members_wet: integer('members_wet'),
    member_count: integer('member_count'),
    precip_mm_mean: doublePrecision('precip_mm_mean'),
  },
  (t) => [unique('trip_day_records_location_day_hour').on(t.location_id, t.local_date, t.recorded_at)],
)

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

/**
 * App feedback and forecast checks — `lib/feedback/`, `routes/feedback.ts`.
 *
 * **Not `conditions_reports`.** That table has no writer, requires a location,
 * and stores `forecast_matched` as a bare boolean with nothing saying what the
 * forecast was. A check here keeps what the app showed (`app_readings`) beside
 * what the climber saw, which is the only form in which it can later be scored
 * against the model (issue #143).
 *
 * **A check outlives its location.** `deleteLocationCascade` detaches these
 * rows (`location_id` → null) rather than deleting them, and `location_name`,
 * `lat` and `lon` are copied at write time so a detached check still says
 * where it was. Deleting a crag from a list must not delete the evidence about
 * it.
 *
 * The CHECK constraints are the shape rules `parseFeedbackInput` enforces,
 * restated where no future writer can skip them.
 */
export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id),
    kind: feedbackKindEnum('kind').notNull(),
    location_id: uuid('location_id').references(() => locations.id),
    location_name: text('location_name'),
    lat: doublePrecision('lat'),
    lon: doublePrecision('lon'),
    message: text('message'),
    observed_at: timestamp('observed_at', { withTimezone: true }),
    observed_conditions: overallStatusEnum('observed_conditions'),
    verdict: forecastVerdictEnum('verdict'),
    /** `FeedbackAppReadings` — words the screen showed, never a 0-1 factor. */
    app_readings: jsonb('app_readings'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    /**
     * When the item was acted on. Null is open. A resolved row leaves
     * `GET /feedback` but stays in the table — a forecast check is still
     * evidence after someone has read it.
     */
    resolved_at: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('feedback_user_created_idx').on(t.user_id, t.created_at),
    check(
      'feedback_app_has_message',
      sql`${t.kind} <> 'app' OR (${t.message} IS NOT NULL AND length(btrim(${t.message})) > 0)`,
    ),
    check(
      'feedback_forecast_is_complete',
      sql`${t.kind} <> 'forecast' OR (${t.observed_at} IS NOT NULL AND ${t.observed_conditions} IS NOT NULL AND ${t.verdict} IS NOT NULL)`,
    ),
  ],
)

// The two Postgres enums above spell out `FEEDBACK_KINDS` and
// `FORECAST_VERDICTS` from `@weatherteam6/types`; a value added to one side
// only fails to compile here rather than failing an insert in production.
type _FeedbackKindsMatch = Assert<
  Equal<(typeof feedbackKindEnum.enumValues)[number], (typeof FEEDBACK_KINDS)[number]>
>
type _ForecastVerdictsMatch = Assert<
  Equal<(typeof forecastVerdictEnum.enumValues)[number], (typeof FORECAST_VERDICTS)[number]>
>
type _ObservedConditionsMatch = Assert<
  Equal<(typeof overallStatusEnum.enumValues)[number], (typeof OBSERVED_CONDITIONS)[number]>
>
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<_T extends true> = never

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
    /**
     * **Dormant since migration Phase 3 — null on every row, and that means
     * nothing.**
     *
     * It was the claim in a claim-before-send: `notifyPendingAlerts` set it with
     * a conditional UPDATE so two overlapping cron runs could not both deliver
     * the same alert. That function went with the Telegram bot and the product
     * has no notification channel, so nothing writes this and nothing reads it.
     *
     * Kept deliberately rather than dropped: whatever replaces the bot wants
     * exactly this mechanism. **Do not read it as "not yet sent"** — it is
     * "never asked", and the two are the same value.
     */
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
  /**
   * **Layer 5 of the v2 scoring model: the thresholds that are constants today.**
   *
   * Every one is `notNull` with a default, so an existing row keeps behaving
   * exactly as it did — and **nothing reads any of them yet.** They are written
   * here in Phase 0 because a migration is the slow half of the work and the
   * column set is what the later phases have to agree on; Phase 5 builds the UI.
   *
   * The defaults are the current hardcoded constants wherever one exists, which
   * is the only defensible starting point: `scoring-findings.md` §4 records that
   * none of them was measured, and moving a number *and* making it a preference
   * in the same change would leave nobody able to say which caused what.
   */
  /** Bottom of the full-marks temperature band. Default is `TEMP_BAND_C.idealMin`. */
  ideal_temp_min_c: doublePrecision('ideal_temp_min_c').default(10).notNull(),
  /** Top of it. Default is `TEMP_BAND_C.idealMax`. Nothing keeps the two ordered yet — Phase 5's UI does. */
  ideal_temp_max_c: doublePrecision('ideal_temp_max_c').default(22).notNull(),
  /**
   * How conservative to be after rain: `relaxed` | `normal` | `cautious`. It
   * scales the rock-type drying window rather than replacing it. `normal` is
   * today's `MAX_HOURS` unchanged, which is why it is the default and why the
   * other two are not defined here — the scale factors belong with the drying
   * code in Phase 2, not in a column comment.
   */
  drying_caution: text('drying_caution').default('normal').notNull(),
  /**
   * Whether the sun term is included in `T_surface`. **Default `true` is a
   * behaviour change, not the status quo** — today aspect and shortwave score
   * nothing at all (issue #139). `false` is the escape hatch for a user who
   * distrusts it, and the honest answer for a crag in a gorge.
   */
  include_sun: boolean('include_sun').default(true).notNull(),
  /**
   * The minimum readings an hour must clear to be inside a window: `wet` |
   * `drying` | `dry`, and `poor` | `fair` | `good` | `great`.
   *
   * **Both defaults are judgement calls with nothing behind them**, recorded as
   * such in the same register as `RAMP_EXPONENT`: there is no window feature
   * today, so there is no existing behaviour to preserve. Phase 2 is the first
   * place they can be argued about against real days.
   */
  window_min_rock: text('window_min_rock').default('drying').notNull(),
  window_min_friction: text('window_min_friction').default('fair').notNull(),
  /**
   * **What Phase 5 actually built (owner decision 2026-10-01)**, beside the
   * Phase 0 columns above, none of which anything reads. The air temperatures,
   * °C, below and above which Crag A's friction starts to fall, and the tab a
   * crag opens on. **Nullable, and null is "the app's default"**, so a row
   * created for one setting does not pin the others — `Preferences` in
   * `packages/types`. `ideal_temp_*` were the five-component scorer's band and
   * are not these.
   */
  temp_low_c: doublePrecision('temp_low_c'),
  temp_high_c: doublePrecision('temp_high_c'),
  default_tab: text('default_tab'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }),
})

/**
 * One fetch of one model at one point — the parent of every stored hour.
 *
 * **A run belongs to a place, not to a location row.** `point_key` is
 * `pt:<lat4>,<lon4>@<elevation>`, built only by `pointKeyForPlace`, so every
 * user's copy of one crag reads and writes the same runs. There is no
 * `location_id`: deleting one user's copy must not delete what another reads,
 * and the prune removes a place's runs once nothing collects it.
 *
 * `fetched_at` is when **this process asked**, not when the model initialized.
 * Probe A found Open-Meteo exposes no run time under any name, so nothing here
 * may be labelled "12Z run".
 *
 * **`raw` is no longer written (2026-09-29)**; rows stored before then carry it
 * until the 2-day prune deletes them. It
 * held the ensemble's 143-member response (~290 KB a run) and nothing ever read
 * it. The column stays until dropping it is decided; a member-level view would
 * need it back, together with a storage plan that can pay for it.
 */
export const weatherRuns = pgTable(
  'weather_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** `pt:<lat4>,<lon4>@<elevation>` from `pointKeyForPlace`. */
    point_key: text('point_key').notNull(),
    /** A deterministic model name, or `'ensemble'` for the pooled ensemble run. */
    model: text('model').notNull(),
    /** `'deterministic'` or `'ensemble'` — which child table carries this run's hours. */
    kind: text('kind').notNull(),
    fetched_at: timestamp('fetched_at', { withTimezone: true }).notNull(),
    /**
     * The last time `collect-runs` confirmed this is still the newest run upstream —
     * set to `fetched_at` on write, then moved forward each hour the model's
     * metadata shows nothing newer and the refetch is skipped.
     *
     * **Freshness is read from here, the data's age from `fetched_at`.** A run
     * fetched five hours ago and checked ten minutes ago is the current forecast;
     * reading freshness off `fetched_at` would refetch every slow model on every
     * request.
     *
     * **Null means never confirmed after the fetch** — every row written before the
     * column existed. A reader takes `fetched_at` in its place, which is exactly
     * when that run was last known to be current.
     */
    checked_at: timestamp('checked_at', { withTimezone: true }),
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
    /**
     * The models whose hourly median fills this run's `weather_run_hours.rain_median_mm`
     * (`lib/weather/rainMedian.ts`). Set on the thermal model's run only. **Null
     * means no median was stored**, and the drying clock then reads the run's own
     * `precip_mm` and names that model instead.
     */
    rain_models: text('rain_models').array(),
    /**
     * An ensemble run's **daily** figures — `parseEnsemble`'s `days` and
     * `model_sources`, computed from the same response the hours came from — so
     * `GET /forecast` and `GET /conditions` read them instead of fetching the
     * ensemble again (`getEnsembleDaily`). Ensemble runs only. **Null means not
     * stored** (a deterministic run, or one written before the column), and a
     * reader then fetches live; it is never a forecast of nothing.
     */
    ensemble_daily: jsonb('ensemble_daily'),
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
    /**
     * Downward shortwave on a **horizontal** surface, W/m². The v2 scoring
     * model's one new input.
     *
     * **Null means the hour was not measured, and 0 means night.** They are not
     * the same and nothing may conflate them: every row written before this
     * column existed is null, and NBM's shortwave horizon (42h measured
     * 2026-09-21) is a fifth of its temperature horizon, so nulls appear
     * mid-series on a model that answered everything else.
     */
    shortwave_wm2: doublePrecision('shortwave_wm2'),
    /**
     * **Not this model's own rain.** The hourly median of `weather_runs.rain_models`
     * from the same fetch, stored beside the thermal model's hours because that
     * is the only run with trailing history. The drying clock reads it; nothing
     * may head it with this run's model name.
     */
    rain_median_mm: doublePrecision('rain_median_mm'),
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

// ─────────────────────────────────────────────
// Guidebook — the logbook and recorded boulder positions
// ─────────────────────────────────────────────
//
// Routes and areas are OpenBeta's and live in the committed snapshot
// (`lib/guidebook/guidebookMn.ts`), not in a table, so `route_id` and `area_id`
// are OpenBeta uuids as text with no FK. The API refuses an id the snapshot
// does not hold. None of these carries a `location_id`: a tick belongs to a
// route, not to anyone's saved copy of the crag.

export const tickStyleEnum = pgEnum('tick_style', ['send', 'flash', 'onsight', 'attempt'])

/** One climb of one route by one user — the app's own logbook, not Mountain Project's. */
export const routeTicks = pgTable(
  'route_ticks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id),
    route_id: text('route_id').notNull(),
    /** The climber's local calendar day, as they entered it. */
    ticked_on: date('ticked_on').notNull(),
    style: tickStyleEnum('style').notNull(),
    /** Null when not entered — not zero laps. */
    laps: integer('laps'),
    note: text('note'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('route_ticks_user_route_idx').on(t.user_id, t.route_id)],
)

/** A route a user wants to climb. At most one row per user and route. */
export const routeTodos = pgTable(
  'route_todos',
  {
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id),
    route_id: text('route_id').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.route_id] })],
)

/**
 * Where a boulder (an OpenBeta area) actually is, recorded from someone's phone
 * standing at it. **Shared by every account** (owner decision 2026-09-29): one
 * row per area, and a later recording replaces the earlier one. OpenBeta's own
 * point is never copied here — it is inherited from parent areas and was wrong
 * on the ground at Barn Bluff.
 */
export const areaLocations = pgTable(
  'area_locations',
  {
    area_id: text('area_id').primaryKey(),
    lat: doublePrecision('lat').notNull(),
    lon: doublePrecision('lon').notNull(),
    /** The phone's own accuracy estimate, metres. */
    accuracy_m: doublePrecision('accuracy_m').notNull(),
    recorded_by: uuid('recorded_by')
      .notNull()
      .references(() => users.id),
    recorded_at: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('area_locations_recorded_by_idx').on(t.recorded_by)],
)
