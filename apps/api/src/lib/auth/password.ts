import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

/**
 * Passphrase hashing for the login route.
 *
 * `node:crypto`'s scrypt, no new dependency. This module is pure — no env
 * reads, no Express types, no database — so the algorithm can be tested
 * directly rather than through a route.
 *
 * **The stored string is self-describing** — `scrypt$N$r$p$<salt>$<hash>` — so
 * the cost parameters travel with the hash. Raising `SCRYPT_N` later does not
 * invalidate an existing row: `verifyPassword` derives with the parameters the
 * row was written with, not the ones this file currently declares.
 *
 * **Honest limit, per the handoff:** there is no rate limiting on the login
 * route. There is no Redis and no store for counters, so scrypt's cost plus the
 * fixed failure delay in `routes/auth.ts` is the whole defence against guessing.
 * **Passphrase strength is the real control** — say that to whoever you add.
 */

/** ~16 MB of memory per derivation (128 · N · r). Interactive-login scale. */
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1

const SALT_BYTES = 16
const KEY_BYTES = 64

const PREFIX = 'scrypt'
const FIELD_COUNT = 6

type ScryptParams = { N: number; r: number; p: number }

/**
 * Node refuses a derivation needing more than `maxmem` and the default is 32 MB,
 * which N=16384/r=8 fits under. Set it explicitly anyway: a future parameter
 * bump would otherwise fail as an opaque `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`
 * rather than simply costing more.
 */
function maxmemFor(params: ScryptParams): number {
  return 128 * params.N * params.r * 2 + 1024 * 1024
}

function deriveKey(
  passphrase: string,
  salt: Buffer,
  params: ScryptParams,
  keyBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      passphrase,
      salt,
      keyBytes,
      { N: params.N, r: params.r, p: params.p, maxmem: maxmemFor(params) },
      (err, key) => {
        if (err) reject(err)
        else resolve(key)
      },
    )
  })
}

/**
 * @throws if the passphrase is empty — an empty passphrase is not a credential,
 * and letting one be stored would make the "both columns present" rule in
 * `db/schema.ts` meaningless.
 */
export async function hashPassword(passphrase: string): Promise<string> {
  if (passphrase === '') throw new Error('passphrase must not be empty')

  const params: ScryptParams = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }
  const salt = randomBytes(SALT_BYTES)
  const key = await deriveKey(passphrase, salt, params, KEY_BYTES)

  return [
    PREFIX,
    String(params.N),
    String(params.r),
    String(params.p),
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$')
}

/** A positive integer, parsed strictly — `Number('8abc')` is NaN, but `parseInt` is 8. */
function positiveInt(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : null
}

type StoredHash = { params: ScryptParams; salt: Buffer; key: Buffer }

/**
 * Returns null for anything this module did not write. A malformed stored value
 * must fail the login rather than throw: a row hand-edited in `db:studio` would
 * otherwise turn a wrong passphrase into a 500 that looks like an outage.
 */
function parseStored(stored: string): StoredHash | null {
  const parts = stored.split('$')
  if (parts.length !== FIELD_COUNT || parts[0] !== PREFIX) return null

  const N = positiveInt(parts[1])
  const r = positiveInt(parts[2])
  const p = positiveInt(parts[3])
  const saltRaw = parts[4]
  const keyRaw = parts[5]
  if (N === null || r === null || p === null) return null
  if (saltRaw === undefined || keyRaw === undefined) return null

  // scrypt requires N to be a power of two greater than 1, and throws otherwise.
  if (N < 2 || (N & (N - 1)) !== 0) return null

  const salt = Buffer.from(saltRaw, 'base64')
  const key = Buffer.from(keyRaw, 'base64')
  // Buffer.from is lenient about base64 — junk decodes to a short buffer rather
  // than throwing, so the emptiness check is what actually rejects it.
  if (salt.length === 0 || key.length === 0) return null

  return { params: { N, r, p }, salt, key }
}

/**
 * Constant-time within a given stored hash. It is not constant-time *across*
 * different `N` values, and it does not need to be: the parameters are not
 * secret and every row this code writes carries the same ones.
 */
export async function verifyPassword(passphrase: string, stored: string): Promise<boolean> {
  const parsed = parseStored(stored)
  if (parsed === null) return false
  if (passphrase === '') return false

  try {
    // Derive to the stored key's own length, so a row written with a different
    // KEY_BYTES still verifies instead of failing the length check below.
    const candidate = await deriveKey(passphrase, parsed.salt, parsed.params, parsed.key.length)
    // Lengths are equal by construction, but timingSafeEqual *throws* on a
    // mismatch rather than returning false, so the guard stays.
    if (candidate.length !== parsed.key.length) return false
    return timingSafeEqual(candidate, parsed.key)
  } catch {
    // An unusable parameter set that got past parseStored. Not a valid login.
    return false
  }
}

/**
 * A stored hash for a username that does not exist.
 *
 * `routes/auth.ts` verifies against this when the lookup misses, so an unknown
 * username costs the same scrypt derivation as a known one. Without it, "no
 * such user" returns in microseconds and "wrong passphrase" in tens of
 * milliseconds, which is a username oracle readable over the network.
 *
 * Built once at module load from a random passphrase nobody holds.
 */
let dummyHashPromise: Promise<string> | null = null
export function dummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomBytes(32).toString('hex'))
  return dummyHashPromise
}
