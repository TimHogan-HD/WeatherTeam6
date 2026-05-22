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

## Database
- [ ] No direct DB mutations outside of Drizzle
- [ ] No migrations written by hand — use `drizzle-kit generate`
- [ ] `user_id` included on inserts to tables that have the FK
- [ ] No N+1 queries — use joins or batch fetches

## Jobs
- [ ] BullMQ jobs are idempotent — safe to re-run without creating duplicates
- [ ] Jobs do not throw unhandled exceptions — errors are caught and logged
- [ ] No new queues added without explicit approval

## Security
- [ ] No secrets logged at any log level
- [ ] No full API response bodies logged in production
- [ ] `.env` not committed — `.env.example` has all keys with blank values
- [ ] R2 presigned URLs used for photo access — no public bucket URLs

## Mobile
- [ ] No direct API calls from components — all fetches go through React Query hooks
- [ ] No hardcoded API base URLs — use environment config
- [ ] Expo SDK version not changed without explicit approval

## General
- [ ] No `console.log` left in committed code — use the logger
- [ ] No commented-out code committed
- [ ] Feature matches the agreed spec — no scope added silently
