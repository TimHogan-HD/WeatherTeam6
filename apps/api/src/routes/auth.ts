import { Router, type Request, type Response } from 'express'
import type { ApiResponse, AuthLoginResponse } from '@weatherteam6/types'
import { authenticateUser } from '../lib/auth/credentials.js'
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
 * `requireApiAuth`, which 401s it. That is the behaviour we want: the hole in
 * the gate is exactly one method on exactly one path.
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

    const exp = expiryFrom()
    const token = signToken({ sub: userId, exp }, secret)

    logger.info({ userId }, '[auth] login succeeded')
    const response: ApiResponse<AuthLoginResponse> = {
      data: { token, expires_at: new Date(exp * 1000).toISOString() },
      error: null,
      status: 200,
    }
    res.status(200).json(response)
  } catch (err) {
    // sendServerError logs through describeError, which reads only known-safe
    // fields — a database driver error here can carry the connection string.
    sendServerError(res, err, 'POST /auth/login')
  }
})
