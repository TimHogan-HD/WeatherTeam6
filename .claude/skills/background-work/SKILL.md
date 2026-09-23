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

- **Claim before you act on any external side effect.** Update the row with a guard
  (`where … isNull(notified_at)` … `.returning()`) and act only if the claim returned a row;
  release the claim if the action fails. `lib/alerts/checkAlerts.ts` holds the pattern.
  Nothing sends notifications today — `weather_alerts.notified_at` is dormant and null means
  "never asked" — but a future channel needs exactly this claim.
- **Purge-and-replace goes in one `db.transaction`**, so a crash leaves the old set or the new
  one, never a gap.
- **Pruning can destroy dedup state.** `notified_at` lives on the alert row, so deleting and
  re-inserting rows resets it. Keep "upstream returned nothing" distinguishable from "upstream
  response was unusable" before pruning on it.

## Before adding scheduled work

Prefer computing it live. `crag_climbability_history` and `location_normals` lost their only
writer when the old jobs were deleted (issue #25) — a new cron for them is a product decision.
