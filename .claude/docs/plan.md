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

> The block below described the repo at the time this plan was written (empty).
> **Current state:** phases 0–13 plus Crossover Tasks 1–4 are built and deployed.
> `apps/api` is live on Vercel + Neon, `apps/mobile` is archived, `apps/miniapp` does
> not exist yet. See `.claude/docs/session-notes.md` for the running record.

---

## Key Design Decisions

1. **13 tables** — schema matches v8 spec. data-model.md column names that differ from v8 (`is_crag` → `is_climbing_location`, `scored_at` → `computed_at`) follow v8.
2. ~~**`conditions_scores` has NO unique constraint**~~ — moot: nothing writes to `conditions_scores` anymore. Scores are computed live and returned in-memory.
3. **`dryingModel()` scope** — only inputs: `rock_type, cliff_angle, rainfall_events, as_of`. Wind + humidity modifiers live in `conditionsScore.ts`.
4. **Aspect conversion** — `aspectToDegrees()` called once in `lib/scoring/liveForecast.ts` (formerly the forecast-snapshot job). `conditionsScore` receives pre-converted `aspectDegrees: number`.
5. **Forecast window** — computed at read time from `(forecast_date - CURRENT_DATE)`, never stored.
6. **`GET /conditions/:locationId`** — computes live via `computeLiveForecast()` and returns today's score. (Was: latest persisted row by `computed_at DESC`.)
7. ~~**Evolution query**~~ — moot: forecast evolution tracking depended on accumulated `conditions_scores` rows, which are no longer written.
8. **Alerts check** — fetches all locations by lat/lon, no nws_office filter. Now `runAlertsCheck()` behind `POST /api/cron/check-alerts`, not a queue worker.
9. ~~**Mobile screen**~~ — `apps/mobile` is archived. The Mini App's routing is defined in its own design spec (Phase B0).
10. ~~**Geocoding** — out of scope. Climbing search via `crags` table only. Non-climbing locations require known lat/lon.~~ **Reversed 2026-08-25.** Geocoding is now **in scope** via Open-Meteo's keyless geocoding API, proxied as `GET /api/v1/geocode?q=`. The product call is that any place can be searched and saved, climbing or not, with `is_climbing_location` set by an explicit toggle at save time. `crags` stays out of v1 search (still empty). Full specification: `docs/handoffs/miniapp-design-v1.md` §12 — read it before touching the add flow, and note it also adds `GET /preview`, `DELETE /locations/:id`, and a changed `POST /locations`.
11. **`crag_climbability_history`** — no `avg_precip_mm` column (data-model.md is stale here).
12. **`premium_pulls`** — includes `raw_response jsonb` (v8 adds this, used to cache Tomorrow.io response).

---

## .env.example Keys

`.env.example` at the repo root is authoritative — this list is a convenience copy and
can drift. `REDIS_URL` and `ADMIN_PASSWORD` were **removed** with BullMQ and Bull Board.

```
DATABASE_URL=          # Neon: pooled for runtime, direct for migrations
DEFAULT_USER_ID=
AUTH_ENABLED=false
NODE_ENV=development
PORT=3001
NWS_USER_AGENT=weatherteam6/1.0 your@email.com
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
CRON_SECRET=
TOMORROW_IO_API_KEY=
RAINVIEWER_KEY=
SHADEMAP_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
API_BASE_URL=
LOG_LEVEL=
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

### Upcoming Phases — Telegram Crossover

**Direction changed 2026-07-31.** The product is now a Telegram bot + Telegram Mini App, not a React Native app. `apps/mobile` is being archived. The authoritative spec is `docs/handoffs/telegram-crossover-v4.md`; the near-term roadmap with sequencing constraints is in the Telegram Crossover roadmap (Tasks 5–7).

Each phase: implement → `npm run typecheck` → `npm run lint` → review checklist → commit → **stop and wait for gate-pass**.

| Phase | Deliverables |
|-------|--------------|
| **Tasks 1–4** | ✅ **Complete.** Neon migration, API on Vercel as a single serverless function, live per-request scoring, alerts cron endpoint, Telegram bot webhook. Merged as `adb19a6`, verified live. |
| **B0 — Mini App design spec** | **Do this before any Mini App code.** Produce `docs/handoffs/miniapp-design-v1.md`: theming decision (Telegram `themeParams` vs. the locked `packages/design` palette), screens + navigation, content hierarchy, units (copy rules lock imperial; the API returns metric), loading/empty/error states, and explicit non-goals. Mine `weatherteam6-ui-handoff-v1.md` §Design System and §7b/7c/7e plus `weatherteam6UI.html` — do not redesign from scratch. Also settle the copy-rule violation described below. |
| **Task 5 — Mini App shell** | New `apps/miniapp` workspace (Vite + React, static build), separate Vercel project, `telegram-web-app.js`, register with @BotFather. **Read https://core.telegram.org/bots/webapps first** — that API changed repeatedly through 2026. Origin lockdown means production domain only; preview URLs will not work. |
| **Task 5a — Add-location API** | **New, added 2026-08-25.** Backend only, and a prerequisite for Task 6's add flow. Four changes, specified in `miniapp-design-v1.md` §12.3: `GET /geocode?q=` (Open-Meteo, keyless, proxied server-side), `GET /preview?lat=&lon=` (live forecast for an unsaved location — `computeLiveForecast` over a synthetic `LiveForecastLocation`, persists nothing), `POST /locations` accepting `is_climbing_location` + optional `rock_type` (it currently hardcodes `false` at `routes/locations.ts:174`), and `DELETE /locations/:id` (**none exists today** — a save flow with no unsave is a trap). `CreateLocationInput` in `packages/types` changes with it. **Independent of the `initData` auth work**, so it does not wait on the constraint below. |
| **Task 6 — Mini App screens + auth** | Location list + location detail + **`/add` search screen and the detail screen's unsaved/preview mode** (§12.1), wired to `/api/v1/*`. **`initData` HMAC validation is a prerequisite, not a finishing touch** — see the sequencing constraint below. Depends on Task 5a; do not mock those four endpoints, `.claude/rules/architecture.md` forbids leaving stubs in a finished feature. Build to the B0 spec; no design decisions in code. |
| **Task 7 — Deep link + archive mobile** | `web_app` inline keyboard button on alert messages (`startapp` deep link into location detail). Remove `apps/mobile` from `turbo.json` and workspace scripts, leave the code in place, add `apps/mobile/ARCHIVED.md`. Also removes the long-standing `apps/mobile` ESLint failure from CI. |

---

### ⚠️ Sequencing constraint — Mini App auth

The Mini App is a browser client inside Telegram's webview. The API sits behind **Vercel SSO protection**, which a webview has no cookies for — every `fetch` will redirect to a login page. The automation bypass secret cannot be used, because it would ship in a public client bundle.

So `initData` HMAC validation must land **before or with** removing SSO protection, and those two changes ship together. SSO off without HMAC leaves the API fully open on a public URL. Build it as route-level middleware on `/api/v1/*`, not per-endpoint checks — per-endpoint is easy to half-apply. The cron and webhook routes are mounted outside `/api/v1` and keep their own gates.

### ⚠️ Known copy-rule violation — settle in B0

`weatherteam6-ui-handoff-v1.md` locks two rules: *"No climbing opinions ('go / don't go')"* and *"Score is a derived signal, never the headline — weather leads on every screen."*

The shipped bot reply is `"looks great — go climb (score 85, confidence high)"` — a climbing opinion, score as headline, no weather. This is live today (see issue #21) and the Mini App would inherit the same framing. Fix the copy model once in B0 and apply it to both surfaces.

### Abandoned — superseded by the Telegram Crossover

The phases below were the React Native roadmap. They are **not being built**. Kept for reference only; `apps/mobile` code remains in the repo but is out of the build.

<details>
<summary>Phases 14a–16 (abandoned)</summary>

| Phase | Branch | Deliverables |
|-------|--------|--------------|
| **16** | `phase/16-radar-native` | Radar rebuilt for native Android/iOS with `react-native-maps` + `UrlTile` over the RainViewer template. |
| **14a** | `phase/14a-weather-api` | Weather API foundation — `/weather/:id`, `/weather/:id/hourly`, `/weather/:id/precip-history`. **Note:** the API-side portion may still be worth building for the Mini App; the mobile UI portion is not. |
| **14b** | `phase/14b-location-detail` | Location Detail overhaul — `PrecipLineChart`, `PastPrecipChart`, `HourlyStrip`, skeleton loading. |
| **14c** | `phase/14c-shade-map` | Shade map rebuilt native. Was already blocked on a design session that never happened. |
| **14d** | `phase/14d-home-polish` | Home screen polish — real temp on cards, empty state, pull-to-refresh. |
| **15** | `phase/15-wire-stubs` | Eliminate remaining mock data in `TripCreationModal`, `StatDrillSheet`, `UVIndexSheet`. |

</details>

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
