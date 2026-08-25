# Architecture Rules

Read this at the start of every session. These decisions are final unless explicitly overridden by the user.

## Monorepo Structure
- Turborepo. Apps: `apps/api` (live; the add-location API landed 2026-08-25, Task 5a), `apps/miniapp` (planned — Crossover Task 5, not yet scaffolded), `apps/mobile` (archived, still in the workspace until Task 7). Shared packages: `packages/types`, `packages/design`.
- Shared TypeScript types live in `packages/types` only. Never duplicate type definitions across apps.
- Design tokens live in `packages/design` only. Never redefine colors, spacing, or type scale in an app.
- Both shared packages compile to `dist/` and must be built before consuming workspaces typecheck.

## Backend Patterns
- Express route handlers are thin. Business logic lives in `src/lib/`, not in route files.
- Weather fetch functions live in `apps/api/src/lib/weather/` — one file per source.
- Scoring logic lives in `apps/api/src/lib/scoring/` — orchestration in `liveForecast.ts`, pure math in `conditionsScore.ts` / `dryingModel.ts`.
- **There is no `apps/api/src/jobs/`.** It was deleted with BullMQ. Scheduled work is an HTTP route under `/api/cron/*` with its logic in `src/lib/` — see § Background Jobs.
- Telegram helpers live in `apps/api/src/lib/telegram/`; alert fetch/upsert/notify logic in `apps/api/src/lib/alerts/`.
- Auth middleware lives in `apps/api/src/middleware/`. `resolveUser` (`auth.ts`) resolves *who* the caller is; `requireApiAuth` (`apiAuth.ts`) decides *whether* they may call `/api/v1/*` at all.
- **`/api/v1/*` is gated by `requireApiAuth`** — `Authorization: Bearer $API_SHARED_SECRET`, fail-closed if the secret is unset. It exists because `resolveUser` hands every unauthenticated caller `DEFAULT_USER_ID`, i.e. owner rights on a public URL, and Vercel's production alias is not covered by Standard Protection (protecting it needs a paid plan). Do not move the gate to Vercel; do not remove it when Mini App auth lands — `initData` validation is added as a **second accepted scheme on the same `Authorization` header**, not a replacement. `/api/cron/*` (CRON_SECRET) and `/api/telegram/*` (chat.id) keep their own auth and stay outside it.
- The credential must travel in `Authorization`. The CORS layer in `index.ts` allows only `Content-Type, Authorization`, so a custom header fails browser preflight.
- Route error/validation helpers live in `apps/api/src/lib/http.ts`. Handlers validate `uuid` route params with `isUuid` (return 404, not a Postgres 500) and funnel caught errors through `sendServerError` — never hand-roll `err.message` into the response, which leaks DB internals. `sendServerError` logs through `describeError`, which reads only known-safe fields; never widen it to serialise an error object wholesale, because driver errors can carry the connection string.
- **External APIs are proxied, never called from the client.** `GET /api/v1/geocode` (Open-Meteo place search) and `GET /api/v1/radar/frames` follow this: the fetch lives in `src/lib/weather/`, wrapped in the shared `fetchWithRetry`, and the route is a thin pass-through returning `{ data, error, status }`. A client calling a third-party API directly bypasses the retry policy and the response contract both.
- `GET /api/v1/preview?lat=&lon=&elevation=` serves weather for a location that has **no row and no UUID** — the add flow's pre-save step. It runs `computeLiveForecast` over a synthetic `LiveForecastLocation` and **persists nothing**; `location.id` is the placeholder `"preview"`, used only for log lines and synthesized snapshot ids. It deliberately returns no conditions score: nothing has been classified as a climbing location yet.

## Auth Pattern
- `AUTH_ENABLED=false` means all requests get `req.userId = DEFAULT_USER_ID` injected by `resolveUser`.
- Route handlers always use `req.userId`. Never reference `DEFAULT_USER_ID` directly in routes.
- Do not build login UI. Do not add Clerk. Do not add sessions.

## Database Rules
- Drizzle schema is the single source of truth. Schema lives in `apps/api/src/db/schema.ts`.
- All migrations via `drizzle-kit`. Never run raw SQL against the DB directly.
- All queries go through Drizzle. No raw `pg` queries unless Drizzle cannot express it.
- `user_id` FK exists on: `locations`, `trips`, `conditions_reports`, `push_tokens`, `premium_pulls`, `user_preferences`. This is intentional even though auth is off.
- **No FK in the schema declares `onDelete`**, so Postgres refuses to delete any row another table still references. Deletes therefore clear their dependents explicitly, in one transaction: `DELETE /locations/:id` goes through `deleteLocationCascade` (`src/lib/locations/deleteLocation.ts`), which walks `DEPENDENT_TABLES`. **Adding a table with a `location_id` FK means adding it to that list** — omit it and delete becomes a foreign-key violation surfacing as a generic 500, and only once real data exists. Do not "fix" this by adding cascades to the schema without deciding what it means for every other delete.
- **Known gap:** `DELETE /trips/:tripId` has this same problem and has not been fixed — `trip_locations` references `trips`, so deleting a trip that has locations 500s. It is inconsistent with the locations delete on purpose only in the sense that nobody has done it yet.

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

There is no queue infrastructure — no BullMQ, no Redis. The API is a single Express app wrapped as one Vercel serverless function (`apps/api/api/index.ts`), so nothing can run on an in-process schedule.

- `forecast-snapshot` and `rainfall-history` were deleted outright, not converted. Forecast/conditions scoring is computed live, per request, in `apps/api/src/lib/scoring/liveForecast.ts` (`computeLiveForecast`) — called directly from `GET /conditions/:id` and `GET /forecast/:id`. Recent (30-day) rainfall for the drying-time component is also live-fetched per request (ACIS via `fetchPrecipHistory` when the location has an `asos_station`, else Open-Meteo's archive API via `fetchArchivePrecip`) — there is no `rainfall_history`-table job keeping that data warm anymore.
- `alerts-poller` was converted, not deleted: its fetch/upsert/prune logic lives in `apps/api/src/lib/alerts/checkAlerts.ts` (`runAlertsCheck`), invoked by `POST /api/cron/check-alerts` (gated on a `CRON_SECRET` header) on an external schedule (cron-job.org), not a queue.
- `snapshot-cleanup` was deleted — nothing to clean up once there's no snapshot table being written on a schedule.

Any handler that touches the DB across more than one request-scoped operation must still be safe to run concurrently / retry — the "idempotent, no duplicate data" bar from the old job-based world still applies, it's just enforced per-request now instead of per-job-run.

## Client Mandate — Telegram Mini App

**Direction changed 2026-07-31.** WeatherTeam6 was a native-mobile-first app; it is now a **Telegram bot + Telegram Mini App**. `apps/mobile` is being archived (Crossover Task 7) — its code stays in the repo but leaves the build. The old Mobile-First Mandate (never use WebView, `react-native-maps` for every map, native `.tsx` always real) is **superseded** and no longer applies. See `docs/handoffs/telegram-crossover-v4.md`.

- **The Mini App is the client.** `apps/miniapp` (Vite + React, static build) is the real, complete implementation of every user-facing screen. There is no second client to keep in parity.
- **Do not add features to `apps/mobile`.** It is archived. If something there is worth keeping, port it into the Mini App rather than reviving the app.
- **Design tokens come from `packages/design`.** Do not redefine colors, spacing, or type scale in the Mini App. The locked contrast, layout, and copy rules in `docs/handoffs/weatherteam6-ui-handoff-v1.md` §Design System still apply — they are client-agnostic.
- **Telegram theming.** The Mini App reads `themeParams` and must be legible in the user's own Telegram theme. How that reconciles with the locked palette is settled in the Mini App design spec — do not improvise it per-component.
- **No hardcoded mock data in production components.** `MOCK_*` constants, `mockXyz()` functions, and bell-curve approximations are stubs that must be replaced before a feature is complete. Stubs are only acceptable during the phase that explicitly introduces them, and must be wired to real data in that phase or the immediately following one.
- **Auth:** the Mini App authenticates via `Telegram.WebApp.initData` validated server-side by HMAC, as route-level middleware on `/api/v1/*`. The bot token never reaches the client bundle. See the sequencing constraint in `.claude/docs/plan.md` — this must ship together with removing Vercel SSO protection from the API.

## Client Patterns (Mini App)
- **React Query** remains the agreed state management layer for server data. No Redux, no Zustand, no Context for server state.
- All API calls go through React Query hooks. Components never call `fetch` directly — the same rule that applied to `apps/mobile/src/hooks/`, now in `apps/miniapp`.
- No hardcoded API base URLs — use build-time env config (`VITE_API_BASE_URL`).
- Navigation is the Mini App's own routing, integrated with Telegram's `BackButton`. The `startapp` deep-link parameter must be able to land directly on location detail.

## Archived — Mobile Patterns (no longer in force)
Kept for context while `apps/mobile` remains in the repo. Do not apply these to new work.
- React Query hooks in `apps/mobile/src/hooks/`; components never called fetch directly.
- Expo SDK version was not to be changed without explicit approval.
- Expo Router was the agreed navigation library; file-based routing under `apps/mobile/app/`, screens as files, layouts as `_layout.tsx`; no imperative navigation outside the `router` API.
