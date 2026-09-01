# WeatherTeam6: Mini App Build Handoff
Version: v1
Date: 2026-08-24
Status: Ready for Handoff

## Context

The Telegram Crossover migration (Tasks 1-4) is finished, merged, and verified running in production. This document hands off the remaining work: Phase B0 (design spec) followed by Crossover Tasks 5, 6, and 7 (the Telegram Mini App). It is written to be the only document a fresh session needs to start from, though it points at the repo docs that carry the detail.

**Read these in the repo before writing any code:**

1. `.claude/rules/architecture.md` (mandatory at every session start)
2. `.claude/docs/STATE.md` (current state — short, and the only state document)
3. `docs/handoffs/telegram-crossover-v4.md` (authoritative product direction)
4. `.claude/docs/plan.md` (phase order)

---

## Current State

### What is live and working

*(Snapshot from when this doc was written. `main` has moved several times since — B0, the `/api/v1` auth gate, and Task 5a have all landed. **`.claude/docs/STATE.md` is the current record;** where it and this section disagree, it wins.)*

- **Repo:** `TimHogan-HD/weatherteam6`, `main` @ `9cc71bd`, clean tree, no open PRs.
- **API:** `https://weather-team6-api.vercel.app`, Express wrapped as one Vercel serverless function at `apps/api/api/index.ts`.
- **DB:** Neon Postgres, `@neondatabase/serverless` **WebSocket** driver via `drizzle-orm/neon-serverless`. Migrations at `0006`. Seeded with 1 user and 3 locations. `DEFAULT_USER_ID` is `00000000-0000-0000-0000-000000000001`.
- **Scoring:** computed live per request in `apps/api/src/lib/scoring/liveForecast.ts`. Nothing is persisted to `forecast_snapshots` or `conditions_scores`.
- **Alerts:** `POST /api/cron/check-alerts`, gated on a `CRON_SECRET` header, logic in `apps/api/src/lib/alerts/checkAlerts.ts`. Dedup verified by hand (two consecutive calls returned `notified: 2` then `notified: 0`).
- **Bot:** `POST /api/telegram/webhook`, registered and answering. Two commands exist: `/start` and `/conditions <name>`.
- **Checks:** `npm run typecheck` clean, 106 tests passing, `npm run lint` has one known failure (below). *(2026-08-25: now 147 tests, and lint passes — the failure below was fixed in `3117020`.)*

### What does not exist yet

*(Accurate as of 2026-07-31; corrected 2026-08-25 — two of these have since landed.)*

- ~~`apps/miniapp` (the entire Mini App)~~ — **the shell landed 2026-08-25** (Task 5): workspace, token adapter, three routes, `BackButton`, Telegram chrome, React Query. The **screens** are still Task 6, and the Vercel project + @BotFather registration are still outstanding
- ~~`docs/handoffs/miniapp-design-v1.md`~~ — **written and merged** (`14c9757`). Binding spec.
- `initData` HMAC middleware — still true, and still the hard prerequisite for Task 6
- ~~Any test coverage for the backend logic added during the migration~~ — **partly addressed.** 147 tests now pass; `checkAddLocationApi.ts` covers the add flow against a real database, which vitest cannot (it mocks `fetch` and never connects)

### Known broken or degraded

| Item | Effect | Where |
| --- | --- | --- |
| ~~CI lint failure~~ **FIXED `3117020`** | Was `'module' is not defined` in `apps/mobile/app.config.js`, red on `main` and every branch. The ignore list now exempts it, so a red CI means something again. | `apps/mobile` |
| Issue #26 | `fetchNwsAlerts` returns `[]` (not `null`) on a malformed 200, and `runAlertsCheck` then deletes every row for that location, wiping `notified_at` and re-sending when the alert reappears. The separate claim-and-release race is already fixed; this prune path is not. Plus unescaped HTML in **two** places. Recommended first fix. | `checkAlerts.ts:87`, `conditionsReply.ts` |
| Issue #25 | `crag_climbability_history` and `location_normals` have no writer. `/history` and `/normals` return `[]` forever. | `locations.ts` |
| Issue #27 | Bot auth reads forgeable `chat.id` from the body, no `update_id` dedupe, `runAlertsCheck` is serial. | `telegramWebhook.ts`, `checkAlerts.ts` |
| Issue #21 | 104F scores 85 and the bot says "looks great, go climb". Violates two locked copy rules. **Settle inside B0.** | `conditionsScore.ts`, `conditionsReply.ts` |
| Issue #22 | Open-Meteo NBM 400s on every request, always falls back to ensemble. | `openMeteo.ts` |
| Unfiled | `computeLiveForecast` reuses *today's* wind, temp, and humidity for every future day, so a day-7 score describes today's weather. When no forecast day matches today, `?? 0` fallbacks score every day at 0 km/h and 0C, and 0C zeroes the temp component. A `logger.warn` for that case was restored on 2026-08-24. | `liveForecast.ts` |

---

## Objective

Ship the Telegram Mini App as the project's only client: a three-route surface (location list, location detail, and the `/add` flow added by `miniapp-design-v1.md` §12) reading the existing API, authenticated by `initData` HMAC, deep-linkable from alert messages, with `apps/mobile` removed from the build.

---

## Constraints / Non-Goals

- **No new features in `apps/mobile`.** It is archived in intent. Port, do not revive.
- **No queue.** No BullMQ, no Redis, no in-process schedulers. Background work is either live per-request compute or an HTTP endpoint on an external schedule. Read `.claude/skills/background-work/SKILL.md` before writing anything job-shaped.
- **Three routes, and no more.** `/` (list), `/location/:id` (detail), `/add` (search and add). This read "two screens only" until `miniapp-design-v1.md` §12 added the add flow on 2026-08-25 — **`/add` is in scope and its API is already built**, so do not treat it as creep. Radar, walls, trips, and shade map exist in the archived mobile app and remain out of scope; those are the ones not to let back in.
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
- [ ] Check `.claude/docs/STATE.md` for anything that landed after this doc was written.

---

## Phases

### Phase B0: Design spec (no code) — ✅ COMPLETE (`14c9757`)

> **Historical from here to the end of this phase.** Every question below was answered in
> `docs/handoffs/miniapp-design-v1.md`; read the answers there rather than re-deciding
> them. Note §12 of that spec added a third route, `/add`, so this phase's "two screens"
> framing is superseded.

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

> **Corrected 2026-08-26. The paragraph struck through below rested on a false premise;
> the constraint it stated survives, its reason does not.** `initData` HMAC validation
> shipped as its own change on 2026-08-26 — see the B3 section for what exists.

~~The Mini App is a browser client inside Telegram's webview. The API currently sits behind **Vercel SSO deployment protection**, which a webview has no cookies for, so every `fetch` 302s to a login page. The protection-bypass secret cannot be used, because it would ship inside a public client bundle.~~

**There is no SSO in the way and none to remove.** `ssoProtection.deploymentType` is `all_except_custom_domains`, which on this Hobby plan leaves the production alias serving straight through — a Telegram webview could always reach the API. What holds the door shut is `requireApiAuth` + `API_SHARED_SECRET`, and that is the thing not to weaken. The protection-bypass secret still cannot be used, because it would ship inside a public client bundle.

**`initData` HMAC validation is a prerequisite for Task 6, not a finishing touch** — a Mini App that cannot authenticate has nothing to render. It is a self-contained change, added as a **second accepted scheme on the same `Authorization` header** alongside `Bearer`, never a replacement for it.

Build it as **route-level middleware on `/api/v1/*`**, not per-endpoint checks. Per-endpoint is easy to half-apply, and that is exactly how auth gaps happen. The cron and webhook routes are mounted outside `/api/v1`, so the middleware will not cover them — they keep their own gates (`CRON_SECRET`, `chat.id`).

**Issue #27 is not made urgent by this change, and was never made urgent by SSO removal.** `POST /api/telegram/webhook` is gated only by the forgeable `chat.id` in the request body, and it is reachable today exactly as it was before — SSO never covered it. The `secret_token` fix is still worth doing; it is simply neither a prerequisite nor a consequence of the auth work here.

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

> **Status: built 2026-08-26.** `apps/api/src/lib/telegram/initData.ts` (pure validator)
> and the second scheme in `apps/api/src/middleware/apiAuth.ts`. Read this section now as
> a description of what exists.

**What was built**

- `validateInitData(raw, botToken)` — HMAC-SHA256 with the `WebAppData`-derived secret key, in `src/lib/telegram/initData.ts`. Pure: no env reads, no Express types.
- A second accepted scheme in `requireApiAuth`: `Authorization: tma <initDataRaw>`, alongside `Bearer <API_SHARED_SECRET>`. `Bearer` is unchanged and is still what keeps the production alias closed.
- **The signed user id is checked against `TELEGRAM_CHAT_ID`.** A valid signature only proves the launch came from *a* Telegram user, and anyone who finds the bot can open its menu button — without this the second scheme would hand `DEFAULT_USER_ID`'s rights to any Telegram account.
- No Vercel SSO change: there is none to make (see the corrected constraint block above).
- Issue #27's webhook `secret_token` is **not** part of this change — it is unaffected either way.
- The credential travels in `Authorization`, which `createApp()`'s CORS layer already allows. A custom header such as `X-Telegram-Init-Data` would fail preflight and present as an auth bug rather than a CORS bug.

**Acceptance criteria — all verified over real HTTP against a locally run API**

- `curl` against `/api/v1/*` **without** a credential returns 401. ✅
- The same call **with** signed owner `initData` under `tma` returns data. ✅
- Signed `initData` for a **different Telegram user** returns 401. ✅
- `initData` older than 24 h, or with any field tampered, returns 401. ✅
- `Bearer $API_SHARED_SECRET` still returns data, and an unset `API_SHARED_SECRET` still fails closed with 503 under **both** schemes. ✅
- `POST /api/cron/check-alerts` still answers on `CRON_SECRET` and the bot webhook still answers. Neither is under `/api/v1`, so neither is affected. ✅

~~**Git checkpoint:** commit auth plus SSO removal together, never separately.~~
**Corrected 2026-08-25 — there is no SSO removal to pair it with.** Both Vercel projects
have `ssoProtection.enabled: true` with `deploymentType: "all_except_custom_domains"`,
which on this Hobby plan does not cover the primary production alias: an unauthenticated
`GET https://weather-team6-api.vercel.app/api/v1/locations` reaches Express and returns
our own `{"data":null,"error":"Unauthorized","status":401}`. SSO protects *preview*
deployments — keep it, both because it is doing useful work and because it is why there
is no preview-URL path for testing the Mini App inside Telegram. `initData` validation is
a self-contained change, layered as a second scheme alongside `API_SHARED_SECRET`.

---

### Phase B4 / Task 6: Screens

> **Status: built 2026-08-26.** Read this section as a description of what exists.
> Two corrections to what it originally said: there are **three** screens, not two
> (§12 added `/add`), and **API changes were needed** — Task 5a shipped them.

**What was built**

- All three routes real: `LocationList`, `LocationDetail`, `AddLocation` (search →
  preview → save), plus the shared `DetailView` the preview reuses in unsaved mode.
- Every call goes through a React Query hook in `src/hooks/`. No component calls
  `fetch`; `src/lib/api.ts` is the only place that does, and it attaches the
  `tma` credential.
- Tokens come from `packages/design` through the adapter. `src/theme/styles.ts` is
  the per-entry `components` audit §0a asked for; nothing restates a literal. The
  one derived value is the alert tint, computed from `colors.poor` because the
  palette has no `poorTint`.
- The §4 formatters and the §7 ladder + suppression rule live in `packages/types`
  (`units.ts`, `conditionsCopy.ts`) so the bot can share one implementation.

**Acceptance criteria — what holds and what does not**

- No `MOCK_*` constants, and no stub data, in any shipped component. ✅
- The add flow runs against the real API and real upstreams: geocode returns the
  three "Red Rock Canyon" parks, `/preview` returns seven days, and every client
  formatter was run over that response. ✅
- Copy matches the B0 model in the Mini App, verified by rendering the detail screen
  and asserting on the output — including the 103 °F suppression case. ✅
- ~~The list shows the 3 real seeded locations~~ and ~~detail shows a real score,
  forecast, and alert state from the live API~~ — **not verified.** Both need a
  database, and there is no local one; the display logic is covered by fixture-based
  render tests instead.
- ~~Copy matches the B0 model on **both** bot and Mini App~~ — **the bot is
  unchanged.** `statusLabel()` still maps score to an opinion. Deleting it is issue
  #21's other half and travels with #26's HTML escaping fix.

---

### Phase B5 / Task 7: Deep link and archive mobile — ✅ COMPLETE 2026-08-26

> **Shipped.** What follows is the original brief, kept for context, with two
> corrections marked inline. What actually landed:
>
> - `apps/api/src/lib/telegram/deepLink.ts` (new) builds
>   `https://t.me/WeatherTeam6_bot/Alert?startapp=loc_<uuid>` and a one-button inline
>   keyboard; `sendTelegramMessage` gained an optional `replyMarkup`; and
>   `notifyPendingAlerts` — not `formatAlertMessage` — attaches it, because the keyboard
>   is a `reply_markup` field on the API call, not part of the message text.
> - `apps/miniapp/src/lib/deepLink.ts` (new), called from `main.tsx` before React mounts.
> - `apps/mobile/package.json` lost its `build`, `dev`, `typecheck`, `lint` and `test`
>   scripts; the dead `@weatherteam6/mobile#build` override left `turbo.json`;
>   `apps/mobile/ARCHIVED.md` added.
>
> **Not verified:** nothing seen inside Telegram, and no real alert has carried the
> button — `weather_alerts` is empty while cron-job.org is unregistered.

**What to build**

- ~~A `web_app` inline keyboard button~~ — **wrong, corrected 2026-08-26.** It must be a
  plain **`url`** button pointing at the Direct Link Mini App
  (`https://t.me/WeatherTeam6_bot/Alert?startapp=loc_<uuid>`). A `web_app` button opens
  an inline-button Mini App and does **not** deliver `start_param` at all. The keyboard
  is attached in `notifyPendingAlerts` (`apps/api/src/lib/alerts/checkAlerts.ts`), not in
  `formatAlertMessage`, which formats only the message text.
- Remove `apps/mobile` from the build. **Leave the source in place.** Add `apps/mobile/ARCHIVED.md` with the date and reason.

**Do not just delete the `@weatherteam6/mobile#build` override from `turbo.json`.** That override exists only to set `outputs: []`; deleting it makes the package fall through to the generic `build` task, which still runs its `tsc --noEmit`. The same is true of lint: `turbo.json` has a bare `lint: {}` task, and mobile's own `lint` script is `eslint . --max-warnings 0`, so no turbo edit silences it. Turbo runs whatever scripts a workspace member declares.

Pick one of these instead, and verify rather than assume:
- Narrow the root `workspaces` globs so `apps/mobile` is not a workspace member (currently `apps/*`, which would need listing members explicitly), or
- Remove or neutralize the `build`, `lint`, `typecheck`, and `test` scripts in `apps/mobile/package.json`, or
- Add `apps/mobile/eslint.config.mjs` overrides if the goal is only to clear the lint failure.

**Acceptance criteria**

- Tapping the button on an alert message opens the Mini App directly on that location's detail screen.
- `npm run build` output contains no `@weatherteam6/mobile` task.
- `npm run lint` exits 0 locally, and the CI check is green for the first time since the migration. Run both before claiming this.

**Acceptance result (2026-08-26):**

- **Build/lint — met.** `turbo run build` executes four tasks, not five;
  `build`/`typecheck`/`lint`/`test`/`dev` all resolve `@weatherteam6/mobile` to
  `<NONEXISTENT>` and skip it. `npm run lint` exits 0.
- **Correction to the third criterion:** lint was **already** green before this task.
  Mobile's ESLint failure was fixed earlier by adding `apps/mobile/app.config.js` to the
  ignores in `eslint.config.mjs`; this change did not clear a live failure, it removed
  the workspace from the run.
- **Tap — not met, and not testable here.** No real alert has carried the button:
  `weather_alerts` is empty while cron-job.org is unregistered, and there is no
  preview-deploy path for testing inside Telegram.

**Git checkpoint:** commit, then confirm CI is green for the first time since the migration.

---

## Data Shapes / API Reference

Every endpoint returns `{ data, error, status }`. Never deviate from this shape.

**Base:** `https://weather-team6-api.vercel.app`

```
GET  /health                          (unauthenticated, outside /api/v1)
POST /api/cron/check-alerts           (x-cron-secret header)
POST /api/cron/collect-runs           (x-cron-secret header; unregistered with the scheduler)
POST /api/cron/prune-runs             (x-cron-secret header; unregistered with the scheduler)
POST /api/telegram/webhook            (chat.id gate; see issue #27)

GET  /api/v1/locations
GET  /api/v1/locations/search         (crags table only — empty; not the add-flow search)
GET  /api/v1/geocode?q=               (place-name search, Open-Meteo proxy — Task 5a)
GET  /api/v1/preview?lat=&lon=&elevation=   (unsaved location's forecast; persists nothing — Task 5a)
POST /api/v1/locations                (takes is_climbing_location, rock_type, elevation_m, timezone)
GET  /api/v1/locations/:id
DEL  /api/v1/locations/:id            (cascades to dependents — Task 5a)
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

The list and detail screens need only `/locations`, `/conditions/:id`, `/forecast/:id`, and `/alerts/:id`.

**Updated 2026-08-25:** there is a **third** screen. `miniapp-design-v1.md` §12 added the add-location flow — route `/add`, plus the detail screen in unsaved mode — which uses `/geocode`, `/preview`, `POST /locations`, and `DELETE /locations/:id`. Those four shipped in Task 5a (`a90613f`) and are live; do not mock them. Two more notes on them:

- `/preview` returns the same windowed `ForecastSnapshot[]` as `/forecast/:id`, so both modes of the detail screen share one rendering path. It deliberately returns **no score** — drive the score section off the mode, not off "score is null".
- Preview and save must carry the **same** `elevation`: the geocoder's value goes to `/preview?elevation=` and then to `POST /locations` as `elevation_m`. Skip it in either place and the same location reports different temperatures before and after saving.

**Synthesized IDs:** `computeLiveForecast` builds `id` as `` `${locationId}:${date}` `` because nothing is persisted. Do not treat these as stable or lookupable across requests.

**Forecast window state machine** (from `.claude/rules/architecture.md`):

```
>14 days out : climatological normals only, no conditions score
7-14 days    : low-confidence ensemble, score shown with low confidence label
<7 days      : full conditions score active, p10/p90 bands shown
```

**New environment variable this work adds:** `VITE_API_BASE_URL` in the new `apps/miniapp` Vercel project. Three places need it, not one:

1. `.env.example`, and the Environment Variables section of `CLAUDE.md`, which are kept in sync by rule.
2. The `apps/miniapp` Vercel project settings.
3. **`turbo.json`'s `globalEnv` array.** Miss this and turbo will not treat the variable as part of the cache key, so changing the API base URL silently reuses a stale bundle built against the old one. Every other runtime variable in this repo is already listed there.

---

## Known Risks / Watch Points

- **Neon is unreachable from cloud dev containers.** The egress proxy blocks both Neon's WebSocket path (403) and its HTTP SQL API host (not allowlisted). `drizzle-kit` auto-detects `@neondatabase/serverless` and uses the WebSocket driver regardless of app code, so **migrations must be run from an unrestricted machine**. Do not burn time debugging this as a code problem.
- **Never set `NODE_ENV=production` as a Vercel environment variable.** npm omits devDependencies, `typescript` is a devDependency, and the root postinstall dies with `tsc: command not found`. Vercel manages `NODE_ENV` itself.
- **The API project's Vercel framework preset must be "Other", not "Express".** The Express preset expects `export default app` or `app.listen()`. `apps/api/api/index.ts` exports a `handler(req, res)`, and `apps/api/package.json`'s `main` points at a factory. The preset fails confusingly at runtime, not at build.
- **`apps/api/vercel.json` skips the build step deliberately,** with a no-op `buildCommand` and an intentionally empty `public/`. Without the empty `public/`, deploys fail with "No Output Directory named public found".
- **The Neon driver cannot be swapped to `neon-http`.** `trips.ts` uses an interactive `db.transaction()`, which the HTTP driver does not support.
- **Do not read `.claude/docs/session-archive.md` for current state.** It is 165KB of dated history in inconsistent order — it accumulated entries at both ends. `.claude/docs/STATE.md` is the current record; grep the archive only for the reasoning behind one specific past decision.
- **A ⚠️ banner on a repo doc means mobile-era history.** No banner means the doc is maintained, not that every line is current. Trust the code over the prose when they disagree.
- **Every significant bug in the migration was caught by review, not by careful writing:** four of six findings in the first round, three in the second, fifteen in the docs round. Keep `/code-review` non-optional before each commit, and run the `/review-checklist` skill (`.claude/skills/review-checklist/SKILL.md`).

---

## Open Questions

1. **Theming** (B0 decision 1) is genuinely open. Hybrid is recommended, not decided.
2. **Where unit conversion lives** (B0 decision 4): client-side in the Mini App, or a shared helper in `packages/types` so the bot can use it too. The bot currently shows no units at all, which is its own small bug.
3. **Issue #25** needs a design call on where the `crag_climbability_history` and `location_normals` writes go now that the worker that did them is gone. Options are a new `/api/cron/*` endpoint or live compute; both are sanctioned patterns.
4. **Test coverage** has no owner yet. Highest value targets are `notifyPendingAlerts`'s claim-and-release logic (the concurrency correctness the whole alerts design rests on) and the `CRON_SECRET` comparison (the only guard on a public URL).
5. **Caching.** `computeLiveForecast` makes three upstream fetches per request in steady state: NBM (which 400s, issue #22), the ensemble fallback, and rainfall history. A detail screen that loads conditions and forecast together doubles that to six. Fine at one user; revisit if the Mini App gets real traffic, and note that fixing #22 removes one of the three for free.

---

## Outstanding Operational Item (not code)

**cron-job.org is not yet registered.** This is the last unexercised acceptance criterion from Tasks 1-4.

```
POST https://weather-team6-api.vercel.app/api/cron/check-alerts
Every 15 minutes
Headers: x-cron-secret, x-vercel-protection-bypass
```

Verify by using cron-job.org's "Run now" twice. The second call should return `notified: 0`.
