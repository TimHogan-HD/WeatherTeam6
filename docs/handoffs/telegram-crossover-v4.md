# WeatherTeam6: Telegram Crossover (Zero-Cost Stack)

**Version:** v4
**Date:** 2026-07-29
**Original status:** Ready for Handoff — corrected against actual repo state

---

## ⚠️ Status as of 2026-07-31 — read this first

**Tasks 1–4 are COMPLETE, merged, and verified live** (PR #20, `main` @ `adb19a6`). The
rest of this document is preserved as the source of truth for **Tasks 5–7**, which are
not started.

> **Update 2026-08-25.** Two more things have landed since, neither of them in the
> original seven:
>
> - **Phase B0 — the Mini App design spec**, `docs/handoffs/miniapp-design-v1.md`
>   (PR #31, `14c9757`). Task 6 builds to that spec, not to this document's two-screen
>   sketch. Read it first.
> - **Task 5a — the add-location API** (PR #37, `a90613f`), added as its own section
>   below, between Tasks 5 and 6.
>
> **Update 2026-08-25 (later the same day).** Task 5's scaffold is built and merged —
> `apps/miniapp` exists, with the token adapter, the three routes, `BackButton` wiring
> and Telegram chrome. The Vercel project and the @BotFather registration are still
> outstanding, so the task is **code complete, not deployed**. See its section below.
>
> The running record of what is built is
> `.claude/docs/session-notes.md`; the phase table in `.claude/docs/plan.md` mirrors
> this task list with more implementation detail.

What actually shipped differs from this doc in a few places. Where they disagree, the
notes below win:

- **Migration count.** This doc says migrations `0000-0002` exist. The repo actually had
  six (`0000`-`0005`); the `notified_at` migration is `0006`, not `0003`.
- **Route prefix.** Routes were unprefixed before the migration, not `/api/v1`. The
  prefix was added at the mount point in `apps/api/src/index.ts` during Task 2.
- **Neon driver.** This doc specifies the **HTTP** driver. The implementation uses
  `drizzle-orm/neon-serverless` (WebSocket) instead, because `apps/api/src/routes/trips.ts`
  uses an interactive `db.transaction()` the HTTP driver cannot express without
  rewriting that route.
- **Two internal contradictions**, resolved during implementation:
  1. This doc says to delete `forecastSnapshot` *and* port the route handlers as-is.
     Those routes only ever read tables that job populated, so they would have returned
     empty forever. Resolved by computing scoring live per request
     (`apps/api/src/lib/scoring/liveForecast.ts`).
  2. Deleting `rainfallHistory` with no replacement would have left `dryingModel`
     permanently defaulting to "no recent rain", silently degrading the
     highest-weighted scoring component. Resolved by live-fetching recent precipitation
     (ACIS when a location has an `asos_station`, else Open-Meteo's archive API).

See `.claude/docs/session-notes.md` for the full implementation record, deployment
state, and Vercel configuration gotchas.

---

## What changed from v3

v3 was written from stale notes and got the current state of the codebase wrong in two
places. Confirmed against actual commit history and deployment logs on Railway:

- **Routes are already mounted and real.** Phase 5 shipped `GET /locations`,
  `GET /conditions/:locationId`, `GET /forecast/:locationId` with a real 5-component
  scoring engine. Phase 6 shipped `GET /alerts/:locationId` and a real `alertsPoller`
  (not a stub) with retry/backoff NWS fetching. v3 said only `health.ts` was mounted —
  wrong, ignore that.
- **`weather_alerts` table already exists** (migration 0002), with a unique constraint
  on `(location_id, nws_alert_id)` — exactly the dedup key needed for the alerts
  endpoint. v3 said to create a new `sent_alerts` table — don't; extend what's there
  instead.
- **Every deployment on Railway failed or was removed.** No environment data was ever
  populated in production. Nothing is being migrated off Railway because there's
  nothing there worth recovering.

## Context

Telegram bot (alerts) + Telegram Mini App (on-demand conditions) replaces both the
native mobile app and Railway hosting. Vercel + Neon, zero ongoing cost, no server to
keep alive.

## Current State (as verified when this doc was written)

- **Schema/migrations:** `locations`, `walls`, `forecast_snapshots`, `rainfall_history`,
  `conditions_scores`, `weather_alerts` — all exist via Drizzle migrations.
- **API routes implemented:** `/locations`, `/conditions/:id`, `/forecast/:id`,
  `/alerts/:id`, `/health`.
- **Scoring engine implemented:** 5-component (drying > rain > wind > temp > humidity),
  confidence bands by window.
- **BullMQ workers implemented:** `forecastSnapshot`, `rainfallHistory`,
  `snapshotCleanup`, `alertsPoller` (real, with retry/backoff on NWS fetch).
- **`apps/mobile`:** Phase 0 scaffold only, being archived, not touched by this doc.
- **Railway:** all deployments failed/removed. Nothing recoverable.
- **Neon:** project created. Both connection strings (pooled + direct) in hand.
- **Telegram:** bot created, token + chat ID in hand.
- **Vercel:** connected to the repo, no project configured yet.

## Objective

Get the existing, working scoring/conditions/alerts logic running on Vercel + Neon with
zero servers, then add the Telegram bot and Mini App on top of it.

## Constraints / Non-Goals

- Do not rewrite `conditionsScore.ts`, the route handlers, or `fetchNwsAlerts` — they
  work, port them as-is.
- Do not create a new alerts-dedup table — extend `weather_alerts`.
- Remove BullMQ and Redis entirely. Three of four workers are deleted outright, not
  ported. The fourth becomes an HTTP endpoint.
- No paid services anywhere in the chain.
- Not touching `apps/mobile` beyond archiving it.
- Not building the route/trip-planning MCP server — separate track.

## Job disposition

- **`forecastSnapshot`** — delete. Existed to cache for app screens that no longer
  exist. Fetch Open-Meteo live per-request instead.
- **`snapshotCleanup`** — delete. Nothing left to clean up.
- **`rainfallHistory`** — delete. Replace with an on-demand query against Open-Meteo's
  archive API if/when historical climbability is actually built.
- **`alertsPoller`** — convert. Keep its internals (NWS fetch, retry/backoff,
  upsert-and-prune logic) but trigger it via HTTP instead of BullMQ, on an external
  schedule.

---

## ✅ Task 1 — Neon migration (COMPLETE)

- Add `DATABASE_URL` (direct connection string) wherever migrations run from
- Run the existing `db:migrate` script against Neon
- Verify all tables exist, plus the Drizzle migrations table
- Swap the Postgres client to `@neondatabase/serverless` — required for serverless
  functions; standard `pg` TCP pooling will not work correctly from Vercel

**Acceptance:** A query against `locations` succeeds using the Neon pooled connection
string. ✅

## ✅ Task 2 — API on Vercel (COMPLETE)

- `vercel.json` + entry point wrapping the existing Express app as a single serverless
  handler — do not rewrite routes individually, wrapping preserves what's working
- Vercel project root directory: `apps/api`
- Remove BullMQ, Redis, ioredis, and the three deleted worker files plus their
  dependencies
- Env vars on Vercel: `DATABASE_URL` (Neon pooled), `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_CHAT_ID`, `CRON_SECRET`, `NWS_USER_AGENT`, `DEFAULT_USER_ID`

**Acceptance:** `GET /api/v1/locations` and `GET /api/v1/conditions/:id` return real
scored data from the deployed Vercel URL. ✅

## ✅ Task 3 — Alerts endpoint + external cron (COMPLETE)

- Add `POST /api/cron/check-alerts`, gated on a `CRON_SECRET` header — reject any
  request without the correct header, this is a public URL
- Port `alertsPoller`'s internals into this handler: fetch NWS alerts per saved
  location, upsert into `weather_alerts`, prune resolved alerts
- Add a `notified_at` column (nullable timestamp) to `weather_alerts`
- After upserting, for any alert row where `notified_at IS NULL`: send a Telegram
  message (tier + plain-language reason, no jargon), then set `notified_at = now()`
- Configure cron-job.org (manual dashboard step) to POST this endpoint every 15 minutes
  with the `CRON_SECRET` header

**Acceptance:** Seed a location with an active NWS alert, trigger the endpoint manually
— one Telegram message arrives. Trigger again immediately — no duplicate message. ✅

## ✅ Task 4 — Bot webhook (COMPLETE)

- `POST /api/telegram/webhook`
- Register via `setWebhook` pointing at the production Vercel URL
- Reject any update where `chat.id` doesn't match `TELEGRAM_CHAT_ID` — this is the
  single-user auth boundary; API itself stays `AUTH_ENABLED=false`
- Implement `/start` and `/conditions <location name>`, returning plain-language status
  pulled from the real `/conditions/:id` logic

**Acceptance:** Messaging the bot `/conditions horseshoe` returns a real score and
plain-language status. ✅

---

## 🟡 Task 5 — Mini App shell (CODE COMPLETE, NOT YET DEPLOYED)

**Updated 2026-08-25.** The scaffold is built and merged — `b06ebed` (PR #38). The two steps that need a
Vercel dashboard and @BotFather are outstanding, and until they are done the task's
acceptance criterion is unmet — do not record it as complete.

**Built:**

- ✅ New Turborepo app `apps/miniapp` — Vite + React, static build. `vercel.json`
  rewrites every path to `index.html`; `VITE_API_BASE_URL` is the only env var, and it
  is inlined into a public bundle.
- ✅ `telegram-web-app.js` loaded synchronously ahead of the app module, `ready()` and
  `expand()` on mount, chrome harmonized per `miniapp-design-v1.md` §1 —
  `setBackgroundColor` gated at Bot API 6.1 and `setHeaderColor` at 6.9, separately,
  with no `bg_color` keyword fallback. `themeParams` is on the typed surface and is
  **deliberately never read** — §1 fixes the content surface to the WeatherTeam6 dark
  palette, because the palette has no light variant and every locked contrast rule
  assumes dark.
- ✅ The token adapter §0a requires *before the first component* —
  `src/theme/tokens.css.ts` re-expresses `type`, `shadow` and `layout` for the web and
  maps `BarlowCondensed` → `"Barlow Condensed"`, plus a generated `:root` block of
  custom properties. Every value derives from an import.
- ✅ All three routes from §2 with Telegram's `BackButton` as the only back affordance,
  per-route rather than a blanket "navigate to `/`". Screens are placeholders — Task 6.
- ✅ React Query provider on §5's settings.

**Outstanding — needs the repo owner:**

- ⬜ Create the separate Vercel project (root directory `apps/miniapp`, *Include source
  files outside of the Root Directory* on, framework preset **Vite**, no `NODE_ENV`).
  Steps are in `apps/miniapp/README.md`.
- ⬜ Register the production URL with @BotFather (`/newapp` or `/setmenubutton`).
  Origin lockdown means the production domain only — preview URLs will not open.

**Acceptance:** Bot's menu button opens the Mini App inside Telegram, themed correctly.
**Not yet met** — the shell has been verified in a real browser (routing, BackButton
wiring, version gating, and the adapter's computed styles), never inside Telegram.

## ✅ Task 5a — Add-location API (COMPLETE)

**Added 2026-08-25, after this document was written.** It is not one of the original
seven tasks. The number reflects only that it had to land before Task 6 — it is
backend work with nothing to do with the Mini App shell in Task 5, and the two can
proceed in either order.

**Why it exists:** the design spec settled how a user adds a location (search a place
by name, see its weather, decide whether to keep it) and that flow turned out to need
five API changes nothing had accounted for. Specified in
`docs/handoffs/miniapp-design-v1.md` §12.3:

- `GET /api/v1/geocode?q=` — place-name search, Open-Meteo, keyless, proxied
  server-side. Nothing turned a name into coordinates before.
- `GET /api/v1/preview?lat=&lon=&elevation=` — weather for a location with no row and
  no UUID yet. Persists nothing.
- `POST /locations` accepting `is_climbing_location` and `rock_type` — it hardcoded
  `is_climbing_location: false`, so a hand-added crag could never be a crag.
- `DELETE /locations/:id` — none existed, so every save was permanent.
- `POST /locations` persisting `elevation_m` — without it a saved location reports
  different temperatures than its own pre-save preview did.

**Also settled a product question:** climbing is a property of a saved location, not a
precondition for saving one. Any place can be searched and saved; `is_climbing_location`
is an explicit toggle at save time, default off. This is where the "+ general weather
app" half of the product becomes real. `plan.md` decision 10 ("geocoding — out of
scope") is reversed by it.

**Acceptance:** `npm run check:add-location` — boots the API against a real database and
walks the whole flow. 16 checks, all passing. ✅ Merged as `a90613f` (PR #37).

## ⬜ Task 6 — Mini App screens (NOT STARTED)

- Port the two screens already designed (location list; location detail with factor
  breakdown, confidence, 7-day forecast table)
- Wire to Task 2's endpoints
- Validate `Telegram.WebApp.initData` server-side via HMAC using `TELEGRAM_BOT_TOKEN`
  before returning data — token stays server-side only, never in the client bundle
- Score stays non-headline: plain-language status leads, numeric score small and
  secondary

**Acceptance:** Mini App shows the real saved-location list; tapping through shows real
score, forecast, alert state. No mock data anywhere.

> **Note added 2026-07-31:** the "two screens already designed" were designed in the
> session that produced this doc and are **not in the repo**. Treat the existing mobile
> mockups (`docs/handoffs/weatherteam6UI.html`, `weatherteam6-ui-handoff-v1.md` §7b/7c/7e)
> as the design basis instead. Also note the API is currently behind Vercel SSO
> protection, which a Telegram webview cannot authenticate against — the `initData` HMAC
> middleware must ship together with removing that protection.

## ⬜ Task 7 — Deep link + cleanup (NOT STARTED)

- Add a `web_app` inline keyboard button to alert messages from Task 3, deep-linking to
  that location's detail screen via a `startapp` parameter
- Remove `apps/mobile` from `turbo.json` pipeline and workspace dev/build scripts, leave
  the code in place
- Add `apps/mobile/ARCHIVED.md` noting the date

**Acceptance:** Tapping an alert opens the Mini App on that location's detail screen.
`turbo build` no longer touches `apps/mobile`.

---

## Known Risks / Watch Points

- **Mini App origin lockdown** has been in effect since 2026-07-20 — register and test
  only against the production Vercel domain, preview-branch URLs will not work.
- **Vercel Hobby cron caps at once/day** — this is exactly why Task 3 uses an external
  scheduler, don't try to move it into `vercel.json`.
- **Neon scale-to-zero** causes a short cold start on first query after idle — expected,
  not a bug.
- **`CRON_SECRET` is the only protection on a public URL** — treat it like a real
  credential.
- **Confirm current Telegram Bot API / Mini App docs before writing code in Tasks 5–6**;
  this surface changed multiple times in 2026.
