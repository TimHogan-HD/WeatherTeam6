# Architecture Rules

Read this at the start of every session. These decisions are final unless explicitly overridden by the user.

## Monorepo Structure
- Turborepo. Two apps: `apps/api`, `apps/mobile`. One shared package: `packages/types`.
- Shared TypeScript types live in `packages/types` only. Never duplicate type definitions across apps.
- `apps/api` imports from `packages/types`. `apps/mobile` imports from `packages/types`.

## Backend Patterns
- Express route handlers are thin. Business logic lives in `src/lib/`, not in route files.
- Weather fetch functions live in `apps/api/src/lib/weather/` — one file per source.
- Scoring logic lives in `apps/api/src/lib/scoring/`.
- BullMQ job definitions live in `apps/api/src/jobs/`.
- Auth middleware lives in `apps/api/src/middleware/auth.ts` — `resolveUser` is the only auth function.
- Route error/validation helpers live in `apps/api/src/lib/http.ts`. Handlers validate `uuid` route params with `isUuid` (return 404, not a Postgres 500) and funnel caught errors through `sendServerError` — never hand-roll `err.message` into the response, which leaks DB internals.

## Auth Pattern
- `AUTH_ENABLED=false` means all requests get `req.userId = DEFAULT_USER_ID` injected by `resolveUser`.
- Route handlers always use `req.userId`. Never reference `DEFAULT_USER_ID` directly in routes.
- Do not build login UI. Do not add Clerk. Do not add sessions.

## Database Rules
- Drizzle schema is the single source of truth. Schema lives in `apps/api/src/db/schema.ts`.
- All migrations via `drizzle-kit`. Never run raw SQL against the DB directly.
- All queries go through Drizzle. No raw `pg` queries unless Drizzle cannot express it.
- `user_id` FK exists on: `locations`, `trips`, `conditions_reports`, `push_tokens`, `premium_pulls`, `user_preferences`. This is intentional even though auth is off.

## API Response Shape
All endpoints return:
```typescript
{ data: T | null, error: string | null, status: number }
```
Never deviate from this shape.

## State Machine: Forecast Window
- `>14 days out`: climatological normals only, no conditions score
- `7-14 days out`: low-confidence ensemble, score shown with low confidence label
- `<7 days out`: full conditions score active, p10/p90 bands shown

## Background Jobs
Four queues, no more:
- `forecast-snapshot` — every 6h
- `rainfall-history` — daily 06:00 UTC
- `alerts-poller` — every 5min
- `snapshot-cleanup` — daily 02:00 UTC

Jobs must be idempotent. A job crashing and rerunning must not create duplicate data.

## Mobile Patterns
- React Query is the agreed state management layer for all server data. No Redux, no Zustand, no Context for server state.
- All API calls go through React Query hooks in `apps/mobile/src/hooks/`. Components never call fetch directly.
- Expo SDK version must not be changed without explicit user approval.
- No hardcoded API base URLs — use environment config via `expo-constants` or similar.

## Mobile Navigation
- Expo Router is the agreed navigation library. Do not use React Navigation or any other router.
- File-based routing under `apps/mobile/app/`. Screens are files, layouts are `_layout.tsx`.
- No imperative navigation outside of Expo Router's `router` API.
