# Architecture Rules

These decisions are final unless the user overrides them. Stack, structure and the delivery
gates are in `CLAUDE.md`; domain patterns are in the `miniapp-patterns`, `drizzle-patterns`,
`background-work` and `conditions-score` skills. **The measurements and incidents behind each
rule are in `.claude/docs/session-archive.md` under "architecture.md history (moved
2026-09-30)"** — grep there before arguing with a rule.

## Scoring model

- **The score on every screen is Crag A (`lib/scoring/cragModel.ts`), owner decision
  2026-09-24.** `score = 100 × dryness^0.55 × friction`, the drying clock on eight vertical
  walls, median taken. A location's score is always Crag A: its recorded aspect and angle are
  not inputs. **Wall A (`evaluateWallA`)** scores individual walls only and nothing calls it
  yet. Friction is condensation × heat × humidity × cold from air temperature, dew point and
  `T_mass` — no sun. A day's score is the worst hour of its best 3-hour run between 08:00 and
  18:00 local (`dayRepresentative`). **Today counts only hours not yet over**
  (`buildHourlyReadings`'s `now`); after 18:00 today has no score. The port is checked
  hour-for-hour against `.claude/docs/crag-a-reference/model.ts` — a change that moves a
  result needs an argument. **Every constant is a judgement call**; nothing is validated
  against outcomes (#143).
- **A reader's temperature range moves Crag A's friction edges, and nothing else** (scoring
  Phase 5, owner decision 2026-10-01). `user_preferences.temp_low_c`/`temp_high_c`, null for
  the default; `TEMP_RANGE_DEFAULT_F` (`packages/types`) is the one spelling of 30–60 °F and
  `COLD_START_C`/`HEAT_START_C` derive from it. `/hourly` and `/conditions` read it per
  request through `tempRangeFor` into `ScoringLocation.range`, so **readings are per reader,
  not per crag** — two partners can see two scores for one crag. A failed read is a
  500, never the default. Limits and the 10 °F minimum gap are `TEMP_RANGE_LIMITS_F`. The
  Phase 0 columns on that table (`ideal_temp_*`, `drying_caution`, `include_sun`,
  `window_min_*`) are read by nothing.
- **`rockThermal.ts` is Layer 1.** Irradiance comes from one deterministic model,
  `gfs_seamless` (`THERMAL_MODEL`); a reading above 1400 W/m² is a gap. **One model is a
  cost decision, not a safety rule** (#212): the mean of GFS, ECMWF and ICON measured 0.2 °F
  better in arid daytime MAE and 1.1 °F in humid, for two more fetches per read and more
  stored history. **`gem_seamless` never feeds irradiance, pooled or alone** (#155). Pooling
  the other three is allowed if a rerun of `compare:rock-temp` earns it — that script tests
  short lead times only, so check days 5–7 first, where GEM went wrong. **`T_surface` is null whenever an input was missing and never degrades to air
  temperature**, and the per-hour `qualified` flag travels with the reading. **The series'
  `T_surface` lags the sun by `SURFACE_TAU_HOURS` (2 h)** — the one rock-thermal constant
  measured against outcomes (`npm run compare:rock-temp`); the drying rate and display read
  the lagged value, `evaluateHour` stays instantaneous.
- **`hourlyConditions.ts` and `sweatBalance.ts` supply `T_mass`, `T_surface` and the drying
  rate** to Crag A (via `evaluateHourlyConditions`); v2's own score and sweat-balance friction
  no longer reach a response. A weighted geometric mean has unbounded slope at zero, so **a new factor must
  approach zero, not reach it** (#148). The hand's vapour-pressure deficit is taken at skin
  temperature, never `T_surface`. `rock.qualified` is false for any drying window containing
  daylight — honest, not a bug.
- **The magnitude fence:** `sweatBalance.sweatFrictionFactor` (skin wettedness → grip) is an
  unmeasured guess, kept and quarantined (owner decision 2026-09-21). **Words and ordering
  reach a screen; 0-1 factors do not** — never "friction 0.29". **Friction is not a word on
  screen either** (owner, 2026-10-05): it graded an unvalidated estimate and read `Great` on
  wet rock. It stays in the score, its penalties reach the reader only through Score
  breakdown, and no surface prints a cause phrase outside it. `FrictionReading` still
  travels on the response (trip records, the condensation qualifier);
  and the app says it is an estimate **once** — in the measurements disclosure
  (`FRICTION_MECHANISM`) and on How the score works, never under every gauge (owner,
  2026-10-02). Factors live under `HourlyConditions.diagnostics`;
  `hourlyConditions.test.ts` fails if one is promoted to the top level. `t_surface_c` and
  `condensation_margin_c` stay renderable. The same fence holds for Crag A's penalties:
  they stay in `diagnostics.penalties`, and only their order reaches a response, as
  `held_back_by` from `heldBackBy` (`cragModel.ts`, #218). The client shows it as
  `Score breakdown` at the top of the measurements panel, suppressed with the score, and
  absent — not a "nothing" row — when no penalty costs a point.
- **The drying clock's rain is the median of the four global models' six-hour means**
  (`lib/weather/rainMedian.ts`, #209, #324), not `THERMAL_MODEL`'s own — GFS alone called wet
  rock dry far more often (`npm run compare:dryness`). Each model is averaged over
  `RAIN_WINDOW` before the median because a per-hour median shrinks a shower the models
  place in different hours, and the clock sizes drying from the storm total; it is a mean,
  never a sum, so totals keep. Measured per day at 0-2 days' lead; a model that did not
  answer an hour is left out of it, never filled from its neighbours. HRRR and NBM are left
  out so a crag abroad gets the same statistic. `readings.rain_models` names the models and
  the measurements disclosure prints them (`dryingRainMechanism`). A thermal run stored
  without a median reads its own rain whole and names only itself; an hour with fewer than
  three models is a gap, never a fallback to GFS. **The Precip tab draws the same four
  models' median hour by hour** (`recentPrecipMedian`), never `best_match` and never
  smoothed — a chart of past rain keeps its hours. Its "last real rain" is `REWETTING_PRECIP_MM` (`packages/types`), which
  `hourlyConditions.SIGNIFICANT_HOURLY_PRECIP_MM` re-exports; a lighter shower never resets
  the headline.
- **There is one drying table, `MIN_HOURS`/`MAX_HOURS` in `dryingModel.ts`, and everything
  imports it.** Never reintroduce a copy. Not-recorded kinds (`sandstone`, `limestone`,
  `basalt`) take their family's slowest window and `unknown` is the slowest row.
- **Every factor ramp reaches its floor at its own band edge — no factor may step** (#148). A
  new factor or band gets a test that walks its input in tenths past both edges.
  `TEMP_BAND_C` no longer feeds any score; it only colours the client's temperature chart.
- **Every degradation path must withhold, never inflate** (#21, #32, #34). Any change to the
  score starts from *"what does this say when the inputs are missing"*, never from
  re-weighting (`scoring-findings.md` §6c).
- **The five-component scorer is gone** (scoring Phase 5b, 2026-10-01): `conditionsScore.ts`,
  its station-rainfall lookup (`acis.ts`), `compare:scoring` and the `conditions_scores`
  table. `computeLiveForecast` now returns weather only. Recover any of it from git history,
  not by rebuilding it.

## Readings on screen

- **`GET /hourly/:locationId` and `GET /conditions/:locationId` carry the same readings,
  sliced by one rule** — `toConditionsReadings` (`lib/runs/conditionsReadings.ts`, shared with
  `check:conditions`) and `readingNow` (`packages/types`, shared with the client) — so one
  crag never shows two numbers on two screens. `ConditionsReadings` carries its own
  `utc_offset_seconds` (#33), and `checked_at` (the series' own, null in both sentinels),
  which the list's pull-to-refresh prints as the **oldest** across cards.
- **`readings.model` is always `THERMAL_MODEL`; `HourlySeries.model` is chosen by coverage.**
  When they differ a surface must not attribute one to the other. If the thermal model did
  not answer, there are no readings and `unavailable_reason` is `model_unavailable` — never
  another model's numbers.
- **`readings.rock_history`** is the rock's state for stored hours before the window, rock
  only. A history hour is published only once it no longer rests on the walk's "it just
  rained" start: wet or drying before real rain resets the clock goes out `null`; `dry`
  stands. `rockByStamp` (`apps/miniapp/src/lib/precipHistory.ts`) joins it by local stamp; an
  absent field draws no rock.
- **Readings reach a response only because the route passed `scoring`.** There is no
  `is_climbing_location` check downstream; the model would score a city if asked. With
  `scoring: null`, `GET /conditions/:id` skips the hourly fetch.
- **Words come from the readings, never from the number.** `summarizeReadings`
  (`packages/types/src/readingsCopy.ts`) is the one implementation; `stateLabel` and
  `summarizeConditions` are deleted.
- **A reading is a label and a value, never a sentence** (owner decision 2026-09-21):
  `Dryness: Dry`, then `Score: 100`, from `ReadingField`. Labels
  live in `readingsCopy.ts`; `fieldLine` punctuates one for text. Caveats are fragments on one
  line. Which inputs a reading came from belongs in the measurements disclosure.
- **The measurements disclosure names each group with the model that produced it**
  (`measurements()` in `readingsCopy.ts`, rendered by `Measurements.tsx`). *Air* is
  `HourlySeries.model`'s; *Rock* is `THERMAL_MODEL`'s; `sharedSource` names one model only
  when every group came from it. A temperature interval goes through `cToFDelta`, never
  `formatTempF`. Rock figures and mechanisms appear only while their gauges are on screen. A
  group with some figures dashes its gaps; a group with none is omitted. **The panel stays
  short** (owner, 2026-10-01): *Air* carries only what the card above does not print
  (gusts, the past hour's rain), the figures render as tiles, each mechanism is one line,
  and the full explanation is `ScoreExplainer` on Profile, linked from the panel. Every
  number that explanation quotes comes from `SCORE_MODEL_FACTS`, pinned to the model by
  `cragModel.test.ts`.
  `ROCK_TEMPERATURE_MECHANISM` is required wherever a modelled rock temperature prints.
- **`HourlyReading.rock_sun_shade` is the warmest and coolest of Crag A's eight compass
  walls' `T_surface`** (owner field report, Barn Bluff 2026-10-04: a south face too hot,
  a shaded one good, under one score). Display only — the score still reads air
  temperature. Null if any wall's is missing. **It renders nowhere** (owner, 2026-10-05):
  sun and shade belong only on crags the owner has confirmed on the ground — today only
  Red Wing — and never in Overview's measurements. When a surface brings it back, gate it
  on a flag on the `KNOWN_CRAGS` entry, not on the data being present. It names no
  direction: Crag A does not know which way a crag's walls face (#293).
- **A score over a span is its worst hour, never a mean or a best.** A day's is
  `dayRepresentative`; the Conditions now card's three-hour blocks (`scoreBlocks`) are the
  same rule, and a block with any hour unread or suppressed has no score — the worst of the
  rest could be better than the missing one. The hero never prints one hour's score as its
  headline (owner, 2026-10-05).
- **The number waits for the alerts query, inside `summarizeReadings`** — `alertsPending`
  suppresses the score on its own (defect class 7). **Severe+ suppression drops the number
  and keeps the readings.** A surface must not reach past `ReadingsSummary.score === null`.
- **Two sentinels:** `NOT_A_CRAG_READINGS` (`not_a_climbing_location`, the reader's choice)
  and `READINGS_UNAVAILABLE` (`model_unavailable`, a gap), both beside `toConditionsReadings`.
  **An absent `readings` field is neither** — it is an older API during a deploy, and renders
  nothing.

## Locations and rock

- **A known crag's rock type is locked, and `resolveRockType`
  (`lib/locations/resolveRockType.ts`) is the only place it is applied** on save;
  `npm run locations:lock-known-crags` applies it to existing rows — **only after the API that
  knows the new types has deployed.** `PATCH /locations/:id` refuses a rock-type change on a
  `known_crag` row with a 409. A `KNOWN_CRAGS` entry needs a `crag-facts.json` family mapping
  to exactly one §7 value and a box no larger than ~30 km (`knownCrags.test.ts`).
- **`PATCH /locations/:id` speaks climbers' wall angle** (`wall_angle_deg`, degrees past
  vertical, positive overhanging); `cliff_angle` keeps 0 vertical, 90 slab. `wallAngle.ts`
  (`packages/types`) is the only place the sign flips. **An unknown body key is a 400.** Rules
  in `lib/locations/updateLocation.ts`; `check:edit-location` runs them against Postgres.
- **The solar geometry runs only on a recorded wall.** `scoringLocationFor`
  (`lib/runs/scoringLocation.ts`) builds `wall` only when both `aspect` (16-point compass) and
  `cliff_angle` were recorded; the 45° default and `aspectToDegrees`'s 180 fallback are never
  a recorded wall. With a wall, `rockThermal.wallIrradianceWm2` replaces the horizontal value
  (sun position, Erbs split, isotropic sky) and every computed hour is qualified. The sun is
  taken mid-hour, because Open-Meteo stamps shortwave at the end of the hour it averages. Terrain shading is not modelled (reads hotter —
  the safe direction). An overhang dries on the vertical factor.
- **`insertGeneralLocation` (`lib/locations/createLocation.ts`) is the one write behind
  `POST /locations`.** `is_climbing_location` is always explicit, never inferred
  (`miniapp-design-v1.md` §12). The `/add` subtitle is `placeSubtitle`
  (`packages/types/geocodeCopy.ts`), one implementation (#82).
- **The guidebook is a committed OpenBeta snapshot, never a runtime call**
  (`lib/guidebook/guidebookMn.ts`, `npm run guidebook:pull`), linked by `guidebookFor` on every
  request — nothing stored on `locations`. Conditions are the **crag's**: no wall or route
  screen shows its own reading. "Left to right" renders only where `GuidebookWall.ordered`.
  Walls are listed A–Z and never placed by OpenBeta's coordinates, which are wrong on the
  ground (owner, 2026-09-29). Grade colours (`gradeScale`/`gradeBoulder`, including status
  hues, owner decision 2026-09-29) are for grade marks only, always beside the printed grade.
- **`/add`'s climbing-area search and browse read per-state OpenBeta snapshots**
  (`lib/weather/climbingAreas<Xx>.ts`, `npm run climbing:pull -- <State> <XX>`, one line in
  `STATES`), never OpenBeta at runtime. Browsing walks `parent_id`, never names, which repeat;
  an area whose parent was filtered out lists at its state's top level, and
  `climbingAreas.test.ts` walks every snapshot to prove nothing is unreachable.
- **The logbook sits beside the snapshot, keyed by OpenBeta ids with no FK** (`lib/logbook/`,
  `routes/logbook.ts`). `route_ticks` and `route_todos` are per user; an unknown id is a 404
  (`routeExists`/`areaExists`). `area_locations` is **shared by every account** — a later
  recording replaces the earlier, so the client asks first. **`recorded_by` never leaves the
  API**; `toPosition` builds the response field by field. `POSITION_ACCURACY_MAX_M` (50 m) is
  a judgement call. None has a `location_id`. The CORS preflight must list `PUT`;
  `check:logbook` asserts it.

## Weather fetches and stored runs

- **All four ensemble models are pooled, unweighted, and `model_sources` names only those
  that yielded arrays.** `ENSEMBLE_MODEL_SUFFIXES` maps model to key suffix — the suffix
  cannot be derived from the name, and a model added to `ENSEMBLE_MODELS` without it is
  silently ignored. A control run (no `_memberNN`) is a member.
- **`parseEnsemble` returns `by_model` beside the pooled days, through the same
  `computeDays`.** A model with precipitation but not all six variables goes in
  `partial_models`, never a row.
- **`temp_c_max`, `temp_c_min` and `wind_kmh_max` are the ensemble median of each member's
  own daily extreme — never a global `Math.max`.** Use `ensembleMedian` for anything read as
  a forecast. Humidity, dew point and shortwave stay means.
- **The chance of rain is `members_wet / member_count`, never `precipitation_probability`.**
  Wet is at or above `MEASURABLE_PRECIP_MM` (0.1 mm). `members_wet` null means unknown and
  withholds the probability.
- **A precipitation percentile may be drawn for one hour; it may never be added.**
  `precip_mm_mean` is the only precipitation figure that sums. p10/p90 shade one mark, never a
  step, day or header total; the mean often sits outside them, and that is not a fault.
- **Hourly precipitation is stamped at the end of its hour**, so a bar owns the hour before
  its timestamp; an instantaneous reading is centred. `Series.tsx` has `accumulationLeft` and
  `instantLeft` so the choice is explicit.
- **A deterministic multi-model response labels its columns only while more than one model
  has coverage.** `parseDeterministicHourly` trusts a bare column only when exactly one model
  was requested; otherwise it reports `ambiguous` and `fetchDeterministicHourly` re-asks one
  model at a time.
- **`precipitation_probability` may be shared between models; `markSharedProbability`
  derives which.** The flag reaches `weather_runs.precip_prob_is_shared`, where null means
  unknown. No surface renders the column; a renderer that does must have
  `probability_is_shared` false.
- **`shortwave_wm2` has three states: a number, 0 (night, a measurement) and null (no
  answer).** Never `?? 0` on this path. Not on the `/hourly` response yet.
- **`gem_seamless`'s shortwave is ~3× too high past day 4 — it never feeds irradiance**
  (#155). The other three may be pooled only on a measured gain (#212, above).
- **An hour with no values at all is not stored**; a stored row keeps its nulls. **"This
  model does not reach this day" is decided on values, not rows**, excluding
  `precip_prob_pct`.
- **Every Open-Meteo call sets `timezone=auto`; "today" is the location's local day** (#33).
  `computeLiveForecast` returns `todayStr` and every caller uses it; use
  `localDateString(now, offset)`. **The server marks `is_today`; the client never computes
  it** — a missing value is unknown, not `false`.
- **`fetchRecentHourlyPrecip` returns a forecast tail**; `GET /recent-precip/:locationId`
  cuts it with `trimToObservedHours` (`lib/weather/recentPrecipWindow.ts`). **A window's
  caption is measured, not requested** — derive the span from the timestamps received;
  `RecentPrecip.from_date` makes a miss read as "none in this window".
- **External APIs are proxied, never called from the client** — the fetch lives in
  `src/lib/weather/`, wrapped in `fetchWithRetry`, behind a thin route returning
  `{ data, error, status }` (`/geocode`, `/geocode/reverse`, `/radar/frames`).
- **Map tiles are the one exception** (owner decision 2026-10-02, Map tab).
  Public, keyless basemap tiles, glyphs and sprites (OpenFreeMap, `tiles.openfreemap.org`)
  and terrain tiles (AWS Open Data Terrarium, `s3.amazonaws.com`) load straight from the
  client; nothing but the viewport goes to them. `apps/miniapp/vercel.json`'s CSP names
  exactly those two hosts in `connect-src`, plus `blob:` for the map's workers and images.
  Any data source that is not a map tile — radar included, when it comes — still goes
  through the API.
- **There is no weather preview before saving** (owner decision 2026-09-30); `GET /preview`
  is deleted. `/add` picks a place, shows a save form, and Save opens the saved screen.
- **`GET /geocode/reverse` names a GPS fix** — Nominatim for the town (identifying
  User-Agent, two attempts, per its usage policy) and Open-Meteo for the terrain elevation,
  side by side. Either failing leaves its fields null; the client then falls back to
  "Current location" and no elevation. A known crag's name beats the town's. A phone's
  altitude is never used as elevation.
- **A stored run belongs to a place, not a location row.** `weather_runs.point_key` is
  `pointKeyForPlace` (`lib/runs/pointKey.ts`, the only spelling); `collectWeatherRuns` fetches
  each distinct place once. No `location_id` on `weather_runs`, so `deleteLocationCascade`
  does not touch runs.
- **`collect-runs` stores trailing hours for `THERMAL_MODEL` only**, and so does a panel
  that found nothing stored — both through `lib/runs/deterministicFetch.ts`, so a new crag
  is read with history at once (#176). `TRAILING_DAYS` (7) is measured by
  `compare:trailing-days`. They come from `past_days` in their own request that asks for all four global models so the rain median has
  history; the median rides on its hours as `rain_median_mm`. **Adding a model to the
  trailing fetch is a storage decision** — check `check:runs-storage` first. Those past hours
  are the model's analysis, not observations.
- **`collect-runs` fetches a model only when Open-Meteo published since our copy**
  (`lib/weather/modelMetadata.ts`, `MODEL_SOURCES`). Every doubt fetches, including a copy
  `REFETCH_BACKSTOP_MS` (6 h) old. Non-empty `staleMetadata` or `unreadableMetadata` means
  the mapping needs updating.
- **A panel reads the newest stored run per model, each with its own age** (#179).
  Freshness is `checked_at` (null reads as `fetched_at`). `lib/runs/latestRuns.ts` serves
  stored runs while any was checked inside `RUN_MAX_AGE_MINUTES`, keeps a model inside
  `STORED_MODEL_MAX_AGE_MINUTES`, and otherwise fetches live and writes back. Stored read and
  write-back are best effort. `HourlySeries.checked_at` is the freshness a screen prints.
- **The daily forecast is the stored ensemble run's own days** (`weather_runs.ensemble_daily`,
  read by `getEnsembleDaily`), not a second live fetch per request: `parseEnsemble`'s output
  from the request the hours came from, so the figures and the score cannot differ from a live
  fetch's. Under the rule above, **plus one: the run must start on the location's today** — a
  run fetched before local midnight reaches one day less far. A stored day with any gap fetches
  live; it never reaches the score as a number. Daily figures are **never rebuilt from
  `weather_ensemble_hours`** — the median of member maxima is not the max of hourly medians,
  and humidity is not stored there. `npm run check:forecast-stored` holds the round trip.
- **`weather_run_hours` and `weather_ensemble_hours` key off `run_id`**; `pruneWeatherRuns`
  and `deleteRunsForPoint` delete children first, driven by the parent rows. Never prune hours
  by their `valid_at`, which is a forecast time.
- **No run stores `raw`** (since 2026-09-29). **Retention is 2 days** (`pruneRuns.ts`) because
  Neon's free tier caps the project at 512 MB — a capacity limit, not a preference.

## Trips

- **Past the readings a trip day is weather only, from the 16-day outlook**
  (`lib/weather/ensembleOutlook.ts`): the ensemble API's per-member *daily* keys for the
  four `ENSEMBLE_MODELS`, fetched live per request and never stored. The ensemble rules
  above hold: highs and lows are `ensembleMedian` of each member's own extreme, the rain
  chance is `members_wet / member_count`, and every figure is over the members that
  reached that day, so `member_count` falls with distance and a day nobody reached is
  absent. **Days 0-6 on a trip screen come from `/hourly` readings, not the outlook**,
  which carries no score.
- **A trip's rain total sums each member's own days, then takes the spread**
  (`tripRainTotal`, `lib/trips/tripOutlook.ts`). A member counts only if it reached every
  covered day, and `days_covered` beside `trip_days` says when the total is not the whole
  trip. `GET /trips/:tripId/forecast` answers `days: null` for a location whose outlook
  failed, never `[]`.
- **`trip_day_records` is keyed per location, not per trip**: `(location_id, local_date,
  recorded_at)`, with `recorded_at` the cron firing's hour. Two trips to one crag share a
  record, a trip's dates can change without losing it, and a rerun inside the hour
  replaces its row. `POST /api/cron/record-trips` (`recordTripDays`) writes from the
  location's local today to the horizon; scores come from `getHourlySeries` under the
  location owner's range, with `scored_run_fetched_at` naming the stored run, and a
  non-crag records weather only. **A location writes nothing unless every source it needs
  answered**: nulls over a good hour would read as "no rain".
- **`trip_rain_records` is keyed per trip**: `(trip_id, location_id, recorded_at)`, because a
  rain total is summed over one trip's dates. The recorder builds it with `tripRainRows`
  from the same `summarizeTripOutlook` the forecast route answers with, in one transaction
  with the day records; a trip with no day in the horizon writes no point. `DELETE
  /trips/:tripId` clears it by `trip_id`; `location_id` is on `DEPENDENT_TABLES`. `GET
  /trips/:tripId/trend` returns its points per trip location, oldest first, 404 for another
  account's trip.
- **Editing a trip keeps its trend honest** (`PATCH /trips/:tripId`, `lib/trips/updateTrip.ts`,
  `check:edit-trip`). A change of either date deletes every `trip_rain_records` point for the
  trip, because each totalled other days; a removed crag takes only its own points. A rename
  keeps them, and the client sends only changed fields so a rename never resets anything.
  `trip_day_records` is per location and never touched. An unknown body key is a 400; another
  account's trip or crag is a 404.
- **An ended trip is read from storage, never forecast.** Once a trip's last day is behind
  the device's today (`tripIsOver`), its screen asks for no outlook, `/hourly` or alerts and
  reads `GET /trips/:tripId/summary`: per day, `trip_day_outcomes` (how it turned out) beside
  the first and last `trip_day_records` that carried a score (`tripDayLookBacks`). The
  recorder writes an outcome for each trip day 1 to `OUTCOME_DAYS` (3) local days behind,
  from `HourlyReadings.past_days`, and reads no trip that ended longer ago. "Turned out" is
  the model's analysis, not observations, and the screen says so once
  (`LOOK_BACK_SOURCE`). A past day's score is withheld unless every daytime hour's rock is
  known by the `rock_history` rule, so the walk's starting guess never scores a day.
- **The trip screen joins two sources on `local_date`, one per figure** (`lib/trips.ts`,
  `tripDayTiles`): score, Dryness and Friction from the crag's `/hourly` readings through
  `summarizeReadings` (alerts pending and Severe+ suppress the number, as everywhere);
  high, low, chance and amount from the trip outlook for every day, so no tile mixes two
  sources for one figure. **Agreement** is `agreementShare` (`packages/types/tripCopy.ts`),
  the majority side of `members_wet` against the rest, withheld when either is unknown, and
  never called confidence. A trend point with `days_covered < trip_days` is drawn hollow, and
  a change chip compares only points that covered the same days.

## Backend patterns

- Route handlers are thin; business logic lives in `src/lib/` (weather fetches in
  `lib/weather/`, one file per source).
- The credential travels in `Authorization`; CORS allows only `Content-Type, Authorization`.
- Route helpers live in `lib/http.ts`. Validate `uuid` params with `isUuid` (404, not a 500);
  funnel caught errors through `sendServerError`, which logs via `describeError` — never widen
  it to serialise an error object.
- `/api/cron/collect-runs`, `/api/cron/prune-runs` and `/api/cron/record-trips` are gated on `CRON_SECRET` through
  `cronGateFailed`, with `Promise.allSettled` across locations.
- **A client reads an absent column as a gap.** API and client deploy separately, and
  `undefined` passes every `=== null` guard. Normalise with `?? null` where a response becomes
  marks (`hourlySeries.ts`, `toDatum`).

## Operator scripts

- One-off and verification scripts live in `apps/api/src/scripts/`, run with `tsx`, exposed
  as npm scripts. They are the only place `console` is used.
- **Acceptance scripts exist because Vitest never reaches the database.** A flow whose
  failures only appear against real Postgres gets a `check:*` script (`checkAddLocationApi.ts`).
- Such a script must be safe against production: rows under an obvious prefix, cleanup in a
  `finally`, loud about failed cleanup.
- Defer runtime imports of `../db/index.js` inside the entry function; it throws at import
  when `DATABASE_URL` is unset.

## Auth Pattern

- **`/api/v1/*` is gated by `requireApiAuth`** (`middleware/apiAuth.ts`), the only setter of
  `req.userId`: `Session <token>` → the token's subject; `Bearer <API_SHARED_SECRET>` →
  `DEFAULT_USER_ID`. An unset `API_SHARED_SECRET` or `AUTH_TOKEN_SECRET` is a 503. Do not move
  the gate to Vercel. `/api/cron/*` keeps its own `CRON_SECRET` auth.
- **Every location id a caller supplies is checked against `req.userId`** — in the path, in
  a body (`POST /trips`'s `cragIds`, `POST /walls`'s `locationId`), or as the key of a table
  without `user_id` (`crag_climbability_history`, `location_normals`). A 404, never a 403;
  `check:auth` covers it.
- **`createApp` hardens Express:** no `X-Powered-By`, `nosniff`, `frame-ancestors 'none'`,
  `Cache-Control: no-store`, a 32 kB JSON limit, body-parser failures as 400/413 in the
  envelope, and a 25 s per-attempt fetch timeout (`FETCH_TIMEOUT_MS`).
- **A router mounted outside `/api/v1` reads `req.userId` as `undefined`** through a type
  that says it cannot be (defect class 8). Mount inside the gate.
- Route handlers use `req.userId`, never `DEFAULT_USER_ID` — except `isOwner`
  (`lib/auth/invites.ts`), which compares the two: the owner is the account
  `DEFAULT_USER_ID` names, and an unset variable means nobody is.
- **No Clerk and no self-serve signup. The owner chooses every account** (owner decision
  2026-10-06): `npm run user:add`, or an invite link only the owner can mint from Profile
  (`POST /invites`, 403 for anyone else). A link works once and expires in
  `INVITE_TTL_MS` (48 hours, short because an unused link is a bearer credential); the
  code rides in the URL fragment and only its SHA-256 is stored, so the list
  (`GET /invites`, with `joined_as`) can never return one. `DELETE /invites/:id` cancels
  an unused link by deleting it; a used one is kept as the record of who joined. A
  forwarded link shows as an account the owner does not recognise on that list. `POST /api/v1/auth/redeem` is the second route above the gate: it claims the
  invite with a conditional update and creates the user in one transaction, so a taken
  username (409) leaves the link usable and a used, expired or unknown code is one 410.
  Usernames match `USERNAME_PATTERN`. A new passphrase passes `passphraseProblem`
  (`packages/types/account.ts`: length, repeats, the username, common words under digits
  and symbols), shared by redeem, the join screen and `user:add`; login never applies it. `check:invites` runs it against Postgres.
- **Login is capped per username, not per address** (`lib/auth/loginThrottle.ts`,
  owner decision 2026-10-06): `LOGIN_ATTEMPT_LIMIT` (10) attempts per
  `LOGIN_ATTEMPT_WINDOW_MS` (15 min), counted in `login_attempts` under a SHA-256 of the
  username, then a 429 for known and unknown names alike. Each attempt is recorded
  before scrypt, so a parallel burst cannot outrun the count; a success clears it.
  Per address would lock every reader out at once, because the web app reaches the API
  through Vercel's rewrite. **Two honest limits:** anyone who knows a username can keep
  it locked for as long as they keep guessing, and there is no token revocation
  (rotating `AUTH_TOKEN_SECRET` invalidates everything). Do not describe either as
  stronger than it is.
- **The token is not a JWT:** HMAC-SHA256 over a base64url payload, one algorithm.
  `lib/auth/token.ts` is pure and verifies over the raw payload string, never re-serialised
  claims.
- **An unknown username costs the same scrypt derivation as a known one**
  (`dummyPasswordHash`).
- **`POST /api/v1/auth/login` is mounted above the gate and must respond, never `next()`.**
- **CORS is an allowlist** (`lib/cors.ts`, overridden by `CORS_ALLOWED_ORIGINS`). One `*` may
  stand for a single host label, matched against `[a-z0-9-]+`.

## Database rules

- All queries go through Drizzle (`apps/api/src/db/schema.ts` is the source of truth). No raw
  SQL unless Drizzle cannot express it.
- **No FK declares `onDelete`**, so deletes clear dependents explicitly in one transaction.
  `DELETE /locations/:id` goes through `deleteLocationCascade`
  (`src/lib/locations/deleteLocation.ts`), which walks `DEPENDENT_TABLES`. **A new table with
  a `location_id` FK goes on that list.** Do not add cascades to the schema without deciding
  what they mean for every delete.
- **`feedback` is detached, not deleted** — `deleteLocationCascade` sets its `location_id`
  null, because a forecast check is evidence about a place (#143).
- **`DELETE /trips/:tripId` clears `trip_locations` and deletes the trip in one
  transaction** (`check:delete-trip`). A new `trip_id` FK is cleared there too.
- **`weather_alerts.notified_at` is dormant** — null means "never asked".

## State machine: forecast window

- `>14 days out`: climatological normals only, no conditions score
- `7-14 days out`: low-confidence ensemble, score shown with low confidence label
- `<7 days out`: full conditions score active, p10/p90 bands shown

## Background jobs

Nothing runs on an in-process schedule. Scoring and recent rainfall are computed live per
request; scheduled work is `/api/cron/*` on cron-job.org (`background-work` skill).

- **`/api/cron/check-alerts` collects and never delivers** — there is no notification channel
  (owner's parked decision). Keep it scheduled: Severe+ rows suppress scores. Do not build a
  channel without asking.
- **A per-location loop that calls upstream runs under `Promise.allSettled`, never
  sequentially** — `fetchWithRetry`'s backoff times the number of locations walks into
  `maxDuration: 60`.
- A handler touching the DB across more than one operation must be safe to run concurrently
  and to retry.

## Client contract — constraints on the API

The client's own patterns are in the `miniapp-patterns` skill.

- **`GET /forecast/:id` carries weather only.** A snapshot has no score field; every score
  on screen is Crag A's, from the readings.
- **A day's score joins the forecast on its local date, never array position.**
