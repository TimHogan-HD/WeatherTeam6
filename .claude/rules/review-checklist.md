# Review Checklist

Run through this before every commit. Flag any failures before proceeding.

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
- [ ] Copy follows the locked rules in `docs/handoffs/weatherteam6-ui-handoff-v1.md` §Design System — no climbing opinions, score is never the headline, imperial units
- [ ] `TELEGRAM_BOT_TOKEN` never reaches the client bundle — `initData` is validated server-side
- [ ] No new features added to `apps/mobile` — it is archived

## Telegram surfaces
- [ ] Any text interpolated into a `parse_mode: 'HTML'` message is escaped (`&`, `<`, `>`) — NWS headlines and user-entered location names routinely contain them, and a malformed message is a non-retryable 400
- [ ] Webhook auth does not rely solely on request-body fields

## General
- [ ] No `console.log` left in committed code — use the logger
- [ ] No commented-out code committed
- [ ] Feature matches the agreed spec — no scope added silently
