import { Router, type Request, type Response } from 'express'
import { and, desc, eq } from 'drizzle-orm'
import type { ApiResponse, Feedback } from '@weatherteam6/types'
import { db } from '../db/index.js'
import { feedback, locations } from '../db/schema.js'
import { isUuid, sendServerError } from '../lib/http.js'
import { parseFeedbackInput } from '../lib/feedback/parseFeedback.js'
import { toFeedback } from '../lib/feedback/feedbackRow.js'

export const feedbackRouter = Router()

/** The newest this many. Enough to scroll; the table itself keeps everything. */
const LIST_LIMIT = 100

function refuse(res: Response, status: number, error: string): void {
  const response: ApiResponse<null> = { data: null, error, status }
  res.status(status).json(response)
}

feedbackRouter.get('/feedback', async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(feedback)
      .where(eq(feedback.user_id, req.userId))
      .orderBy(desc(feedback.created_at))
      .limit(LIST_LIMIT)
    const response: ApiResponse<Feedback[]> = { data: rows.map(toFeedback), error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /feedback')
  }
})

feedbackRouter.post('/feedback', async (req: Request, res: Response) => {
  const parsed = parseFeedbackInput(req.body, Date.now())
  if ('error' in parsed) {
    refuse(res, 400, parsed.error)
    return
  }

  try {
    // The location must be the caller's own. A wrong owner and a missing row
    // are the same 404, as on every other location route.
    let place: { name: string; lat: number; lon: number } | null = null
    if (parsed.location_id !== null) {
      const rows = await db
        .select({ name: locations.name, lat: locations.lat, lon: locations.lon })
        .from(locations)
        .where(and(eq(locations.id, parsed.location_id), eq(locations.user_id, req.userId)))
        .limit(1)
      const row = rows[0]
      if (!row) {
        refuse(res, 404, 'Location not found')
        return
      }
      place = { name: row.name, lat: Number(row.lat), lon: Number(row.lon) }
    }

    const common = {
      user_id: req.userId,
      location_id: parsed.location_id,
      location_name: place?.name ?? null,
      lat: place?.lat ?? null,
      lon: place?.lon ?? null,
    }
    const values =
      parsed.kind === 'app'
        ? { ...common, kind: parsed.kind, message: parsed.message }
        : {
            ...common,
            kind: parsed.kind,
            message: parsed.message,
            observed_at: parsed.observed_at,
            observed_conditions: parsed.observed_conditions,
            verdict: parsed.verdict,
            app_readings: parsed.app_readings,
          }

    const inserted = await db.insert(feedback).values(values).returning()
    const row = inserted[0]
    if (!row) throw new Error('Insert returned no row')
    const response: ApiResponse<Feedback> = { data: toFeedback(row), error: null, status: 201 }
    res.status(201).json(response)
  } catch (err) {
    sendServerError(res, err, 'POST /feedback')
  }
})

feedbackRouter.delete('/feedback/:feedbackId', async (req: Request, res: Response) => {
  const id = req.params['feedbackId']
  if (!id || !isUuid(id)) {
    refuse(res, 404, 'Feedback not found')
    return
  }
  try {
    const rows = await db
      .delete(feedback)
      .where(and(eq(feedback.id, id), eq(feedback.user_id, req.userId)))
      .returning({ id: feedback.id })
    if (rows.length === 0) {
      refuse(res, 404, 'Feedback not found')
      return
    }
    const response: ApiResponse<null> = { data: null, error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'DELETE /feedback/:feedbackId')
  }
})
