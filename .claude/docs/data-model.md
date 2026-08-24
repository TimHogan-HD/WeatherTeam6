# Data Model

Read this before any database work. This is the source of truth for the schema.

## ⚠️ Four tables currently have no writer

The Telegram Crossover migration (PR #20) deleted the BullMQ workers that populated these. The tables still exist and are still read — they just never fill up. **Do not assume a query against them returns data.**

| Table | Status |
|-------|--------|
| `forecast_snapshots` | **Intentionally dead.** Forecasts are computed live per request (`lib/scoring/liveForecast.ts`). Nothing writes here by design. |
| `conditions_scores` | **Intentionally dead.** Same — scores are computed live and returned in-memory. |
| `crag_climbability_history` | **Unintentionally dead — see issue #25.** The `rainfallHistory` worker's backfill branch was its only writer. `GET /locations/:id/history` therefore returns `[]` forever. |
| `location_normals` | **Unintentionally dead — see issue #25.** Same worker was the only writer. `GET /locations/:id/normals` returns `[]` forever. |

`rainfall_history` is also no longer written on a schedule; recent precipitation is fetched live per request instead (ACIS when the location has an `asos_station`, else Open-Meteo's archive API).

Migrations are at `0006` (`weather_alerts.notified_at`). Note `weather_alerts.notified_at` lives on the row, so **any code path that deletes and re-inserts alert rows also resets notification dedup state** — see issue #26.

## Table List (in dependency order)
```
users
locations
crags
rainfall_history
forecast_snapshots      -- no writer (by design)
conditions_scores       -- no writer (by design)
trips
trip_locations
crag_climbability_history   -- no writer (regression, issue #25)
conditions_reports
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
rock_type       text    -- 'sandstone' | 'limestone' | 'granite' | 'basalt' | null
aspect          text    -- wall facing direction e.g. 'NW', used for shade calc
cliff_angle     numeric -- degrees from vertical, used for drying calc
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
Computed conditions score per location. **No longer written** — scores are computed live per request in `lib/scoring/liveForecast.ts` and returned in-memory, never persisted.
```typescript
id              uuid PK
location_id     uuid FK → locations.id
computed_at     timestamptz
score           int         -- 0-100
confidence      text        -- 'high' | 'medium' | 'low'
drying_hours_remaining  numeric
last_rain_mm    numeric
last_rain_hours numeric
forecast_rain_72h_mm    numeric
drying_score    int         -- component score 0-40
rain_score      int         -- component score 0-25
wind_score      int         -- component score 0-15
temp_score      int         -- component score 0-12
humidity_score  int         -- component score 0-8
score_breakdown jsonb       -- full breakdown including modifiers
created_at      timestamptz default now()
```

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
created_at              timestamptz default now()
```

## Key Relationships
- Everything traces back to `users.id` via FK — even with auth off
- `locations` is the hub: forecast_snapshots, conditions_scores, rainfall_history, and conditions_reports all FK to it
- `crags` is a separate read-only reference table seeded from OpenBeta — not the same as `locations`
- A user "saves" a crag by creating a `locations` row, optionally linked by name/coords to a `crags` row
