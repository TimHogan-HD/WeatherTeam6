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

### Completed (Phases 0–13)

| Phase | Status | Deliverables |
|-------|--------|--------------|
| 0–6 | ✅ | Monorepo, schema, queues, scoring engine, NWS alerts |
| 7a–7d | ✅ | Mobile scaffold, home screen, location detail, search stub |
| 8 | ✅ | Walls screen, wall setup flow |
| 9a–9c | ✅ | Trip CRUD API, trip screens, forecast evolution chart |
| 10a–10c | ✅ | POST /locations, GET /search, crags seeding, general weather screens |
| 11 | ✅ | ACIS gridded normals replacing Tomorrow.io |
| 12 | ✅ (API + web) | rainViewer.ts, GET /radar/tiles, Leaflet radar on web — **native radar is Phase 12b** |
| 13 | ✅ | Historical climbability, GET /locations/:id/history, history section in mobile |

---

### Upcoming Phases

Each phase: implement → `npm run typecheck` → `npm run lint` → review checklist → commit → **stop and wait for gate-pass**.

| Phase | Branch | Deliverables |
|-------|--------|--------------|
| **12b** | `phase/12b-radar-native` | **Radar rebuilt for native Android/iOS.** Replace `RadarMapView.tsx` SVG stub with `react-native-maps` MapView + `UrlTile` overlay using the existing RainViewer tile URL template. Scrubber remains; location markers as native map markers. Delete `RadarMapView.web.tsx` or demote it to a genuine web-bonus. Read `apps/api/src/lib/weather/rainViewer.ts` and `apps/mobile/app/(tabs)/radar.tsx` before starting. |
| **14a** | `phase/14a-weather-api` | Weather API foundation — real `/weather/:id`, `/weather/:id/hourly`, `/weather/:id/precip-history` endpoints. Promote `WeatherObservation` + `HourlySlot` into `packages/types`. ASOS + Open-Meteo blend. Read `docs/superpowers/specs/2026-06-19-phase14-polish-design.md` §14a before starting. |
| **14b** | `phase/14b-location-detail` | Location Detail overhaul — rebuild `PrecipLineChart` (real layout), add `PastPrecipChart` (7-day look-back), wire `HourlyStrip` to real API data, skeleton loading on every section. Read spec §14b before starting. |
| **14c** | `phase/14c-shade-map` | **Shade map rebuilt for native.** Replace `ShadeMapEmbed.tsx` WebView with `react-native-maps` MapView. Sun position from `suncalc` (already installed). Time-of-day scrubber drives terrain shade as a native overlay (SVG or canvas — no WebView). Pending Tim's shade session for detailed spec; do not start until that session occurs and a spec is written. |
| **14d** | `phase/14d-home-polish` | Home screen polish — real temp + condition string on location cards, proper empty state, pull-to-refresh, skeleton loading. Read spec §14d before starting. |
| **15** | `phase/15-wire-stubs` | **Eliminate all remaining mock data.** (1) `TripCreationModal.tsx` — replace `MOCK_CRAGS` with real `GET /search` call via `useSearchCrags` hook. (2) `StatDrillSheet.tsx` — remove `mockModelValues()` and hardcoded `TREND_PATH`; wire to real forecast data or remove the model-comparison row until real data exists. (3) `UVIndexSheet.tsx` — replace bell-curve with real hourly UV from `/weather/:id/hourly` (available after Phase 14a). Do not introduce new mocks. |

---

### Mobile-First Rule for All Upcoming Phases

See `.claude/rules/architecture.md` § Mobile-First Mandate. The short version: **native `.tsx` is always the real implementation.** No WebView for features that should be native. `react-native-maps` for every map primitive. No mock data left standing after the phase that introduces it.

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
