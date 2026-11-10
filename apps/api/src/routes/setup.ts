import { Router, type Request, type Response } from 'express'
import type { ApiResponse, SetupPreview } from '@weatherteam6/types'
import { sendServerError } from '../lib/http.js'
import { buildSetupPreview, parsePreviewQuery } from '../lib/setup/setupPreview.js'

/**
 * The welcome screen's example week (#543). Mounted inside `/api/v1`, so only
 * a signed-in reader reaches it. Reads no table and calls nothing upstream:
 * the week is a fixture, scored on the draft the query carries.
 */
export const setupRouter = Router()

/** `?first=&last=&low_c=&high_c=`, each optional; refused exactly as `PUT /preferences` would refuse the save. */
setupRouter.get('/setup/preview', (req: Request, res: Response) => {
  const parsed = parsePreviewQuery(req.query as Record<string, unknown>)
  if (!parsed.ok) {
    const response: ApiResponse<null> = { data: null, error: parsed.error, status: parsed.status }
    res.status(parsed.status).json(response)
    return
  }
  try {
    const response: ApiResponse<SetupPreview> = { data: buildSetupPreview(parsed.draft), error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /setup/preview')
  }
})
