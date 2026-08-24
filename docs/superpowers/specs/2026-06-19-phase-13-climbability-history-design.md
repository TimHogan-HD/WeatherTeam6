# Phase 13 — Historical Climbability Patterns

> ## ⚠️ ARCHIVED — describes the React Native app, which is no longer being built
>
> Direction changed **2026-07-31**: WeatherTeam6 is now a Telegram bot + Telegram Mini App.
> `apps/mobile` is archived and out of the build. This document is retained as a historical
> record of the mobile-era design and **must not be used as a spec for new work**.
>
> Current direction: `docs/handoffs/telegram-crossover-v4.md`. Current roadmap:
> `.claude/docs/plan.md`.


**Date:** 2026-06-19  
**Branch:** `phase/13-history` off `main`

---

## Summary

Phase 13 adds historical climbability patterns to WeatherTeam6. For each climbing location, we accumulate monthly climbable-day counts from 10 years of ACIS gridded precipitation data and display them as a bar chart on the Location Detail screen. The feature answers the question "when is this crag historically in season?" without affecting the live conditions score.

---

## Goals

- Populate `crag_climbability_history` with 10 years of monthly data per climbing location
- Expose monthly averages via `GET /locations/:id/history`
- Display a seasonal bar chart + best-months callout on the Location Detail screen
- Seed MN/WI climbing areas from OpenBeta data so history is pre-populated for local crags

---

## What This Is Not

- Historical climbability data does **not** feed the live conditions score. The score remains driven by recent rainfall, current forecast, wind, temp, and humidity only.
- The `>14 days out` window already shows climatological normals (from `location_normals`). The history chart is a separate display alongside the 7-day forecast — it does not replace or modify the forecast window state machine.

---

## Data Layer

### `fetchGriddedPrecipHistory(lat, lon, fromDate, toDate)`

- **File:** `apps/api/src/lib/weather/acisNormals.ts` (alongside `fetchGriddedNormals`)
- **Endpoint:** ACIS GridData (`data.rcc-acis.org/GridData`), grid ID 1 (NRCC Hi-Res), same as normals
- **Request:** daily `pcpn` element in mm, for the given lat/lon and date range
- **Response:** `{ date: string; precip_mm: number }[]`
- **Sentinel handling:** skip M (missing), T (trace), non-finite values — same logic as `fetchPrecipHistory`
- **Date range:** `fromDate` = 10 years ago from today, `toDate` = yesterday (~3,650 rows per call)
- **No station ID required** — works for all locations with lat/lon

### `computeClimbabilityHistory(rows, rockType)`

- **File:** `apps/api/src/lib/scoring/climbabilityHistory.ts`
- **Pure function** — no DB access, no side effects
- **Input:** `{ date: string; precip_mm: number }[]` + `rockType`
- **Output:** `{ month: number; year: number; climbable_days: number; total_days: number }[]`
- **Logic:** A day is climbable if no rain ≥ 2mm in its drying lookback window (the window ends on that day, inclusive):

```
granite:    1-day window  (max dry time 12h ≈ 1 day)
limestone:  1-day window  (max dry time 24h = 1 day)
basalt:     2-day window  (max dry time 48h = 2 days)
sandstone:  3-day window  (max dry time 72h = 3 days)
unknown:    3-day window  (sandstone-conservative default)
```

- Days with missing precip data are counted in `total_days` but not in `climbable_days`
- Monthly aggregation groups rows by `(year, month)` from the date string

### `ClimbabilityHistory` type

Added to `packages/types/src/index.ts`:

```typescript
export type ClimbabilityHistory = {
  month: number           // 1–12
  avg_climbable_days: number
  years_of_data: number
}
```

---

## Backend Jobs

### Backfill job

The rainfall-history worker gains a new branch: when `job.data?.type === 'backfill'`:

1. Fetch the location row by `job.data.locationId`
2. Compute `fromDate` (10 years ago) and `toDate` (yesterday)
3. Call `fetchGriddedPrecipHistory(lat, lon, fromDate, toDate)`
4. Call `computeClimbabilityHistory(rows, rockType ?? 'unknown')`
5. Upsert all rows into `crag_climbability_history` with `onConflictDoUpdate` on `(location_id, month, year)` — idempotent

Regular daily job behaviour (no `type` field) is unchanged.

### Two backfill triggers

**Trigger 1 — on location save (`POST /locations` route handler):**
- After inserting the location, if `is_climbing_location === true`, call `rainfallHistoryQueue.add('backfill', { type: 'backfill', locationId: row.id })` inside a try/catch
- Redis failure is logged but does not affect the 201 response
- This handles all user-added crags immediately on save

**Trigger 2 — daily job safety net (third pass in `rainfallHistoryWorker`):**
- After the rainfall pass and the normals pass, query for all `is_climbing_location` locations with zero `crag_climbability_history` rows
- For each, dispatch a backfill job to `rainfallHistoryQueue`
- Catches seeded locations on first daily run and any locations that were missed

Both triggers are idempotent — the upsert handles re-runs safely.

### API endpoint

`GET /locations/:id/history` added to `apps/api/src/routes/locations.ts`:

- Validates `id` with `isUuid` (returns 404 on invalid format)
- Queries `crag_climbability_history` for all rows for that location
- Groups by month, computes `AVG(climbable_days)` across all years (simple average of the absolute count), counts distinct years
- Returns 12 rows (one per month) in standard envelope:

```typescript
ApiResponse<ClimbabilityHistory[]>
// { data: [...], error: null, status: 200 }
```

- Returns `data: []` (not 404) when no history rows exist yet — mobile handles the zero-data state

---

## Seed Data

### MN/WI climbing areas

Two-step process:

**Step 1 — import crags from OpenBeta:**
Run `importCrags.ts` with the MN and WI OpenBeta JSON exports. Populates the `crags` reference table with all documented climbing areas in both states (accurate lat/lon, rock type, area name from OpenBeta).

**Step 2 — seed as locations:**
Add a seeding step in `apps/api/src/db/seed.ts` (or a companion script) that reads all MN/WI rows from the `crags` table and upserts them into `locations` with `is_climbing_location: true`. Upsert by name — idempotent on re-run.

No `asos_station` is required — the GridData-based backfill uses lat/lon only.

**Rock type note:** `rhyolite` is not in the enum (`sandstone | limestone | granite | basalt | unknown`). Rhyolite crags (e.g., Shovel Point, Palisade Head) map to `unknown`, which applies the sandstone-conservative 3-day drying window. This is the correct safe default.

The daily job's safety-net pass picks up all seeded locations automatically on first run and queues their backfill jobs.

---

## Mobile

### `useClimbabilityHistory(locationId)`

- **File:** `apps/mobile/src/hooks/useClimbabilityHistory.ts`
- React Query hook for `GET /locations/:id/history`
- `staleTime: 24 * 60 * 60 * 1000` (24h — data changes only on daily job runs)
- Disabled when `locationId` is undefined
- Returns `ClimbabilityHistory[]`

### History section — `apps/mobile/app/location/[id].tsx`

Rendered below the 7-day forecast card. Only shown when `location.is_climbing_location === true`.

**`BestMonthsCallout`:**
- Sorts the 12 months by `avg_climbable_days` descending, takes top 3
- Renders: `"Best months: May · Jun · Sep"`
- Hidden entirely when `data` is empty

**`ClimbabilityChart`:**
- 12 vertical bars, one per month (Jan–Dec left to right)
- Bar height proportional to `avg_climbable_days`, max scale anchored at 31 (max days in any month)
- Current month bar: `colors.good` (lime)
- Other bars: `colors.info` at 60% opacity
- Month abbreviation labels below each bar (`Jan`, `Feb`, etc.)
- Faint horizontal rule at 50% height (14-day mark)
- No numeric axes — values are implicit from bar height

**Zero-data state:**
- When `data` is empty: render a single muted line `"History populating — check back soon."`
- No spinner, no error state

**Source note:**
- Below chart: `"Based on {n} year{s} of rain data"`
- Uses `years_of_data` from the first returned row

### `useHistoricalObservations` — not changed

This stub hook is used by the stat detail sheets (24H history charts for temp, humidity, etc.) and is unrelated to climbability history. It remains a stub — do not conflate or replace it.

---

## Constraints

- No new BullMQ queues — backfill jobs use the existing `rainfall-history` queue
- No changes to the conditions scoring algorithm
- `asos_station` is not required for the backfill — GridData endpoint uses lat/lon
- Backfill jobs run sequentially per location (one ACIS call per job) — no parallel fan-out
- Raw daily rows from the 10-year fetch are never persisted — only monthly aggregates written to `crag_climbability_history`
- `rainfall_history` table is not written to by the backfill

---

## Acceptance Criteria

- [ ] `fetchGriddedPrecipHistory` returns daily precip rows for a 10-year range via ACIS GridData
- [ ] `computeClimbabilityHistory` returns correct monthly counts for known test inputs
- [ ] Backfill job upserts monthly rows into `crag_climbability_history` and is safe to re-run
- [ ] `POST /locations` dispatches a backfill job for climbing locations
- [ ] Daily job safety-net pass queues backfill for any climbing location with zero history
- [ ] `GET /locations/:id/history` returns 12 monthly averages or `[]` if no data
- [ ] `useClimbabilityHistory` hook returns data correctly in mobile
- [ ] Location Detail screen shows chart + best-months callout for climbing locations only
- [ ] Zero-data state renders gracefully
- [ ] MN/WI crags importable via `importCrags.ts` + seeded as locations
- [ ] `npm run typecheck` — zero errors
- [ ] `npm run lint` — zero violations
- [ ] Review checklist passes
