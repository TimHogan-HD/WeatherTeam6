import { createHash, timingSafeEqual } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { sendServerError } from '../lib/http.js'
import { runAlertsCheck, notifyPendingAlerts } from '../lib/alerts/checkAlerts.js'
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
    await runAlertsCheck()
    const result = await notifyPendingAlerts()

    const response: ApiResponse<{ checked: number; notified: number }> = {
      data: result,
      error: null,
      status: 200,
    }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'POST /api/cron/check-alerts')
  }
})
