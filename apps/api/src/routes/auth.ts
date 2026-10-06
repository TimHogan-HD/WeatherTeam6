import { Router, type Request, type Response } from 'express'
import {
  isValidUsername,
  MAX_PASSPHRASE_LENGTH,
  MIN_PASSPHRASE_LENGTH,
  type ApiResponse,
  type AuthLoginResponse,
} from '@weatherteam6/types'
import { authenticateUser } from '../lib/auth/credentials.js'
import { MAX_CODE_LENGTH, redeemInvite } from '../lib/auth/invites.js'
import { expiryFrom, signToken } from '../lib/auth/token.js'
import { logger } from '../lib/logger.js'
import { sendServerError } from '../lib/http.js'

export const authRouter = Router()

/**
 * The front door. Mounted **above** the `/api/v1` gate in `index.ts`, because
 * you cannot present a token in order to obtain one.
 *
 * Express matches in registration order, so this handler must *respond* rather
 * than fall through — which it does on every path. An unmatched route under
 * `/api/v1/auth` (a GET, a typo) reaches no handler here and continues to
 * `requireApiAuth`, which 401s it. That is the behaviour we want: the holes in
 * the gate are exactly two POSTs, `/login` and `/redeem`.
 *
 * **No rate limiting.** There is no Redis and no store for counters. scrypt's
 * cost plus `FAILURE_DELAY_MS` below is the whole defence, and passphrase
 * strength is the real control — `npm run user:add` says so at the prompt.
 */

/**
 * Paid on every failure, after the work rather than instead of it.
 *
 * It is a guessing tax, not a timing defence — the constant-time part is in
 * `authenticateUser`, which pays the same scrypt cost for an unknown username
 * as for a wrong passphrase. This just makes a serial guessing loop cost about
 * two attempts a second.
 */
const FAILURE_DELAY_MS = 400

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** One message for every failure. Which half was wrong is not the caller's business. */
const REJECTION = 'Invalid username or passphrase'

function readCredential(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * Upper bounds on what the login route will hash. scrypt's first step is
 * PBKDF2 over the whole passphrase, so an unbounded one is CPU spent on the
 * attacker's terms before the answer is even no. `user:add` asks for 12+
 * characters; 1024 leaves any real passphrase alone.
 */
const MAX_USERNAME_LENGTH = 128

authRouter.post('/login', async (req: Request, res: Response) => {
  const secret = process.env['AUTH_TOKEN_SECRET']

  // Fail closed, exactly as requireApiAuth does. An unset signing key must not
  // silently mean "issue an unsigned token" or "let everyone in" — it means the
  // server cannot authenticate anyone, which is a 503, not a 401.
  if (!secret) {
    logger.error('AUTH_TOKEN_SECRET is not configured — refusing to issue tokens')
    const response: ApiResponse<null> = {
      data: null,
      error: 'API unavailable: server is not configured for authenticated access',
      status: 503,
    }
    res.status(503).json(response)
    return
  }

  // `express.json()` leaves req.body as {} for a non-JSON request, so both
  // fields simply read as absent. A missing body is a 400, not a 500.
  const body = req.body as { username?: unknown; passphrase?: unknown } | undefined
  const username = readCredential(body?.username)
  const passphrase = readCredential(body?.passphrase)

  if (username === null || passphrase === null) {
    const response: ApiResponse<null> = {
      data: null,
      error: 'username and passphrase are required',
      status: 400,
    }
    res.status(400).json(response)
    return
  }

  if (username.length > MAX_USERNAME_LENGTH || passphrase.length > MAX_PASSPHRASE_LENGTH) {
    const response: ApiResponse<null> = {
      data: null,
      error: 'username or passphrase is too long',
      status: 400,
    }
    res.status(400).json(response)
    return
  }

  try {
    const userId = await authenticateUser(username, passphrase)

    if (userId === null) {
      // Never log the username either: a typo'd passphrase in the username box
      // would otherwise be written to the log in plain text.
      logger.warn({ path: req.path }, '[auth] login rejected')
      await delay(FAILURE_DELAY_MS)
      const response: ApiResponse<null> = { data: null, error: REJECTION, status: 401 }
      res.status(401).json(response)
      return
    }

    logger.info({ userId }, '[auth] login succeeded')
    sendToken(res, userId, secret)
  } catch (err) {
    // sendServerError logs through describeError, which reads only known-safe
    // fields — a database driver error here can carry the connection string.
    sendServerError(res, err, 'POST /auth/login')
  }
})

function sendToken(res: Response, userId: string, secret: string): void {
  const exp = expiryFrom()
  const token = signToken({ sub: userId, exp }, secret)
  const response: ApiResponse<AuthLoginResponse> = {
    data: { token, expires_at: new Date(exp * 1000).toISOString() },
    error: null,
    status: 200,
  }
  res.status(200).json(response)
}

function sendError(res: Response, status: number, error: string): void {
  const response: ApiResponse<null> = { data: null, error, status }
  res.status(status).json(response)
}

/**
 * The second hole in the gate: an owner-minted invite (`POST /invites`) traded
 * for a new account and a session. Like `/login`, it responds on every path.
 *
 * 410 for a code that is unknown, used or expired (one answer for all three);
 * 409 for a taken username, which leaves the invite usable.
 */
authRouter.post('/redeem', async (req: Request, res: Response) => {
  const secret = process.env['AUTH_TOKEN_SECRET']
  if (!secret) {
    logger.error('AUTH_TOKEN_SECRET is not configured — refusing to redeem invites')
    sendError(res, 503, 'API unavailable: server is not configured for authenticated access')
    return
  }

  const body = req.body as { code?: unknown; username?: unknown; passphrase?: unknown } | undefined
  const code = readCredential(body?.code)
  const username = readCredential(body?.username)
  const passphrase = readCredential(body?.passphrase)

  if (code === null || username === null || passphrase === null) {
    sendError(res, 400, 'code, username and passphrase are required')
    return
  }
  if (code.length > MAX_CODE_LENGTH) {
    sendError(res, 410, 'This invite has expired or has already been used')
    return
  }
  if (!isValidUsername(username)) {
    sendError(res, 400, 'username must be 2-32 lowercase letters, digits, dots, dashes or underscores')
    return
  }
  if (passphrase.length < MIN_PASSPHRASE_LENGTH || passphrase.length > MAX_PASSPHRASE_LENGTH) {
    sendError(res, 400, `passphrase must be ${MIN_PASSPHRASE_LENGTH} to ${MAX_PASSPHRASE_LENGTH} characters`)
    return
  }

  try {
    const result = await redeemInvite(code, username, passphrase)
    if (!result.ok) {
      logger.warn({ reason: result.reason }, '[auth] invite redemption refused')
      if (result.reason === 'username_taken') sendError(res, 409, 'That username is taken')
      else sendError(res, 410, 'This invite has expired or has already been used')
      return
    }
    logger.info({ userId: result.userId }, '[auth] invite redeemed')
    sendToken(res, result.userId, secret)
  } catch (err) {
    sendServerError(res, err, 'POST /auth/redeem')
  }
})
