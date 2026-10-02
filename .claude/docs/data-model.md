# Data Model

Read this before any database work. This is the source of truth for the schema.

## ⚠️ Four tables currently have no writer

The Telegram Crossover migration (PR #20) deleted the BullMQ workers that populated these. The tables still exist and are still read — they just never fill up. **Do not assume a query against them returns data.**

| Table | Status |
|-------|--------|
| `forecast_snapshots` | **Intentionally dead.** Forecasts are computed live per request (`lib/scoring/liveForecast.ts`). Nothing writes here by design. |
| `crag_climbability_history` | **Unintentionally dead — see issue #25.** The `rainfallHistory` worker's backfill branch was its only writer. `GET /locations/:id/history` therefore returns `[]` forever. |
| `location_normals` | **Unintentionally dead — see issue #25.** Same worker was the only writer. `GET /locations/:id/normals` returns `[]` forever. |

`rainfall_history` is also no longer written on a schedule; recent precipitation is fetched live per request from Open-Meteo. The ACIS station lookup was deleted with the old scorer in Phase 5b.

Migrations are at `0006` (`weather_alerts.notified_at`). Note `weather_alerts.notified_at` lives on the row, so **any code path that deletes and re-inserts alert rows also resets notification dedup state** — see issue #26.

## Table List (in dependency order)
```
users
locations
crags
rainfall_history
forecast_snapshots      -- no writer (by design)
trips
trip_locations
trip_day_records        -- migration 0025, written by /api/cron/record-trips
trip_rain_records       -- migration 0026, written by /api/cron/record-trips
crag_climbability_history   -- no writer (regression, issue #25)
conditions_reports      -- no writer; superseded by feedback
feedback                -- migration 0018
route_ticks             -- migration 0019
route_todos             -- migration 0019
area_locations          -- migration 0019, shared by every account
premium_pulls
location_normals        -- no writer (regression, issue #25)
push_tokens
user_preferences
walls
weather_alerts
```

16 tables. `walls`, `location_normals`, and `weather_alerts` were added after the
original 13-table spec (migrations 0002, 0003, 0005).

## Tables

### users
```typescript
id          uuid PK default gen_random_uuid()
name        text
created_at  timestamptz default now()
```
Single row in production. Seeded on first deploy. UUID stored as `DEFAULT_USER_ID` in the Vercel project's environment variables (currently `00000000-0000-0000-0000-000000000001`).

### locations
User-saved locations (crags or general weather spots).
```typescript
id              uuid PK
user_id         uuid FK → users.id
name            text
lat             numeric
lon             numeric
is_climbing_location  boolean default false   -- renamed from is_crag
rock_type       rock_type enum -- ROCK_TYPES in packages/types: 27 values since 0015
                        -- (rock-drying-research.md §7), or null
known_crag      text    -- KNOWN_CRAGS slug, or null. Set = rock_type is locked:
                        -- written from the research on save, never from a body.
                        -- Written only by resolveRockType (POST /locations) and
                        -- npm run locations:lock-known-crags (existing rows).
aspect          text    -- wall facing direction e.g. 'NW', used for shade calc
cliff_angle     numeric -- 0 vertical, 90 flat slab, NEGATIVE overhanging (runs opposite to
                        --   climbers; the API speaks wall_angle_deg = -cliff_angle, wallAngle.ts)
asos_station    text    -- nearest IEM ASOS station ID e.g. 'KMSN'
asos_network    text    -- IEM network e.g. 'WI_ASOS'
nws_office      text    -- e.g. 'MPX'
nws_grid_x      int
nws_grid_y      int
timezone        text    -- IANA tz string e.g. 'America/Chicago'
created_at      timestamptz default now()
```

### crags
OpenBeta crag data. Populated via seed script from OpenBeta export.
```typescript
id              uuid PK
openbeta_id     text UNIQUE
name            text
lat             numeric
lon             numeric
rock_type       text
area_name       text
state           text
created_at      timestamptz default now()
```

### rainfall_history
Ground-truth observed precipitation per location per day.
```typescript
id              uuid PK
location_id     uuid FK → locations.id
date            date
precip_mm       numeric
source          text    -- 'acis' | 'open_meteo_historical' | 'iem_asos'
verified        boolean default false   -- true if from ACIS
created_at      timestamptz default now()
UNIQUE(location_id, date)
```

### forecast_snapshots
Point-in-time forecast captures. **No longer written** — the `forecast-snapshot` job and the `snapshot-cleanup` job that pruned this table were both deleted. Forecasts are computed live per request in `lib/scoring/liveForecast.ts` and returned in-memory.
```typescript
id              uuid PK
location_id     uuid FK → locations.id
captured_at     timestamptz
forecast_date   date
precip_mm_p10   numeric
precip_mm_p50   numeric
precip_mm_p90   numeric
temp_c_min      numeric
temp_c_max      numeric
wind_kmh_max    numeric
humidity_pct    numeric
model_sources   text[]  -- which models contributed
created_at      timestamptz default now()
```

### conditions_scores
**Dropped** in migration 0023 (scoring Phase 5b, 2026-10-01). It had no writer since scores went live per request.

### trips
User trip projects with forecast tracking.
```typescript
id          uuid PK
user_id     uuid FK → users.id
name        text
start_date  date
end_date    date
notes       text
created_at  timestamptz default now()
```

### trip_locations
Locations attached to a trip.
```typescript
id          uuid PK
trip_id     uuid FK → trips.id
location_id uuid FK → locations.id
```

### trip_day_records
What the forecast said about one trip day at one location, per firing of `POST /api/cron/record-trips` (`lib/trips/recordTripDays.ts`). The trend a trip screen plots as the day approaches.
```typescript
id                    uuid PK
location_id           uuid FK → locations.id   -- per location, not per trip: two trips to one crag share it
local_date            date        -- the forecast day, local to the location
recorded_at           timestamptz -- the firing, truncated to the hour
lead_days             int         -- local days from today at recording; 0 is today
scored_run_fetched_at timestamptz -- fetched_at of the stored THERMAL_MODEL run the score read; null without a score
score                 int         -- ReadingsDay.best.score; null past the readings (7 days) and at a non-crag
dryness               text        -- best.rock.level: wet | drying | dry
friction              text        -- best.friction.level: poor | fair | good | great
temp_c_max            double      -- 16-day outlook: median of member highs
temp_c_min            double
members_wet           int         -- members at or above 0.1 mm that day
member_count          int
precip_mm_mean        double      -- mean of member daily totals; sums across days
UNIQUE(location_id, local_date, recorded_at)   -- a rerun inside the hour replaces its row
```
On `DEPENDENT_TABLES`, so a location delete clears it. A row is written only when every source the location needs answered; a failed read writes nothing rather than nulls.

### trip_rain_records
A trip's rain total and warmest high at one of its locations, per firing of `POST /api/cron/record-trips`: the points of the trip screen's forecast trend, read by `GET /trips/:tripId/trend`. Built by `tripRainRows` from the same `summarizeTripOutlook` that `GET /trips/:tripId/forecast` answers with.
```typescript
id            uuid PK
trip_id       uuid FK → trips.id       -- per trip: a total is summed over one trip's dates
location_id   uuid FK → locations.id
recorded_at   timestamptz -- the firing, truncated to the hour
mean_mm       double      -- mean of member trip totals; null when no member reached every covered day
p10_mm        double      -- percentiles of member totals, never a sum of daily percentiles
p90_mm        double
member_count  int         -- members summed
days_covered  int         -- trip days inside the horizon; null with the rain
trip_days     int NOT NULL
high_c_max    double      -- highest of the covered days' median highs; null when no day had one
UNIQUE(trip_id, location_id, recorded_at)   -- a rerun inside the hour replaces its row
```
**`days_covered < trip_days` marks a total over part of the trip**, which jumps when the next day enters the horizon; the trend draws such a point hollow. A trip with no day inside the horizon writes no row. Written in the same transaction as the location's `trip_day_records`, so both or neither land. `DELETE /trips/:tripId` clears it by `trip_id` in its transaction; `location_id` is on `DEPENDENT_TABLES`.

### crag_climbability_history
Accumulated historical climbability pattern per crag per month. Grows over time.
```typescript
id              uuid PK
location_id     uuid FK → locations.id
month           int     -- 1-12
year            int
climbable_days  int
total_days      int
avg_precip_mm   numeric
created_at      timestamptz default now()
UNIQUE(location_id, month, year)
```

### conditions_reports
User-submitted field reports.
```typescript
id              uuid PK
location_id     uuid FK → locations.id
user_id         uuid FK → users.id
reported_at     timestamptz default now()
visited_at      date
overall_status  text    -- 'dry' | 'damp' | 'wet' | 'mixed'
rating          int     -- 1-5
notes           text
photo_urls      text[]  -- R2 keys, not public URLs
forecast_matched boolean -- did conditions match app prediction?
created_at      timestamptz default now()
```

### feedback
App feedback and forecast checks (`POST/GET /api/v1/feedback`, `POST /feedback/:id/resolve`,
`DELETE /feedback/:id`;
rules in `lib/feedback/parseFeedback.ts`, Postgres behaviour in `npm run check:feedback`).
A forecast check stores **what the app showed** (`app_readings`) beside **what the climber
saw**, so it can later be scored against the model (#143). `conditions_reports` is left
unwritten: it stores only a bare `forecast_matched` boolean.
```typescript
id                  uuid PK
user_id             uuid FK → users.id
kind                feedback_kind      -- 'app' | 'forecast'
location_id         uuid FK → locations.id, nullable -- set null when the location is deleted
location_name       text               -- copied at write time; survives the delete
lat, lon            double precision   -- copied at write time
message             text               -- required (non-blank) for 'app'
observed_at         timestamptz        -- required for 'forecast'
observed_conditions overall_status     -- required for 'forecast'
verdict             forecast_verdict   -- 'matched' | 'partly' | 'missed'; required for 'forecast'
app_readings        jsonb              -- FeedbackAppReadings | null: labelled words, never 0-1 factors
created_at          timestamptz default now()
resolved_at         timestamptz        -- null = open; set once acted on (migration 0024)
INDEX(user_id, created_at); CHECK constraints enforce the per-kind required fields
```
**`deleteLocationCascade` detaches feedback rather than deleting it** — a check is evidence
about a place and outlives the saved location.

**Acted-on feedback is resolved, not deleted.** `GET /feedback` lists open rows only; "Done"
in the app and `npm run feedback -- resolve <id>` set `resolved_at` and the row stays — a
resolved forecast check is still #143 evidence.

### route_ticks, route_todos, area_locations
The logbook and recorded boulder positions (`GET /logbook`, `POST/DELETE /logbook/ticks`,
`PUT/DELETE /logbook/todos/:routeId`, `PUT /guidebook/areas/:areaId/position`; rules in
`lib/logbook/parseLogbook.ts`, Postgres behaviour in `npm run check:logbook`). Routes and
areas live in the committed OpenBeta snapshot, not a table, so `route_id` and `area_id` are
OpenBeta uuids as text with **no FK**; the API refuses an id the snapshot does not hold.
```typescript
// route_ticks — one climb of one route by one user
id          uuid PK
user_id     uuid FK → users.id
route_id    text               -- OpenBeta climb uuid
ticked_on   date               -- the climber's local day
style       tick_style         -- 'send' | 'flash' | 'onsight' | 'attempt'
laps        integer            -- null when not entered, never 0
note        text
created_at  timestamptz default now()
INDEX(user_id, route_id)

// route_todos — a route a user wants to climb
user_id     uuid FK → users.id
route_id    text
created_at  timestamptz default now()
PK(user_id, route_id)            -- a second PUT is a no-op

// area_locations — where a boulder is, from a phone standing at it
area_id     text PK            -- OpenBeta area uuid; one row per area
lat, lon    double precision
accuracy_m  double precision   -- the phone's estimate; the API refuses > 50 m
recorded_by uuid FK → users.id -- never returned by any response
recorded_at timestamptz default now()
INDEX(recorded_by)
```
**`area_locations` is shared by every account** (owner decision 2026-09-29): a later
recording replaces the earlier one, whoever made either. OpenBeta's own point is never
copied here. None of the three has a `location_id`, so deleting a location leaves them alone.

### premium_pulls
Log of Tomorrow.io on-demand pulls for cost tracking.
```typescript
id          uuid PK
user_id     uuid FK → users.id
location_id uuid FK → locations.id
pulled_at   timestamptz default now()
cost_usd    numeric
```

### push_tokens
Expo push notification tokens.
```typescript
id          uuid PK
user_id     uuid FK → users.id
token       text UNIQUE
created_at  timestamptz default now()
```

### walls
Individual walls within a climbing location (added migration 0003).
```typescript
id              uuid PK
location_id     uuid FK → locations.id
user_id         uuid FK → users.id
name            text
aspect_deg      int         -- 0-359, wall facing direction
aspect_source   text        -- how aspect was determined
angle_deg       int         -- degrees from vertical
angle_band      text        -- categorical band
route_count     int
created_at      timestamptz default now()
updated_at      timestamptz
```

### location_normals
30-year ACIS gridded climatological normals per location per month (added migration 0005).
**No writer — see issue #25.**
```typescript
id                  uuid PK
location_id         uuid FK → locations.id
month               int     -- 1-12
precip_normal_mm    numeric
temp_max_normal_c   numeric
temp_min_normal_c   numeric
source              text default 'acis_grid_91_20'
fetched_at          timestamptz default now()
UNIQUE(location_id, month)
```

### weather_alerts
Active NWS alerts per location (added migration 0002; `notified_at` added 0006).
```typescript
id              uuid PK
location_id     uuid FK → locations.id
nws_alert_id    text
event           text
severity        text
certainty       text
headline        text
description     text
effective       timestamptz
expires         timestamptz
notified_at     timestamptz -- NULL until sent to Telegram; the dedup key
created_at      timestamptz default now()
UNIQUE(location_id, nws_alert_id)
```
Written by `runAlertsCheck()` in `lib/alerts/checkAlerts.ts`, driven by
`POST /api/cron/check-alerts`. **`notified_at` lives on the row**, so pruning and
re-inserting a row resets its notification state — see issue #26.

### user_preferences
```typescript
id                      uuid PK
user_id                 uuid FK → users.id UNIQUE
temp_unit               text default 'F'
precip_unit             text default 'in'
default_rock_type       text
alert_enabled           boolean default true
alert_min_score         int default 70
ideal_temp_min_c        double precision default 10 NOT NULL
ideal_temp_max_c        double precision default 22 NOT NULL
drying_caution          text default 'normal' NOT NULL   -- relaxed | normal | cautious
include_sun             boolean default true NOT NULL
window_min_rock         text default 'drying' NOT NULL   -- wet | drying | dry
window_min_friction     text default 'fair' NOT NULL     -- poor | fair | good | great
created_at              timestamptz default now()
```
**The six columns from `ideal_temp_min_c` down are Layer 5 of the v2 scoring
model, added by migration `0012` on 2026-09-21, and nothing reads any of them
yet** — including the rest of `user_preferences`, which has no reader either.
They exist because the migration is the slow half and the later phases need the
column set settled. Defaults are the current hardcoded constants where one exists
(`ideal_temp_*` is `TEMP_BAND_C`, `drying_caution: 'normal'` is `MAX_HOURS`
unchanged); the two window minimums have no precedent and are judgement calls
recorded as such in `schema.ts`.

## Key Relationships
- Everything traces back to `users.id` via FK — even with auth off
- `locations` is the hub: forecast_snapshots, rainfall_history, and conditions_reports all FK to it
- `crags` is a separate read-only reference table seeded from OpenBeta — not the same as `locations`
- A user "saves" a crag by creating a `locations` row, optionally linked by name/coords to a `crags` row
