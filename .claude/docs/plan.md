# WeatherTeam6 Build Plan

## Context

WeatherTeam6 is a climbing-specific weather platform (13-phase gated build). The repo has complete documentation but zero application code. This plan is based on the v8 build prompt, with two blocking spec gaps resolved below.

**Authoritative sources (priority order for any conflict):**
- This plan (incorporates v8 + two resolutions below)
- `.claude/docs/data-model.md` — schema column details
- `.claude/docs/scoring-algorithm.md` — scoring math
- `.claude/docs/api-sources.md` — external API details
- `.claude/rules/architecture.md` — directory layout and patterns

---

## Two Spec Gaps Resolved (v8 → this plan)

### Resolution 1: `dryingModel` output must include `lastRainMm`

v8 Phase 4 defines dryingModel output as `{ hours_since_significant_rain, estimated_dry, confidence }`. v8 Phase 3 Step 2 says "get `hoursSinceRain`, `lastRainMm`" from it — but `lastRainMm` is not in the output type.

**Agreed fix:** dryingModel output type is:
```typescript
{
  hours_since_significant_rain: number,
  last_rain_mm: number,           // precip_mm of the most recent event > 2mm, or 0 if none
  estimated_dry: boolean,
  confidence: 'low' | 'medium' | 'high'
}
```

Phase 3 maps these to ScoreInput as:
- `hoursSinceRain = hours_since_significant_rain`
- `lastRainMm = last_rain_mm`

### Resolution 2: `ScoreOutput.breakdown` must be nullable

v8 defines `breakdown: ScoreBreakdown` (not nullable) but the Phase 3 stub returns `breakdown: null`. With `strict: true` this is a TypeScript error.

**Agreed fix:** In `packages/types`, `ScoreOutput.breakdown` is typed as `ScoreBreakdown | null`. The Phase 3 stub returns `null`; Phase 5 real implementation always returns a populated breakdown.

### Note on Tomorrow.io endpoint (Phase 11)

- api-sources.md says `/v4/weather/forecast`
- v8 says `/v4/timelines`

These differ. v8 explicitly requires verifying the endpoint before writing Phase 11 code. **Implementation must verify at Phase 11 start — use whichever endpoint is available on the free tier.**

---

## Repo State

- `apps/api/`, `apps/mobile/`, `packages/types/` — do not exist
- No `package.json`, `turbo.json`, `.env.example`
- Documentation complete: `.claude/docs/`, `.claude/rules/`, `.claude/skills/`

---

## Key Design Decisions

1. **13 tables** — schema matches v8 spec. data-model.md column names that differ from v8 (`is_crag` → `is_climbing_location`, `scored_at` → `computed_at`) follow v8.
2. **`conditions_scores` has NO unique constraint** — INSERT not upsert. Multiple rows per `(location_id, forecast_date)` accumulate for evolution tracking.
3. **`dryingModel()` scope** — only inputs: `rock_type, cliff_angle, rainfall_events, as_of`. Wind + humidity modifiers live in `conditionsScore.ts`.
4. **Aspect conversion** — `aspectToDegrees()` called once in the forecast-snapshot job. `conditionsScore` receives pre-converted `aspectDegrees: number`.
5. **Forecast window** — computed at read time from `(forecast_date - CURRENT_DATE)`, never stored.
6. **`GET /conditions/:locationId`** — latest row by `computed_at DESC` for today's `forecast_date`.
7. **Evolution query** — uses `computed_at` (not `captured_at`).
8. **Alerts-poller** — fetches all locations by lat/lon, no nws_office filter.
9. **Mobile screen** — `location/[id].tsx` (not `crag/[id].tsx`).
10. **Geocoding** — out of scope. Climbing search via `crags` table only. Non-climbing locations require known lat/lon.
11. **`crag_climbability_history`** — no `avg_precip_mm` column (data-model.md is stale here).
12. **`premium_pulls`** — includes `raw_response jsonb` (v8 adds this, used to cache Tomorrow.io response).

---

## .env.example Keys (exact, from v8)

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

## Implementation Sequence

Each phase: implement → acceptance criteria → `npm run typecheck` → `npm run lint` → review checklist → commit → **stop and wait for gate-pass**.

| Phase | Commit message | Deliverables |
|-------|---------------|--------------|
| 0 | `phase-0: monorepo scaffold` | Turborepo, Express /health, resolveUser middleware, pino logger, .env.example |
| 1 | `phase-1: drizzle schema, migrations, seed data, and shared types` | 13-table schema + migration, seed (1 user + 3 locations), packages/types fully populated |
| 2 | `phase-2: bullmq queue infrastructure` | 4 queues + stubs, Bull Board at /admin/queues, lib/redis.ts |
| 3 | `phase-3: open-meteo integration, forecast snapshot job, snapshot cleanup` | openMeteo.ts, conditionsScore stub, forecast-snapshot job, snapshot-cleanup job |
| 4 | `phase-4: rainfall history, acis/asos integration, drying model` | acis.ts, iemAsos.ts, dryingModel.ts (with lastRainMm in output), rainfall-history job |
| 5 | `phase-5: conditions score engine and core API endpoints` | Real conditionsScore.ts, GET /locations, /conditions/:id, /forecast/:id |
| 6 | `phase-6: nws alerts and alert poller` | nwsAlerts.ts, alerts-poller job, GET /alerts/:id |
| 7a | `phase-7a: react-query install and API client scaffold` | `@tanstack/react-query` install, `apps/mobile/src/lib/api.ts` client, `apps/mobile/src/hooks/` directory with base pattern |
| 7b | `phase-7b: home screen and useLocations hook` | Home screen rendering location cards, `useLocations` hook |
| 7c | `phase-7c: location detail screen and conditions/forecast hooks` | `location/[id].tsx`, `useConditions` hook, `useForecast` hook |
| 7d | `phase-7d: search stub screen` | Search screen (UI stub, no backend — real search in Phase 10) |
| 8 | `phase-8: walls screen and wall setup flow` | Walls screen (classic rows + data cards), wall setup 4-step modal, shadeCalc.ts (suncalc) powering the SunArc SVG — per `docs/handoffs/weatherteam6-ui-handoff-v1.md` Phase 8 and `docs/handoffs/design-mockups/walls-flow.jsx` + `walls-viz.jsx` |
| 9a | `phase-9a: trip CRUD API endpoints` | POST/GET/DELETE `/trips`, POST `/trips/:id/locations` |
| 9b | `phase-9b: trip mobile screens and hooks` | Trip list screen, trip detail screen, `useTrips` hook, `useTripLocations` hook |
| 9c | `phase-9c: forecast evolution and mobile chart` | Evolution query embedded in GET `/trips/:id`, `ForecastChart` component |
| 10a | `phase-10a: POST /locations and GET /search` | POST `/locations` endpoint, GET `/search` querying crags table |
| 10b | `phase-10b: importCrags seeding utility` | `importCrags.ts` script to seed crags table |
| 10c | `phase-10c: mobile general weather and search screens` | General weather mode screens, live search screen |
| 11 | `phase-11: tomorrow.io premium pull` | tomorrowIo.ts (verify endpoint first), POST /premium-pull/:id, mobile button |
| 12 | `phase-12: rainviewer radar integration` | rainViewer.ts, GET /radar/tiles, mobile overlay |
| 13 | `phase-13: historical climbability patterns` | Climbability logic in rainfall job, GET /locations/:id/history, mobile history section |

---

## Critical Types (packages/types/index.ts — built in Phase 1)

```typescript
export type ApiResponse<T> = { data: T | null; error: string | null; status: number }

export type ScoreInput = {
  rockType: 'sandstone' | 'limestone' | 'granite' | 'basalt' | 'unknown'
  aspectDegrees: number
  cliffAngle: number            // 0 = vertical wall, 90 = flat slab. Default 45 if null.
  hoursSinceRain: number
  lastRainMm: number
  forecastRain72hMm: number
  forecastRain72hP10: number
  forecastRain72hP90: number
  currentWindKmh: number
  maxWindKmh24h: number
  currentTempC: number
  forecastHighC: number
  currentHumidityPct: number
  forecastDateDaysOut: number
  // sunExposureHours omitted — client-side only (Phase 8)
}

export type ScoreOutput = {
  score: number | null
  confidence: 'low' | 'medium' | 'high'
  window: 'pre' | 'early' | 'decision'
  components: { drying_time: number; upcoming_rain: number; wind: number; temp: number; humidity: number }
  breakdown: ScoreBreakdown | null   // null during Phase 3 stub; always populated after Phase 5
}

export type ScoreBreakdown = {
  drying: { score: number; hours_since_rain: number; hours_remaining: number; rock_type: string; modifiers: { angle: number; wind: number; humidity: number } }
  rain: { score: number; forecast_72h_mm: number }
  wind: { score: number; max_kmh: number }
  temp: { score: number; temp_c: number }
  humidity: { score: number; pct: number }
  total: number
  confidence: string
  computed_at: string
}

export function aspectToDegrees(aspect: string): number {
  // N=0, NNE=22, NE=45, ENE=67, E=90, ESE=112, SE=135, SSE=157,
  // S=180, SSW=202, SW=225, WSW=247, W=270, WNW=292, NW=315, NNW=337
  // Unknown/unrecognized → 180 (south-facing default)
}
```

---

## dryingModel Signature (Phase 4)

```typescript
function dryingModel(params: {
  rockType: 'sandstone' | 'limestone' | 'granite' | 'basalt' | 'unknown'
  cliffAngle: number
  rainfallEvents: { date: string; precip_mm: number }[]
  asOf: Date
}): {
  hours_since_significant_rain: number
  last_rain_mm: number          // ← Resolution 1: added here
  estimated_dry: boolean
  confidence: 'low' | 'medium' | 'high'
}
```

Wind and humidity modifiers are NOT in dryingModel. They live in conditionsScore.ts.

---

## Seed Data (Phase 1)

```
User: 1 row, fixed UUID → DEFAULT_USER_ID in .env.example

Locations (is_climbing_location: true):
- Joshua Tree: granite, aspect S, cliff_angle 30, asos_station KPSP, asos_network CA_ASOS
- Red Rock:    limestone, aspect E, cliff_angle 10, asos_station KLAS, asos_network NV_ASOS
- Indian Creek: sandstone, aspect W, cliff_angle 5,  asos_station KCNY, asos_network UT_ASOS
```

Seed script is idempotent (upsert by name or fixed UUIDs).

---

## Verification Per Phase

1. All acceptance criteria from v8 build prompt for that phase
2. `npm run typecheck` — strict mode, zero errors
3. `npm run lint` — zero violations
4. `npm run test` — all tests pass
5. `.claude/rules/review-checklist.md` — all boxes checked
6. Commit with exact format: `phase-N: <description>` (sub-phases use `phase-Na: <description>`)
7. Stop. Wait for user gate-pass before the next phase.
