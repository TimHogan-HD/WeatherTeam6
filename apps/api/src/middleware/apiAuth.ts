import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';
import { validateInitData } from '../lib/telegram/initData.js';

/**
 * Gate for `/api/v1/*`.
 *
 * Why this exists: `resolveUser` injects DEFAULT_USER_ID for every request while
 * AUTH_ENABLED=false, so an unauthenticated caller is treated as the owner —
 * including on POST /locations, POST /trips, DELETE /trips/:id, POST /walls and
 * DELETE /walls/:id. The deployment is reachable on a public URL: Vercel's
 * "Standard Protection" (ssoProtection deploymentType `all_except_custom_domains`)
 * exempts the production alias, and protecting production requires a paid plan.
 * So the gate belongs here, in the app, where it is free and portable.
 *
 * Credential travels in `Authorization`, deliberately, not a custom header:
 * createApp's CORS layer allows exactly `Content-Type, Authorization`, so a
 * custom header would fail preflight from a browser client.
 *
 * **Two accepted schemes on that one header:**
 *
 * - `Bearer <API_SHARED_SECRET>` — server-side callers, scripts, manual curl.
 *   This is what actually keeps the production alias closed, and it is not
 *   replaced by the Mini App's scheme. If it is unset the gate fails closed.
 * - `tma <initDataRaw>` — the Telegram Mini App, validated by HMAC against
 *   TELEGRAM_BOT_TOKEN. Telegram's own convention for the header, so nothing
 *   custom has to be negotiated with the webview.
 */

/** Fixed-length digest comparison — a bare `===` leaks the secret via response timing. */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function credentialFor(scheme: 'Bearer' | 'tma', header: string | undefined): string | null {
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
    // Not a 503: the Bearer scheme is unaffected and the gate is still shut.
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

  // Fail closed. An unset secret must not silently mean "open" — that is the
  // exact failure this middleware exists to correct. Mirrors the CRON_SECRET
  // handling in routes/cron.ts. Checked before the scheme is read so that a
  // half-configured server cannot be reached through the tma path either.
  if (!expected) {
    logger.error('API_SHARED_SECRET is not configured — refusing all /api/v1 requests');
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

  const initData = credentialFor('tma', header);
  if (initData !== null) {
    if (initDataAccepted(req, res, initData)) next();
    return;
  }

  const bearer = credentialFor('Bearer', header);
  if (bearer === null || !secretMatches(bearer, expected)) {
    reject(req, res, 'bad or missing bearer');
    return;
  }

  next();
}
