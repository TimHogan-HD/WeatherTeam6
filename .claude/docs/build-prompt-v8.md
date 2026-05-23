# WeatherTeam6: Claude Code Build Prompt
Version: v8
Date: 2026-05-22
Status: Ready for Handoff

---

## How to Use This Document

This is a **gated phase build**. You are not building the whole app in one pass.

- Read the full document before writing a single line of code.
- Complete one phase, run its acceptance criteria checks, commit, then stop.
- Wait for the user to confirm the gate passes before moving to the next phase.
- If something is ambiguous, stop and ask. Do not assume and continue.
- Never skip a git checkpoint.

---

## Project Overview

**WeatherTeam6** is a climbing-specific weather platform. Core purpose: tell a climber whether a crag is climbable now, over the next 7 days, and help plan trips weeks out. It also functions as a general weather app for non-climbing locations (climbing score hidden when not a climbing location).

### Stack
- **Mobile:** React Native + Expo (Expo Router for navigation)
- **Backend:** Node.js + TypeScript + Express
- **Database:** PostgreSQL + Drizzle ORM
- **Queues:** Redis + BullMQ
- **Storage:** Cloudflare R2 (for photos)
- **Hosting:** Railway
- **Monorepo:** Turborepo — `apps/api`, `apps/mobile`, `packages/types`

### Key Data Sources
- Open-Meteo ensemble API (31-member GFS + ECMWF/ICON/GEM)
- Open-Meteo deterministic forecast (GFS, HRRR, ECMWF, ICON, NAM, NBM)
- Open-Meteo historical archive
- Open-Meteo air quality API
- IEM ASOS current observations
- NOAA ACIS verified precipitation
- NWS Alerts API
- RainViewer radar tiles
- Tomorrow.io (premium on-demand)
- OpenBeta crag export (local JSON, not API)
- suncalc npm package (client-side solar math)
- ShadeMap SDK (client-side terrain shade)

---

## Architecture Rules (Non-Negotiable)

These rules apply to every phase. Violating any of them is a blocking issue.

- **Monorepo:** Turborepo. `apps/api`, `apps/mobile`, `packages/types`.
- **Shared types:** All shared TypeScript types live in `packages/types` only. Never duplicate type definitions.
- **Route handlers are thin.** Business logic lives in `apps/api/src/lib/`, not in route files.
- **Auth:** `AUTH_ENABLED=false` means `resolveUser` middleware injects `req.userId = DEFAULT_USER_ID`. Route handlers use `req.userId`. Never reference `DEFAULT_USER_ID` in routes. Do not build login UI. Do not add Clerk/sessions.
- **Database:** Drizzle is the only ORM. Schema in `apps/api/src/db/schema.ts`. All migrations via `drizzle-kit generate` then `drizzle-kit migrate`. Never use `drizzle-kit push`. Never write raw SQL unless Drizzle cannot express it (comment why).
- **API response shape:** All endpoints return `{ data: T | null, error: string | null, status: number }`. No exceptions.
- **Background jobs:** Exactly four BullMQ queues. No new queues without explicit approval.
- **Mobile state:** React Query for all server state. No Redux, no Zustand, no Context for server state.
- **Mobile navigation:** Expo Router only. File-based routing under `apps/mobile/app/`.
- **Mobile API calls:** All fetches go through React Query hooks in `apps/mobile/src/hooks/`. Components never call fetch directly.
- **No hardcoded URLs:** API base URL from env config. No hardcoded API base URLs in mobile.
- **Logging:** Use `logger` (pino) everywhere in `apps/api`. No `console.log` or `console.error`.
- **Forecast window:** Computed at read time from `(forecast_date - CURRENT_DATE)`. Never stored as a column.
- **`.env.example`** is the authoritative list of required env vars. Other docs (CLAUDE.md, README) may lag.

---

## Directory Structure

```
apps/
  api/
    src/
      index.ts
      db/
        schema.ts
        seed.ts
        index.ts          <- db connection export
      lib/
        logger.ts         <- pino logger, used everywhere
        redis.ts          <- ioredis client for caching (alerts, premium pulls). Separate from BullMQ connection.
        weather/
          openMeteo.ts
          acis.ts
          iemAsos.ts
          nwsAlerts.ts
          tomorrowIo.ts
          rainViewer.ts
        scoring/
          dryingModel.ts
          conditionsScore.ts
      jobs/
        connection.ts     <- BullMQ Redis connection (maxRetriesPerRequest: null). NOT the same as lib/redis.ts.
        queues.ts
        scheduler.ts
        workers/
          forecastSnapshot.ts
          rainfallHistory.ts
          alertsPoller.ts
          snapshotCleanup.ts
      middleware/
        auth.ts           <- resolveUser only
      routes/
        locations.ts
        conditions.ts
        alerts.ts
        forecast.ts
        trips.ts
        premium.ts
        radar.ts
        health.ts
  mobile/
    app/
      _layout.tsx
      index.tsx
      location/[id].tsx   <- Location detail: score, alerts, 7-day forecast (handles both climbing and general weather)
      search.tsx
      trip/
        index.tsx         <- Trip list
        [id].tsx          <- Trip detail with forecast evolution
    src/
      hooks/
        useLocations.ts
        useConditions.ts
        useAlerts.ts
        useForecasts.ts
        useTrips.ts
      utils/
        shadeCalc.ts
        shadeMapCalc.ts
packages/
  types/
    index.ts              <- All shared types + aspectToDegrees utility. Populated in Phase 1.
```

---

## Schema Spec (13 tables)

All tables have `id: uuid PK default gen_random_uuid()` and `created_at: timestamptz default now()`.

Tables with `updated_at`: locations, trips, user_preferences only. All other tables: `created_at` only.

- **users:** name text. Single row seeded.
- **locations:** user_id FK, name, lat, lon, is_climbing_location boolean, rock_type enum (sandstone/limestone/granite/basalt/unknown, nullable), aspect text, cliff_angle numeric (nullable), asos_station text, asos_network text, nws_office text, nws_grid_x int, nws_grid_y int, timezone text
- **crags:** openbeta_id text UNIQUE, name, lat, lon, rock_type text, area_name text, state text. Read-only reference table.
- **rainfall_history:** location_id FK, date, precip_mm numeric, source enum (acis/open_meteo_historical/iem_asos), station_id text nullable, verified boolean default false. UNIQUE(location_id, date).
- **forecast_snapshots:** location_id FK, captured_at timestamptz, forecast_date date, precip_mm_p10, precip_mm_p50, precip_mm_p90, temp_c_min, temp_c_max, wind_kmh_max, humidity_pct, model_sources text[]. No `window` column.
- **conditions_scores:** location_id FK, forecast_date date, score int (0-100 or null), confidence enum (low/medium/high), component_drying_time int, component_upcoming_rain int, component_wind int, component_temp int, component_humidity int, score_breakdown jsonb, computed_at timestamptz. **No unique constraint** — multiple rows accumulate per (location_id, forecast_date) across job runs, enabling score evolution tracking for trips.
- **trips:** user_id FK, name, target_date date (single date, not a range), notes text
- **trip_locations:** trip_id FK, location_id FK
- **crag_climbability_history:** location_id FK (not crag_id), month int, year int, climbable_days int, total_days int. UNIQUE(location_id, month, year).
- **conditions_reports:** location_id FK, user_id FK, reported_at timestamptz, visited_at date, overall_status enum, rating int, notes text, photo_urls text[], forecast_matched boolean
- **premium_pulls:** location_id FK, user_id FK, pulled_at timestamptz, raw_response jsonb, cost_usd numeric nullable
- **push_tokens:** user_id FK, token text UNIQUE
- **user_preferences:** user_id FK UNIQUE, temp_unit text default 'F', precip_unit text default 'in', default_rock_type text, alert_enabled boolean default true, alert_min_score int default 70

---

## Shared Types and Utilities in packages/types

Built in Phase 1. packages/types exports:
- `ApiResponse<T>`: the standard `{ data, error, status }` shape
- `Location`, `Crag`, `ConditionsScore`, `ForecastSnapshot` types
- `ScoreInput`, `ScoreOutput`, and `ScoreBreakdown` types (used by backend scoring function)
- `aspectToDegrees(aspect: string): number` utility

aspectToDegrees canonical mapping:
- N=0, NNE=22, NE=45, ENE=67
- E=90, ESE=112, SE=135, SSE=157
- S=180, SSW=202, SW=225, WSW=247
- W=270, WNW=292, NW=315, NNW=337
- Unknown or unrecognized input returns 180 (south-facing default)

ScoreInput type:
- rockType: 'sandstone' | 'limestone' | 'granite' | 'basalt' | 'unknown'
- aspectDegrees: number
- cliffAngle: number (degrees from vertical: 0 = vertical wall, 90 = flat slab. Default 45 if locations.cliff_angle is null)
- hoursSinceRain: number
- lastRainMm: number
- forecastRain72hMm: number (sum of next 3 days' precip_mm_p50 from forecast_snapshots)
- forecastRain72hP10: number (sum of next 3 days' precip_mm_p10 from forecast_snapshots)
- forecastRain72hP90: number (sum of next 3 days' precip_mm_p90 from forecast_snapshots)
- currentWindKmh: number
- maxWindKmh24h: number
- currentTempC: number
- forecastHighC: number
- currentHumidityPct: number
- forecastDateDaysOut: number
- // sunExposureHours omitted — shade modifier not applied server-side in v1. suncalc is client-side only (Phase 8).

ScoreOutput type:
- score: number | null
- confidence: 'low' | 'medium' | 'high'
- window: 'pre' | 'early' | 'decision'
- components: { drying_time: number, upcoming_rain: number, wind: number, temp: number, humidity: number }
- breakdown: ScoreBreakdown

ScoreBreakdown type (persisted to conditions_scores.score_breakdown):
- drying: { score: number, hours_since_rain: number, hours_remaining: number, rock_type: string, modifiers: { angle: number, wind: number, humidity: number } }
- rain: { score: number, forecast_72h_mm: number }
- wind: { score: number, max_kmh: number }
- temp: { score: number, temp_c: number }
- humidity: { score: number, pct: number }
- total: number
- confidence: string
- computed_at: string

---

## NWS Alert Tier Mapping

Use `properties.event` string (not `properties.severity`) to determine tier:

- **Watch:** `Severe Thunderstorm Watch`, `Tornado Watch`, `Winter Storm Watch`, `Flash Flood Watch`
- **Advisory:** `Wind Advisory`, `Heat Advisory`, `Winter Weather Advisory`, `Dense Fog Advisory`
- **Warning:** `Severe Thunderstorm Warning`, `Flash Flood Warning`, `Winter Storm Warning`, `High Wind Warning`, `Excessive Heat Warning`
- **Active:** `Tornado Warning`, `Extreme Wind Warning`

Unknown event types → `Watch` (conservative default). Multiple simultaneous alerts → highest tier wins (Active > Warning > Advisory > Watch).

Test cases for acceptance:
- `Tornado Warning` → `Active`
- `Flash Flood Warning` + `Wind Advisory` → `Warning` (higher wins)
- `Dense Fog Advisory` → `Advisory`
- `Unknown Event Name` → `Watch`

---

## .env.example (Authoritative)

```
DATABASE_URL=
REDIS_URL=
DEFAULT_USER_ID=
AUTH_ENABLED=false
ADMIN_PASSWORD=
NODE_ENV=development
PORT=3001
NWS_USER_AGENT=weatherteam6/1.0 your@email.com
TOMORROW_IO_API_KEY=
RAINVIEWER_KEY=
SHADEMAP_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
API_BASE_URL=
```

---

## Phase 0: Monorepo Scaffold

What to build:
- Turborepo root with `apps/api`, `apps/mobile`, `packages/types`
- `apps/api`: Express + TypeScript boilerplate, `/health` endpoint returning `{ data: { status: "ok" }, error: null, status: 200 }`
- `apps/mobile`: Expo project initialized with Expo Router
- `packages/types`: empty `index.ts`, configured for cross-app imports. Types are added in Phase 1.
- `apps/api/src/lib/logger.ts`: pino logger instance, exported. Every log call in the API uses this — never `console.log`.
- `apps/api/src/middleware/auth.ts`: `resolveUser` middleware. If `AUTH_ENABLED=false`, sets `req.userId = process.env.DEFAULT_USER_ID`. All routes use `req.userId`.
- `.env.example` with all keys listed above, blank values
- `.gitignore` excludes `.env`, `node_modules/`, `dist/`, `.next/`
- No `.env` committed. Only `.env.example`.

Acceptance criteria:
- `turbo run build` succeeds for all workspaces
- `/health` returns expected shape
- `packages/types` importable from both `apps/api` and `apps/mobile`
- `resolveUser` attaches `req.userId` on every request
- `logger` used in health route, no `console.log` anywhere
- `.env.example` present with all keys, no values

Git checkpoint: `git commit -m "phase-0: monorepo scaffold"`

---

## Phase 1: Database Schema + Migrations + Shared Types

What to build:
- Drizzle config in `apps/api` pointing to `DATABASE_URL`
- Full schema in `apps/api/src/db/schema.ts` covering all 13 tables listed above
- `user_id` FK on: locations, trips, conditions_reports, push_tokens, premium_pulls, user_preferences
- `updated_at` on locations, trips, user_preferences only. All other tables: `created_at` only.
- rock_type enum: sandstone / limestone / granite / basalt / unknown
- Three schema-only tables (no endpoints or logic): conditions_reports, push_tokens, user_preferences
- `crag_climbability_history` has only `climbable_days` and `total_days` — no `avg_precip_mm`
- `conditions_scores` has NO unique constraint — multiple rows per (location_id, forecast_date) are expected
- Generate initial migration with `npx drizzle-kit generate`. Review the SQL before committing.

- **Populate `packages/types/index.ts`** with all shared types and utilities:
  - `ApiResponse<T>`: `{ data: T | null, error: string | null, status: number }`
  - `Location`, `Crag`, `ConditionsScore`, `ForecastSnapshot` types matching the schema
  - `ScoreInput`, `ScoreOutput`, `ScoreBreakdown` types with exact shapes defined in the architecture section above
  - `aspectToDegrees(aspect: string): number` utility with the canonical mapping defined above
  - All exports must compile and be importable from both `apps/api` and `apps/mobile`

- Seed script at `apps/api/src/db/seed.ts`:
  - 1 user row with a fixed UUID. Store it as `DEFAULT_USER_ID` in `.env.example`.
  - 3 test locations (`is_climbing_location: true`):
    - Joshua Tree: rock_type granite, aspect S, cliff_angle 30, asos_station KPSP, asos_network CA_ASOS
    - Red Rock: rock_type limestone, aspect E, cliff_angle 10, asos_station KLAS, asos_network NV_ASOS
    - Indian Creek: rock_type sandstone, aspect W, cliff_angle 5, asos_station KCNY, asos_network UT_ASOS
  - Seed script is idempotent

Acceptance criteria:
- `npx drizzle-kit migrate` runs cleanly against local PostgreSQL
- All 13 tables exist
- No `drizzle-kit push` used (migration file must exist in `drizzle/`)
- `npx tsx apps/api/src/db/seed.ts` inserts 1 user and 3 locations without errors
- Running seed twice does not duplicate rows
- rock_type enum includes `unknown`
- forecast_snapshots has no `window` column
- trips has `target_date`, not `start_date` or `end_date`
- rainfall_history.source accepts `acis`, `open_meteo_historical`, `iem_asos`
- updated_at present on locations, trips, user_preferences only
- premium_pulls.cost_usd is nullable
- conditions_scores has NO unique constraint on (location_id, forecast_date)
- Seed locations include cliff_angle values
- crag_climbability_history has no avg_precip_mm column
- `packages/types` exports `ApiResponse`, `ScoreInput`, `ScoreOutput`, `ScoreBreakdown`, `aspectToDegrees`
- `aspectToDegrees('S')` returns 180, `aspectToDegrees('NW')` returns 315, `aspectToDegrees('garbage')` returns 180
- `turbo run build` succeeds (types compile cleanly across workspaces)

Git checkpoint: `git commit -m "phase-1: drizzle schema, migrations, seed data, and shared types"`

---

## Phase 2: Background Job Infrastructure

What to build:
- BullMQ + Redis connection in `apps/api/src/jobs/connection.ts`, exported as singleton. This is separate from `lib/redis.ts`.
- Four queue files in `apps/api/src/jobs/`, named exactly: `forecast-snapshot`, `rainfall-history`, `alerts-poller`, `snapshot-cleanup`
- Each processor stub logs `[queue-name] job started` via logger (not `console.log`) and completes without error
- Cron schedules: forecast-snapshot every 6h, rainfall-history daily 06:00 UTC, alerts-poller every 5min, snapshot-cleanup daily 02:00 UTC
- Bull Board UI at `/admin/queues`, basic auth gated by `ADMIN_PASSWORD`
- Redis failure logs error via logger without crashing Express

Acceptance criteria:
- All four queues in Bull Board at `/admin/queues`
- Manually triggering any queue logs expected string and marks it completed
- Redis failure logs error without crashing
- No fifth queue exists anywhere in the codebase
- Bull Board returns 401 with wrong ADMIN_PASSWORD
- No `console.log` or `console.error` anywhere in the jobs directory

Git checkpoint: `git commit -m "phase-2: bullmq queue infrastructure"`

---

## Phase 3: Open-Meteo Integration + Forecast Snapshot Job + Snapshot Cleanup

What to build:
- Verify live before writing code: `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=36.0&longitude=-114.0&models=gfs_seamless,ecmwf_ifs025,icon_seamless_eps,gem_global&hourly=precipitation,temperature_2m,windspeed_10m,relativehumidity_2m`
- `apps/api/src/lib/weather/openMeteo.ts`:
  - Fetch all four models: gfs_seamless, ecmwf_ifs025, icon_seamless_eps, gem_global
  - p10/p50/p90 derived from GFS members only (31 members). Other models are metadata only.
  - Aggregate GFS hourly members to daily: precip_mm_p10, precip_mm_p50, precip_mm_p90, temp_c_min, temp_c_max, wind_kmh_max, humidity_pct
  - model_sources: array of models that returned data successfully

- `apps/api/src/lib/scoring/conditionsScore.ts`: STUB ONLY in this phase.
  - Accepts ScoreInput (imported from packages/types), returns ScoreOutput
  - Stub returns `{ score: null, confidence: 'low', window: 'pre', components: { drying_time: 0, upcoming_rain: 0, wind: 0, temp: 0, humidity: 0 }, breakdown: null }`
  - Real implementation is built in Phase 5. This stub exists only so Phase 3 can wire the call.

- forecast-snapshot job processor replaces stub:
  - For each active location, fetch ensemble forecast
  - Insert one forecast_snapshots row per forecast day
  - After inserting snapshots for a location, build ScoreInput from **both snapshot data AND drying model output**:
    1. Query `rainfall_history` for this location (most recent 30 days)
    2. Call `dryingModel()` with rainfall data + location metadata → get `hoursSinceRain`, `lastRainMm`. If no `rainfall_history` rows exist yet (new location, Phase 4 hasn't run), default `hoursSinceRain = 0`, `lastRainMm = 0` (pessimistic — assumes currently raining).
    3. For ScoreInput's current conditions fields, use today's forecast snapshot values as proxies: `currentWindKmh = wind_kmh_max`, `currentTempC = (temp_c_min + temp_c_max) / 2`, `currentHumidityPct = humidity_pct` from today's snapshot row
    4. For 72h aggregate fields: sum the next 3 days' `precip_mm_p10`, `precip_mm_p50`, `precip_mm_p90` from `forecast_snapshots` to get `forecastRain72hP10`, `forecastRain72hMm`, `forecastRain72hP90`
    5. Set `cliffAngle` from `locations.cliff_angle`, defaulting to `45` if null
    6. Set `aspectDegrees = aspectToDegrees(location.aspect)` using the utility imported from `packages/types`
    7. Call `conditionsScore()` with the assembled ScoreInput
  - **INSERT** (not upsert) result to conditions_scores. Multiple rows per (location_id, forecast_date) accumulate over time — this is intentional for score evolution tracking. Write `ScoreOutput.breakdown` to `conditions_scores.score_breakdown`.
  - `conditions_scores.computed_at = now()`
  - Non-200 from Open-Meteo: log via logger, mark job failed, do not insert partial data

- snapshot-cleanup job processor replaces stub:
  - Delete `forecast_snapshots` rows where `captured_at < NOW() - INTERVAL '30 days'`
  - Delete `conditions_scores` rows where `forecast_date < CURRENT_DATE - INTERVAL '30 days'`
  - Safe to run multiple times — both deletes are idempotent

Acceptance criteria:
- Manually trigger forecast-snapshot in Bull Board
- Rows inserted into forecast_snapshots for seeded locations
- precip_mm_p10 <= precip_mm_p50 <= precip_mm_p90 across all rows
- model_sources non-empty on every snapshot row
- conditions_scores rows exist for seeded locations (score will be null — stub is running)
- Running forecast-snapshot twice creates additional conditions_scores rows (not overwriting — INSERT, not upsert)
- No `window` column in forecast_snapshots
- Open-Meteo endpoint verified live before writing code
- ScoreInput assembly queries rainfall_history (returns empty array for new locations)
- cliffAngle populated from locations.cliff_angle (or default 45)
- aspectDegrees populated via aspectToDegrees(location.aspect)
- Manually trigger snapshot-cleanup — seed a forecast_snapshot with captured_at 31 days ago, verify it is deleted after job runs
- Snapshot-cleanup also deletes old conditions_scores rows

Git checkpoint: `git commit -m "phase-3: open-meteo integration, forecast snapshot job, snapshot cleanup"`

---

## Phase 4: Rainfall History + Drying Model

Three sources, priority order: ACIS (authoritative) > IEM ASOS > Open-Meteo historical (fallback).

What to build:
- Verify IEM ASOS live: `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=KSLC&data=precip&year1=2026&month1=1&day1=1&year2=2026&month2=1&day2=7&tz=UTC&format=comma&latlon=no&direct=no`
- Verify ACIS: try GET `https://data.rcc-acis.org/StnData?sid=KSLC&sdate=2026-01-01&edate=2026-01-07&elems=pcpn&output=json` first. If GET returns non-200, use POST with JSON body `{ "sid": "KSLC", "sdate": "...", "edate": "...", "elems": "pcpn" }`.

`apps/api/src/lib/weather/acis.ts`:
- Returns `{ date, precip_mm, verified: true }[]`
- T (trace) → 0.1mm. M (missing) → skip.

`apps/api/src/lib/weather/iemAsos.ts`:
- Parses CSV into `{ date, precip_mm }[]`
- M → skip. T → 0.1mm.

rainfall-history job processor replaces stub:
- Locations with asos_station: try ACIS first (source: acis, verified: true). On ACIS failure, try IEM ASOS (source: iem_asos, verified: false).
- Locations without asos_station: Open-Meteo historical (source: open_meteo_historical, verified: false).
- Upsert by (location_id, date). ACIS rows must never be overwritten by lower-priority sources.
- Fetch last 30 days per run.

`apps/api/src/lib/scoring/dryingModel.ts`:
- Inputs: rock_type, cliff_angle, rainfall_events: `{ date: string, precip_mm: number }[]`, as_of: Date
- Output: `{ hours_since_significant_rain: number, estimated_dry: boolean, confidence: 'low' | 'medium' | 'high' }`
- Significant rain threshold: > 2mm
- unknown rock type uses 36h threshold
- Cliff angle modifier for `estimated_dry` threshold: `angleFactor = 1 + (cliffAngle / 90) * 0.3` applied to base drying hours. Higher angle (more slab) = slower drainage = longer drying.
- **Wind and humidity modifiers are NOT applied here.** They live in Phase 5's conditionsScore.ts, which has access to all ScoreInput fields. dryingModel only uses rock_type, cliff_angle, and rainfall history.
- Confidence: high if ACIS rows present, medium if iem_asos, low if open_meteo_historical or < 7 days history

Acceptance criteria:
- Manually trigger rainfall-history, confirm rows in rainfall_history for seeded locations
- ACIS rows have verified: true
- ACIS rows not overwritten on second job run
- source is always one of three valid values, never null
- Drying model: granite + 15h after 5mm rain → estimated_dry: true
- Drying model: sandstone + 12h after 10mm rain → estimated_dry: false
- Drying model: unknown rock type + 40h after 5mm rain → estimated_dry: true
- Cliff angle modifier applied: vertical wall (cliffAngle=0) dries faster than slab (cliffAngle=80)
- dryingModel does NOT reference wind speed or humidity (verify no such fields in function signature)
- Trace T → precip_mm: 0.1 from both parsers
- Missing M → skipped, not inserted

Git checkpoint: `git commit -m "phase-4: rainfall history, acis/asos integration, drying model"`

---

## Phase 5: Conditions Score Engine + Core API Endpoints

What to build:
- `apps/api/src/lib/scoring/conditionsScore.ts`: replace the Phase 3 stub with the real implementation
  - Imports ScoreInput, ScoreOutput, ScoreBreakdown from packages/types
  - Uses aspectDegrees from ScoreInput directly (pre-converted by caller in Phase 3 using aspectToDegrees — do NOT call aspectToDegrees again inside this function)
  - Uses cliffAngle from ScoreInput for drying time modifier (angleFactor = 1 + (cliffAngle / 90) * 0.3)
  - Applies wind drying modifier here: if maxWindKmh24h > 20, reduce drying hours by 20%
  - Applies humidity drying modifier here: if currentHumidityPct > 80, increase drying hours by 30%
  - Window computed from forecastDateDaysOut field on ScoreInput
  - Pre-window (>14 days): score null, confidence low
  - Early-window (7-14 days): score computed, confidence low
  - Decision-window (<7 days): full score, confidence from p10/p90 spread (forecastRain72hP90 - forecastRain72hP10: <=2mm → high, <=8mm → medium, else low)
  - Weight order: drying_time > upcoming_rain > wind > temp > humidity
  - Clamp final score to 0-100
  - Returns full ScoreBreakdown in output.breakdown, persisted to conditions_scores.score_breakdown by the forecast-snapshot job (wired in Phase 3)
  - Note: sunExposureHours is not applied server-side in v1. The shade modifier is omitted from server scoring. suncalc runs client-side only (Phase 8). Scoring will be slightly conservative for sun-exposed walls.

- Three API endpoints:
  - `GET /api/v1/locations`: all locations for `req.userId`
  - `GET /api/v1/conditions/:locationId`: reads from conditions_scores. Returns the **latest** row (ORDER BY computed_at DESC LIMIT 1) where `forecast_date = CURRENT_DATE`. If no row for today exists, return the latest row with the nearest future `forecast_date`. If no rows exist or all are pre-window (score null), return `{ score: null, window: 'pre' }`. Non-climbing location returns `{ score: null, is_climbing_location: false }`.
  - `GET /api/v1/forecast/:locationId`: returns next 7 days of forecast_snapshots for the location, ordered by forecast_date ascending. Each returned row includes `window` computed at read time from `(forecast_date - CURRENT_DATE)`: >14 days → 'pre', 7-14 days → 'early', <7 days → 'decision'. Window is never stored as a column.

Acceptance criteria:
- conditionsScore returns null score for forecastDateDaysOut > 14
- conditionsScore returns score with confidence 'low' for forecastDateDaysOut 7-14
- Component breakdown sums to total score within rounding tolerance
- drying_time component is the highest-weighted (0-40 range)
- cliffAngle modifier affects drying score (vertical wall scores higher than slab, all else equal)
- Wind drying modifier applied in conditionsScore (not dryingModel)
- Humidity drying modifier applied in conditionsScore (not dryingModel)
- ScoreBreakdown populated in ScoreOutput.breakdown — not null
- conditions_scores.score_breakdown contains valid JSON after forecast-snapshot job runs with real scoring
- GET /api/v1/locations returns seeded locations
- GET /api/v1/conditions/:locationId returns the LATEST row (most recent computed_at) for today's forecast_date
- GET /api/v1/forecast/:locationId returns 7 days ordered ascending with window per row
- Forecast rows with forecast_date >14 days out have window: 'pre'
- All responses use `{ data, error, status }` shape

Git checkpoint: `git commit -m "phase-5: conditions score engine and core API endpoints"`

---

## Phase 6: NWS Alerts + Alert Poller

What to build:
- Verify live: `https://api.weather.gov/alerts/active?point=36.0,-114.0`
- `apps/api/src/lib/weather/nwsAlerts.ts`:
  - Fetch active alerts for a lat/lon point using `?point={lat},{lon}`
  - `User-Agent` header required: use `NWS_USER_AGENT` from env. Requests without it get blocked.
  - Map `properties.event` string to internal tier using the mapping above
  - Multiple alerts → highest tier wins
- alerts-poller job processor replaces stub:
  - For each active location, fetch alerts using the location's `lat` and `lon`. No nws_office filter — the NWS alerts endpoint uses lat/lon directly.
  - Store in Redis (`redisCache` from `lib/redis.ts`) with key `alerts:{locationId}`, TTL 360 seconds (6 minutes)
- `GET /api/v1/alerts/:locationId`:
  - Read from Redis. If cache miss, fetch live and re-cache.
  - Response: `{ data: { tier: 'Watch' | 'Advisory' | 'Warning' | 'Active' | null, alerts: object[] }, error: null, status: 200 }`

Acceptance criteria:
- Manually trigger alerts-poller, confirm Redis keys exist for seeded locations (`GET alerts:{id}` in redis-cli)
- `GET /api/v1/alerts/:locationId` returns valid shape
- TTL on Redis key is 360 seconds (verify with `TTL alerts:{id}` in redis-cli)
- Cache miss triggers a live NWS fetch and re-caches the result
- NWS endpoint verified live before writing integration code
- `NWS_USER_AGENT` header sent on every NWS request
- Alerts fetched for all seeded locations (no nws_office filter blocking them)

Git checkpoint: `git commit -m "phase-6: nws alerts and alert poller"`

---

## Phase 7: Mobile Core Screens

What to build:
- Expo Router file structure:
  ```
  app/
    _layout.tsx           <- Root layout with React Query provider
    index.tsx             <- Location list (home screen)
    location/[id].tsx     <- Location detail: score, alerts, 7-day forecast
    search.tsx            <- Location search (stub for now, functional in Phase 10)
  ```
- React Query hooks in `apps/mobile/src/hooks/`:
  - `useLocations()`: fetches `GET /api/v1/locations`
  - `useConditions(locationId)`: fetches `GET /api/v1/conditions/:locationId`
  - `useAlerts(locationId)`: fetches `GET /api/v1/alerts/:locationId`
  - `useForecasts(locationId)`: fetches `GET /api/v1/forecast/:locationId`
- `API_BASE_URL` from Expo `app.config.js` extra. Never hardcoded.
- All screens use real data from hooks. No mock data.
- No design pass this phase. Focus on data rendering correctly.
- Trip screens are NOT built this phase. Added in Phase 9.
- 7-day forecast on location detail screen uses window per row to conditionally show p10/p90 bands (decision window) or low-confidence label (early/pre window)

Acceptance criteria:
- Home screen lists the 3 seeded locations
- Tapping a location navigates to location detail screen (`location/[id]`)
- Detail screen shows: conditions score (or null with message), alert tier (or "No active alerts"), 7-day forecast dates with p50 precip values
- Forecast rows with window 'early' or 'pre' show appropriate confidence indicator
- No component in `src/components/` calls `fetch` directly
- `API_BASE_URL` sourced from env, not hardcoded
- `npx expo export` completes without TypeScript errors

Git checkpoint: `git commit -m "phase-7: mobile core screens"`

---

## Phase 8: Shade + Sun Windows

What to build:
- `apps/mobile/src/utils/shadeCalc.ts`: client-side sun window using `suncalc` npm package
  - Inputs: `lat`, `lon`, `wallAspect: number` (degrees 0-359), `date: Date`
  - Output: `{ sun_start: string | null, sun_end: string | null, hours_of_sun: number }`
  - Sun hits the wall when azimuth is within 90 degrees of wall aspect
  - No external API. Pure math.
- `apps/mobile/src/utils/shadeMapCalc.ts`: ShadeMap SDK wrapper
  - Only imported and called if `SHADEMAP_KEY` is present in env
  - On SDK throw: catch, log, fall back to suncalc result
- Detail screen always shows a sun window for climbing locations. ShadeMap if key present, suncalc otherwise.

Acceptance criteria:
- Sun window displayed on location detail screen for climbing locations
- South-facing wall (`aspect: 'S'`) at mid-latitude shows 6+ hours of sun on a summer day
- `SHADEMAP_KEY` absent: suncalc runs without error
- ShadeMap throws: error logged, suncalc fallback shown

Git checkpoint: `git commit -m "phase-8: shade and sun window calculation"`

---

## Phase 9: Trip Planner + Forecast Evolution

What to build:
- API endpoints:
  - `POST /api/v1/trips`: body `{ name: string, target_date: string, location_ids: string[] }`. Creates trip + trip_locations rows. Uses `req.userId`.
  - `GET /api/v1/trips`: all trips for `req.userId`
  - `GET /api/v1/trips/:tripId`: trip detail with locations, their current conditions scores, and **forecast evolution**. Evolution data is embedded in the response, not a separate endpoint. Response shape per location:
    ```typescript
    {
      location: Location,
      current_score: ConditionsScore | null,  // latest row by computed_at
      evolution: {
        computed_at: string,
        score: number | null,
        confidence: string
      }[]
    }
    ```
    Evolution query: `SELECT computed_at, score, confidence FROM conditions_scores WHERE location_id = :id AND forecast_date = :target_date ORDER BY computed_at ASC`. This returns all accumulated rows for this (location_id, forecast_date) pair, showing how the score has changed across successive forecast-snapshot job runs.
  - `DELETE /api/v1/trips/:tripId`: delete trip and trip_locations
- Mobile: trip list screen (`trip/index.tsx`), trip detail screen (`trip/[id].tsx`), create trip flow. Trip detail shows each location's current score and a mini chart of score evolution over time.

Acceptance criteria:
- Create, list, view, delete trips via API
- Trip detail includes evolution array per location
- Forecast evolution shows at least 2 data points after 2 forecast-snapshot job runs (verified by running the job twice and checking the array length)
- trip_locations rows deleted when trip deleted
- All endpoints use `req.userId`
- Evolution query uses `computed_at` (not `captured_at`)

Git checkpoint: `git commit -m "phase-9: trip planner and forecast evolution"`

---

## Phase 10: General Weather Mode + Location Search

What to build:
- `POST /api/v1/locations`: body `{ name, lat, lon, is_climbing_location, rock_type?, aspect?, cliff_angle?, asos_station?, asos_network? }`. Uses `req.userId`. Does not accept a `crag_id` FK.
- OpenBeta import script at `apps/api/src/db/importCrags.ts`: reads OpenBeta JSON export, inserts into `crags` table. Does not create `locations` rows.
- Location search: `GET /api/v1/search?q={query}`: searches crags by name, returns matches with lat/lon for user to add as a location. **This is climbing-only search** — it queries the `crags` table (OpenBeta data). General/non-climbing locations must be added via direct API call with known lat/lon coordinates. Geocoding for arbitrary place names is not included in this build.
- Non-climbing locations: `is_climbing_location: false`. Same weather UI on `location/[id]` screen, conditions score hidden.
- Climbing locations: full score shown.

Acceptance criteria:
- Search returns crag results with lat/lon
- Adding a climbing location via POST shows full score
- Adding a non-climbing location via direct API POST (with known lat/lon) shows weather but no score
- OpenBeta import populates crags without touching locations
- `POST /api/v1/locations` does not accept or set a `crag_id` FK
- Non-climbing location search is not available in mobile UX (no geocoding endpoint in this build)

Git checkpoint: `git commit -m "phase-10: general weather mode and location search"`

---

## Phase 11: Tomorrow.io Premium Pull

What to build:
- Verify Tomorrow.io free tier limits at `https://docs.tomorrow.io/reference/api-credits` before writing any code.
- `apps/api/src/lib/weather/tomorrowIo.ts`: wrapper for Tomorrow.io timelines API at `https://api.tomorrow.io/v4/timelines`. On-demand only, never scheduled.
- `POST /api/v1/premium-pull/:locationId`:
  - Check `premium_pulls` for a pull within last 6 hours for this location
  - If recent: return cached result, do not call Tomorrow.io
  - If none: call Tomorrow.io, store in `premium_pulls` with `cost_usd: null`, return enriched conditions score
  - `TOMORROW_IO_API_KEY` absent: return `{ data: null, error: "Premium forecast not configured", status: 503 }`
- Mobile: "Get premium forecast" button on location detail, only rendered if `TOMORROW_IO_API_KEY` set. Shows "Updated Xh ago" if cached.

Acceptance criteria:
- Premium pull stores row in premium_pulls with correct location_id, user_id, cost_usd: null
- Second pull within 6 hours returns cached result (verify via logs, no outbound call made)
- Key absent: 503 from API, button hidden in mobile

Git checkpoint: `git commit -m "phase-11: tomorrow.io premium pull"`

---

## Phase 12: RainViewer Radar

What to build:
- Verify live: `https://api.rainviewer.com/public/weather-maps.json`
- `apps/api/src/lib/weather/rainViewer.ts`: fetch tile URL set from RainViewer coverage endpoint
- `GET /api/v1/radar/tiles?lat={lat}&lon={lon}`: returns current frame + last 2h frames + 1h nowcast. API key applied server-side only, never in response.
- Mobile: radar tile overlay on location detail, below the fold. "Animate" button cycles past frames. Run `npx expo-doctor` before picking a native map dependency.

Acceptance criteria:
- Tile URLs returned with no embedded API key
- At least current frame renders on location detail screen
- `RAINVIEWER_KEY` absent: radar hidden in mobile, API returns 503
- `npx expo-doctor` run before adding native radar dependency

Git checkpoint: `git commit -m "phase-12: rainviewer radar integration"`

---

## Phase 13: Historical Climbability Patterns

What to build:
- After each rainfall-history job run, compute whether yesterday was climbable for each location:
  - "Climbable" = drying model returns `estimated_dry: true` AND no active `Warning` or `Active` tier NWS alert
  - Alert tier read from Redis (`redisCache` from `lib/redis.ts`, not the BullMQ connection). If the key is absent (cache expired), treat as no active alert.
  - Upsert into `crag_climbability_history` by `(location_id, year, month)`: increment `climbable_days` if climbable, always increment `total_days`
  - This logic runs inside the existing `rainfall-history` job. No new queue.
- `GET /api/v1/locations/:locationId/history`: returns past 12 months as `{ month, year, climbable_days, total_days, pct }[]`
- Mobile: 12-month history section at bottom of location detail screen

Acceptance criteria:
- History endpoint returns valid shape
- `total_days` increments each job run
- `climbable_days` only increments when both conditions pass
- Queue count in Bull Board is still exactly 4
- `crag_climbability_history` rows use `location_id` FK (not `crag_id`)
- Redis read for alert tier uses `redisCache` from `lib/redis.ts`, not the BullMQ connection

Git checkpoint: `git commit -m "phase-13: historical climbability patterns"`

---

## End State Verification

After Phase 13:
- All 13 phases committed with correct message format
- `git log --all --full-history -- .env` returns nothing
- `turbo run build` completes cleanly
- `npx expo export` inside `apps/mobile` completes without TypeScript errors
- Exactly 4 queues in Bull Board
- All 13 DB tables present
- `/health` returns 200
- No hardcoded API keys anywhere
- `forecast_snapshots` has no `window` column
- `trips` has `target_date`, not `start_date`/`end_date`
- `rainfall_history.source` only contains `acis`, `open_meteo_historical`, or `iem_asos`
- `updated_at` present on locations, trips, user_preferences only
- `premium_pulls.cost_usd` is nullable
- `conditions_scores` has NO unique constraint — multiple rows per (location_id, forecast_date) expected
- `conditions_scores.score_breakdown` contains valid JSON (not null) for rows with non-null scores
- No `console.log` or `console.error` anywhere in `apps/api` (all logging through logger)
- `ScoreInput` in `packages/types` includes `cliffAngle: number`
- `ScoreInput` in `packages/types` does NOT include `sunExposureHours` (omitted in v1)
- `ScoreBreakdown` type exported from `packages/types`
- `packages/types` exports `aspectToDegrees`, `ApiResponse`, `ScoreInput`, `ScoreOutput`, `ScoreBreakdown`
- Forecast-snapshot job queries `rainfall_history` and calls `dryingModel()` before building ScoreInput
- Forecast-snapshot job uses INSERT (not upsert) for conditions_scores
- Snapshot-cleanup job deletes old forecast_snapshots and conditions_scores rows
- `GET /api/v1/forecast/:locationId` returns window per row, computed at read time
- `GET /api/v1/conditions/:locationId` returns latest row by computed_at
- `GET /api/v1/trips/:tripId` includes evolution data per location using computed_at
- `crag_climbability_history` has no `avg_precip_mm` column
- `dryingModel` does NOT apply wind or humidity modifiers (those live in conditionsScore)
- Location detail screen is `location/[id].tsx` (not `crag/[id].tsx`)
- Alerts-poller fetches all locations by lat/lon (no nws_office filter)

---

## Known Risks

- Open-Meteo ensemble response field names vary by model. Verify against a live response before writing the aggregation logic.
- IEM ASOS and ACIS both have special values for missing and trace precip. Both parsers must handle them explicitly.
- ACIS endpoint: try GET first. If it fails, fall back to POST with JSON body.
- ShadeMap SDK: pin version in package.json. Key is in Railway env.
- Tomorrow.io free tier call limits may be tight. Verify before Phase 11. The 6-hour cache is the only guard.
- React Native New Architecture + Expo SDK 55 has known gaps with some native modules. Run `npx expo-doctor` before adding any native dependency.
- react-native-maps radar overlay may need a Google Maps API key on Android.
- Railway PostgreSQL may require `?sslmode=require` in `DATABASE_URL`. Test before running the first migration.
- `lib/redis.ts` and `jobs/connection.ts` are two separate Redis clients. Both point to `REDIS_URL` but have different configurations. Do not mix them up.
- Server-side scoring does not apply the sun exposure modifier (sunExposureHours omitted from ScoreInput in v1). Drying time estimates will be slightly conservative for sun-exposed walls and correct for shaded ones. Can be revisited by adding suncalc to the API if precision matters.
- Location search is climbing-only (crags table). Non-climbing locations require known lat/lon via direct API call. Geocoding can be added later via Open-Meteo geocoding API.
- conditions_scores rows accumulate (no unique constraint). Snapshot-cleanup handles pruning, but monitor table size in production. If growth becomes an issue, consider adding a composite index on (location_id, forecast_date, computed_at DESC).
