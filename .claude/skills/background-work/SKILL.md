---
name: background-work
description: Use when writing anything that runs outside a normal user request — scheduled work, alert polling, forecast/score computation, backfills, or anything that feels like "a job". This project has no queue. Covers the two sanctioned patterns (live per-request compute, and HTTP cron endpoints), idempotency, and the serverless constraints behind them.
---

# Background Work in WeatherTeam6

## There is no queue

The API is a single Express app wrapped as one Vercel serverless function
(`apps/api/api/index.ts`). There is no long-lived process, so nothing can hold a worker, a
scheduler, or a Redis connection between requests. BullMQ and Redis were removed for that
reason; do not reintroduce them or an `apps/api/src/jobs/` directory.

## Pattern 1: live per-request compute

For anything a user is waiting on. `computeLiveForecast` (`lib/scoring/liveForecast.ts`)
fetches the forecast and recent rainfall, scores, and returns — nothing is persisted.

- **Parallelize independent upstream work with `Promise.allSettled`.** Each fetch retries with
  backoff; serializing across N locations stacks those windows and exceeds `maxDuration`
  (`apps/api/vercel.json`). `routes/trips.ts` is the reference, including isolating one
  location's failure from the rest.

## Pattern 2: HTTP cron endpoint

For scheduled work: a route under `/api/cron/*` (`routes/cron.ts`), called by cron-job.org —
not Vercel Cron, which caps at once a day on Hobby.

- **Gate it with `cronGateFailed`**, which compares the `x-cron-secret` header in constant time
  and handles the `string[]` case. It is the only protection on a public URL.
- **The route stays thin**: validate, call a `src/lib/` function (e.g. `runAlertsCheck`), return.
- **Idempotent.** The scheduler retries, and a manual trigger can overlap a scheduled run;
  calling twice must not duplicate data.
- **Don't let one sub-step gate another.** `runAlertsCheck` throws if any location errored, but
  the successful locations have already written their rows — so the route catches it and
  reports `refreshFailed` on a 200 rather than losing the run.
- Register the route in cron-job.org.

## Idempotency

- **Claim before you act on any external side effect**, so two overlapping invocations
  cannot both act. Nothing sends notifications today — `weather_alerts.notified_at` is
  dormant and null means "never asked" — and the code that did was deleted with the bot, so
  this is the pattern a future channel needs:

  ```typescript
  const claimed = await db
    .update(weatherAlerts)
    .set({ notified_at: new Date() })
    .where(and(eq(weatherAlerts.id, alert.id), isNull(weatherAlerts.notified_at)))
    .returning({ id: weatherAlerts.id })

  if (claimed.length === 0) continue   // another invocation got it first

  try {
    await deliver(...)
  } catch {
    // release the claim so the next run retries — a failed send is not "notified"
  }
  ```
- **Purge-and-replace goes in one `db.transaction`**, so a crash leaves the old set or the new
  one, never a gap.
- **Pruning can destroy dedup state.** `notified_at` lives on the alert row, so deleting and
  re-inserting rows resets it. Keep "upstream returned nothing" distinguishable from "upstream
  response was unusable" before pruning on it.

## Before adding scheduled work

Prefer computing it live. `crag_climbability_history` and `location_normals` lost their only
writer when the old jobs were deleted (issue #25) — a new cron for them is a product decision.
