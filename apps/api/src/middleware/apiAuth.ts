import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';
import { verifyToken } from '../lib/auth/token.js';

/**
 * Set by `requireApiAuth` and by nothing else.
 *
 * It lived in `middleware/auth.ts` while `resolveUser` existed for the Telegram
 * webhook. That file is gone with the bot, so the declaration lives with the one
 * function that assigns it.
 *
 * Non-optional deliberately: a route under `/api/v1` always has a user. That is
 * also why a router mounted **outside** this gate is defect class 8 — it reads
 * `undefined` through a type that says it cannot be.
 */
declare module 'express-serve-static-core' {
  interface Request {
    userId: string;
  }
}

/**
 * Gate for `/api/v1/*`, and **the single place identity is decided** for every
 * route under it.
 *
 * Why this exists: the API is reachable on a public URL, and until this
 * middleware ran, `resolveUser` handed every unauthenticated caller
 * DEFAULT_USER_ID — owner rights, including POST /locations, POST /trips,
 * DELETE /trips/:id, POST /walls and DELETE /walls/:id. The gate belongs here,
 * in the app, where it is free and portable. (Vercel Authentication at "All
 * Deployments" scope would also cover the production alias, free on Hobby — but
 * it gates by Vercel account login, which a climbing partner will not have.)
 *
 * Credential travels in `Authorization`, deliberately, not a custom header:
 * createApp's CORS layer allows exactly `Content-Type, Authorization`, so a
 * custom header would fail preflight from a browser client.
 *
 * **Two accepted schemes on that one header:**
 *
 * - `Session <token>` — a real user, signed by `lib/auth/token.ts` and minted by
 *   POST /api/v1/auth/login. `req.userId` is the token's subject, so two users
 *   see two different lists.
 * - `Bearer <API_SHARED_SECRET>` — server-side callers, scripts, manual curl.
 *   Acts as DEFAULT_USER_ID. This is what actually keeps the production alias
 *   closed and it is not replaced by the scheme above it.
 *
 * A third, `tma <initDataRaw>`, went with the bot in migration Phase 3.
 * **Do not revive it**: the client no longer loads the Telegram SDK, so nothing
 * can mint an `initData` and the scheme would accept a credential that does not
 * exist.
 *
 * **`req.userId` is set here and nowhere else in the app.** `resolveUser` is
 * deleted along with the webhook it survived for, so a route mounted outside
 * this gate reads `undefined` through a type that says it cannot be (defect
 * class 8: a permissive type that silently discards data). If you mount a new
 * router in `index.ts`, it goes inside `/api/v1` or it brings its own identity.
 */

/** Fixed-length digest comparison — a bare `===` leaks the secret via response timing. */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function credentialFor(
  scheme: 'Bearer' | 'Session',
  header: string | undefined,
): string | null {
  if (!header) return null;
  const match = new RegExp(`^${scheme}[ ]+(.+)$`, 'i').exec(header.trim());
  return match?.[1]?.trim() ?? null;
}

function reject(req: Request, res: Response, why: string): void {
  // Never log the provided value, and never tell the caller which half was wrong.
  logger.warn({ path: req.path, method: req.method, why }, '[apiAuth] rejected request');
  res.status(401).json({ data: null, error: 'Unauthorized', status: 401 });
}

/**
 * The owner identity, for the `Bearer` scheme — which authenticates a
 * *credential* rather than a *user*.
 *
 * This is the half `resolveUser` used to do app-wide. It stays a 500 rather
 * than a 401 because an authenticated caller reaching a server with no
 * DEFAULT_USER_ID is a misconfigured server, not a bad credential — and
 * silently continuing would hand every route `undefined` for `req.userId`
 * through a non-optional type.
 */
function assignDefaultUser(req: Request, res: Response): boolean {
  const defaultUserId = process.env['DEFAULT_USER_ID'];
  if (!defaultUserId) {
    logger.error('DEFAULT_USER_ID is not set — the Bearer scheme cannot resolve a user');
    res.status(500).json({
      data: null,
      error: 'Server misconfigured: DEFAULT_USER_ID missing',
      status: 500,
    });
    return false;
  }
  req.userId = defaultUserId;
  return true;
}

export function requireApiAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env['API_SHARED_SECRET'];
  const tokenSecret = process.env['AUTH_TOKEN_SECRET'];

  // Fail closed, on BOTH secrets. An unset one must not silently mean "open" —
  // that is the exact failure this middleware exists to correct. Mirrors the
  // CRON_SECRET handling in routes/cron.ts. Checked before the scheme is read
  // so that a half-configured server cannot be reached through any path.
  if (!expected || !tokenSecret) {
    logger.error(
      { missing: !expected ? 'API_SHARED_SECRET' : 'AUTH_TOKEN_SECRET' },
      'an auth secret is not configured — refusing all /api/v1 requests',
    );
    res.status(503).json({
      data: null,
      error: 'API unavailable: server is not configured for authenticated access',
      status: 503,
    });
    return;
  }

  // `authorization` is single-valued in Node's parser (string | undefined), unlike
  // the repeatable headers elsewhere in this codebase that need an Array.isArray guard.
  const header = req.headers.authorization;

  const token = credentialFor('Session', header);
  if (token !== null) {
    const result = verifyToken(token, tokenSecret);
    if (!result.ok) {
      reject(req, res, `session invalid: ${result.reason}`);
      return;
    }
    // The token's own subject, never DEFAULT_USER_ID. This is the line that
    // makes the API multi-user: every route scopes its query by req.userId, so
    // user A presenting A's token cannot see B's locations.
    req.userId = result.claims.sub;
    next();
    return;
  }

  const bearer = credentialFor('Bearer', header);
  if (bearer === null || !secretMatches(bearer, expected)) {
    reject(req, res, 'bad or missing bearer');
    return;
  }

  if (!assignDefaultUser(req, res)) return;

  next();
}
