import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The session token — a signed statement that a given user id logged in.
 *
 * Format: `<base64url(payload JSON)>.<base64url(HMAC-SHA256 of that string)>`.
 * Deliberately not a JWT: there is no algorithm field to confuse, no `alg:none`
 * to reject, and no library. One algorithm, always.
 *
 * Pure — no env reads, no Express types — the same shape as
 * `lib/telegram/initData.ts` and for the same reason: the middleware stays a
 * thin gate and this is directly testable. `verifyToken` returns a
 * discriminated result and never throws.
 *
 * **Two honest limits, to be read as design rather than discovered later:**
 *
 * - **There is no revocation.** There is no session table, so a token stands
 *   until it expires. Rotating `AUTH_TOKEN_SECRET` invalidates every token at
 *   once and is the only lever. At five users that is acceptable.
 * - **The payload is signed, not encrypted.** Anyone holding a token can read
 *   the user id in it. Nothing secret goes in here.
 */

/**
 * 30 days. A crag is the wrong place to be logged out — the app is opened at a
 * trailhead, on a phone, often with no signal to re-authenticate over.
 */
export const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

export type TokenClaims = {
  /** The `users.id` this token authenticates as. */
  sub: string
  /** Expiry, seconds since the epoch. */
  exp: number
}

export type TokenVerification = { ok: true; claims: TokenClaims } | { ok: false; reason: string }

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

/**
 * Fixed-length digest comparison. The computed signature is a known length but
 * the provided one is attacker-controlled and may be any length, and
 * `timingSafeEqual` throws rather than returning false on a length mismatch —
 * which would turn a malformed credential into a 500.
 */
function signaturesMatch(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/**
 * @throws if the secret is empty. A token signed with an empty key verifies
 * against an unconfigured server, so minting one must be impossible rather than
 * merely useless.
 */
export function signToken(claims: TokenClaims, secret: string): string {
  if (secret === '') throw new Error('AUTH_TOKEN_SECRET must not be empty')
  if (claims.sub === '') throw new Error('token subject must not be empty')
  if (!Number.isFinite(claims.exp)) throw new Error('token expiry must be a finite number')

  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

function parseClaims(payload: string): TokenClaims | null {
  let decoded: string
  try {
    decoded = Buffer.from(payload, 'base64url').toString('utf8')
  } catch {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(decoded)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) return null
  const { sub, exp } = parsed as { sub?: unknown; exp?: unknown }
  if (typeof sub !== 'string' || sub === '') return null
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return null
  return { sub, exp }
}

/**
 * @param token the credential, verbatim, without its `Session ` scheme prefix
 * @param secret `AUTH_TOKEN_SECRET`
 * @param nowMs injectable clock, for tests
 */
export function verifyToken(
  token: string,
  secret: string,
  nowMs: number = Date.now(),
): TokenVerification {
  if (token.trim() === '') return { ok: false, reason: 'empty token' }
  if (secret.trim() === '') return { ok: false, reason: 'no token secret configured' }

  // Exactly two segments. A three-segment token is a JWT presented by mistake,
  // or an attacker appending to the payload; either way the signature below
  // covers only `parts[0]`, so the shape has to be pinned here.
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'malformed token' }
  const payload = parts[0]
  const signature = parts[1]
  if (payload === undefined || payload === '') return { ok: false, reason: 'malformed token' }
  if (signature === undefined || signature === '') return { ok: false, reason: 'malformed token' }

  // Signed over the raw payload *string*, never over re-serialised claims —
  // JSON.stringify of a parsed object does not reproduce the bytes that were
  // signed (key order, whitespace, number formatting), so a re-serialising
  // verifier rejects its own valid tokens.
  if (!signaturesMatch(signature, sign(payload, secret))) {
    return { ok: false, reason: 'signature mismatch' }
  }

  const claims = parseClaims(payload)
  if (claims === null) return { ok: false, reason: 'malformed payload' }

  // Everything above is signed, so the expiry can be trusted to be ours.
  if (claims.exp * 1000 <= nowMs) return { ok: false, reason: 'token expired' }

  return { ok: true, claims }
}

/** The expiry a token minted `nowMs` should carry, in seconds since the epoch. */
export function expiryFrom(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000) + TOKEN_TTL_SECONDS
}
