# WeatherTeam6: Leave Telegram — Handoff

Version: v1
Date: 2026-09-22
Status: **Approved by the owner, 2026-09-22. Nothing is built.** This document reverses the
Telegram client mandate. Phase 1 has not started.

**This supersedes `docs/handoffs/telegram-crossover-v4.md` as the product direction.** The
crossover doc remains the record of why Telegram existed and is not deleted.

Two standing documents still contradict this one and are amended in **Phase 4**, not before:
`CLAUDE.md` and `.claude/rules/architecture.md` both carry the Telegram client mandate and
the "Do not build a login UI. Do not add sessions." rule. See § Explicit rule overrides.
They are **not blocking**.

## Context

The Telegram migration is being reversed. The only recorded reason for adopting Telegram —
`telegram-crossover-v4.md`'s *"zero ongoing cost, no server to keep alive"*, written after every
Railway deploy failed — is satisfied identically by a static site on Vercel, which is already
what `apps/miniapp` is. Nothing in the repo records a UX argument for Telegram; the decision
session itself was never archived.

What Telegram actually costs today:

- **No preview-deploy test path.** Mini App origin lockdown means preview URLs cannot open as a
  Mini App. That is why nothing here has been tested before production and why Playwright cannot
  drive the UI. This is the largest day-to-day loss.
- **~5,510 production + ~3,050 test lines** of bot machinery (`lib/telegram/` at 4,029 + 2,984,
  the webhook at 546, four operator scripts at 810, one table) serving a chat surface that has been
  rebuilt three times on device feedback. A fifth script, `check:conditions`, is rewritten rather
  than deleted — see Phase 3. *(All line counts in this document were measured against the tree at
  `93d1cd3`, not estimated.)*
- A 15-second callback deadline, a 64-byte `callback_data` budget, two opposite HTML-escaping
  rules, a rich-message/HTML dual render path, and inline charts that failed on a real device.

What it gives that must be replaced: **identity** (`TELEGRAM_CHAT_ID` is the entire auth
boundary) and **push** (`notifyPendingAlerts` is the only notification channel in the product).

**Owner decisions, 2026-09-22:**

| Decision | Answer |
| --- | --- |
| The bot | **Delete Telegram entirely.** No bot, no webhook, no alert delivery. |
| Auth | **Passphrase → signed token**, a third `Authorization` scheme beside `Bearer`. |
| Alerts | **Parked.** Alert *data* keeps being collected; delivery is a future decision. |
| Audience | **Owner plus a few climbing partners.** Build the identity seam once, properly. |

Intended outcome: `https://weatherteam6.vercel.app` is an installable web app anyone with a
passphrase can open in any browser, the API authenticates real users, and `apps/api` loses a
third of its source.

---

## Explicit rule overrides

These are standing rules this plan breaks. They are broken deliberately, on the owner's
instruction, and the rule text gets amended in Phase 4 rather than silently contradicted.

| Rule | Where | Override |
| --- | --- | --- |
| "Do not build a login UI. Do not add sessions." | `CLAUDE.md`, `.claude/rules/architecture.md` § Auth Pattern | A login screen and a bearer token are now the product's front door. Still **no Clerk, no self-serve signup**. |
| "The Mini App is the client… authenticated by `initData` HMAC" | `CLAUDE.md` | Replaced by the token scheme. |
| "Telegram `BackButton` as the only back affordance. No in-app back arrow." | `miniapp-design-v1.md` §2, §8 | There is no `BackButton` outside Telegram. An in-app affordance becomes required. |
| "Push notifications outside Telegram's own" is a non-goal | `miniapp-design-v1.md` §9 | Unchanged for now — alerts are parked, not re-scoped. |

One correction to carry into the docs: `CLAUDE.md` and `apiAuth.ts:13-14` both state that
protecting Vercel's production alias needs a paid plan. **That is out of date** — Vercel
Authentication at "All Deployments" scope covers production domains free on Hobby. It is not the
chosen approach (it gates by Vercel account login, which partners will not have), but the comment
should stop asserting something false.

---

## Phase 1 — Token auth in the API

Lands first because nothing else can work without it. The bot keeps running throughout.

**Schema** — one migration (`npm run db:generate`, then `db:migrate`; never `drizzle-kit push`).
Add to `users` in `apps/api/src/db/schema.ts`:

- `username text unique` — nullable
- `password_hash text` — nullable

Both nullable so the existing seeded row needs no backfill dance. **A user with either column null
cannot log in** — that is the intended reading, not an oversight, and the lookup must require both.

**New: `apps/api/src/lib/auth/`** (business logic, not route files, per the architecture rule):

- `password.ts` — `hashPassword` / `verifyPassword` using `node:crypto` `scrypt` with a per-user
  random salt, stored as a self-describing `scrypt$N$r$p$<salt>$<hash>` string. Compare with
  `timingSafeEqual`, which `apiAuth.ts:1` already imports. **No new dependency.**
- `token.ts` — `signToken({ sub, exp })` / `verifyToken(token)`, HMAC-SHA256 over a base64url
  payload, keyed on a new `AUTH_TOKEN_SECRET`. Pure, no env reads, no Express types — the same
  shape as `validateInitData` and for the same reason: the algorithm must be directly testable.
  `verifyToken` returns a discriminated result, never throws.
- TTL **30 days**. A crag is the wrong place to be logged out.

**`apps/api/src/middleware/apiAuth.ts`** gains a third scheme and becomes the single place
identity is decided:

- `Session <token>` → verify → `req.userId = claims.sub`
- `Bearer <API_SHARED_SECRET>` → `req.userId = DEFAULT_USER_ID` (scripts and curl act as owner)
- **Fail closed on `AUTH_TOKEN_SECRET` exactly as it already does on `API_SHARED_SECRET`** — unset
  means 503 for every scheme, never an open door.
- Delete the `tma` branch in Phase 3, not here.

**`apps/api/src/middleware/auth.ts`** — `resolveUser` stops being mounted app-wide in
`index.ts:39`. Verified: `routes/cron.ts` reads `req.userId` nowhere (it acts across all
locations), and the webhook is the only other consumer. The `AUTH_ENABLED=true` → 501 branch is
deleted; `DEFAULT_USER_ID` survives as the `Bearer` identity and for `db:seed`.

> **Review this specifically.** `declare module 'express-serve-static-core'` types `req.userId` as
> non-optional `string`. Once the setter moves into `requireApiAuth`, any route mounted outside
> that gate reads `undefined` through a type that says it cannot be. Confirm at review that
> `/api/v1` is the only mount reading it. This is defect class 8 — a permissive type that
> silently discards data.

**New route: `apps/api/src/routes/auth.ts`** — `POST /api/v1/auth/login`, taking
`{ username, passphrase }`, returning `{ data: { token, expires_at }, error, status }` in the
standard shape. Mount it as `app.use('/api/v1/auth', authRouter)` **above** the
`app.use('/api/v1', requireApiAuth, …)` block in `index.ts` — you cannot present a token in order
to obtain one. Express matches in registration order, so the handler must *respond* rather than
call `next()`; an unmatched path under `/api/v1/auth` then falls through to the gate and 401s,
which is the behaviour you want. Handler stays thin; the work is in `lib/auth/`.

**New operator script: `apps/api/src/scripts/addUser.ts`** → `npm run user:add`. Creates a user
row with a username and a hashed passphrase, or resets an existing one. This is how a climbing
partner is added; there is no signup flow and should not be one.

**New acceptance check: `apps/api/src/scripts/checkAuth.ts`** → `npm run check:auth`, against real
Postgres, following `checkAddLocationApi.ts` as the worked example — obvious row prefix, cleanup
in `finally`, loud if cleanup failed. Note this is a **workspace-level** check: `ci.yml:71-73`
deliberately excludes `apps/api`'s `check:*` scripts because they need a real database, so this one
is run by hand and is not a merge gate. It must assert the three things vitest cannot see:

1. A valid passphrase issues a token, and that token opens a gated route.
2. A wrong passphrase does not, and neither does a tampered token.
3. **A token for user A cannot read user B's locations.** This is the multi-user property that is
   the entire point of the schema change, and no unit test can reach it.

**Honest limits, to be written into the code comments and the docs, not discovered later:**

- **No rate limiting on `/auth/login`.** There is no Redis and no store for counters. scrypt's cost
  plus a fixed delay on failure is the whole defence; passphrase strength is the real control.
- **No token revocation.** There is no session table. Rotating `AUTH_TOKEN_SECRET` invalidates
  every token at once. At five users that is acceptable; say so rather than implying otherwise.
- **CORS is `Access-Control-Allow-Origin: '*'`** (`index.ts:24`). Tighten it to the Mini App origin
  in this phase — cheap, and the reason for the wildcard was a webview.

---

## Phase 2 — The web app stands alone

At the end of this phase the app works in an ordinary browser. The bot is still running and still
untouched.

**Login** — a `/login` route; token in `localStorage`; `authHeaders()` in
`apps/miniapp/src/lib/api.ts` reads it instead of `getWebApp()?.initData`; a 401 from `ApiError`
clears the token and returns to `/login`. Keep the existing narrowing of
`JsonRequestInit['headers']` to a plain object — that guard exists because a `Headers` instance
spreads to `{}` and silently drops auth.

**Back affordance** — the one forbidden design decision, now required. Add `chevron-left` to
`apps/miniapp/src/components/Icons.tsx` (§8 currently forbids it) and a back control in the screen
header. The per-route back-target table in `miniapp-design-v1.md` §2 is still correct and re-homes
onto it unchanged, including `/add` preview → `/add` with search and results intact.

> Extract the target resolution as a **pure** `backTarget(route, tabState)` and unit-test it.
> `vitest.config.ts` is `environment: 'node'` with no DOM, deliberately, and components are checked
> via `renderToStaticMarkup`. Do not add jsdom for this.

**Delete** — `apps/miniapp/src/telegram/` (4 files, 157 lines), `apps/miniapp/src/lib/deepLink.ts`
+ its test (211 lines), the `useTelegramChrome()` call in `App.tsx`, the deep-link boot line in
`main.tsx`, and the synchronous `<script src="https://telegram.org/js/telegram-web-app.js">` in
`index.html`. React Router already serves `/location/:id` directly, so the two-entry history
seating goes with it.

**Geometry** — in `apps/miniapp/src/theme/globals.css` and
`apps/miniapp/src/components/SaveBar.tsx`, swap `--tg-viewport-stable-height` → `100dvh` and
`--tg-safe-area-inset-*` → `env(safe-area-inset-*)`. Both already carry those exact values as
fallbacks, so this is deleting the first argument of each `var()`. Keep `viewport-fit=cover`.

**Theming needs almost nothing.** §1 already fixes the dark palette for all content and
`themeParams` has no reader anywhere. Only the two chrome calls in `useTelegramChrome.ts` are
Telegram-shaped, and they go. Replace with a `<meta name="theme-color">` from
`colors.bgGradientTop`.

**PWA** — `manifest.webmanifest` with `display: standalone`, name, theme/background colours and
icons, linked from `index.html`. This restores the home-screen shell the bot's menu button
provided. **No service worker** — push is parked, and a service worker with nothing to do is a
cache-invalidation bug waiting to happen.

**Leave `refetchOnWindowFocus: false`** in `apps/miniapp/src/lib/queryClient.ts`. Its comment
already gives two reasons; only the first (Telegram webview focus events on keyboard dismissal)
goes stale. The second — *"live scoring costs several seconds and six upstream fetches per detail
screen"* — is the one that actually binds, and there are unexplained Open-Meteo JSON-parse failures
theorised to be rate-limiting on Vercel's shared egress. Delete the Telegram clause, keep the flag
and keep the cost reason.

---

## Phase 3 — Delete Telegram

**Delete outright:**

| Path | Lines |
| --- | --- |
| `apps/api/src/lib/telegram/` — all 14 modules + 12 test files | ~7,013 |
| `apps/api/src/routes/telegramWebhook.ts` | 546 |
| `apps/api/src/scripts/`: `probeTelegramRender`, `checkPanelState`, `checkChatLocations`, `setBotCommands` | ~810 |
| `escapeTelegramHtml` — an edit to `packages/types/src/conditionsCopy.ts:191`, not a file delete | ~12 |
| `panel_states` — schema block + a drop migration | ~51 |

**Edit, don't delete:**

- `index.ts` — drop the webhook mount (lines 18, 41-43).
- `routes/cron.ts` — drop `prunePanelStates` and `panelStatesPruned` (~20 lines). **The
  `/api/cron/check-alerts` schedule stays registered** and `runAlertsCheck` is untouched.
- `lib/alerts/checkAlerts.ts` — delete `notifyPendingAlerts` (~74 lines, plus its mocks in the
  test). **`runAlertsCheck` (~124 lines) stays and has zero Telegram in it.**
- `lib/locations/deleteLocation.ts` — remove `panelStates` from `DEPENDENT_TABLES`.
- `middleware/apiAuth.ts` — delete the `tma` scheme, `initDataAccepted`, and the stale
  paid-plan comment. `apiAuth.test.ts` loses its initData fixtures.
- `.env.example` — drop `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`; add
  `AUTH_TOKEN_SECRET`. Delete the same three in the Vercel dashboard, and delete the bot's webhook
  registration with Telegram so it stops delivering to a 404.

**Keep deliberately:**

- **`weather_alerts` and everything that writes it.** Alert data drives Severe+ score suppression
  in `summarizeReadings` and `GET /api/v1/alerts`. Only *delivery* is being removed.
- **`weather_alerts.notified_at`** — now unused. Keep the column; whatever replaces the bot will
  want exactly that claim mechanism. Document it as dormant so it is not read as live.
- **`fieldLine`** in `packages/types/src/readingsCopy.ts` — used by `LocationCard.tsx`.
- **`placeSubtitle`** in `packages/types/geocodeCopy.ts` — the Mini App's `/add` picker uses it.
- **`push_tokens`** — already dead, unrelated to Telegram, and the obvious home for web push later.

**Rewrite, do not delete: `check:conditions`.** This is the repo's strongest acceptance check
(17/17 against real Postgres and live Open-Meteo, named in `STATE.md`'s baseline) and it currently
runs through `buildConditionsInput` + `formatConditionsReply` — bot code. Re-point it at
`GET /conditions/:locationId`'s own composition, `getHourlySeries` + `toConditionsReadings`, and
keep all three properties it asserts: the readings survive the gather, the window's clock is the
location's own `utc_offset_seconds` (#33), and no 0-1 magnitude leaks out of
`HourlyConditions.diagnostics`. **Deleting this check because its formatter went away would open
the largest verification gap in the project.**

---

## Phase 4 — Docs and rules

Volume is large enough to be its own pass rather than a `/session-end` afterthought.

- **`CLAUDE.md`** — the Mini App/`initData` line, the Telegram env-var block, the Auth Pattern
  rules, `telegram-precision-interface-plan.md` from the mandatory reading list, the stale Vercel
  paid-plan claim.
- **`.claude/rules/architecture.md`** — roughly fifteen Telegram paragraphs (deep links, panel
  state, webhook auth, `InlineKeyboardButton`, the two-id callback check, rich-message rules).
  Anything describing a *shared* invariant (`summarizeReadings`, `toConditionsReadings`, the
  sentinels) stays and loses only its bot half.
- **Delete the `telegram-patterns` skill.** Amend `miniapp-patterns` (Telegram theming, capability
  gating, deep links).
- **`miniapp-design-v1.md`** — amend §1, §2, §8; add the login screen; note §12's preview-in-state
  constraint now has a plain-web reason rather than an inherited one.
- **Mark superseded, do not delete:** `telegram-crossover-v4.md`,
  `.claude/docs/telegram-precision-interface-plan.md`. They are the record of why this existed.
- **`.claude/rules/defect-patterns.md` — leave the Telegram examples in.** It is a catalogue of
  defects that actually shipped, and classes 3, 5 and 11 are still true of code that is staying.
- `STATE.md` rewrite + `session-archive.md` block via `/session-end`.

---

## Verification

Per phase, and none of it is "typecheck passed":

1. `npm run build --workspace=packages/types --workspace=packages/design` first, always.
2. `npm run typecheck && npm run lint && npm run test` — **read the file count, not just the test
   count.** Baseline 1,026 passing (699 api, 260 miniapp, 67 types); miniapp once printed
   "123 passed" having silently shrunk by 44.
3. **Phase 1:** `npm run check:auth` against real Postgres, including the cross-user denial. Then
   `curl` the deployed `POST /api/v1/auth/login` and use the returned token against
   `GET /api/v1/locations` — the real path, not a mock.
4. **Phase 2:** the thing that has never been possible — **open a preview deployment in a real
   browser.** Playwright MCP can now drive the app. Check login, the back affordance on the Hourly
   tab (the acceptance criterion no test here could reach), safe-area padding on a phone-width
   viewport, and Add to Home Screen.
5. **Phase 3:** `npm run check:conditions`, `check:add-location`, `check:delete-trip`,
   `check:weather-runs`, `check:hourly` — all against the real database. Confirm
   `POST /api/cron/check-alerts` still writes `weather_alerts` with delivery removed, and that a
   location with alerts still suppresses its score.
6. `npm run check:hooks` after any `package.json` script changes.
7. **Mutation:** `npm run test:mutation --workspace=apps/api` once after Phase 3. Baseline 67.82%
   against `thresholds.break: 67` — **0.82 of headroom**, and deleting ~9,000 lines of
   well-tested code can move the total in either direction. Check the run; do not assume it passes.
   ~37 minutes.
8. Delivery per `CLAUDE.md`: branch → PR → green CI → squash merge, four times. Wait for the
   `review` check even though it does not block.

---

## Risks and what this plan does not do

- **Partners will not see each other's crags.** `locations.user_id` scopes every list per user, so
  "a few climbing partners" means each of you curating a separate list. If you want a *shared*
  crag list, that is product work — a sharing model or a team concept — and it is **not in this
  plan**. This is the item most likely to surprise the owner; flagged before login works, not
  after.
- **The product has no notification channel** from Phase 3 until a replacement is chosen. NWS
  Severe+ warnings will be collected and visible in the app, and will reach nobody. This follows
  the owner's decision to park alerts; it is stated here so it is not a discovery.
- **The chat surface goes.** `plan.md` records it as *"the priority feature"* and the owner asked
  specifically on 2026-09-02 to add and remove locations from chat. `/add` already does that in the
  Mini App; typing a slash command into a messenger you already have open does not survive.
- **A token in `localStorage` is readable by XSS.** The app renders no user-supplied HTML and,
  once `telegram-web-app.js` goes, loads no third-party script — so the attack surface is smaller
  after this change than before it. Worth stating, not worth cookie gymnastics across two origins.
- **~9,000 lines deleted across the four phases** (measured: 9,002) is the largest change this repo
  has made. Phase 1 is purely additive. Phase 2 removes 368 client lines but nothing the bot needs,
  so it is revertible on its own. **Phase 3 is the irreversible one** — its own PR, its own diff
  read as prose per Gate 0, and the last chance to notice something the bot was quietly carrying.
- Not touched: `apps/mobile` (archived), the scoring v2 line, the parked dataviz phases, CSS or
  motion architecture (still unauthorised), issue #25's product decision.
