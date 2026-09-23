import { createHash, timingSafeEqual } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { sendServerError } from '../lib/http.js'
import { logger } from '../lib/logger.js'
import { runAlertsCheck } from '../lib/alerts/checkAlerts.js'
import { collectWeatherRuns } from '../lib/runs/collectRuns.js'
import { pruneWeatherRuns } from '../lib/runs/pruneRuns.js'
import type { ApiResponse } from '@weatherteam6/types'

export const cronRouter = Router()

// Fixed-length digest comparison so a mismatched CRON_SECRET can't be brute-forced
// via response-time differences — this header is the only guard on a public URL.
function isValidCronSecret(provided: string | undefined, expected: string): boolean {
  if (!provided) return false
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/**
 * The shared gate on every `/api/cron/*` route: a configured `CRON_SECRET` and a
 * matching header, or nothing runs.
 *
 * Fail-closed like `requireApiAuth` — an unset secret is a 503, never an open
 * door on a public URL. Returns false having already answered, so the caller
 * only has to return.
 */
function cronGateFailed(req: Request, res: Response): boolean {
  const expected = process.env['CRON_SECRET']
  if (!expected) {
    res
      .status(503)
      .json({
        data: null,
        error: 'Cron endpoint unavailable: CRON_SECRET is not configured',
        status: 503,
      })
    return true
  }

  const rawHeader = req.headers['x-cron-secret']
  const provided = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
  if (!isValidCronSecret(provided, expected)) {
    res.status(401).json({ data: null, error: 'Unauthorized', status: 401 })
    return true
  }
  return false
}

/**
 * Refresh `weather_alerts` from NWS for every saved location.
 *
 * **It collects; it does not deliver.** `notifyPendingAlerts` went with the bot
 * in migration Phase 3 and alerts are parked — there is no notification channel
 * in the product until one is chosen (`docs/handoffs/leave-telegram-v1.md`
 * § Risks). The data still matters: `GET /api/v1/alerts` reads it, and a Severe+
 * row suppresses the location's score in `summarizeReadings`. **The schedule
 * stays registered with cron-job.org** — unregistering it would leave every
 * surface reading a stale alert table, which is worse than a quiet one.
 *
 * Answers 200 with `refreshFailed` rather than a 500, because a run that failed
 * on one location out of five is a partial outcome the schedule should not
 * retry blindly — the same shape as `/collect-runs`.
 */
cronRouter.post('/check-alerts', async (req: Request, res: Response) => {
  if (cronGateFailed(req, res)) return

  try {
    // runAlertsCheck throws if ANY location errored, and the locations that did
    // succeed have already written their rows. Caught rather than propagated so
    // one bad location reports as a flag on a 200 instead of losing the run.
    let refreshError: string | null = null
    try {
      await runAlertsCheck()
    } catch (err) {
      refreshError = err instanceof Error ? err.message : String(err)
      logger.error({ err: refreshError }, '[cron] alerts refresh failed')
    }

    const response: ApiResponse<{ refreshFailed: boolean }> = {
      data: { refreshFailed: refreshError !== null },
      error: null,
      status: 200,
    }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'POST /api/cron/check-alerts')
  }
})

/**
 * Collect and persist one forecast run per saved location.
 *
 * Registered with the external scheduler (cron-job.org) — there is no queue in
 * this project and nothing runs on an in-process timer. Idempotent: a retried or
 * overlapping call upserts the same rows rather than duplicating them.
 *
 * Answers 200 with the failure list even when some locations failed, because a
 * partial collection is a real outcome the schedule should not retry blindly.
 * `failed` naming the locations is what stops it reading as a clean run.
 */
cronRouter.post('/collect-runs', async (req: Request, res: Response) => {
  if (cronGateFailed(req, res)) return

  try {
    const result = await collectWeatherRuns()
    const response: ApiResponse<typeof result> = { data: result, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'POST /api/cron/collect-runs')
  }
})

/**
 * Drop runs past the parsed retention window and clear the raw payload past the
 * raw one.
 *
 * Separate from the collection route so a prune failure cannot stop collection
 * and a collection timeout cannot stop the prune — the same reason the alerts
 * route catches its housekeeping separately.
 */
cronRouter.post('/prune-runs', async (req: Request, res: Response) => {
  if (cronGateFailed(req, res)) return

  try {
    const result = await pruneWeatherRuns()
    const response: ApiResponse<typeof result> = { data: result, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'POST /api/cron/prune-runs')
  }
})
