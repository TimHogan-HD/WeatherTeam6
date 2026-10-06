import { Router, type Request, type Response } from 'express'
import { eq } from 'drizzle-orm'
import type { Account, ApiResponse, InviteCreated, InviteSummary } from '@weatherteam6/types'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { isUuid, sendServerError } from '../lib/http.js'
import { cancelInvite, isOwner, listInvites, mintInvite } from '../lib/auth/invites.js'

/** Mounted inside `/api/v1`, so `req.userId` is set by `requireApiAuth`. */
export const accountRouter = Router()

accountRouter.get('/me', async (req: Request, res: Response) => {
  try {
    const rows = await db.select({ username: users.username }).from(users).where(eq(users.id, req.userId)).limit(1)
    const response: ApiResponse<Account> = {
      data: { username: rows[0]?.username ?? null, can_invite: isOwner(req.userId) },
      error: null,
      status: 200,
    }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /me')
  }
})

/** The invite routes are owner only. Anyone else is a 403: the route exists, they may not use it. */
function refuseNonOwner(req: Request, res: Response): boolean {
  if (isOwner(req.userId)) return false
  const response: ApiResponse<null> = { data: null, error: 'Only the owner can invite people', status: 403 }
  res.status(403).json(response)
  return true
}

accountRouter.get('/invites', async (req: Request, res: Response) => {
  if (refuseNonOwner(req, res)) return
  try {
    const response: ApiResponse<InviteSummary[]> = { data: await listInvites(req.userId), error: null, status: 200 }
    res.status(200).json(response)
  } catch (err) {
    sendServerError(res, err, 'GET /invites')
  }
})

/** Cancels an unused link. 404 for an unknown id, a used link, or another account's. */
accountRouter.delete('/invites/:id', async (req: Request, res: Response) => {
  if (refuseNonOwner(req, res)) return
  const id = req.params['id'] ?? ''
  if (!isUuid(id)) {
    const response: ApiResponse<null> = { data: null, error: 'No open invite with that id', status: 404 }
    res.status(404).json(response)
    return
  }
  try {
    const cancelled = await cancelInvite(req.userId, id)
    const status = cancelled ? 200 : 404
    const response: ApiResponse<null> = { data: null, error: cancelled ? null : 'No open invite with that id', status }
    res.status(status).json(response)
  } catch (err) {
    sendServerError(res, err, 'DELETE /invites/:id')
  }
})

accountRouter.post('/invites', async (req: Request, res: Response) => {
  if (refuseNonOwner(req, res)) return
  try {
    const response: ApiResponse<InviteCreated> = { data: await mintInvite(req.userId), error: null, status: 201 }
    res.status(201).json(response)
  } catch (err) {
    sendServerError(res, err, 'POST /invites')
  }
})
