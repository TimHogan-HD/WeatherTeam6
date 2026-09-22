import { describe, expect, it } from 'vitest'
import { dummyPasswordHash, hashPassword, verifyPassword } from './password.js'

const PASSPHRASE = 'correct-horse-battery-staple'

describe('hashPassword', () => {
  it('produces a self-describing scrypt string', async () => {
    const stored = await hashPassword(PASSPHRASE)
    const parts = stored.split('$')
    expect(parts).toHaveLength(6)
    expect(parts[0]).toBe('scrypt')
    // The cost parameters travel with the hash, so raising them later does not
    // invalidate a row written today.
    expect(Number(parts[1])).toBeGreaterThan(1)
    expect(Number(parts[2])).toBeGreaterThan(0)
    expect(Number(parts[3])).toBeGreaterThan(0)
  })

  it('never contains the passphrase', async () => {
    expect(await hashPassword(PASSPHRASE)).not.toContain(PASSPHRASE)
  })

  it('salts, so the same passphrase hashes differently every time', async () => {
    const a = await hashPassword(PASSPHRASE)
    const b = await hashPassword(PASSPHRASE)
    expect(a).not.toBe(b)
    // ...and both still verify. A salt that was not stored would pass the
    // inequality above and fail here.
    expect(await verifyPassword(PASSPHRASE, a)).toBe(true)
    expect(await verifyPassword(PASSPHRASE, b)).toBe(true)
  })

  it('refuses an empty passphrase', async () => {
    await expect(hashPassword('')).rejects.toThrow()
  })
})

describe('verifyPassword', () => {
  it('accepts the right passphrase and rejects a wrong one', async () => {
    const stored = await hashPassword(PASSPHRASE)
    expect(await verifyPassword(PASSPHRASE, stored)).toBe(true)
    expect(await verifyPassword(`${PASSPHRASE}x`, stored)).toBe(false)
    expect(await verifyPassword(PASSPHRASE.slice(0, -1), stored)).toBe(false)
    expect(await verifyPassword(PASSPHRASE.toUpperCase(), stored)).toBe(false)
  })

  it('rejects an empty passphrase against a real hash', async () => {
    expect(await verifyPassword('', await hashPassword(PASSPHRASE))).toBe(false)
  })

  it('verifies against the parameters the row carries, not the current constants', async () => {
    // Written by hand at N=1024 — a value this module does not use — to prove
    // the derivation reads the stored parameters. If verifyPassword ignored
    // them and used SCRYPT_N, this would fail.
    const { scryptSync, randomBytes } = await import('node:crypto')
    const salt = randomBytes(16)
    const key = scryptSync(PASSPHRASE, salt, 64, { N: 1024, r: 8, p: 1 })
    const stored = `scrypt$1024$8$1$${salt.toString('base64')}$${key.toString('base64')}`

    expect(await verifyPassword(PASSPHRASE, stored)).toBe(true)
    expect(await verifyPassword('wrong', stored)).toBe(false)
  })

  it('verifies a stored hash of a different key length', async () => {
    // The derivation asks for the stored key's own length, so a row written
    // with a different KEY_BYTES still verifies rather than failing a length
    // check that looks like a wrong passphrase.
    const { scryptSync, randomBytes } = await import('node:crypto')
    const salt = randomBytes(16)
    const key = scryptSync(PASSPHRASE, salt, 32, { N: 1024, r: 8, p: 1 })
    const stored = `scrypt$1024$8$1$${salt.toString('base64')}$${key.toString('base64')}`

    expect(await verifyPassword(PASSPHRASE, stored)).toBe(true)
  })

  it('returns false rather than throwing for a malformed stored value', async () => {
    // A row hand-edited in db:studio must fail the login, not 500 the route.
    const malformed = [
      '',
      'not-a-hash',
      'scrypt$16384$8$1$onlyfivefields',
      'scrypt$16384$8$1$salt$hash$extra',
      'bcrypt$16384$8$1$c2FsdA==$aGFzaA==',
      'scrypt$0$8$1$c2FsdA==$aGFzaA==',
      'scrypt$-1$8$1$c2FsdA==$aGFzaA==',
      'scrypt$abc$8$1$c2FsdA==$aGFzaA==',
      'scrypt$16384$0$1$c2FsdA==$aGFzaA==',
      // N must be a power of two greater than 1, or scrypt itself throws.
      'scrypt$16383$8$1$c2FsdA==$aGFzaA==',
      'scrypt$16384$8$1$$aGFzaA==',
      'scrypt$16384$8$1$c2FsdA==$',
    ]
    for (const stored of malformed) {
      await expect(verifyPassword(PASSPHRASE, stored)).resolves.toBe(false)
    }
  })

  it('rejects a stored value whose salt was swapped', async () => {
    const stored = await hashPassword(PASSPHRASE)
    const parts = stored.split('$')
    parts[4] = Buffer.from('a-different-salt').toString('base64')
    expect(await verifyPassword(PASSPHRASE, parts.join('$'))).toBe(false)
  })
})

describe('dummyPasswordHash', () => {
  it('is a usable hash that no passphrase opens', async () => {
    const stored = await dummyPasswordHash()
    // It has to parse, or the constant-time miss path in authenticateUser would
    // return early and reintroduce the username oracle it exists to close.
    expect(stored.split('$')).toHaveLength(6)
    expect(await verifyPassword(PASSPHRASE, stored)).toBe(false)
    expect(await verifyPassword('', stored)).toBe(false)
  })

  it('is built once and reused', async () => {
    expect(await dummyPasswordHash()).toBe(await dummyPasswordHash())
  })
})
