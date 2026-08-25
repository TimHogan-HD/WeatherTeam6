import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';

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
 * Forward-compatible with the Mini App: Telegram's convention for Mini App
 * requests is `Authorization: tma <initDataRaw>`. When initData HMAC validation
 * lands (Task 6), it slots in as a second accepted scheme on this same header —
 * `Bearer` stays for server-side callers and manual curl.
 */

/** Fixed-length digest comparison — a bare `===` leaks the secret via response timing. */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer[ ]+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? null;
}

export function requireApiAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env['API_SHARED_SECRET'];

  // Fail closed. An unset secret must not silently mean "open" — that is the
  // exact failure this middleware exists to correct. Mirrors the CRON_SECRET
  // handling in routes/cron.ts.
  if (!expected) {
    logger.error('API_SHARED_SECRET is not configured — refusing all /api/v1 requests');
    res.status(503).json({
      data: null,
      error: 'API unavailable: server is not configured for authenticated access',
      status: 503,
    });
    return;
  }

  const rawHeader = req.headers.authorization;
  const provided = bearerToken(Array.isArray(rawHeader) ? rawHeader[0] : rawHeader);

  if (provided === null || !secretMatches(provided, expected)) {
    // Never log the provided value, and never say which half was wrong.
    logger.warn({ path: req.path, method: req.method }, '[apiAuth] rejected unauthenticated request');
    res.status(401).json({ data: null, error: 'Unauthorized', status: 401 });
    return;
  }

  next();
}
