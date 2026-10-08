# Architecture Rules

These decisions are final unless the user overrides them. Stack, structure and the delivery
gates are in `CLAUDE.md`; domain patterns are in the `miniapp-patterns`, `drizzle-patterns`,
`background-work` and `conditions-score` skills. **The measurements and incidents behind each
rule are in `.claude/docs/session-archive.md` under "architecture.md history (moved
2026-09-30)"** — grep there before arguing with a rule.

## Scoped rule files

Most rules load only when a file they govern is read or edited (`paths:` frontmatter). This
file holds the ones that apply everywhere. **Before planning or reviewing a change, read the
scoped files that govern the paths it touches** — a plan made before opening a file has not
seen them.

- `scoring.md` — Scoring model; State machine: forecast window. How Crag A scores, and what may feed it.
- `readings.md` — Readings on screen; Client contract — constraints on the API. What a reading may say, where it comes from, and what the client may assume of the API.
- `locations.md` — Locations and rock. Saved places, known crags, rock types, the guidebook snapshot and the logbook.
- `weather.md` — Weather fetches and stored runs. Upstream fetches, ensemble statistics, and how runs are stored, read and pruned.
- `trips.md` — Trips. Trip outlooks, recorded trends, editing, and the ended-trip summary.

## Everywhere

- **Every degradation path must withhold, never inflate** (#21, #32, #34). A missing input
  is a gap on screen and a withheld score, never a plausible number. Any change to what a
  surface says starts from *"what does this say when the inputs are missing"*.

## Backend patterns

- Route handlers are thin; business logic lives in `src/lib/` (weather fetches in
  `lib/weather/`, one file per source).
- The credential travels in `Authorization`; CORS allows only `Content-Type, Authorization`.
- Route helpers live in `lib/http.ts`. Validate `uuid` params with `isUuid` (404, not a 500);
  funnel caught errors through `sendServerError`, which logs via `describeError` — never widen
  it to serialise an error object.
- `/api/cron/collect-runs`, `/api/cron/prune-runs` and `/api/cron/record-trips` are gated on `CRON_SECRET` through
  `cronGateFailed`, with `Promise.allSettled` across locations.
- **A client reads an absent column as a gap.** API and client deploy separately, and
  `undefined` passes every `=== null` guard. Normalise with `?? null` where a response becomes
  marks (`hourlySeries.ts`, `toDatum`).

## Operator scripts

- One-off and verification scripts live in `apps/api/src/scripts/`, run with `tsx`, exposed
  as npm scripts. They are the only place `console` is used.
- **Acceptance scripts exist because Vitest never reaches the database.** A flow whose
  failures only appear against real Postgres gets a `check:*` script (`checkAddLocationApi.ts`).
- Such a script must be safe against production: rows under an obvious prefix, cleanup in a
  `finally`, loud about failed cleanup.
- Defer runtime imports of `../db/index.js` inside the entry function; it throws at import
  when `DATABASE_URL` is unset.

## Auth Pattern

- **`/api/v1/*` is gated by `requireApiAuth`** (`middleware/apiAuth.ts`), the only setter of
  `req.userId`: `Session <token>` → the token's subject; `Bearer <API_SHARED_SECRET>` →
  `DEFAULT_USER_ID`. An unset `API_SHARED_SECRET` or `AUTH_TOKEN_SECRET` is a 503. Do not move
  the gate to Vercel. `/api/cron/*` keeps its own `CRON_SECRET` auth.
- **Every location id a caller supplies is checked against `req.userId`** — in the path, in
  a body (`POST /trips`'s `cragIds`, `POST /walls`'s `locationId`), or as the key of a table
  without `user_id` (`crag_climbability_history`, `location_normals`). A 404, never a 403;
  `check:auth` covers it.
- **`createApp` hardens Express:** no `X-Powered-By`, `nosniff`, `frame-ancestors 'none'`,
  `Cache-Control: no-store`, a 32 kB JSON limit, body-parser failures as 400/413 in the
  envelope, and a 25 s per-attempt fetch timeout (`FETCH_TIMEOUT_MS`).
- **A router mounted outside `/api/v1` reads `req.userId` as `undefined`** through a type
  that says it cannot be (defect class 8). Mount inside the gate.
- Route handlers use `req.userId`, never `DEFAULT_USER_ID` — except `isOwner`
  (`lib/auth/invites.ts`), which compares the two: the owner is the account
  `DEFAULT_USER_ID` names, and an unset variable means nobody is.
- **No Clerk and no self-serve signup. The owner chooses every account** (owner decision
  2026-10-06): `npm run user:add`, or an invite link only the owner can mint from Profile
  (`POST /invites`, 403 for anyone else). A link works once and expires in
  `INVITE_TTL_MS` (48 hours, short because an unused link is a bearer credential); the
  code rides in the URL fragment and only its SHA-256 is stored, so the list
  (`GET /invites`, with `joined_as`) can never return one. `DELETE /invites/:id` cancels
  an unused link by deleting it; a used one is kept as the record of who joined. A
  forwarded link shows as an account the owner does not recognise on that list. `POST /api/v1/auth/redeem` is the second route above the gate: it claims the
  invite with a conditional update and creates the user in one transaction, so a taken
  username (409) leaves the link usable and a used, expired or unknown code is one 410.
  Usernames match `USERNAME_PATTERN`. A new passphrase passes `passphraseProblem`
  (`packages/types/account.ts`: length, repeats, the username, common words under digits
  and symbols), shared by redeem, the join screen and `user:add`; login never applies it. `check:invites` runs it against Postgres.
- **Login is capped per username, not per address** (`lib/auth/loginThrottle.ts`,
  owner decision 2026-10-06): `LOGIN_ATTEMPT_LIMIT` (10) attempts per
  `LOGIN_ATTEMPT_WINDOW_MS` (15 min), counted in `login_attempts` under a SHA-256 of the
  username, then a 429 for known and unknown names alike. Each attempt is recorded
  before scrypt, so a parallel burst cannot outrun the count; a success clears it.
  Per address would lock every reader out at once, because the web app reaches the API
  through Vercel's rewrite. **Two honest limits:** anyone who knows a username can keep
  it locked for as long as they keep guessing, and there is no token revocation
  (rotating `AUTH_TOKEN_SECRET` invalidates everything). Do not describe either as
  stronger than it is.
- **The token is not a JWT:** HMAC-SHA256 over a base64url payload, one algorithm.
  `lib/auth/token.ts` is pure and verifies over the raw payload string, never re-serialised
  claims.
- **An unknown username costs the same scrypt derivation as a known one**
  (`dummyPasswordHash`).
- **`POST /api/v1/auth/login` is mounted above the gate and must respond, never `next()`.**
- **CORS is an allowlist** (`lib/cors.ts`, overridden by `CORS_ALLOWED_ORIGINS`). One `*` may
  stand for a single host label, matched against `[a-z0-9-]+`.

## Database rules

- All queries go through Drizzle (`apps/api/src/db/schema.ts` is the source of truth). No raw
  SQL unless Drizzle cannot express it.
- **No FK declares `onDelete`**, so deletes clear dependents explicitly in one transaction.
  `DELETE /locations/:id` goes through `deleteLocationCascade`
  (`src/lib/locations/deleteLocation.ts`), which walks `DEPENDENT_TABLES`. **A new table with
  a `location_id` FK goes on that list.** Do not add cascades to the schema without deciding
  what they mean for every delete.
- **`feedback` is detached, not deleted** — `deleteLocationCascade` sets its `location_id`
  null, because a forecast check is evidence about a place (#143).
- **`DELETE /trips/:tripId` clears `trip_locations` and deletes the trip in one
  transaction** (`check:delete-trip`). A new `trip_id` FK is cleared there too.
- **`weather_alerts.notified_at` is dormant** — null means "never asked".

## Background jobs

Nothing runs on an in-process schedule. Scoring and recent rainfall are computed live per
request; scheduled work is `/api/cron/*` on cron-job.org (`background-work` skill).

- **`/api/cron/check-alerts` collects and never delivers** — there is no notification channel
  (owner's parked decision). Keep it scheduled: Severe+ rows suppress scores. Do not build a
  channel without asking.
- **A per-location loop that calls upstream runs under `Promise.allSettled`, never
  sequentially** — `fetchWithRetry`'s backoff times the number of locations walks into
  `maxDuration: 60`.
- A handler touching the DB across more than one operation must be safe to run concurrently
  and to retry.
