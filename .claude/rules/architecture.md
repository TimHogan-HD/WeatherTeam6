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
- `auth.md` — Auth. Tokens, accounts and invites, the login cap, CORS, Express hardening.

## Everywhere

- **Every degradation path must withhold, never inflate** (#21, #32, #34). A missing input
  is a gap on screen and a withheld score, never a plausible number. Any change to what a
  surface says starts from *"what does this say when the inputs are missing"*.
- **External APIs are proxied, never called from the client** — the fetch lives in
  `src/lib/weather/`, wrapped in `fetchWithRetry`, behind a thin route returning
  `{ data, error, status }` (`/geocode`, `/geocode/reverse`, `/radar/latest`).
- **Map tiles are the one exception** (owner decision 2026-10-02, Map tab).
  Public, keyless basemap tiles, glyphs and sprites (OpenFreeMap, `tiles.openfreemap.org`)
  and terrain tiles (AWS Open Data Terrarium, `s3.amazonaws.com`) load straight from the
  client; nothing but the viewport goes to them. **Radar tiles joined the exception**
  (owner decision 2026-10-26): IEM's keyless NEXRAD tiles (`mesonet.agron.iastate.edu`)
  load the same way, but the frame's time — data, not a tile — comes through the API
  (`/radar/latest`) and the tiles are requested for that time. `apps/miniapp/vercel.json`'s
  CSP names exactly those three hosts in `connect-src`, plus `blob:` for the map's workers
  and images. Any data source that is not a map tile still goes through the API.

## Backend patterns

- Route handlers are thin; business logic lives in `src/lib/` (weather fetches in
  `lib/weather/`, one file per source).
- The credential travels in `Authorization`; CORS allows only `Content-Type, Authorization`.
- Route helpers live in `lib/http.ts`. Validate `uuid` params with `isUuid` (404, not a 500);
  funnel caught errors through `sendServerError`, which logs via `describeError` — never widen
  it to serialise an error object.
- `/api/cron/collect-runs`, `/api/cron/prune-runs`, `/api/cron/record-trips` and `/api/cron/collect-radar` are gated on `CRON_SECRET` through
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

The detail (tokens, invites, the login cap, CORS, how `createApp` hardens Express) is in
`auth.md`. What every route has to know:

- **`requireApiAuth` (`middleware/apiAuth.ts`) gates `/api/v1/*` and is the only setter of
  `req.userId`.** Route handlers use `req.userId`, never `DEFAULT_USER_ID`. `/api/cron/*`
  keeps its own `CRON_SECRET` auth.
- **Every location id a caller supplies is checked against `req.userId`** — in the path, in
  a body (`POST /trips`'s `cragIds`, `POST /walls`'s `locationId`), or as the key of a table
  without `user_id` (`GET /alerts/:locationId` over `weather_alerts`). A 404, never a 403;
  `check:auth` covers it.
- **A router mounted outside `/api/v1` reads `req.userId` as `undefined`** through a type
  that says it cannot be (defect class 8). Mount inside the gate.

## Database rules

- All queries go through Drizzle (`apps/api/src/db/schema.ts` is the source of truth). No raw
  SQL unless Drizzle cannot express it.
- **No FK declares `onDelete`**, so deletes clear dependents explicitly in one transaction.
  `DELETE /locations/:id` goes through `deleteLocationCascade`
  (`src/lib/locations/deleteLocation.ts`), which walks `DEPENDENT_TABLES`. **A new table with
  a `location_id` FK goes on that list** (or on `DETACHED_TABLES`, as `feedback` is);
  `deleteLocation.test.ts` fails on any FK to `locations` that is on neither. Do not add cascades to the schema without deciding
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
  (owner's parked decision). Keep it scheduled: the stored rows are the warnings every crag
  screen shows. **No alert withholds a score** (owner, 2026-10-29): a warning sits beside the
  number until the app has an alert and warning system deep enough to justify hiding one.
  Do not build a channel, or bring suppression back, without asking.
- **A per-location loop that calls upstream runs under `Promise.allSettled`, never
  sequentially** — `fetchWithRetry`'s backoff times the number of locations walks into
  `maxDuration: 60`.
- A handler touching the DB across more than one operation must be safe to run concurrently
  and to retry.
