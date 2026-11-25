import { Router, type Request, type Response } from 'express'
import type { ApiResponse, SensorReading } from '@weatherteam6/types'
import { sendServerError } from '../lib/http.js'
import { isOwner } from '../lib/auth/invites.js'
import { latestSensorReadings } from '../lib/sensors/latestReadings.js'

/**
 * The owner's thermometer (owner, 2026-11-25). Mounted inside `/api/v1`, so
 * `req.userId` is set by `requireApiAuth`. Owner only: the device and the key
 * are the owner's, and a home reading says when someone is home.
 */
export const sensorsRouter = Router()

sensorsRouter.get('/sensors', async (req: Request, res: Response) => {
  if (!isOwner(req.userId)) {
    const response: ApiResponse<null> = { data: null, error: 'Only the owner can read the thermometer', status: 403 }
    res.status(403).json(response)
    return
  }
  try {
    const response: ApiResponse<SensorReading[]> = { data: await latestSensorReadings(), error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /sensors')
  }
})
