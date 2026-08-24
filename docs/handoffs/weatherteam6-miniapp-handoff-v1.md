# WeatherTeam6: Mini App Build Handoff
Version: v1
Date: 2026-08-24
Status: Ready for Handoff

## Context

The Telegram Crossover migration (Tasks 1-4) is finished, merged, and verified running in production. This document hands off the remaining work: Phase B0 (design spec) followed by Crossover Tasks 5, 6, and 7 (the Telegram Mini App). It is written to be the only document a fresh session needs to start from, though it points at the repo docs that carry the detail.

**Read these in the repo before writing any code:**

1. `.claude/rules/architecture.md` (mandatory at every session start)
2. `.claude/docs/session-notes.md` (newest entry is at the **top** of the file, not the bottom)
3. `docs/handoffs/telegram-crossover-v4.md` (authoritative product direction)
4. `.claude/docs/plan.md` (phase order)

---

## Current State

### What is live and working

- **Repo:** `TimHogan-HD/weatherteam6`, `main` @ `9cc71bd`, clean tree, no open PRs.
- **API:** `https://weather-team6-api.vercel.app`, Express wrapped as one Vercel serverless function at `apps/api/api/index.ts`.
- **DB:** Neon Postgres, `@neondatabase/serverless` **WebSocket** driver via `drizzle-orm/neon-serverless`. Migrations at `0006`. Seeded with 1 user and 3 locations. `DEFAULT_USER_ID` is `00000000-0000-0000-0000-000000000001`.
- **Scoring:** computed live per request in `apps/api/src/lib/scoring/liveForecast.ts`. Nothing is persisted to `forecast_snapshots` or `conditions_scores`.
- **Alerts:** `POST /api/cron/check-alerts`, gated on a `CRON_SECRET` header, logic in `apps/api/src/lib/alerts/checkAlerts.ts`. Dedup verified by hand (two consecutive calls returned `notified: 2` then `notified: 0`).
- **Bot:** `POST /api/telegram/webhook`, registered and answering. Two commands exist: `/start` and `/conditions <name>`.
- **Checks:** `npm run typecheck` clean, 106 tests passing, `npm run lint` has one known failure (below).

### What does not exist yet

- `apps/miniapp` (the entire Mini App)
- `docs/handoffs/miniapp-design-v1.md` (the Phase B0 deliverable)
- `initData` HMAC middleware
- Any test coverage for the roughly 480 lines of backend logic added during the migration

### Known broken or degraded

| Item | Effect | Where |
| --- | --- | --- |
| CI lint failure | `'module' is not defined` in `apps/mobile/app.config.js`. Fails identically on `main` and every branch. Task 7 removes it for free. | `apps/mobile` |
| Issue #26 | Alert double-send plus unescaped HTML in **two** places. Recommended first fix. | `checkAlerts.ts`, `conditionsReply.ts` |
| Issue #25 | `crag_climbability_history` and `location_normals` have no writer. `/history` and `/normals` return `[]` forever. | `locations.ts` |
| Issue #27 | Bot auth reads forgeable `chat.id` from the body, no `update_id` dedupe, `runAlertsCheck` is serial. | `telegramWebhook.ts`, `checkAlerts.ts` |
| Issue #21 | 104F scores 85 and the bot says "looks great, go climb". Violates two locked copy rules. **Settle inside B0.** | `conditionsScore.ts`, `conditionsReply.ts` |
| Issue #22 | Open-Meteo NBM 400s on every request, always falls back to ensemble. | `openMeteo.ts` |
| Unfiled | `computeLiveForecast` reuses *today's* wind, temp, and humidity for every future day, so a day-7 score describes today's weather. When no forecast day matches today, `?? 0` fallbacks score every day at 0 km/h and 0C, and 0C zeroes the temp component. A `logger.warn` for that case was restored on 2026-08-24. | `liveForecast.ts` |

---

## Objective

Ship the Telegram Mini App as the project's only client: a two-screen surface (location list, location detail) reading the existing API, authenticated by `initData` HMAC, deep-linkable from alert messages, with `apps/mobile` removed from the build.

---

## Constraints / Non-Goals

- **No new features in `apps/mobile`.** It is archived in intent. Port, do not revive.
- **No queue.** No BullMQ, no Redis, no in-process schedulers. Background work is either live per-request compute or an HTTP endpoint on an external schedule. Read `.claude/skills/background-work/SKILL.md` before writing anything job-shaped.
- **Two screens only.** Radar, walls, trips, and shade map exist in the archived mobile app and are out of scope for the Mini App. Do not let them creep back in.
- **No mock data in production components.** `MOCK_*` constants and bell-curve approximations are stubs, acceptable only inside the phase that introduces them.
- **No login UI, no Clerk, no sessions.** `AUTH_ENABLED` stays as-is; `resolveUser` remains the only auth function for user identity.
- **State management is React Query.** No Redux, no Zustand, no Context for server state. Components never call `fetch` directly.
- **Design tokens come from `packages/design`.** Never redefine colors, spacing, or type scale in the app.

---

## Pre-Implementation Checklist

- [ ] **Verify the Telegram Mini App contract against live docs** at `https://core.telegram.org/bots/webapps`. The Crossover doc warns this surface changed repeatedly through 2026 and model knowledge cutoffs predate that. Confirm specifically: the `initData` signature and validation algorithm, `themeParams`, the `startapp` deep-link parameter, and the current origin-lockdown rules.
- [ ] Confirm `https://weather-team6-api.vercel.app/health` responds before assuming a client bug is a client bug.
- [ ] Build shared packages first, or typechecks fail with "cannot find module":
      `npm run build --workspace=packages/types --workspace=packages/design`
- [ ] Read `docs/handoffs/weatherteam6-ui-handoff-v1.md` §Design System. Its per-screen phases are dead, but the Design System section is client-agnostic and still binding.
- [ ] Check `.claude/docs/session-notes.md` top entry for anything that landed after this doc was written.

---

## Phases

### Phase B0: Design spec (no code)

**Deliverable:** `docs/handoffs/miniapp-design-v1.md`, agreed before any scaffold exists.

This is not a from-scratch design exercise. Mine what already exists:

| Asset | What to take |
| --- | --- |
| `packages/design/src/tokens.ts` | Framework-agnostic TypeScript, already a built workspace package. Exports `colors`, `uvScale`, `fonts`, `type`, `spacing`, `radius`, `shadow`, `components`, `layout`, `bottomNav`, `units`. Import directly. |
| `weatherteam6-ui-handoff-v1.md` §Design System | Contrast rules, layout constants, copy rules. All marked **locked**. Carry over verbatim unless there is a stated reason not to. |
| `docs/handoffs/design-mockups/weatherteam6UI.html` | Primary mockup for Home plus Location Detail, which map almost directly onto the Mini App's two screens. |
| Handoff §7b, §7c, §7e | Existing screen specs for the same content. |

**Decisions the spec must actually make:**

1. **Theming.** Telegram supplies `themeParams` from the user's own client theme; WeatherTeam6 has a locked palette. Pick one: honor Telegram fully, keep the WeatherTeam6 palette, or hybrid (take light/dark from Telegram, apply WeatherTeam6 tokens within it). Hybrid is the recommendation, but it needs deciding rather than assuming.
2. **Navigation.** Confirm two screens is the whole surface. Does back use Telegram's `BackButton` API or in-app routing? What does a `startapp` deep link into detail do to the back stack?
3. **Content hierarchy per screen,** given "weather leads, score is derived".
4. **Units.** Copy rules lock imperial (F, mph, in). The API returns metric (`temp_c`, `wind_kmh`, `precip_mm`). Decide where conversion happens: client-side, or a shared helper in `packages/types`. The bot has the same problem and currently displays no units at all.
5. **States.** Loading (live scoring takes seconds), empty (no saved locations), error, stale or offline.
6. **Non-goals,** written explicitly.
7. **The copy model, resolving issue #21.** The locked rules say no climbing opinions and score is never the headline. The shipped bot reply is `"looks great — go climb (score 85, confidence high)"`, which is a climbing opinion, score as headline, and no weather. It is already live and violates both rules. Settle the correct copy model here and apply it to the bot and the Mini App together, so the two surfaces agree. Doing this after Task 6 means Task 6 inherits the wrong framing.

**Acceptance criteria:** someone else could build the Mini App from the spec without asking a design question. Every decision above has a written answer, and the copy model is consistent between bot and Mini App.

**Git checkpoint:** commit the spec on its own.

---

### ⚠️ Hard ordering constraint, read before scoping B2 and B3

The Mini App is a browser client inside Telegram's webview. The API currently sits behind **Vercel SSO deployment protection**, which a webview has no cookies for, so every `fetch` 302s to a login page. The protection-bypass secret cannot be used, because it would ship inside a public client bundle.

**`initData` HMAC validation is a prerequisite, not a finishing touch.** It must land in the same change that removes SSO protection from the API project. SSO off without HMAC leaves the API fully open on a public URL.

Build it as **route-level middleware on `/api/v1/*`**, not per-endpoint checks. Per-endpoint is easy to half-apply, and that is exactly how auth gaps happen. The cron and webhook routes are mounted outside `/api/v1` and keep their own gates.

**Task 6 is blocked on Task 5's auth work.** Do not build screens first and bolt auth on after.

---

### Phase B2 / Task 5: Scaffold

**What to build**

- New workspace `apps/miniapp`, Vite + React, static build. Add to root `workspaces` (already globbed as `apps/*`) and to `turbo.json`.
- Separate Vercel project, root directory `apps/miniapp`, with its own `VITE_API_BASE_URL`. The existing `EXPO_PUBLIC_API_BASE_URL` belongs to mobile; do not reuse it.
- Load `telegram-web-app.js`, call `Telegram.WebApp.ready()`, read `themeParams` per the B0 theming decision.
- Register the Mini App with @BotFather.

**Acceptance criteria**

- The Mini App opens from the bot's menu button and renders, themed per B0.
- `npm run build` produces a static bundle with no `TELEGRAM_BOT_TOKEN` anywhere in it.

**Watch point:** origin lockdown means production domain only. Vercel preview URLs will not work, so plan to test against production from the start.

**Git checkpoint:** commit after the scaffold renders.

---

### Phase B3 / Task 5: Server-side auth

**What to build**

- Middleware validating `Telegram.WebApp.initData` via HMAC using `TELEGRAM_BOT_TOKEN`. Token stays server-side.
- Mount on `/api/v1/*` in `apps/api/src/index.ts`, after `resolveUser`.
- Turn off Vercel SSO on the API project in the same change.

**Acceptance criteria**

- `curl` against `/api/v1/locations` **without** valid `initData` returns 401.
- The same call **with** valid `initData` returns data.
- Both must hold before this is considered done.
- `POST /api/cron/check-alerts` still works with `x-cron-secret`, and the bot webhook still answers. Neither is under `/api/v1`, so neither should be affected.

**Git checkpoint:** commit auth plus SSO removal together, never separately.

---

### Phase B4 / Task 6: Screens

**What to build**

Build to the B0 spec. No design decisions get made here. If something was not settled in B0, go back and settle it rather than improvising in code.

- Location list and location detail.
- Wire to existing endpoints through React Query hooks. All are verified working; no API changes needed.
- Import tokens from `packages/design`.

**Acceptance criteria**

- The list shows the 3 real seeded locations, not fixtures.
- Detail shows a real score, forecast, and alert state from the live API.
- No `MOCK_*` constants remain in shipped components.
- Copy matches the B0 model, on both bot and Mini App.

**Git checkpoint:** commit per screen.

---

### Phase B5 / Task 7: Deep link and archive mobile

**What to build**

- A `web_app` inline keyboard button on alert messages in `formatAlertMessage` (`apps/api/src/lib/alerts/checkAlerts.ts`), deep-linking to that location's detail screen via `startapp`.
- Remove `apps/mobile` from `turbo.json` (the `@weatherteam6/mobile#build` override) and from workspace dev and build scripts. **Leave the code in place.** Add `apps/mobile/ARCHIVED.md` with the date and reason.

**Acceptance criteria**

- Tapping the button on an alert message opens the Mini App directly on that location's detail screen.
- `turbo build` no longer touches `apps/mobile`.
- CI lint is green: the `'module' is not defined` failure is gone.

**Git checkpoint:** commit, then confirm CI is green for the first time since the migration.

---

## Data Shapes / API Reference

Every endpoint returns `{ data, error, status }`. Never deviate from this shape.

**Base:** `https://weather-team6-api.vercel.app`

```
GET  /health                          (unauthenticated, outside /api/v1)
POST /api/cron/check-alerts           (x-cron-secret header)
POST /api/telegram/webhook            (chat.id gate; see issue #27)

GET  /api/v1/locations
GET  /api/v1/locations/search
POST /api/v1/locations
GET  /api/v1/locations/:id
GET  /api/v1/locations/:id/normals    (returns [] forever, issue #25)
GET  /api/v1/locations/:id/history    (returns [] forever, issue #25)
GET  /api/v1/conditions/:locationId
GET  /api/v1/forecast/:locationId
GET  /api/v1/alerts/:locationId
GET  /api/v1/walls/:locationId
POST /api/v1/walls
DEL  /api/v1/walls/:wallId
GET  /api/v1/trips
POST /api/v1/trips
GET  /api/v1/trips/:tripId
DEL  /api/v1/trips/:tripId
GET  /api/v1/trips/:tripId/forecast
GET  /api/v1/radar/frames
```

The Mini App's two screens need only `/locations`, `/conditions/:id`, `/forecast/:id`, and `/alerts/:id`.

**Synthesized IDs:** `computeLiveForecast` builds `id` as `` `${locationId}:${date}` `` because nothing is persisted. Do not treat these as stable or lookupable across requests.

**Forecast window state machine** (from `.claude/rules/architecture.md`):

```
>14 days out : climatological normals only, no conditions score
7-14 days    : low-confidence ensemble, score shown with low confidence label
<7 days      : full conditions score active, p10/p90 bands shown
```

**New environment variable this work adds:** `VITE_API_BASE_URL` in the new `apps/miniapp` Vercel project. Add it to `.env.example` and to the Environment Variables section of `CLAUDE.md`, which are kept in sync by rule.

---

## Known Risks / Watch Points

- **Neon is unreachable from cloud dev containers.** The egress proxy blocks both Neon's WebSocket path (403) and its HTTP SQL API host (not allowlisted). `drizzle-kit` auto-detects `@neondatabase/serverless` and uses the WebSocket driver regardless of app code, so **migrations must be run from an unrestricted machine**. Do not burn time debugging this as a code problem.
- **Never set `NODE_ENV=production` as a Vercel environment variable.** npm omits devDependencies, `typescript` is a devDependency, and the root postinstall dies with `tsc: command not found`. Vercel manages `NODE_ENV` itself.
- **The API project's Vercel framework preset must be "Other", not "Express".** The Express preset expects `export default app` or `app.listen()`. `apps/api/api/index.ts` exports a `handler(req, res)`, and `apps/api/package.json`'s `main` points at a factory. The preset fails confusingly at runtime, not at build.
- **`apps/api/vercel.json` skips the build step deliberately,** with a no-op `buildCommand` and an intentionally empty `public/`. Without the empty `public/`, deploys fail with "No Output Directory named public found".
- **The Neon driver cannot be swapped to `neon-http`.** `trips.ts` uses an interactive `db.transaction()`, which the HTTP driver does not support.
- **Session notes are newest-first.** Reading the tail of `.claude/docs/session-notes.md` gives you a June 2026 mobile entry and a misleading picture.
- **A ⚠️ banner on a repo doc means mobile-era history.** No banner means the doc is maintained, not that every line is current. Trust the code over the prose when they disagree.
- **Every significant bug in the migration was caught by review, not by careful writing:** four of six findings in the first round, three in the second, fifteen in the docs round. Keep `/code-review` non-optional before each commit, and run `.claude/rules/review-checklist.md`.

---

## Open Questions

1. **Theming** (B0 decision 1) is genuinely open. Hybrid is recommended, not decided.
2. **Where unit conversion lives** (B0 decision 4): client-side in the Mini App, or a shared helper in `packages/types` so the bot can use it too. The bot currently shows no units at all, which is its own small bug.
3. **Issue #25** needs a design call on where the `crag_climbability_history` and `location_normals` writes go now that the worker that did them is gone. Options are a new `/api/cron/*` endpoint or live compute; both are sanctioned patterns.
4. **Test coverage** has no owner yet. Highest value targets are `notifyPendingAlerts`'s claim-and-release logic (the concurrency correctness the whole alerts design rests on) and the `CRON_SECRET` comparison (the only guard on a public URL).
5. **Caching.** `computeLiveForecast` makes two upstream fetches per request. Fine at one user; revisit if the Mini App gets real traffic.

---

## Outstanding Operational Item (not code)

**cron-job.org is not yet registered.** This is the last unexercised acceptance criterion from Tasks 1-4.

```
POST https://weather-team6-api.vercel.app/api/cron/check-alerts
Every 15 minutes
Headers: x-cron-secret, x-vercel-protection-bypass
```

Verify by using cron-job.org's "Run now" twice. The second call should return `notified: 0`.
