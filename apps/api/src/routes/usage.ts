import { Router, type Request, type Response } from 'express'
import { parseUsageEvent, type ApiResponse } from '@weatherteam6/types'
import { db } from '../db/index.js'
import { usageEvents } from '../db/schema.js'
import { sendServerError } from '../lib/http.js'

/**
 * **The usage log** (owner, 2026-11-23; `docs/usage-log.md`, which also says
 * how to remove it): the app reports each screen and crag tab opened, under
 * a random per-launch visit id and never the account. Read back only by
 * `npm run usage` (`scripts/usage.ts`); no route returns these rows.
 */
export const usageRouter = Router()

usageRouter.post('/usage', async (req: Request, res: Response) => {
  const event = parseUsageEvent(req.body)
  if (event === null) {
    const response: ApiResponse<null> = { data: null, error: 'Not a usage event', status: 400 }
    res.status(400).json(response)
    return
  }
  try {
    // Signed-in callers only (the route is behind the gate), but no account is stored.
    await db.insert(usageEvents).values({ visit_id: event.visit, screen: event.screen, tab: event.tab })
    const response: ApiResponse<null> = { data: null, error: null, status: 201 }
    res.status(201).json(response)
  } catch (err) {
    sendServerError(res, err, 'POST /usage')
  }
})
