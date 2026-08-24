---
name: background-work
description: Use when writing anything that runs outside a normal user request — scheduled work, alert polling, forecast/score computation, backfills, or anything that feels like "a job". This project has NO queue. Covers the two sanctioned patterns (live per-request compute, and HTTP cron endpoints), idempotency requirements, and the serverless constraints that make queues impossible here.
---

# Background Work in WeatherTeam6

## There is no queue

**BullMQ, Redis, ioredis, and Bull Board were removed entirely in the Telegram Crossover migration (PR #20, 2026-07-31).** Do not reintroduce them. Do not create `apps/api/src/jobs/`. Do not `npm install bullmq`.

The reason is structural, not preference: the API is a **single Express app wrapped as one Vercel serverless function** (`apps/api/api/index.ts`). There is no long-lived process, so nothing can hold a worker, a scheduler, or a Redis connection between requests. A queue has nowhere to run.

## The two sanctioned patterns

### 1. Live per-request compute

For anything a user is waiting on. The canonical example is `apps/api/src/lib/scoring/liveForecast.ts`:

```typescript
// Called directly from GET /conditions/:id and GET /forecast/:id
export async function computeLiveForecast(
  location: LiveForecastLocation,
  now: Date = new Date(),
): Promise<LiveForecastResult>
```

It fetches the forecast (NBM, falling back to ensemble), fetches recent rainfall (ACIS when the location has an `asos_station`, else Open-Meteo's archive), runs `dryingModel` + `conditionsScore`, and returns in-memory results. **Nothing is persisted.**

Rules for this pattern:
- **Parallelize independent work.** Each call makes up to three retrying upstream fetches with ~7s of backoff each. Serializing across N locations stacks those windows and blows the function's `maxDuration`. Use `Promise.allSettled` — see `apps/api/src/routes/trips.ts` for the reference implementation, which also isolates per-location failures so one bad upstream doesn't 500 the whole response.
- **Never let one item's failure sink the batch.** Settle independently, log, degrade.
- Watch total latency. `maxDuration` is set in `apps/api/vercel.json`.

### 2. HTTP cron endpoint

For scheduled work. The canonical example is `POST /api/cron/check-alerts` (`apps/api/src/routes/cron.ts`), driven by **cron-job.org** on an external schedule — not Vercel Cron, which caps at once/day on Hobby.

```typescript
// Gate every cron route on CRON_SECRET with a constant-time compare.
// This is the ONLY protection on a public URL.
const rawHeader = req.headers['x-cron-secret']
const provided = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
if (!isValidCronSecret(provided, expected)) { /* 401 */ }
```

Rules for this pattern:
- **Route handlers stay thin.** Logic lives in `src/lib/` — see `lib/alerts/checkAlerts.ts` (`runAlertsCheck`, `notifyPendingAlerts`). The route validates the secret, calls a lib function, returns.
- **Header may be `string[]`.** Express types `req.headers[x]` as `string | string[] | undefined`. Handle the array case; do not blind-cast.
- **Idempotent, always.** The scheduler will retry. Calling twice must not duplicate data or re-send notifications.
- **Don't let one sub-step gate another.** `runAlertsCheck` throws if any location errored; if that aborted the request, alerts already sitting unnotified would never send. It's wrapped in its own try/catch so `notifyPendingAlerts()` runs regardless.

## Idempotency: claim before you act

The bar from the old job-based world still applies, now enforced per-request. For anything that sends a notification or has an external side effect, **claim the row atomically before acting**, so two overlapping invocations can't both act on it:

```typescript
// lib/alerts/checkAlerts.ts — the reference pattern
const claimed = await db
  .update(weatherAlerts)
  .set({ notified_at: new Date() })
  .where(and(eq(weatherAlerts.id, alert.id), isNull(weatherAlerts.notified_at)))
  .returning({ id: weatherAlerts.id })

if (claimed.length === 0) continue   // another invocation got it first

try {
  await sendTelegramMessage(...)
} catch {
  // release the claim so the next run retries — a failed send is not "notified"
}
```

Read-then-act without a claim is a race. Two cron invocations 15 minutes apart don't overlap, but a manual trigger during a scheduled run does.

## Purge-and-replace needs a transaction

If work deletes a set and re-inserts it, wrap both in `db.transaction` so a crash leaves the old set or the new set, never a gap or a mix.

## Known trap: pruning destroys dedup state

`weather_alerts.notified_at` lives **on the row**. Any code path that deletes and re-inserts alert rows also resets the dedup state, causing re-sends. See issue #26 — `fetchNwsAlerts` returning `[]` instead of `null` for a malformed response triggers exactly this. When adding prune logic, be sure "upstream returned nothing" and "upstream response was unusable" are distinguishable.

## What was deleted, and what replaced it

| Old job | Disposition |
|---------|-------------|
| `forecast-snapshot` | Deleted. Scoring computes live in `liveForecast.ts`. |
| `rainfall-history` | Deleted. Recent rainfall fetched live. **Note:** this also removed the only writer for `crag_climbability_history` and `location_normals` — see issue #25, unresolved. |
| `snapshot-cleanup` | Deleted. Nothing accumulates to clean. |
| `alerts-poller` | Converted to `POST /api/cron/check-alerts`. Internals preserved in `lib/alerts/checkAlerts.ts`. |

## Before adding new scheduled work

1. Can it be computed live on request instead? Prefer that.
2. If it genuinely must be scheduled: add an `/api/cron/*` route, gate it on `CRON_SECRET`, put the logic in `src/lib/`, make it idempotent, and register it in cron-job.org.
3. Remember the deployment is behind Vercel SSO protection — external schedulers also need the `x-vercel-protection-bypass` header.
