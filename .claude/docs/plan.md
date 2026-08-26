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
> **Current state:** phases 0–13 plus Crossover Tasks 1–6 are built; **Task 7 is the
> only one left.** `apps/api` is live on Vercel + Neon, `apps/mobile` is archived, and
> `apps/miniapp` is live at https://weatherteam6.vercel.app, opened from the bot's menu
> button. Its three screens are real as of 2026-08-26 (Task 6) — **written and merged,
> but not yet confirmed inside Telegram**, because there is no preview-deploy path for
> testing there. See `.claude/docs/session-notes.md` for the running record.

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
| **B0 — Mini App design spec** | ✅ **Complete — merged `14c9757` (PR #31).** `docs/handoffs/miniapp-design-v1.md` exists and is binding; read it before any Mini App code. It settled: theming decision (Telegram `themeParams` vs. the locked `packages/design` palette), screens + navigation, content hierarchy, units (copy rules lock imperial; the API returns metric), loading/empty/error states, and explicit non-goals. Mine `weatherteam6-ui-handoff-v1.md` §Design System and §7b/7c/7e plus `weatherteam6UI.html` — do not redesign from scratch. Also settle the copy-rule violation described below. |
| **Task 5 — Mini App shell** | ✅ **Complete 2026-08-25 — merged `b06ebed` (PR #38), live at https://weatherteam6.vercel.app as the bot's menu button.** `apps/miniapp` exists — Vite + React static build, `vercel.json` SPA rewrite, `telegram-web-app.js` loaded ahead of the app module, `ready()`/`expand()`, and chrome colours gated per-method (`setBackgroundColor` at Bot API 6.1, `setHeaderColor` at 6.9, no `bg_color` fallback). Ships the §0a token adapter (`src/theme/tokens.css.ts` + generated `:root` custom properties), all three §2 routes with Telegram's `BackButton` as the only back affordance, and the §5 React Query defaults. Screens are placeholders — Task 6. Deployed as its own Vercel project (root `apps/miniapp`, "include files outside root dir" on, preset **Vite**, no `NODE_ENV`) and registered with @BotFather via `/setmenubutton`; settings recorded in `apps/miniapp/README.md`. Confirmed open inside Telegram on Android — header takes the gradient colour, Barlow Condensed loads in the webview, nothing clipped by the notch. ~~`/newapp` has not been run~~ — **done 2026-08-26.** The Direct Link Mini App is registered as short name `Alert`, so the deep link base is `https://t.me/WeatherTeam6_bot/Alert?startapp=<param>`. Task 7 is no longer blocked. |
| **Task 5a — Add-location API** | ✅ **Complete — merged `a90613f` (PR #37), live in production.** Backend only; despite the name it is unrelated to Task 5's shell, and was numbered 5a only because it had to precede Task 6. All five changes from `miniapp-design-v1.md` §12.3 shipped: `GET /geocode?q=` (Open-Meteo, keyless, proxied server-side), `GET /preview?lat=&lon=&elevation=` (unsaved location's forecast — synthetic `LiveForecastLocation`, persists nothing, returns no score), `POST /locations` taking `is_climbing_location`, `rock_type`, `elevation_m` and `timezone`, `DELETE /locations/:id` (cascades to all ten dependent tables in one transaction — no FK declares `onDelete`), and `elevation_m` persisted so preview and the saved location agree on temperature. `CreateLocationInput`, `RockType`, and `GeocodeResult` in `packages/types` changed with it. Verify with `npm run check:add-location`. |
| **Task 6 — Mini App screens + auth** | ✅ **Complete 2026-08-26 — merged `f48bad0` (PR #39, auth) and `63b92dd` (PR #41, screens), live in production.** Two PRs, auth first. **Auth:** `apps/api/src/lib/telegram/initData.ts` (pure HMAC validator) plus a second accepted scheme in `requireApiAuth` — `Authorization: tma <initDataRaw>` alongside `Bearer $API_SHARED_SECRET`, never replacing it, and the signed `user.id` checked against `TELEGRAM_CHAT_ID`. **Screens:** all three §2 routes real — list (weather-first cards, score chip last, conditions call skipped for non-climbing locations), detail (alert banner → today → 7 days → collapsed score → computed sources footer, plus delete), and `/add` (geocoder search with `admin1, country` disambiguation, coordinate entry, preview in unsaved mode, save bar with the climbing toggle and rock-type picker). The §4 formatters and the §7 ladder/suppression rule live in `packages/types` (`units.ts`, `conditionsCopy.ts`) so the bot can share them. 50 new tests. **Not verified:** list and saved-detail against real data — both need a database. **Followed up the same day:** `statusLabel()` is now deleted and the bot uses the shared ladder — see the issue table below. |
| **Task 7 — Deep link + archive mobile** | **Unblocked as of 2026-08-26** — `/newapp` is done, short name `Alert`. Two independent halves. **(a) Deep link:** a plain `url` inline keyboard button on alert messages pointing at `https://t.me/WeatherTeam6_bot/Alert?startapp=loc_<uuid>`, plus the Mini App reading `start_param` and routing to detail with `/` pushed beneath. Use a `url` button, **not** `web_app` — `web_app` does not deliver `start_param`. `initData` is populated on a direct-link launch (verified), so the `tma` auth works on this path. Full settled detail in `telegram-crossover-v4.md` § Task 7. **(b) Archive mobile:** the fix is in `apps/mobile/package.json` scripts, **not `turbo.json`** — turbo runs whatever scripts a workspace member declares, so deleting the `@weatherteam6/mobile#build` override makes it fall through to the generic `build` and still run `tsc --noEmit`. Also clears the standing CI ESLint failure. |

---

### Issue status — checked 2026-08-26

The five filed issues, and what is actually left of each. Several were partly fixed
without being closed, so "open" alone is misleading.

| Issue | State |
| --- | --- |
| **#21** — heat scores 80+ | **Half fixed.** The copy half is done: no surface maps a score to an opinion, and `summarizeConditions` suppresses the score as a summary when a component is 0 or a Severe+ alert is active. **The scoring half is open** — heat still costs at most 12 of 100 points and saturates above 35 °C, so a settled dry spell scores in the 80s at 103 °F. Options remain: cap the total when a component is 0, apply a multiplicative safety factor, or re-weight temperature. |
| **#22** — NBM 400s | **Closed 2026-08-26.** Root cause: Open-Meteo does not define `precipitation_p10/p50/p90` as daily variables and exposes no NBM quantiles under any name (verified against the live API). The NBM branch could never have returned data, so the call was removed. `fetchNBM` remains in `openMeteo.ts`, tested and unused. |
| **#25** — `/history` and `/normals` return `[]` forever | **Open, unchanged.** Deleting the `rainfallHistory` worker removed the only writer for `crag_climbability_history` and `location_normals`. Needs a design call on where the write goes. Both routes are on the clients' do-not-call list. |
| **#26** — Telegram HTML + alert pruning | **Closed 2026-08-26.** Every interpolated value is escaped in both message paths, and `fetchNwsAlerts` now returns `null` rather than `[]` for a 200 that is not a FeatureCollection — the case that deleted stored rows and destroyed `notified_at`. A third bug was found in the same audit and fixed with it: `/start` and the usage reply both contained `<location name>`, which Telegram rejects as an unsupported start tag, so neither had ever been delivered. |
| **#27** — webhook hardening | **Open, unchanged.** `POST /api/telegram/webhook` is gated only by the forgeable `chat.id` in the request body; `secret_token` is the fix. No `update_id` dedupe either. Note this was never made urgent by the auth work — SSO never covered that route. |

**Filed since:** `ScoreInput` conflates the humidity component with the drying humidity
modifier in one field, so per-day humidity cannot be fixed without moving the drying
calculation too. Found 2026-08-26 while fixing the per-day wind component; needs its
own change.

---
### ⚠️ Sequencing constraint — Mini App auth

> **Corrected 2026-08-25 against the live projects — read this before acting on the paragraph below.**
> The premise turned out to be false, and acting on it would mean turning off a protection that is doing useful work.
>
> Both Vercel projects do have `ssoProtection.enabled: true`, but with `deploymentType: "all_except_custom_domains"`, and on this Hobby plan **that does not cover the primary production alias**. Verified: an unauthenticated `GET https://weather-team6-api.vercel.app/api/v1/locations` reaches Express and returns our own `{"data":null,"error":"Unauthorized","status":401}` with `X-Powered-By: Express` — not a Vercel login page, not a redirect. So a Telegram webview can already reach the API today.
>
> **Consequences:**
> - **There is no SSO to remove, and it must not be removed.** What SSO still protects is *preview* deployments, which is worth keeping — and it is why there is no preview-URL path for testing the Mini App inside Telegram.
> - **The thing actually holding the door shut is `requireApiAuth` + `API_SHARED_SECRET`**, which exists precisely because the production alias is open. Weakening or bypassing it is the real hazard, not an SSO toggle.
> - **The two changes no longer have to ship together**, because one of them does not exist. `initData` HMAC validation is a self-contained change.
> - `initData` is added as a **second accepted scheme on the same `Authorization` header**, alongside the shared secret — not a replacement for it. See `.claude/rules/architecture.md`.

The Mini App is a browser client inside Telegram's webview, and the automation bypass secret cannot be used to authenticate it because it would ship in a public client bundle.

Build `initData` validation as route-level middleware on `/api/v1/*`, not per-endpoint checks — per-endpoint is easy to half-apply. The cron and webhook routes are mounted outside `/api/v1` and keep their own gates.

### ⚠️ Known copy-rule violation — settle in B0

`weatherteam6-ui-handoff-v1.md` locks two rules: *"No climbing opinions ('go / don't go')"* and *"Score is a derived signal, never the headline — weather leads on every screen."*

~~The shipped bot reply is `"looks great — go climb (score 85, confidence high)"`~~ — **fixed 2026-08-26.** `statusLabel()` is deleted; both surfaces now use the shared ladder and suppression rule in `packages/types/src/conditionsCopy.ts`. **The score itself is unchanged and still wrong**: heat costs at most 12 of 100 points and saturates above 35 °C, so a settled dry spell still scores in the 80s at 103 °F. The copy is honest about it — the suppression rule names temperature as the limiting factor — but the scoring fix is still open. See the issue table below.

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
