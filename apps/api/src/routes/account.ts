import { Router, type Request, type Response } from 'express'
import { eq } from 'drizzle-orm'
import type { Account, ApiResponse, InviteCreated } from '@weatherteam6/types'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { sendServerError } from '../lib/http.js'
import { isOwner, mintInvite } from '../lib/auth/invites.js'

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

/** Owner only. Anyone else is a 403: the route exists, they may not use it. */
accountRouter.post('/invites', async (req: Request, res: Response) => {
  if (!isOwner(req.userId)) {
    const response: ApiResponse<null> = { data: null, error: 'Only the owner can invite people', status: 403 }
    res.status(403).json(response)
    return
  }
  try {
    const response: ApiResponse<InviteCreated> = { data: await mintInvite(req.userId), error: null, status: 201 }
    res.status(201).json(response)
  } catch (err) {
    sendServerError(res, err, 'POST /invites')
  }
})
