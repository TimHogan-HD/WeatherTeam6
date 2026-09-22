import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';
import { verifyToken } from '../lib/auth/token.js';
import { validateInitData } from '../lib/telegram/initData.js';

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
 * **Three accepted schemes on that one header:**
 *
 * - `Session <token>` — a real user, signed by `lib/auth/token.ts` and minted by
 *   POST /api/v1/auth/login. `req.userId` is the token's subject, so two users
 *   see two different lists.
 * - `Bearer <API_SHARED_SECRET>` — server-side callers, scripts, manual curl.
 *   Acts as DEFAULT_USER_ID. This is what actually keeps the production alias
 *   closed and it is not replaced by the schemes around it.
 * - `tma <initDataRaw>` — the Telegram Mini App, validated by HMAC against
 *   TELEGRAM_BOT_TOKEN, also acting as DEFAULT_USER_ID. **Deleted in migration
 *   Phase 3** (`docs/handoffs/leave-telegram-v1.md`), not before: the Mini App
 *   is still launched from Telegram until Phase 2 ships.
 *
 * **`req.userId` is set here and nowhere else under /api/v1.** `resolveUser` is
 * no longer mounted app-wide — it sits on `/api/telegram` alone — so a route
 * mounted outside this gate reads `undefined` through a type that says it
 * cannot be (defect class 8: a permissive type that silently discards data).
 * If you mount a new router in `index.ts`, it goes inside `/api/v1` or it
 * brings its own identity.
 */

/** Fixed-length digest comparison — a bare `===` leaks the secret via response timing. */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function credentialFor(
  scheme: 'Bearer' | 'tma' | 'Session',
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
 * The owner identity, for the two schemes that authenticate a *credential*
 * rather than a *user*.
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
    logger.error('DEFAULT_USER_ID is not set — the Bearer and tma schemes cannot resolve a user');
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

/**
 * A valid signature proves the request came from *a* Telegram user, not from
 * the owner. The bot is single-user and TELEGRAM_CHAT_ID is its auth boundary
 * (see routes/telegramWebhook.ts); in a private chat that id is the user's own.
 * Without this check, anyone who finds the bot and opens its menu button would
 * hold DEFAULT_USER_ID's rights over the whole API.
 */
function initDataAccepted(req: Request, res: Response, initData: string): boolean {
  const botToken = process.env['TELEGRAM_BOT_TOKEN'];
  const expectedUserId = process.env['TELEGRAM_CHAT_ID'];

  if (!botToken || !expectedUserId) {
    // Not a 503: the other schemes are unaffected and the gate is still shut.
    logger.error(
      '[apiAuth] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured — the tma scheme is unavailable',
    );
    reject(req, res, 'tma unconfigured');
    return false;
  }

  const result = validateInitData(initData, botToken);
  if (!result.ok) {
    // Field *names* only, never values — the payload is the credential.
    //
    // This exists because a hash mismatch is otherwise undiagnosable from the
    // outside, and one cost a full release cycle: `signature` was being
    // excluded from the check string (that is the Ed25519 rule, not the
    // bot-token rule), so every launch from a Bot API 7.10+ client 401'd while
    // the unit tests stayed green. A list of the keys Telegram actually sent
    // would have pointed straight at it.
    const fields =
      result.reason === 'hash mismatch'
        ? [...new Set([...new URLSearchParams(initData).keys()])].sort().join(',')
        : undefined;
    logger.warn({ fields }, '[apiAuth] initData fields present at rejection');
    reject(req, res, `tma invalid: ${result.reason}`);
    return false;
  }

  if (String(result.user.id) !== expectedUserId.trim()) {
    reject(req, res, 'tma user is not the owner');
    return false;
  }

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

  const initData = credentialFor('tma', header);
  if (initData !== null) {
    if (initDataAccepted(req, res, initData) && assignDefaultUser(req, res)) next();
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
