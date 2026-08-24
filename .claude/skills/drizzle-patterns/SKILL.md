---
name: drizzle-patterns
description: Use when writing Drizzle ORM schema, queries, migrations, or anything touching the database layer. Covers schema definition patterns, query patterns, migration workflow, and common gotchas for this project.
---

# Drizzle Patterns for WeatherTeam6

## Schema Location
`apps/api/src/db/schema.ts` — single file, all tables. Do not split into multiple schema files.

## Schema Definition Pattern
```typescript
import { pgTable, uuid, text, numeric, boolean, integer, date, timestamptz, jsonb, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamptz('created_at').notNull().default(sql`now()`),
})

export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  // ...
}, (table) => ({
  // Always add indexes on FK columns — Drizzle does NOT create them automatically
  userIdIdx: index('locations_user_id_idx').on(table.userId),
}))
```

**Critical:** Drizzle never auto-creates indexes on foreign key columns. Every FK that will be used in a WHERE clause or JOIN needs an explicit index or queries will do full table scans as data grows.

Tables that need FK indexes: `locations.user_id`, `forecast_snapshots.location_id`, `conditions_scores.location_id`, `rainfall_history.location_id`, `trips.user_id`, `trip_locations.trip_id`, `trip_locations.location_id`, `conditions_reports.location_id`, `crag_climbability_history.location_id`.

## Query Patterns

### Basic select with filter
```typescript
import { db } from '../db'
import { locations } from '../db/schema'
import { eq } from 'drizzle-orm'

const userLocations = await db
  .select()
  .from(locations)
  .where(eq(locations.userId, userId))
```

### Insert returning
```typescript
const [location] = await db
  .insert(locations)
  .values({ userId, name, lat, lon })
  .returning()
```

### Upsert (insert or update)
```typescript
await db
  .insert(rainfallHistory)
  .values({ locationId, date, precipMm, source })
  .onConflictDoUpdate({
    target: [rainfallHistory.locationId, rainfallHistory.date],
    set: { precipMm, source, verified }
  })
```

### Join
```typescript
const result = await db
  .select({
    location: locations,
    score: conditionsScores,
  })
  .from(locations)
  .leftJoin(conditionsScores, eq(conditionsScores.locationId, locations.id))
  .where(eq(locations.userId, userId))
```

## Migration Workflow
```bash
# After editing schema.ts:
npm run db:generate   # generates migration file in drizzle/ directory
npm run db:migrate    # applies pending migrations to DB

# NEVER run: drizzle-kit push
# db push skips migration files entirely and can cause data loss in production.
# Always use generate + migrate, even in development.

# Never edit generated migration files manually
# Never run SQL directly against the DB
```

## DB Client Setup
`apps/api/src/db/index.ts` — Neon serverless, **WebSocket** driver:
```typescript
import { neonConfig, Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import * as schema from './schema.js'

// Node runtime has no native WebSocket; Neon's driver needs one.
neonConfig.webSocketConstructor = ws

export const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool, { schema })
```

**Do not "simplify" this to `drizzle-orm/neon-http`.** `apps/api/src/routes/trips.ts` uses an interactive `db.transaction()` (insert a trip, read back its generated id, insert dependent rows). The HTTP driver only supports pre-batched, non-interactive transactions and cannot express that without rewriting the route.

**Do not use `pg` / `node-postgres`.** Standard TCP pooling does not work correctly from Vercel serverless functions.

### Migrations cannot run from the cloud dev sandbox
`drizzle-kit` auto-detects `@neondatabase/serverless` and uses its WebSocket driver regardless of app code. This environment's egress proxy blocks that (403), and Neon's HTTP SQL API host is not allowlisted either. **Run `npm run db:migrate` from an unrestricted machine**, or widen the environment's allowlist to `*.aws.neon.tech`.

## drizzle.config.ts (repo root of apps/api)
```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',   // NOT driver: 'pg' — that's deprecated and will warn/error
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config
```

## Gotchas
- `timestamptz` not `timestamp` — always use timezone-aware timestamps
- `defaultRandom()` for UUIDs — not `default(sql\`gen_random_uuid()\`)`
- Drizzle column names are camelCase in TS, snake_case in DB — Drizzle handles the mapping
- `onConflictDoUpdate` requires `target` to match a unique constraint or index
- Always destructure single-row inserts: `const [row] = await db.insert(...).returning()`
- Never import `db` in `schema.ts` — circular dependency
- `dialect: 'postgresql'` in drizzle.config.ts — `driver: 'pg'` is deprecated
- Never use `drizzle-kit push` — always `generate` then `migrate`
- Never manually edit files in the `drizzle/` migrations directory
