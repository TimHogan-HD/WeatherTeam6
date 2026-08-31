import { createHash, timingSafeEqual } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { sendServerError } from '../lib/http.js'
import { logger } from '../lib/logger.js'
import { runAlertsCheck, notifyPendingAlerts } from '../lib/alerts/checkAlerts.js'
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

cronRouter.post('/check-alerts', async (req: Request, res: Response) => {
  const expected = process.env['CRON_SECRET']
  if (!expected) {
    res.status(503).json({ data: null, error: 'Cron endpoint unavailable: CRON_SECRET is not configured', status: 503 })
    return
  }

  const rawHeader = req.headers['x-cron-secret']
  const provided = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
  if (!isValidCronSecret(provided, expected)) {
    res.status(401).json({ data: null, error: 'Unauthorized', status: 401 })
    return
  }

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
    // retention rule nothing enforces is not a retention rule — a new route
    // would need a new registration, which is a task for the user rather than a
    // line of code. When Phase 2 adds `/api/cron/prune-runs`, this moves there.
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
