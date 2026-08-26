# Review Checklist

Run through this before every commit. Flag any failures before proceeding.

## Gate 0 — read the diff (do this first, and do not skip it)

- [ ] **The actual diff has been read, hunk by hunk, as prose** — not the checklist, not the test output
- [ ] `.claude/rules/defect-patterns.md` was read before that review
- [ ] For each hunk: what does it render or do when the input is `null`, `0`, absent, or the network fails?
- [ ] For each "passing" check: what would it actually have caught?

> **This gate is first because it is the only one that has ever worked.** On 2026-08-26 a
> single session found **ten defects** in code that had already passed typecheck, lint and
> the full suite — three live in production, one meaning the bot's `/start` had never once
> worked. An earlier session found six the same way. Every automated gate below was green
> for all of them.

## TypeScript
- [ ] No `any` types anywhere
- [ ] No `as unknown as X` casts unless absolutely necessary and commented
- [ ] All function parameters and return types are explicit
- [ ] `strict: true` in tsconfig — no overrides

## Architecture Drift
- [ ] Route handlers contain no business logic (logic belongs in `src/lib/`)
- [ ] No type definitions duplicated outside `packages/types`
- [ ] `req.userId` used in routes — never `process.env.DEFAULT_USER_ID` directly
- [ ] API response shape is `{ data, error, status }` — no exceptions
- [ ] No raw SQL queries unless Drizzle cannot express it (comment why if used)

## External API Calls
- [ ] Every fetch is wrapped in try/catch
- [ ] Exponential backoff retry on 429 and 5xx
- [ ] No API keys or secrets in source code
- [ ] NWS calls include `User-Agent` header
- [ ] IEM ASOS obs checked for staleness (reject if >90 min old)
- [ ] Array fields are element-validated (non-finite/sentinel → null), and index alignment between parallel arrays (e.g. `time[]` vs value arrays) is preserved — never `.filter()` a parallel axis

## Database
- [ ] No direct DB mutations outside of Drizzle
- [ ] No migrations written by hand — use `drizzle-kit generate`
- [ ] `user_id` included on inserts to tables that have the FK
- [ ] New table with a `location_id` FK? It is added to `DEPENDENT_TABLES` in `lib/locations/deleteLocation.ts` — no FK declares `onDelete`, so a missing entry turns `DELETE /locations/:id` into a 500 that only appears once real data exists
- [ ] No N+1 queries — use joins or batch fetches
- [ ] Route params feeding `uuid`/typed columns are validated (`isUuid`) before the query — an unvalidated id is a leaked-error 500, not a 404

## Cron / on-demand compute
- [ ] No BullMQ/Redis reintroduced — background work is either computed live per-request (`liveForecast.ts`) or an HTTP endpoint on an external schedule (`/api/cron/check-alerts`), never a queue
- [ ] `/api/cron/*` endpoints are idempotent — safe to call twice without creating duplicates or double-sending notifications
- [ ] Purge-and-replace across multiple statements is wrapped in a single `db.transaction` — a crash leaves the old or new set, never a gap or a mix
- [ ] Handlers don't throw unhandled exceptions — errors are caught and logged

## Security
- [ ] No secrets logged at any log level
- [ ] No full API response bodies logged in production
- [ ] 500 handlers return a generic message via `sendServerError` — never raw `err.message` (it leaks DB internals); log the detail server-side
- [ ] `.env` not committed — `.env.example` has all keys with blank values
- [ ] R2 presigned URLs used for photo access — no public bucket URLs

## Client (Mini App)
- [ ] No direct API calls from components — all fetches go through React Query hooks
- [ ] No hardcoded API base URLs — use build-time env config (`VITE_API_BASE_URL`)
- [ ] Colors/spacing/type come from `packages/design` — not redefined locally
- [ ] `type`, `shadow` and `layout` come from `src/theme/tokens.css.ts`, never straight from `@weatherteam6/design/tokens` — they are React Native shaped, and the RN font family name silently falls back to the system font in CSS
- [ ] No hand-written `--wt6-*` declaration — the `:root` block is generated from the tokens by `src/theme/cssVars.ts`
- [ ] A token property added in `packages/design` has a mapping in the adapter — not a widened type or a silenced throw; RN/CSS defaults differ (flex `column` vs `row`, `border-width` needing `border-style`) and a missing mapping renders wrong rather than failing
- [ ] Vertical spacing comes from tokens, not browser default margins — `globals.css` resets them, and a new text element that needs spacing gets it from the type scale
- [ ] Every `--tg-*` var reference has a fallback (`var(--tg-safe-area-inset-top, 0px)`) — CSS drops the whole declaration when a `var()` resolves to nothing
- [ ] The screen still renders with `getWebApp()` returning `null` — a plain browser, or `telegram-web-app.js` failing to load
- [ ] Each Telegram API call is gated at its own version floor, not a shared one
- [ ] Copy follows the locked rules in `docs/handoffs/weatherteam6-ui-handoff-v1.md` §Design System — no climbing opinions, score is never the headline, imperial units
- [ ] Nothing formats a nullable weather value by hand — the `packages/types` formatters return an em dash, and `null` coerced to `0` renders a plausible `32°F` / `0 mph` instead of a visible gap
- [ ] The state label and suppression come from `conditionsCopy.ts`, not reimplemented — and no "degradation guard" has been added to the suppression rule
- [ ] `GET /conditions/:id` is not called for a non-climbing location, and no score, breakdown or hours-since-rain renders for one
- [ ] The sources footer is derived from `model_sources` and `asos_station`, and omits a source rather than guessing one — including NWS when the alerts call failed
- [ ] "Today" is matched against the API's UTC day, and a missing row says so rather than falling back to the first row
- [ ] No interactive element is nested inside another (`LocationCard` is a `div` with `role="button"` for exactly this reason)
- [ ] `TELEGRAM_BOT_TOKEN` never reaches the client bundle — `initData` is validated server-side
- [ ] A deep-link parameter is validated and never repaired — `loc_<uuid>` with dashes intact, anything else lands on `/` silently and renders no error
- [ ] Deep-link history is seated before React mounts, `/` then `/location/:id` — not in an effect, and not detail alone (the platform back gesture would close the app)
- [ ] No new features added to `apps/mobile` — it is archived and out of the build. It leaves the build through its own `package.json` scripts; a `turbo.json` override cannot silence a script that exists

## Telegram surfaces
- [ ] Any text interpolated into a `parse_mode: 'HTML'` message is escaped with `escapeTelegramHtml` — NWS headlines and user-entered location names routinely contain `&`, and a malformed message is a non-retryable 400 the webhook swallows
- [ ] **A string literal in the source counts too.** `/start` and the usage reply both shipped containing `<location name>`, which Telegram rejects as an unsupported start tag — neither had ever been delivered
- [ ] Score-to-text goes through `summarizeConditions` — no surface writes its own mapping, or the bot and the Mini App drift apart
- [ ] Webhook auth does not rely solely on request-body fields
- [ ] An inline keyboard deep link is a `url` button, not `web_app` — `web_app` never delivers `start_param`
- [ ] A button that cannot be built correctly is omitted, not approximated — a malformed url is a non-retryable 400 that costs the whole message

## Verification
- [ ] The change was **run**, not just compiled — an external-API call had its response read, a database write was made and read back
- [ ] If the flow can only fail against real Postgres, a `check:*` script under `apps/api/src/scripts/` covers it and was run
- [ ] What was *not* verified is stated explicitly, in the commit or the session notes

## Docs
- [ ] A completed task is marked complete in **both** `docs/handoffs/telegram-crossover-v4.md` and `.claude/docs/plan.md`
- [ ] New endpoint added to the inventory in `docs/handoffs/weatherteam6-miniapp-handoff-v1.md`; new external API added to `.claude/docs/api-sources.md`
- [ ] No doc still describes the shipped thing as missing, planned, or "does not exist yet" — a stale rule misdirects the next agent more than a missing one does
- [ ] A new invariant future work must uphold is written into `.claude/rules/architecture.md`, not just the session notes

## Reporting
- [ ] The report ends with a **handoff block**: does the user need to do anything (yes/no, in bold, first), and the single next step — see CLAUDE.md § Reporting Work. Applies to recaps, summaries and PR bodies alike
- [ ] "Yes" names only things the user alone can do — a credential, a dashboard setting, a phone, a product decision. Unstarted work is a next step, not a user action
- [ ] What was **not** verified is stated without being asked

## General
- [ ] No `console.log` left in committed code — use the logger (`src/scripts/` is the documented exception)
- [ ] No commented-out code committed
- [ ] Feature matches the agreed spec — no scope added silently
