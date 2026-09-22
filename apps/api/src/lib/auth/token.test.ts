import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { TOKEN_TTL_SECONDS, expiryFrom, signToken, verifyToken } from './token.js'

const SECRET = 'test-token-secret'
const SUB = '00000000-0000-0000-0000-000000000001'

/** A token whose expiry is far enough out that no test races it. */
function freshToken(sub = SUB, secret = SECRET): string {
  return signToken({ sub, exp: Math.floor(Date.now() / 1000) + 3600 }, secret)
}

describe('signToken', () => {
  it('produces exactly two base64url segments', () => {
    const parts = freshToken().split('.')
    expect(parts).toHaveLength(2)
    for (const part of parts) expect(part).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('refuses to sign with an empty secret', () => {
    // A token signed with an empty key would verify against an unconfigured
    // server, so minting one has to be impossible rather than merely useless.
    expect(() => signToken({ sub: SUB, exp: expiryFrom() }, '')).toThrow()
  })

  it('refuses an empty subject', () => {
    expect(() => signToken({ sub: '', exp: expiryFrom() }, SECRET)).toThrow()
  })

  it('refuses a non-finite expiry', () => {
    expect(() => signToken({ sub: SUB, exp: Number.NaN }, SECRET)).toThrow()
  })
})

describe('verifyToken', () => {
  it('round-trips the subject it was signed with', () => {
    const result = verifyToken(freshToken(), SECRET)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.claims.sub).toBe(SUB)
  })

  it('rejects a token signed with a different secret', () => {
    // Rotating AUTH_TOKEN_SECRET is the only revocation mechanism there is, so
    // this is the assertion that makes rotation mean anything.
    const result = verifyToken(freshToken(SUB, 'another-secret'), SECRET)
    expect(result).toEqual({ ok: false, reason: 'signature mismatch' })
  })

  it('rejects a payload edited after signing', () => {
    // The attack this exists to stop: take your own token, swap the user id in
    // the readable payload, keep the signature.
    const token = freshToken()
    const [payload, signature] = token.split('.')
    const claims = JSON.parse(Buffer.from(String(payload), 'base64url').toString('utf8')) as {
      sub: string
      exp: number
    }
    claims.sub = '00000000-0000-0000-0000-0000000000ff'
    const forged = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')

    const result = verifyToken(`${forged}.${String(signature)}`, SECRET)
    expect(result).toEqual({ ok: false, reason: 'signature mismatch' })
  })

  it('accepts a correctly signed payload built by hand, not only by signToken', () => {
    // Defect class 11: a validator tested only against its own signing helper
    // proves the code agrees with itself. This constructs the token the way the
    // format is documented — HMAC over the base64url payload string — so a
    // change to either side breaks it.
    const payload = Buffer.from(
      JSON.stringify({ sub: SUB, exp: Math.floor(Date.now() / 1000) + 60 }),
      'utf8',
    ).toString('base64url')
    const signature = createHmac('sha256', SECRET).update(payload).digest('base64url')

    const result = verifyToken(`${payload}.${signature}`, SECRET)
    expect(result.ok).toBe(true)
  })

  it('rejects an expired token', () => {
    const token = signToken({ sub: SUB, exp: Math.floor(Date.now() / 1000) - 1 }, SECRET)
    expect(verifyToken(token, SECRET)).toEqual({ ok: false, reason: 'token expired' })
  })

  it('treats the expiry second itself as expired, not valid', () => {
    // The boundary, on the input that threatens it: exp === now must not pass.
    const nowMs = 1_800_000_000_000
    const token = signToken({ sub: SUB, exp: nowMs / 1000 }, SECRET)
    expect(verifyToken(token, SECRET, nowMs).ok).toBe(false)
    expect(verifyToken(token, SECRET, nowMs - 1).ok).toBe(true)
  })

  it('rejects a three-segment token', () => {
    // A JWT presented by mistake, or an attacker appending to the payload. The
    // signature only ever covers segment one, so the shape has to be pinned.
    const token = freshToken()
    expect(verifyToken(`${token}.extra`, SECRET)).toEqual({ ok: false, reason: 'malformed token' })
  })

  it('rejects a token with no signature segment', () => {
    const [payload] = freshToken().split('.')
    expect(verifyToken(String(payload), SECRET).ok).toBe(false)
    expect(verifyToken(`${String(payload)}.`, SECRET).ok).toBe(false)
  })

  it('rejects an empty token and an empty secret', () => {
    expect(verifyToken('', SECRET)).toEqual({ ok: false, reason: 'empty token' })
    expect(verifyToken('   ', SECRET)).toEqual({ ok: false, reason: 'empty token' })
    expect(verifyToken(freshToken(), '')).toEqual({
      ok: false,
      reason: 'no token secret configured',
    })
  })

  it('does not throw on a signature of a different length', () => {
    // timingSafeEqual throws on unequal buffer lengths — the sha256 digest step
    // is what prevents that. A one-character signature must be a rejection,
    // not a 500.
    const [payload] = freshToken().split('.')
    expect(() => verifyToken(`${String(payload)}.x`, SECRET)).not.toThrow()
    expect(verifyToken(`${String(payload)}.x`, SECRET).ok).toBe(false)
  })

  it('rejects a correctly signed payload that is not a claims object', () => {
    // Signed, so it got past the HMAC — the shape check below it is what
    // catches a payload of `null`, a bare number or a missing `sub`.
    for (const body of ['null', '42', '"hello"', '{}', '{"sub":"x"}', '{"exp":123}']) {
      const payload = Buffer.from(body, 'utf8').toString('base64url')
      const signature = createHmac('sha256', SECRET).update(payload).digest('base64url')
      expect(verifyToken(`${payload}.${signature}`, SECRET)).toEqual({
        ok: false,
        reason: 'malformed payload',
      })
    }
  })

  it('rejects a correctly signed payload that is not JSON at all', () => {
    const payload = Buffer.from('not json', 'utf8').toString('base64url')
    const signature = createHmac('sha256', SECRET).update(payload).digest('base64url')
    expect(verifyToken(`${payload}.${signature}`, SECRET)).toEqual({
      ok: false,
      reason: 'malformed payload',
    })
  })
})

describe('expiryFrom', () => {
  it('is 30 days out', () => {
    // A crag is the wrong place to be logged out. If this changes, it is a
    // decision, not a refactor.
    expect(TOKEN_TTL_SECONDS).toBe(30 * 24 * 60 * 60)
    const nowMs = 1_800_000_000_000
    expect(expiryFrom(nowMs)).toBe(1_800_000_000 + TOKEN_TTL_SECONDS)
  })
})
