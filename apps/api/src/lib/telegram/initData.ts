import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Validation of `Telegram.WebApp.initData` — the Mini App's credential.
 *
 * Telegram signs the launch payload with a key derived from the bot token, so
 * holding the token is enough to verify it and nothing secret has to reach the
 * client bundle. The derivation is deliberately the reverse of the obvious one:
 * the *literal string* `WebAppData` is the HMAC key and the bot token is the
 * message, not the other way round.
 *
 * This module is pure — no env reads, no Express types — so the middleware can
 * stay a thin gate and this can be tested directly.
 */

/**
 * `initData` is minted when the Mini App is opened and is never refreshed while
 * it stays open, so this is a cap on how long one launch may keep calling the
 * API, not a session idle timeout. Re-opening the app mints a fresh payload.
 */
export const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

/** Only the fields the gate needs. `id` is what binds a launch to the owner. */
export type InitDataUser = {
  id: number;
};

export type InitDataValidation =
  | { ok: true; user: InitDataUser }
  | { ok: false; reason: string };

/**
 * Fixed-length digest comparison. The computed hash is a known-length hex
 * string but the provided one is attacker-controlled and may be any length,
 * and `timingSafeEqual` throws rather than returning false on a length
 * mismatch — which would turn a malformed credential into a 500.
 */
function hashesMatch(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Everything except `hash` itself, and except `signature` — that field carries
 * Telegram's separate Ed25519 third-party signature and is explicitly excluded
 * from the bot-token check. Including it would fail every launch from a client
 * new enough to send one.
 */
function buildDataCheckString(entries: readonly (readonly [string, string])[]): string {
  return entries
    .filter(([key]) => key !== 'hash' && key !== 'signature')
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
}

function parseUserId(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const id = (parsed as { id?: unknown }).id;
    return typeof id === 'number' && Number.isInteger(id) ? id : null;
  } catch {
    // A `user` field that is not JSON cannot have come from Telegram, but the
    // hash check has already passed by the time we get here, so this is only
    // reachable with the bot token in hand. Treat it as invalid regardless.
    return null;
  }
}

/**
 * @param raw   the value of `Telegram.WebApp.initData`, verbatim
 * @param botToken `TELEGRAM_BOT_TOKEN`
 * @param nowMs injectable clock, for tests
 */
export function validateInitData(
  raw: string,
  botToken: string,
  nowMs: number = Date.now(),
): InitDataValidation {
  if (raw.trim() === '') return { ok: false, reason: 'empty initData' };
  if (botToken.trim() === '') return { ok: false, reason: 'no bot token configured' };

  // URLSearchParams accepts any string — junk parses to junk pairs rather than
  // throwing — so malformed input is caught by the hash check below, not here.
  const entries: (readonly [string, string])[] = [...new URLSearchParams(raw).entries()].map(
    ([k, v]) => [k, v] as const,
  );

  // Exactly one hash. `URLSearchParams.get` would return the first of several
  // and let an attacker append a second one that the check string then omits.
  const hashes = entries.filter(([key]) => key === 'hash').map(([, value]) => value);
  const providedHash = hashes[0];
  if (hashes.length !== 1 || providedHash === undefined || providedHash === '') {
    return { ok: false, reason: 'missing or duplicated hash' };
  }

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey)
    .update(buildDataCheckString(entries))
    .digest('hex');

  if (!hashesMatch(providedHash, expectedHash)) {
    return { ok: false, reason: 'hash mismatch' };
  }

  // Everything below is signed, so it can be trusted — but not assumed present.
  const fields = new Map(entries);

  const authDateRaw = fields.get('auth_date');
  const authDateSeconds = authDateRaw === undefined ? Number.NaN : Number(authDateRaw);
  if (!Number.isFinite(authDateSeconds)) {
    return { ok: false, reason: 'missing or malformed auth_date' };
  }
  // Only the upper bound is enforced. A future-dated `auth_date` is covered by
  // the signature, so it can only come from Telegram's own clock — rejecting it
  // would turn a few seconds of clock skew into an unexplainable 401.
  const ageSeconds = nowMs / 1000 - authDateSeconds;
  if (ageSeconds > INIT_DATA_MAX_AGE_SECONDS) {
    return { ok: false, reason: 'initData expired' };
  }

  const userId = parseUserId(fields.get('user'));
  if (userId === null) {
    // Telegram omits `user` for launches from a channel or an inline context.
    // Those cannot be attributed to the owner, so they are not accepted here.
    return { ok: false, reason: 'no user in initData' };
  }

  return { ok: true, user: { id: userId } };
}
