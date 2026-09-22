import { and, eq, isNotNull } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'
import { dummyPasswordHash, verifyPassword } from './password.js'

/**
 * Username + passphrase → a user id, or null.
 *
 * The one place the "both columns present" rule from `db/schema.ts` is enforced.
 * `username` and `password_hash` are nullable so the seeded owner row needed no
 * backfill, which means **a row with either one null must not be able to log
 * in** — enforced in the query with `isNotNull`, not left to a `!== null` check
 * a later edit could drop.
 *
 * A miss and a wrong passphrase are indistinguishable from the outside, in the
 * return value *and in the time taken*: an unknown username is verified against
 * `dummyPasswordHash()` so it pays the same scrypt cost. Without that, the
 * difference between "no such user" and "wrong passphrase" is tens of
 * milliseconds and reads as a username oracle over the network.
 */
export async function authenticateUser(
  username: string,
  passphrase: string,
): Promise<string | null> {
  const trimmed = username.trim()

  const rows =
    trimmed === ''
      ? []
      : await db
          .select({ id: users.id, passwordHash: users.password_hash })
          .from(users)
          .where(
            and(
              eq(users.username, trimmed),
              isNotNull(users.username),
              isNotNull(users.password_hash),
            ),
          )
          .limit(1)

  const row = rows[0]
  // `isNotNull` already excluded a null hash; the fallback is what keeps the
  // work constant for a miss, and the `?? ''` is unreachable rather than a
  // default.
  const stored = row?.passwordHash ?? (await dummyPasswordHash())

  const ok = await verifyPassword(passphrase, stored)
  if (!ok || row === undefined) return null
  return row.id
}
