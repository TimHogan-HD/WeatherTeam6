---
name: bullmq-jobs
description: Use when writing BullMQ background jobs, queue definitions, workers, or job scheduling. Covers the four queues for this project, worker patterns, idempotency requirements, and Redis connection setup.
---

# BullMQ Patterns for WeatherTeam6

## The Four Queues (no others without approval)
| Queue | Schedule | Purpose |
|-------|----------|---------|
| `forecast-snapshot` | Every 6h | Fetch ensemble + deterministic forecast for all saved locations, write forecast_snapshots, recalculate conditions_scores |
| `rainfall-history` | Daily 06:00 UTC | Backfill yesterday's precip from ACIS, write rainfall_history, update crag_climbability_history |
| `alerts-poller` | Every 5min | Fetch NWS alerts for all saved locations, trigger push notifications if needed |
| `snapshot-cleanup` | Daily 02:00 UTC | Delete forecast_snapshots older than 30 days |

## Queue + Worker Setup
```typescript
// apps/api/src/jobs/queues.ts
// QueueScheduler was removed in BullMQ v3+. Do NOT import it — it doesn't exist.
import { Queue, Worker } from 'bullmq'
import { redisConnection } from '../lib/redis'

export const forecastSnapshotQueue = new Queue('forecast-snapshot', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,  // keep last 100 for debugging
    removeOnFail: 25,       // alerts-poller runs 288x/day — keep this low
  },
})
```

## Redis Connection
```typescript
// apps/api/src/lib/redis.ts
import { Redis } from 'ioredis'

export const redisConnection = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null, // required by BullMQ — omitting this causes worker crashes
  enableReadyCheck: false,
})
```

## Worker Pattern
```typescript
// apps/api/src/jobs/workers/forecastSnapshot.ts
import { Worker, Job } from 'bullmq'
import { redisConnection } from '../../lib/redis'
import { db } from '../../db'
import { logger } from '../../lib/logger'

export const forecastSnapshotWorker = new Worker(
  'forecast-snapshot',
  async (job: Job) => {
    // Always fetch fresh list of locations from DB — do not pass location list in job data
    const locations = await db.select().from(locationsTable)

    for (const location of locations) {
      await processLocation(location)
    }
  },
  { connection: redisConnection, concurrency: 1 }
)

// Use logger, never console.error
forecastSnapshotWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'forecast-snapshot job failed')
})
```

**Note on process architecture:** Workers and the API server run in the same process in this project. This is acceptable for a single-user personal app but is not the production-standard pattern — ideally workers run as a separate process so a worker crash doesn't take down the API. If the app ever scales, split workers into their own Railway service.

## Scheduler (Repeating Jobs)
```typescript
// apps/api/src/jobs/scheduler.ts
import { forecastSnapshotQueue, rainfallHistoryQueue, snapshotCleanupQueue, alertsPollerQueue } from './queues'

export async function initScheduler() {
  // BullMQ deduplicates repeating jobs by name + repeat pattern automatically.
  // Do NOT use obliterate() — it nukes the entire queue including in-flight jobs.
  // Instead, remove only the specific repeating schedule keys before re-adding.
  for (const queue of [forecastSnapshotQueue, rainfallHistoryQueue, snapshotCleanupQueue, alertsPollerQueue]) {
    const repeatableJobs = await queue.getRepeatableJobs()
    for (const job of repeatableJobs) {
      await queue.removeRepeatableByKey(job.key)
    }
  }

  await forecastSnapshotQueue.add(
    'run',
    {},
    { repeat: { every: 6 * 60 * 60 * 1000 } } // 6 hours in ms
  )

  await rainfallHistoryQueue.add(
    'run',
    {},
    { repeat: { cron: '0 6 * * *', tz: 'UTC' } }
  )

  await snapshotCleanupQueue.add(
    'run',
    {},
    { repeat: { cron: '0 2 * * *', tz: 'UTC' } }
  )

  await alertsPollerQueue.add(
    'run',
    {},
    { repeat: { every: 5 * 60 * 1000 } } // 5 minutes
  )
}
```

## Idempotency Rules
- Jobs MUST be safe to re-run. Crashes, retries, and duplicate runs must not corrupt data.
- Use `onConflictDoUpdate` for all DB writes in jobs — never plain insert
- For conditions_scores: delete the existing row for the location and insert fresh (score is always fully recomputed)
- For snapshot-cleanup: use `WHERE created_at < now() - interval '30 days'` — safe to run multiple times

## Startup (apps/api/src/index.ts)
```typescript
import { initScheduler } from './jobs/scheduler'

// After DB connection confirmed:
await initScheduler()
```

## Gotchas
- `maxRetriesPerRequest: null` is required on the Redis connection for BullMQ — omitting it causes worker crashes
- `QueueScheduler` does not exist in BullMQ v3+. Never import it.
- Never use `obliterate()` in the scheduler — use `removeRepeatableByKey()` instead
- `concurrency: 1` on forecast-snapshot prevents concurrent API hammering of Open-Meteo
- Never pass large data payloads in job data — fetch from DB inside the worker instead
- Keep `removeOnFail` low for high-frequency queues (alerts-poller) to avoid Redis memory bloat
- Use `logger`, never `console.error` or `console.log`
