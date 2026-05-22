# Data Model

Read this before any database work. This is the source of truth for the schema.

## Table List (in dependency order)
```
users
locations
crags
rainfall_history
forecast_snapshots
conditions_scores
trips
trip_locations
crag_climbability_history
conditions_reports
premium_pulls
push_tokens
user_preferences
```

## Tables

### users
```typescript
id          uuid PK default gen_random_uuid()
name        text
created_at  timestamptz default now()
```
Single row in production. Seeded on first deploy. UUID stored as `DEFAULT_USER_ID` in Railway env.

### locations
User-saved locations (crags or general weather spots).
```typescript
id              uuid PK
user_id         uuid FK → users.id
name            text
lat             numeric
lon             numeric
is_crag         boolean default false
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
Point-in-time forecast captures. Retained 30 days, pruned by snapshot-cleanup job.
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
Computed conditions score per location. Recalculated by forecast-snapshot job.
```typescript
id              uuid PK
location_id     uuid FK → locations.id
scored_at       timestamptz
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
target_date date
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
