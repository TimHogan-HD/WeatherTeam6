# Phase 13 — Historical Climbability Patterns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate monthly climbable-day history per climbing location from 10 years of ACIS gridded precip data, expose it via `GET /locations/:id/history`, and display a seasonal bar chart on the Location Detail screen.

**Architecture:** A pure `computeClimbabilityHistory()` function converts raw daily precip rows into monthly climbable-day counts. A backfill job branch in the `rainfall-history` worker fetches 10 years of ACIS GridData (lat/lon-based, no ASOS station required) on demand and stores monthly aggregates into `crag_climbability_history`. Two triggers fire the backfill: `POST /locations` (for user-added crags) and a daily safety-net pass in the rainfall-history job (for seeded locations). The mobile Location Detail screen adds a bar chart and best-months callout powered by a new `useClimbabilityHistory` hook.

**Tech Stack:** Node.js + TypeScript + Express, Drizzle ORM, BullMQ, React Native + Expo, React Query, Vitest, ACIS GridData API.

## Global Constraints

- TypeScript strict mode everywhere — no `any`, no `as unknown as X`
- All API responses: `{ data: T | null, error: string | null, status: number }`
- No new BullMQ queues — backfill uses the existing `rainfall-history` queue
- Route params validated with `isUuid` before any DB query
- All caught errors funneled through `sendServerError` — never raw `err.message` in response
- No `console.log` — use the pino `logger`
- No `req.userId` shortcuts — always use `resolveUser` middleware
- `npm run typecheck` and `npm run lint` must pass at each commit
- Test framework: Vitest (`npm run test --workspace=apps/api`)
- Branch: `phase/13-history` off `main`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `packages/types/src/index.ts` | Modify | Add `ClimbabilityHistory` type |
| `apps/api/src/lib/scoring/climbabilityHistory.ts` | Create | Pure function: daily precip rows → monthly counts |
| `apps/api/src/lib/scoring/climbabilityHistory.test.ts` | Create | Vitest unit tests |
| `apps/api/src/lib/weather/acisNormals.ts` | Modify | Add `fetchGriddedPrecipHistory()` |
| `apps/api/src/jobs/workers/rainfallHistory.ts` | Modify | Backfill job branch + daily safety-net pass |
| `apps/api/src/routes/locations.ts` | Modify | `GET /locations/:id/history` + queue dispatch on `POST /locations` |
| `apps/api/src/db/seed.ts` | Modify | Seed MN/WI crags as locations |
| `apps/mobile/src/hooks/useClimbabilityHistory.ts` | Create | React Query hook |
| `apps/mobile/src/components/history/BestMonthsCallout.tsx` | Create | Top-3 months callout |
| `apps/mobile/src/components/history/ClimbabilityChart.tsx` | Create | 12-bar seasonal chart |
| `apps/mobile/app/location/[id].tsx` | Modify | Wire history section |

---

## Task 1: `ClimbabilityHistory` shared type

**Files:**
- Modify: `packages/types/src/index.ts`

**Interfaces:**
- Produces: `ClimbabilityHistory` — consumed by Tasks 5, 7, 8, 9

- [ ] **Step 1: Add the type**

Open `packages/types/src/index.ts` and append at the bottom of the exports:

```typescript
export type ClimbabilityHistory = {
  month: number            // 1–12
  avg_climbable_days: number
  years_of_data: number
}
```

- [ ] **Step 2: Build shared packages**

```bash
npm run build --workspace=packages/types
```

Expected: exits 0, no errors.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck --workspace=packages/types
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): add ClimbabilityHistory type"
```

---

## Task 2: `computeClimbabilityHistory` pure function (TDD)

**Files:**
- Create: `apps/api/src/lib/scoring/climbabilityHistory.ts`
- Create: `apps/api/src/lib/scoring/climbabilityHistory.test.ts`

**Interfaces:**
- Produces:
  - `DailyPrecip` type
  - `MonthlyClimbability` type
  - `computeClimbabilityHistory(rows: DailyPrecip[], rockType: string | null): MonthlyClimbability[]`
- Consumed by: Task 4 (backfill worker)

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/lib/scoring/climbabilityHistory.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeClimbabilityHistory, type DailyPrecip } from './climbabilityHistory.js'

describe('computeClimbabilityHistory', () => {
  it('returns empty array for empty input', () => {
    expect(computeClimbabilityHistory([], 'granite')).toEqual([])
  })

  it('counts all days climbable when no rain', () => {
    const rows: DailyPrecip[] = [
      { date: '2024-06-01', precip_mm: 0 },
      { date: '2024-06-02', precip_mm: 0 },
      { date: '2024-06-03', precip_mm: 0 },
    ]
    const result = computeClimbabilityHistory(rows, 'granite')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ month: 6, year: 2024, climbable_days: 3, total_days: 3 })
  })

  it('granite: blocks only 1 day after rain', () => {
    // Rain on day 1 (>=2mm): day 1 and day 2 not climbable (1-day lookback window)
    // Day 3 is climbable (no rain in its 1-day window = just day 3 itself)
    const rows: DailyPrecip[] = [
      { date: '2024-06-01', precip_mm: 5 },  // rained
      { date: '2024-06-02', precip_mm: 0 },  // within 1-day window of rain → not climbable
      { date: '2024-06-03', precip_mm: 0 },  // clean → climbable
    ]
    const result = computeClimbabilityHistory(rows, 'granite')
    expect(result[0]).toMatchObject({ climbable_days: 1, total_days: 3 })
  })

  it('sandstone: blocks 3 days after rain', () => {
    // Rain on day 1: days 1, 2, 3 blocked; day 4 is climbable
    const rows: DailyPrecip[] = [
      { date: '2024-06-01', precip_mm: 5 },
      { date: '2024-06-02', precip_mm: 0 },
      { date: '2024-06-03', precip_mm: 0 },
      { date: '2024-06-04', precip_mm: 0 },
    ]
    const result = computeClimbabilityHistory(rows, 'sandstone')
    expect(result[0]).toMatchObject({ climbable_days: 1, total_days: 4 })
  })

  it('unknown rock type uses 3-day window (sandstone default)', () => {
    const rows: DailyPrecip[] = [
      { date: '2024-06-01', precip_mm: 5 },
      { date: '2024-06-02', precip_mm: 0 },
      { date: '2024-06-03', precip_mm: 0 },
      { date: '2024-06-04', precip_mm: 0 },
    ]
    const result = computeClimbabilityHistory(rows, null)
    expect(result[0]).toMatchObject({ climbable_days: 1, total_days: 4 })
  })

  it('trace rain (<2mm) does not block climbability', () => {
    const rows: DailyPrecip[] = [
      { date: '2024-06-01', precip_mm: 1.5 },
      { date: '2024-06-02', precip_mm: 0 },
    ]
    const result = computeClimbabilityHistory(rows, 'sandstone')
    expect(result[0]).toMatchObject({ climbable_days: 2, total_days: 2 })
  })

  it('groups rows into correct month/year buckets', () => {
    const rows: DailyPrecip[] = [
      { date: '2024-05-31', precip_mm: 0 },
      { date: '2024-06-01', precip_mm: 0 },
    ]
    const result = computeClimbabilityHistory(rows, 'granite')
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ month: 5, year: 2024 })
    expect(result[1]).toMatchObject({ month: 6, year: 2024 })
  })

  it('results sorted by year then month ascending', () => {
    const rows: DailyPrecip[] = [
      { date: '2023-12-01', precip_mm: 0 },
      { date: '2024-01-01', precip_mm: 0 },
    ]
    const result = computeClimbabilityHistory(rows, 'granite')
    expect(result[0]).toMatchObject({ year: 2023, month: 12 })
    expect(result[1]).toMatchObject({ year: 2024, month: 1 })
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm run test --workspace=apps/api -- --reporter=verbose climbabilityHistory
```

Expected: all tests FAIL with "cannot find module" or similar.

- [ ] **Step 3: Implement the function**

Create `apps/api/src/lib/scoring/climbabilityHistory.ts`:

```typescript
export type DailyPrecip = {
  date: string       // YYYY-MM-DD
  precip_mm: number
}

export type MonthlyClimbability = {
  month: number
  year: number
  climbable_days: number
  total_days: number
}

const LOOKBACK_DAYS: Record<string, number> = {
  granite: 1,
  limestone: 1,
  basalt: 2,
  sandstone: 3,
  unknown: 3,
}

export function computeClimbabilityHistory(
  rows: DailyPrecip[],
  rockType: string | null,
): MonthlyClimbability[] {
  if (rows.length === 0) return []

  const lookback = LOOKBACK_DAYS[rockType ?? 'unknown'] ?? 3

  const precipByDate = new Map<string, number>()
  for (const row of rows) {
    precipByDate.set(row.date, row.precip_mm)
  }

  const monthly = new Map<string, MonthlyClimbability>()

  for (const row of rows) {
    const year = parseInt(row.date.slice(0, 4), 10)
    const month = parseInt(row.date.slice(5, 7), 10)
    const key = `${year}-${month}`

    if (!monthly.has(key)) {
      monthly.set(key, { month, year, climbable_days: 0, total_days: 0 })
    }
    const entry = monthly.get(key)!
    entry.total_days++

    let climbable = true
    for (let d = 0; d < lookback; d++) {
      const checkDate = offsetDate(row.date, -d)
      const precip = precipByDate.get(checkDate)
      if (precip !== undefined && precip >= 2) {
        climbable = false
        break
      }
    }
    if (climbable) entry.climbable_days++
  }

  return Array.from(monthly.values()).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month,
  )
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm run test --workspace=apps/api -- --reporter=verbose climbabilityHistory
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/scoring/climbabilityHistory.ts apps/api/src/lib/scoring/climbabilityHistory.test.ts
git commit -m "feat(scoring): add computeClimbabilityHistory pure function"
```

---

## Task 3: `fetchGriddedPrecipHistory` ACIS function

**Files:**
- Modify: `apps/api/src/lib/weather/acisNormals.ts`

**Interfaces:**
- Produces: `fetchGriddedPrecipHistory(lat: number, lon: number, fromDate: string, toDate: string): Promise<DailyPrecip[]>`
- Consumes: `DailyPrecip` from Task 2 (`import type { DailyPrecip } from '../scoring/climbabilityHistory.js'`)
- Consumed by: Task 4 (backfill worker)

- [ ] **Step 1: Add the import and new types to `acisNormals.ts`**

At the top of `apps/api/src/lib/weather/acisNormals.ts`, add this import after the existing imports:

```typescript
import type { DailyPrecip } from '../scoring/climbabilityHistory.js'
```

Then add a new internal type for the daily GridData response (add after the existing `AcisGridRow` type at the top of the file):

```typescript
type AcisGridDailyRow = [string, number | string]
type AcisGridDailyResponse = {
  data?: AcisGridDailyRow[]
  error?: string
}
```

- [ ] **Step 2: Add `fetchGriddedPrecipHistory` at the bottom of `acisNormals.ts`**

Append after the last function in the file:

```typescript
export async function fetchGriddedPrecipHistory(
  lat: number,
  lon: number,
  fromDate: string,
  toDate: string,
): Promise<DailyPrecip[]> {
  const body = {
    grid: GRID_ID,
    sdate: fromDate,
    edate: toDate,
    elems: [{ name: 'pcpn', units: 'mm' }],
    loc: `${lon},${lat}`,
  }

  logger.debug({ lat, lon, fromDate, toDate }, '[acisNormals] fetching daily precip history')

  let lastErr: Error = new Error('no attempts made')
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(ACIS_GRID_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const parsed = (await res.json()) as AcisGridDailyResponse
        if (parsed.error) throw new Error(`ACIS GridData error: ${parsed.error}`)

        const rows = parsed.data ?? []
        const out: DailyPrecip[] = []
        for (const row of rows) {
          const [date, value] = row
          if (typeof date !== 'string') continue
          if (typeof value === 'string') {
            const trimmed = value.trim()
            if (trimmed === 'M' || trimmed === 'T' || trimmed === '') continue
            const n = parseFloat(trimmed)
            if (!isFinite(n) || n === ACIS_MISSING) continue
            out.push({ date, precip_mm: n })
          } else if (typeof value === 'number' && isFinite(value) && value !== ACIS_MISSING) {
            out.push({ date, precip_mm: value })
          }
        }
        return out
      }

      if (res.status !== 429 && res.status < 500) {
        throw new Error(`ACIS GridData returned ${res.status}`)
      }
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      if (lastErr.message.startsWith('ACIS GridData')) throw lastErr
    }
    if (attempt < 3) {
      await new Promise<void>((r) => setTimeout(r, Math.pow(2, attempt) * 1000))
    }
  }
  throw lastErr
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/weather/acisNormals.ts
git commit -m "feat(weather): add fetchGriddedPrecipHistory for 10-year ACIS daily precip"
```

---

## Task 4: Backfill worker branch + daily safety-net

**Files:**
- Modify: `apps/api/src/jobs/workers/rainfallHistory.ts`

**Interfaces:**
- Consumes:
  - `fetchGriddedPrecipHistory(lat, lon, fromDate, toDate)` from Task 3
  - `computeClimbabilityHistory(rows, rockType)` from Task 2
  - `cragClimbabilityHistory` table from `../../db/schema.js`
  - `rainfallHistoryQueue` from `../queues.js`

- [ ] **Step 1: Add new imports to `rainfallHistory.ts`**

At the top of `apps/api/src/jobs/workers/rainfallHistory.ts`, add to the existing imports:

```typescript
import { eq, notInArray, sql } from 'drizzle-orm'
import { cragClimbabilityHistory } from '../../db/schema.js'
import { fetchGriddedPrecipHistory } from '../../lib/weather/acisNormals.js'
import { computeClimbabilityHistory } from '../../lib/scoring/climbabilityHistory.js'
import { rainfallHistoryQueue } from '../queues.js'
```

Note: check the existing import from `drizzle-orm` and merge — don't duplicate the `sql` import if it already exists.

- [ ] **Step 2: Add the backfill helper function**

Add this function at the top of the file (before `rainfallHistoryWorker`):

```typescript
async function runBackfill(locationId: string): Promise<void> {
  const locationRows = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1)
  const loc = locationRows[0]
  if (!loc) {
    logger.warn({ locationId }, '[rainfall-history] backfill: location not found')
    return
  }

  const now = new Date()
  const toDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const tenYearsAgo = new Date(now)
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10)
  const fromDate = tenYearsAgo.toISOString().slice(0, 10)

  const lat = parseFloat(loc.lat)
  const lon = parseFloat(loc.lon)

  logger.info({ locationId, lat, lon, fromDate, toDate }, '[rainfall-history] backfill: fetching 10yr precip')

  const dailyRows = await fetchGriddedPrecipHistory(lat, lon, fromDate, toDate)
  const monthly = computeClimbabilityHistory(dailyRows, loc.rock_type)

  if (monthly.length === 0) {
    logger.warn({ locationId }, '[rainfall-history] backfill: no monthly data computed')
    return
  }

  await db
    .insert(cragClimbabilityHistory)
    .values(
      monthly.map((m) => ({
        location_id: locationId,
        month: m.month,
        year: m.year,
        climbable_days: m.climbable_days,
        total_days: m.total_days,
      })),
    )
    .onConflictDoUpdate({
      target: [cragClimbabilityHistory.location_id, cragClimbabilityHistory.month, cragClimbabilityHistory.year],
      set: {
        climbable_days: sql`excluded.climbable_days`,
        total_days: sql`excluded.total_days`,
      },
    })

  logger.info({ locationId, monthCount: monthly.length }, '[rainfall-history] backfill: complete')
}
```

- [ ] **Step 3: Update the worker to branch on job type**

Find the worker's `async (_job: Job)` signature and change it to handle both job types. The worker currently starts with:

```typescript
export const rainfallHistoryWorker = new Worker(
  'rainfall-history',
  async (_job: Job) => {
    logger.info('[rainfall-history] job started')
    // ... daily batch logic
  },
```

Replace the `async (_job: Job) => {` line and its opening log with:

```typescript
  async (job: Job) => {
    // Backfill branch: targeted single-location history population
    if (job.data?.type === 'backfill') {
      const { locationId } = job.data as { type: 'backfill'; locationId: string }
      logger.info({ locationId }, '[rainfall-history] backfill job started')
      await runBackfill(locationId)
      return
    }

    logger.info('[rainfall-history] job started')
    // ... rest of existing daily batch logic unchanged
```

- [ ] **Step 4: Add the safety-net pass at the end of the daily job**

Find the end of the daily job body (after the normals loop and before the `if (errors.length > 0)` throw), and add:

```typescript
    // Safety-net: dispatch backfill for any climbing location with no history yet.
    // Catches seeded locations on first run and any locations missed by the on-save trigger.
    const locationsWithHistory = await db
      .selectDistinct({ location_id: cragClimbabilityHistory.location_id })
      .from(cragClimbabilityHistory)

    const withHistorySet = new Set(locationsWithHistory.map((r) => r.location_id))
    const needsBackfill = allLocations.filter(
      (loc) => loc.is_climbing_location && !withHistorySet.has(loc.id),
    )

    for (const loc of needsBackfill) {
      await rainfallHistoryQueue.add('backfill', { type: 'backfill', locationId: loc.id })
      logger.info({ locationId: loc.id }, '[rainfall-history] queued backfill for location without history')
    }
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/jobs/workers/rainfallHistory.ts
git commit -m "feat(jobs): add climbability history backfill — on-demand branch + daily safety-net"
```

---

## Task 5: `GET /locations/:id/history` endpoint + `POST /locations` queue dispatch

**Files:**
- Modify: `apps/api/src/routes/locations.ts`

**Interfaces:**
- Consumes:
  - `ClimbabilityHistory` type from `@weatherteam6/types`
  - `cragClimbabilityHistory` table from `../db/schema.js`
  - `rainfallHistoryQueue` from `../jobs/queues.js`
  - `avg`, `count`, `asc` from `drizzle-orm`

- [ ] **Step 1: Add new imports to `locations.ts`**

Add to the existing imports at the top:

```typescript
import { avg, count } from 'drizzle-orm'
import { cragClimbabilityHistory } from '../db/schema.js'
import { rainfallHistoryQueue } from '../jobs/queues.js'
import type { ClimbabilityHistory } from '@weatherteam6/types'
```

Also add `asc` to the existing `drizzle-orm` import (merge — don't duplicate).

- [ ] **Step 2: Add `GET /locations/:id/history` endpoint**

Add this route in `locations.ts` **before** the existing `GET /locations/:id` route (order matters in Express — more specific paths first):

```typescript
router.get('/:id/history', async (req: Request, res: Response) => {
  const { id } = req.params
  if (!id || !isUuid(id)) {
    const response: ApiResponse<null> = { data: null, error: 'Location not found', status: 404 }
    res.status(404).json(response)
    return
  }

  try {
    const rows = await db
      .select({
        month: cragClimbabilityHistory.month,
        avg_climbable_days: avg(cragClimbabilityHistory.climbable_days),
        years_of_data: count(cragClimbabilityHistory.year),
      })
      .from(cragClimbabilityHistory)
      .where(eq(cragClimbabilityHistory.location_id, id))
      .groupBy(cragClimbabilityHistory.month)
      .orderBy(asc(cragClimbabilityHistory.month))

    const data: ClimbabilityHistory[] = rows.map((r) => ({
      month: r.month,
      avg_climbable_days: parseFloat(r.avg_climbable_days ?? '0'),
      years_of_data: r.years_of_data,
    }))

    const response: ApiResponse<ClimbabilityHistory[]> = { data, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /locations/:id/history')
  }
})
```

- [ ] **Step 3: Add queue dispatch to `POST /locations` crag branch**

Find the crag branch of `POST /locations` (after `res.status(201).json(response)` inside the crag try block) and add the fire-and-forget dispatch immediately after the response is sent:

```typescript
      res.status(201).json(response)

      // Fire-and-forget: populate 10-year climbability history in the background.
      // Wrapped in try/catch so Redis failure never affects the 201 response.
      rainfallHistoryQueue
        .add('backfill', { type: 'backfill', locationId: row.id })
        .catch((err: unknown) => {
          logger.warn(
            { locationId: row.id, err: err instanceof Error ? err.message : String(err) },
            'POST /locations: failed to queue history backfill',
          )
        })
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: 0 errors.

- [ ] **Step 5: Lint**

```bash
npm run lint --workspace=apps/api
```

Expected: 0 violations.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/locations.ts
git commit -m "feat(api): GET /locations/:id/history + queue history backfill on POST /locations"
```

---

## Task 6: MN/WI seed data

**Files:**
- Modify: `apps/api/src/db/seed.ts`

**Interfaces:**
- Consumes: `crags` table from `./schema.js`

**Note:** Run `importCrags.ts` with the MN and WI OpenBeta JSON exports **before** running this seed step, so the `crags` table has MN/WI rows to pull from.

- [ ] **Step 1: Add `crags` import and rock-type helper to `seed.ts`**

Add to the existing imports in `seed.ts`:

```typescript
import { crags } from './schema.js'
import { or, eq } from 'drizzle-orm'
```

Add this helper function before the main seed function:

```typescript
function toRockType(
  v: string | null | undefined,
): 'sandstone' | 'limestone' | 'granite' | 'basalt' | 'unknown' {
  const valid = ['sandstone', 'limestone', 'granite', 'basalt'] as const
  if (valid.includes(v as (typeof valid)[number])) return v as (typeof valid)[number]
  return 'unknown'
}
```

- [ ] **Step 2: Add MN/WI location seeding step**

At the end of the seed function (after the existing seeded locations are inserted), add:

```typescript
  // Seed MN/WI crags from the crags reference table as climbing locations.
  // Requires importCrags.ts to have been run first with MN/WI OpenBeta data.
  const mnwiCrags = await db
    .select()
    .from(crags)
    .where(or(eq(crags.state, 'MN'), eq(crags.state, 'WI')))

  if (mnwiCrags.length > 0) {
    // Pre-fetch existing location names to avoid duplicate inserts (locations has no unique-name constraint)
    const existingLocations = await db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.user_id, userId))
    const existingNames = new Set(existingLocations.map((r) => r.name))

    const toInsert = mnwiCrags.filter((c) => !existingNames.has(c.name))

    if (toInsert.length > 0) {
      await db.insert(locations).values(
        toInsert.map((crag) => ({
          user_id: userId,
          name: crag.name,
          lat: crag.lat,
          lon: crag.lon,
          is_climbing_location: true,
          rock_type: toRockType(crag.rock_type),
        })),
      )
      logger.info(`Seeded ${toInsert.length} MN/WI climbing locations`)
    } else {
      logger.info('MN/WI locations already seeded — skipping')
    }
  } else {
    logger.info('No MN/WI crags found in crags table — run importCrags.ts first')
  }
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck --workspace=apps/api
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/seed.ts
git commit -m "feat(seed): seed MN/WI climbing locations from crags table"
```

---

## Task 7: `useClimbabilityHistory` mobile hook

**Files:**
- Create: `apps/mobile/src/hooks/useClimbabilityHistory.ts`

**Interfaces:**
- Consumes: `apiFetch` from `../lib/api`, `ClimbabilityHistory` from `@weatherteam6/types`
- Produces: `useClimbabilityHistory(locationId: string | undefined)` React Query hook

- [ ] **Step 1: Create the hook**

Create `apps/mobile/src/hooks/useClimbabilityHistory.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import type { ClimbabilityHistory } from '@weatherteam6/types'
import { apiFetch } from '../lib/api'

export function useClimbabilityHistory(locationId: string | undefined) {
  return useQuery({
    queryKey: ['climbabilityHistory', locationId],
    queryFn: () => apiFetch<ClimbabilityHistory[]>(`/locations/${locationId}/history`),
    enabled: !!locationId,
    staleTime: 24 * 60 * 60 * 1000,
  })
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run build --workspace=packages/types && npm run typecheck --workspace=apps/mobile
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/hooks/useClimbabilityHistory.ts
git commit -m "feat(mobile): add useClimbabilityHistory hook"
```

---

## Task 8: Mobile history components + Location Detail wiring

**Files:**
- Create: `apps/mobile/src/components/history/BestMonthsCallout.tsx`
- Create: `apps/mobile/src/components/history/ClimbabilityChart.tsx`
- Modify: `apps/mobile/app/location/[id].tsx`

**Interfaces:**
- Consumes:
  - `useClimbabilityHistory` from Task 7
  - `ClimbabilityHistory` from `@weatherteam6/types`
  - `colors`, `fonts` from `@weatherteam6/design`

- [ ] **Step 1: Create `BestMonthsCallout`**

Create `apps/mobile/src/components/history/BestMonthsCallout.tsx`:

```tsx
import React from 'react'
import { Text, StyleSheet } from 'react-native'
import type { ClimbabilityHistory } from '@weatherteam6/types'
import { colors, fonts } from '@weatherteam6/design'

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

interface Props {
  data: ClimbabilityHistory[]
}

export function BestMonthsCallout({ data }: Props) {
  if (data.length === 0) return null

  const top3 = [...data]
    .sort((a, b) => b.avg_climbable_days - a.avg_climbable_days)
    .slice(0, 3)
    .sort((a, b) => a.month - b.month)
    .map((d) => MONTH_LABELS[d.month - 1])

  return (
    <Text style={styles.callout}>
      Best months: {top3.join(' · ')}
    </Text>
  )
}

const styles = StyleSheet.create({
  callout: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.good,
    marginBottom: 10,
  },
})
```

- [ ] **Step 2: Create `ClimbabilityChart`**

Create `apps/mobile/src/components/history/ClimbabilityChart.tsx`:

```tsx
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import type { ClimbabilityHistory } from '@weatherteam6/types'
import { colors, fonts } from '@weatherteam6/design'

const MONTH_LABELS = ['J','F','M','A','M','J','J','A','S','O','N','D']
const MAX_DAYS = 31
const BAR_MAX_HEIGHT = 72

interface Props {
  data: ClimbabilityHistory[]
}

export function ClimbabilityChart({ data }: Props) {
  const currentMonth = new Date().getMonth() + 1

  const byMonth = new Map(data.map((d) => [d.month, d]))

  return (
    <View style={styles.container}>
      <View style={styles.midLineWrap}>
        <View style={styles.midLine} />
      </View>
      <View style={styles.bars}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
          const entry = byMonth.get(month)
          const barHeight = entry
            ? Math.max(2, Math.round((entry.avg_climbable_days / MAX_DAYS) * BAR_MAX_HEIGHT))
            : 0
          const isCurrent = month === currentMonth
          return (
            <View key={month} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: barHeight,
                      backgroundColor: isCurrent
                        ? colors.good
                        : 'rgba(144,205,244,0.55)',
                    },
                  ]}
                />
              </View>
              <Text style={[styles.label, isCurrent && styles.labelActive]}>
                {MONTH_LABELS[month - 1]}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    height: BAR_MAX_HEIGHT + 20,
  },
  midLineWrap: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    height: BAR_MAX_HEIGHT,
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  midLine: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: BAR_MAX_HEIGHT / 2,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: BAR_MAX_HEIGHT,
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barTrack: {
    width: '60%',
    height: BAR_MAX_HEIGHT,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 2,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 4,
  },
  labelActive: {
    color: colors.good,
  },
})
```

- [ ] **Step 3: Wire into Location Detail screen**

In `apps/mobile/app/location/[id].tsx`:

1. Add imports at the top:

```typescript
import { useClimbabilityHistory } from '../../src/hooks/useClimbabilityHistory'
import { BestMonthsCallout } from '../../src/components/history/BestMonthsCallout'
import { ClimbabilityChart } from '../../src/components/history/ClimbabilityChart'
```

2. Add the hook call alongside the other hooks near the top of the component:

```typescript
const { data: historyData } = useClimbabilityHistory(
  location?.is_climbing_location ? location.id : undefined,
)
```

3. Add the history section below the 7-day forecast card in the JSX. Find the SevenDayTable/forecast section and add after it:

```tsx
{location?.is_climbing_location && (
  <View style={styles.historySection}>
    <Text style={styles.sectionLabel}>SEASONAL CLIMBABILITY</Text>
    {historyData && historyData.length > 0 ? (
      <>
        <BestMonthsCallout data={historyData} />
        <ClimbabilityChart data={historyData} />
        <Text style={styles.sourceNote}>
          Based on {historyData[0]?.years_of_data ?? 0} year
          {(historyData[0]?.years_of_data ?? 0) !== 1 ? 's' : ''} of rain data
        </Text>
      </>
    ) : (
      <Text style={styles.emptyHistory}>History populating — check back soon.</Text>
    )}
  </View>
)}
```

4. Add styles (merge into the existing `StyleSheet.create` call):

```typescript
historySection: {
  marginTop: 16,
  paddingHorizontal: 16,
  paddingBottom: 24,
},
sectionLabel: {
  fontFamily: fonts.condensed,
  fontSize: 11,
  letterSpacing: 1.2,
  color: 'rgba(255,255,255,0.35)',
  marginBottom: 10,
},
sourceNote: {
  fontFamily: fonts.body,
  fontSize: 11,
  color: 'rgba(255,255,255,0.35)',
  marginTop: 8,
},
emptyHistory: {
  fontFamily: fonts.body,
  fontSize: 13,
  color: 'rgba(255,255,255,0.35)',
  fontStyle: 'italic',
},
```

- [ ] **Step 4: Typecheck**

```bash
npm run build --workspace=packages/types --workspace=packages/design && npm run typecheck --workspace=apps/mobile
```

Expected: 0 errors.

- [ ] **Step 5: Lint**

```bash
npm run lint --workspace=apps/mobile
```

Expected: 0 violations.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/history/ apps/mobile/src/hooks/useClimbabilityHistory.ts apps/mobile/app/location/[id].tsx
git commit -m "feat(mobile): Phase 13 history section — seasonal climbability bar chart"
```

---

## Final Checks

- [ ] **Run all tests**

```bash
npm run test --workspace=apps/api
```

Expected: all tests pass including the new `climbabilityHistory` suite.

- [ ] **Full typecheck**

```bash
npm run typecheck
```

Expected: 0 errors across all workspaces.

- [ ] **Full lint**

```bash
npm run lint
```

Expected: 0 violations.

- [ ] **Run review checklist**

Read `.claude/rules/review-checklist.md` and verify every item passes.

- [ ] **Final commit if any loose files**

```bash
git status
```

Confirm clean working tree. If anything uncommitted, commit it now.

- [ ] **Append session-end block to `.claude/docs/session-notes.md`** per the session end protocol in `CLAUDE.md`.
