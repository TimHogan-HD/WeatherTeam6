---
name: review-checklist
description: The review checklist for WeatherTeam6. Use once before opening a PR, or when asked to review a diff. Covers Gate 0 (read the diff as prose), TypeScript, architecture drift, external API calls, database and FK-cascade rules, cron idempotency, security, web-app client rules, weather-data surfaces, verification, and the handoff block.
---

# Review Checklist

Run through this once before opening a PR, and fix what fails.

## Gate 0 — read the diff first

Every defect catalogued in `.claude/rules/defect-patterns.md` passed typecheck, lint and the
suite; reading the diff is what caught them.

- [ ] **The actual diff has been read, hunk by hunk, as prose** — not the checklist, not the test output
- [ ] For each hunk: what does it render or do when the input is `null`, `0`, absent, or the network fails?
- [ ] For each "passing" check: what would it actually have caught?
- [ ] **For each test added or changed: which line of the implementation would have to change
      for this to fail?** If you cannot name one, the fixture does not reach it. Then the
      harder version: was this fixture built by the same understanding as the code it checks?
      `npm run test:mutation --workspace=apps/api` answers the first question mechanically —
      but it runs weekly, so here you ask it yourself.

## TypeScript
- [ ] No `any` types anywhere
- [ ] No `as unknown as X` casts unless absolutely necessary and commented
- [ ] All function parameters and return types are explicit
- [ ] `strict: true` in tsconfig — no overrides

## Architecture Drift
- [ ] Route handlers contain no business logic (logic belongs in `src/lib/`)
- [ ] No type definitions duplicated outside `packages/types`
- [ ] `req.userId` used in routes — never `process.env.DEFAULT_USER_ID` directly
- [ ] **A new router is mounted inside `/api/v1`, or brings its own identity.** `requireApiAuth` is the only setter of `req.userId` there, and `req.userId` is typed non-optional `string` — a router mounted outside every setter reads `undefined` with no type error and no test failure, and simply finds nothing (defect class 8)
- [ ] A credential is never logged, echoed in a response, or written to the terminal — including **indirectly**. The hidden passphrase prompt in `user:add` leaked on backspace because readline rewrites `prompt + line-so-far` as one chunk; a guard keyed on the prompt let it through
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
- [ ] New table with a `trip_id` FK? `DELETE /trips/:tripId` clears it too. That endpoint 500'd on **every** trip until 2026-08-26 for exactly this reason — `trip_locations` was never cleared and `POST /trips` requires at least one location
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

## Client (the web app)
- [ ] No direct API calls from components — all fetches go through React Query hooks
- [ ] No hardcoded API base URLs — use build-time env config (`VITE_API_BASE_URL`)
- [ ] Colors/spacing/type come from `packages/design` — not redefined locally
- [ ] `type`, `shadow` and `layout` come from `src/theme/tokens.css.ts`, never straight from `@weatherteam6/design/tokens` — they are React Native shaped, and the RN font family name silently falls back to the system font in CSS
- [ ] No hand-written `--wt6-*` declaration — the `:root` block is generated from the tokens by `src/theme/cssVars.ts`
- [ ] A token property added in `packages/design` has a mapping in the adapter — not a widened type or a silenced throw; RN/CSS defaults differ (flex `column` vs `row`, `border-width` needing `border-style`) and a missing mapping renders wrong rather than failing
- [ ] Vertical spacing comes from tokens, not browser default margins — `globals.css` resets them, and a new text element that needs spacing gets it from the type scale
- [ ] Every `env(safe-area-inset-*)` reference keeps its `0px` fallback, and `index.html` still sets `viewport-fit=cover` — without the latter every inset silently computes to 0 on a notched phone, and without the former CSS drops the whole declaration
- [ ] **A 401 on an authenticated call clears the token; nothing else does.** `apiLogin` is the one unauthenticated call (its 401 is a wrong passphrase, not a dead session) and a 503 means the server has no signing key, so neither may clear. A new call added outside `request()` bypasses this entirely
- [ ] Nothing reintroduces a client-side `expires_at` check — a wrong device clock then discards a token it was just issued and dead-ends on `/login`
- [ ] A new screen behind the gate is wrapped in `RequireAuth`, and a new back affordance goes through `backTarget` rather than calling `navigate('/')` — two of the five targets are not navigations
- [ ] A colour reaching the manifest, `theme-color` or `public/icons/` still comes from the tokens; `npm run check:icons` passes after any palette change
- [ ] Copy follows the locked rules in `docs/handoffs/design-system-v1.md` — no climbing opinions, score is never the headline, imperial units
- [ ] Nothing formats a nullable weather value by hand — the `packages/types` formatters return an em dash, and `null` coerced to `0` renders a plausible `32°F` / `0 mph` instead of a visible gap
- [ ] The readings and the suppression come from `readingsCopy.ts`, not reimplemented — and no surface derives a word from the score, which is what `stateLabel` did and why it is gone
- [ ] `GET /conditions/:id` is not called for a non-climbing location, and no score, breakdown or hours-since-rain renders for one
- [ ] The sources footer is derived from `model_sources` and `asos_station`, and omits a source rather than guessing one — including NWS when the alerts call failed
- [ ] "Today" comes from the server's `is_today` flag, never a date the client derived — and a missing row says so rather than falling back to the first row
- [ ] No route derives its own `todayStr` — `computeLiveForecast` returns the location's local day and every caller uses it
- [ ] A swallowed upstream error does not become a favourable input — an unmeasurable value withholds the score (`scoreUnavailable`) rather than scoring as its best case
- [ ] "The call failed" and "the call returned nothing" are handled separately — a genuine empty result still scores
- [ ] No interactive element is nested inside another (`LocationCard` is a `div` with `role="button"` for exactly this reason)
- [ ] No credential is a build-time value — `API_SHARED_SECRET` and `AUTH_TOKEN_SECRET` never reach the client bundle, and no `VITE_*` variable carries one

## Weather data surfaces

- [ ] A precipitation **total** over more than one hour comes from `precip_mm_mean`, never from summing `precip_mm_p10/p50/p90` — a percentile is not additive, and a summed p50 is the median of nothing. A percentile shown against a multi-hour step describes **one hour** of it, and the surface says so
- [ ] A chance of rain is `members_wet / member_count`, never `precipitation_probability` — and a null wet count or a zero member count **withholds** the figure rather than showing 0%
- [ ] "This model has no data here" is decided on the **values**, not on rows being absent — Open-Meteo pads every model out to the longest horizon in the request, so a model past its own horizon returns real rows full of nulls. `precip_prob_pct` cannot be the evidence either way: that series outlives the model it was requested with
- [ ] Reading-to-text goes through `summarizeReadings` — no surface writes its own mapping, or two screens drift apart on the same crag. A friction **magnitude** never reaches a screen, and the estimate note rides with every friction level
- [ ] A reading is rendered as a label and a value, never as a sentence — a surface composes `ReadingField`s (and `fieldLine` where there is no layout), and no component writes its own label
- [ ] A user-visible source list is derived from what was actually *read*, not what was requested — `model_sources` reports only the models `parseEnsemble` consumes
- [ ] A model added to `ENSEMBLE_MODELS` also has an entry in `ENSEMBLE_MODEL_SUFFIXES` — the key suffix is not derivable from the model name, and a missing entry means the model is fetched and silently ignored
- [ ] A per-day figure a user reads as a forecast (high, low, peak wind) is `ensembleMedian` of per-member daily extremes — **not** a global `Math.max`/`Math.min` across members and hours, which reports the single most extreme member
- [ ] A rain mark covers the hour *before* its timestamp; an instantaneous reading is centred on its timestamp. `Series.tsx` has one helper per convention — do not inherit the other one

## Verification
- [ ] The change was **run**, not just compiled — an external-API call had its response read, a database write was made and read back
- [ ] If the flow can only fail against real Postgres, a `check:*` script under `apps/api/src/scripts/` covers it and was run
- [ ] What was *not* verified is stated explicitly, in the commit or the session notes

## Docs
- [ ] The handoff for the line of work being advanced records what shipped — `weatherteam6-scoring-model-handoff-v1.md`, `miniapp-design-v1.md`, or `miniapp-hourly-dataviz-handoff-v1.md`. A new external API goes in `.claude/docs/api-sources.md`
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
