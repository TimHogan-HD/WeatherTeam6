# WeatherTeam6 Build Plan

> **This is the original 13-phase build plan and it is history for most purposes** — the
> application it describes as having "zero application code" has shipped. Keep reading it for
> the schema, scoring and sequencing decisions it records, and for the issue #21 diagnosis.
>
> **The current feature direction is not here.** It is
> **`.claude/docs/telegram-precision-interface-plan.md`** — the approved plan for the
> Telegram precision interface, which is the priority work as of 2026-08-31.

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
> **Current state:** phases 0–13 plus **all seven Crossover Tasks** are built — Task 7
> closed 2026-08-26 and the crossover is finished. `apps/api` is live on Vercel + Neon,
> `apps/mobile` is archived and **out of the build** (no `build`/`dev`/`typecheck`/
> `lint`/`test` scripts, so turbo skips it; see `apps/mobile/ARCHIVED.md`), and
> `apps/miniapp` is live at https://weatherteam6.vercel.app, opened from the bot's menu
> button. Its three screens are real as of 2026-08-26 (Task 6) — **written and merged,
> but not yet confirmed inside Telegram**, because there is no preview-deploy path for
> testing there. See `.claude/docs/session-archive.md` for the running record.

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

Reconciled against the real file 2026-08-26 — it had drifted three keys in each
direction. `TOMORROW_IO_API_KEY` (replaced by ACIS in Phase 11), `RAINVIEWER_KEY`
(unused by the current code) and `SHADEMAP_KEY` are **not** in `.env.example`.

```
DATABASE_URL=          # Neon: pooled for runtime, direct for migrations
DEFAULT_USER_ID=
AUTH_ENABLED=false
NODE_ENV=development   # NEVER set this on Vercel — see CLAUDE.md § Known Gotchas
PORT=3001
NWS_USER_AGENT=weatherteam6/1.0 your@email.com
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
CRON_SECRET=
TELEGRAM_WEBHOOK_SECRET=   # added 2026-08-26 with the #27 fix; must match setWebhook's secret_token
EXPO_PUBLIC_SHADEMAP_KEY=  # archived — apps/mobile only
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
API_BASE_URL=
LOG_LEVEL=
EXPO_PUBLIC_API_BASE_URL=  # archived — apps/mobile only
API_SHARED_SECRET=         # gates ALL of /api/v1/*; fail-closed
VITE_API_BASE_URL=         # inlined into a PUBLIC bundle — never a credential
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
| **Task 6 — Mini App screens + auth** | ✅ **Complete 2026-08-26 — merged `f48bad0` (PR #39, auth) and `63b92dd` (PR #41, screens), live in production.** Two PRs, auth first. **Auth:** `apps/api/src/lib/telegram/initData.ts` (pure HMAC validator) plus a second accepted scheme in `requireApiAuth` — `Authorization: tma <initDataRaw>` alongside `Bearer $API_SHARED_SECRET`, never replacing it, and the signed `user.id` checked against `TELEGRAM_CHAT_ID`. **Screens:** all three §2 routes real — list (weather-first cards, score chip last, conditions call skipped for non-climbing locations), detail (alert banner → today → 7 days → collapsed score → computed sources footer, plus delete), and `/add` (geocoder search with `admin1, country` disambiguation, coordinate entry, preview in unsaved mode, save bar with the climbing toggle and rock-type picker). The §4 formatters and the §7 ladder/suppression rule live in `packages/types` (`units.ts`, `conditionsCopy.ts`) so the bot can share them. 50 new tests. **Not verified:** list and saved-detail against real data — both need a database. **⚠️ The auth half shipped broken and was fixed 2026-08-26 as `5c41a44` (PR #43):** `buildDataCheckString` excluded `signature`, which is the **Ed25519** rule, not the bot-token rule — so the check string was a field short and **every Mini App request 401'd** until the fix. The 27 auth tests were green throughout because the signing helper made the same mistake. Read the invariant in `.claude/rules/architecture.md` before touching that file again. **Followed up the same day:** `statusLabel()` is now deleted and the bot uses the shared ladder — see the issue table below. |
| **Task 7 — Deep link + archive mobile** | ✅ **Complete 2026-08-26.** **(a) Deep link:** `apps/api/src/lib/telegram/deepLink.ts` builds `https://t.me/WeatherTeam6_bot/Alert?startapp=loc_<uuid>` and a one-button inline keyboard, attached by `notifyPendingAlerts`; a `url` button, **not** `web_app`, because `web_app` never delivers `start_param`. A non-uuid id yields `null` — no button at all — because a malformed button url is a non-retryable 400 that would cost the whole alert, not just the button. On the client `apps/miniapp/src/lib/deepLink.ts` reads `initDataUnsafe.start_param`, falling back to the `tgWebAppStartParam` launch parameter in the query string and then the hash, validates `loc_<uuid>` with the dashes untouched, and seats history as `/` then `/location/:id`. It runs in `main.tsx` **before React mounts**, so `BrowserRouter` reads the detail route as its initial location (no list flash) and a `<StrictMode>` double-invoked effect cannot push the entry twice. **(b) Archive mobile:** `apps/mobile/package.json` no longer declares `build`, `dev`, `typecheck`, `lint` or `test`, so turbo skips the workspace in every graph; the dead `@weatherteam6/mobile#build` override was removed from `turbo.json`. `apps/mobile/ARCHIVED.md` added. **Note:** mobile's ESLint failure had already been fixed before this task (the `app.config.js` ignore in `eslint.config.mjs`) — `npm run lint` was green at the start of the session, so this did not clear a live failure. **Not verified:** nothing seen inside Telegram, and no real alert has carried the button — `weather_alerts` is empty while cron-job.org is unregistered. |

---

### Direction after the crossover — set by the user 2026-08-26

> **Revised by the user 2026-08-26, later the same day, after the agent-systems review.**
> The Mini App design work below was explicitly downgraded and the chat interface promoted.
> Where this section and the original ordering disagree, this note wins.

The seven crossover tasks are done and the whole stack is confirmed working on a real
device. The user's stated order from here:

1. **An agent-systems cleanup pass — it comes first.** Not the app: the hooks, rules,
   agents, docs and review loops. Stage 0 (working hooks, a permissions allowlist, current
   models on the review agents) and Stage 1 (session-start context cost) are what this
   branch does. The goal is "a clean base and polished repo to move forward with feature
   updates".
2. **The chat interface — this is the priority feature.** The user wants to **ask in plain
   language and get a response**, and to use **slash commands to pull specific information
   about a location or a span of time**. Weather should arrive as *text*, not only through
   the Mini App and alert replies.

   > **Superseded 2026-08-31 — the design conversation happened.** The spec is
   > `.claude/docs/telegram-precision-interface-plan.md` and it is approved. **Phases 0 to 3 are
   > built and the chat rendering has been rebuilt twice more since, on real-device feedback —
   > see `.claude/docs/STATE.md` for the current state.** Next up, in order: issue #82 (the
   > geocode picker), then **Phase 5** (add/remove/update locations from chat, requested
   > directly by the owner), then Phase 4 (`/insight` needs re-specifying first; `/afd` is
   > buildable standalone). Build to the plan document; do not re-spec this from the paragraph
   > above, and do not treat it as an open design question any more.
3. **An in-app feedback button.** Press it, type a note in the moment, and the note lands
   **somewhere in this repo** to be addressed later. The destination and mechanism are
   undecided; the requirement is that it is capturable without breaking flow. Also a design
   conversation to have first.
4. **Mini App polish — deliberately downgraded.** The user's words: *"I overstated the
   design portion… the Mini App doesn't need to be super fancy."* An earlier version of
   this plan proposed a CSS architecture, a motion system and a browser-based visual
   review loop for it. **That work is not authorised.** The Mini App is styled entirely
   with inline styles, which cannot express hover, transitions or breakpoints — that is a
   real ceiling, but it is not one the user wants lifted yet. Revisit only if asked.

**Deliberately deferred by the user, not forgotten:** the conditions score algorithm,
i.e. the open half of **#21**. Quote: *"right now I don't really want to worry about that
algorithm behind the score… we can worry about the algorithm and the score in the
future."* The diagnosis below is complete and the two viable options are named, so it is
ready to pick up — **but do not start it, and do not let it ride along inside another
change.** It needs a product decision the user has chosen not to make yet.

---

### Issue status

**Read it from GitHub: `gh issue list`. There is deliberately no table here.**

A transcribed status table used to live at this spot and it drifted in both directions —
it claimed six issues open when four were, and marked #33 and #34 open after both had been
fixed and closed. The commit that claimed to correct it touched only the session record and
left this file wrong. Copied state goes stale; derived state cannot.

Standing context that is *not* recorded on the issues themselves lives in
`.claude/docs/STATE.md` — which of them are deferred by the user, which need a product
decision rather than code, and which are blocked on a migration this environment cannot run.

The diagnosis for **#21** is the one thing worth keeping in prose, because it is long and it
is not in the issue: see *Direction after the crossover* above. Its short form — the
temperature component is already saturated at 0 across every hot location, so re-weighting
temperature cannot fix it; only something acting on the total can.

**A note on the pattern, worth keeping in view when #21 is picked up:** #21, #32 and #34 are
the same defect wearing three hats. **Every degradation path in the scorer inflates.** A
missing rainfall fetch is full drying credit; a missing today-row is full wind and humidity
credit; brutal heat maxes out four of five components. Whatever is done about the score
should start from "what does this say when the inputs are missing", not from re-weighting
temperature.

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
5. the `/review-checklist` skill (`.claude/skills/review-checklist/SKILL.md`) — all boxes checked
6. Commit with exact format: `phase-N: <description>` (sub-phases use `phase-Na: <description>`)
7. Stop. Wait for user gate-pass before the next phase.
