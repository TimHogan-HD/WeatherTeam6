import { Router, type Request, type Response } from 'express'
import type { ApiResponse, Preferences } from '@weatherteam6/types'
import { sendServerError } from '../lib/http.js'
import { preferencesFor, savePreferences } from '../lib/preferences/preferences.js'
import { parsePreferencesUpdate, planPreferencesUpdate } from '../lib/preferences/updatePreferences.js'

/**
 * The reader's own settings (scoring Phase 5). Mounted inside `/api/v1`, so
 * `req.userId` is set by `requireApiAuth` and nothing here takes an id.
 */
export const preferencesRouter = Router()

preferencesRouter.get('/preferences', async (req: Request, res: Response) => {
  try {
    const response: ApiResponse<Preferences> = { data: await preferencesFor(req.userId), error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /preferences')
  }
})

/**
 * Partial: an absent field is left alone and null resets it. 400 for a
 * malformed body, 409 for a range narrower than `TEMP_RANGE_LIMITS_F.minGap`
 * once merged with what is stored. The response is the whole saved row.
 *
 * Read-then-write: two saves racing from two devices each check the gap
 * against the row they read, and the later write wins whole. The owner and a
 * few partners, one account each, make that a theoretical case.
 */
preferencesRouter.put('/preferences', async (req: Request, res: Response) => {
  const parsed = parsePreferencesUpdate(req.body)
  if ('error' in parsed) {
    const response: ApiResponse<null> = { data: null, error: parsed.error, status: 400 }
    res.status(400).json(response)
    return
  }
  try {
    const plan = planPreferencesUpdate(await preferencesFor(req.userId), parsed)
    if (!plan.ok) {
      const response: ApiResponse<null> = { data: null, error: plan.error, status: plan.status }
      res.status(plan.status).json(response)
      return
    }
    const response: ApiResponse<Preferences> = {
      data: await savePreferences(req.userId, plan.next),
      error: null,
      status: 200,
    }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'PUT /preferences')
  }
})
