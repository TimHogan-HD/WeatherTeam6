import { createHash, timingSafeEqual } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { sendServerError } from '../lib/http.js'
import { logger } from '../lib/logger.js'
import { runAlertsCheck, notifyPendingAlerts } from '../lib/alerts/checkAlerts.js'
import { collectWeatherRuns } from '../lib/runs/collectRuns.js'
import { pruneWeatherRuns } from '../lib/runs/pruneRuns.js'
import { prunePanelStates } from '../lib/telegram/panelState.js'
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

cronRouter.post('/check-alerts', async (req: Request, res: Response) => {
  if (cronGateFailed(req, res)) return

  try {
    // Refresh failures must not gate notification: runAlertsCheck throws if ANY
    // location errored, and alerts already sitting unnotified in the DB (possibly
    // from earlier runs) still need to go out. Catch here so a single bad location
    // can't wedge delivery indefinitely.
    let refreshError: string | null = null
    try {
      await runAlertsCheck()
    } catch (err) {
      refreshError = err instanceof Error ? err.message : String(err)
      logger.error({ err: refreshError }, '[cron] alerts refresh failed — notifying anyway')
    }

    const result = await notifyPendingAlerts()

    // Housekeeping, riding along on the one schedule that is already registered
    // with cron-job.org. `panel_states` has a 7-day retention rule, and a
    // retention rule nothing enforces is not a retention rule.
    //
    // `/api/cron/prune-runs` now exists and is where this belongs — but moving
    // it there before that route has a schedule registered against it would stop
    // the prune running at all. It moves once the registration exists, not when
    // the route does.
    //
    // Its own try/catch: a housekeeping failure must not wedge alert delivery,
    // the same reason the refresh above is caught separately.
    let pruned = 0
    try {
      pruned = await prunePanelStates()
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        '[cron] panel-state prune failed — alerts were still delivered',
      )
    }

    const response: ApiResponse<{
      checked: number
      notified: number
      refreshFailed: boolean
      panelStatesPruned: number
    }> = {
      data: { ...result, refreshFailed: refreshError !== null, panelStatesPruned: pruned },
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
