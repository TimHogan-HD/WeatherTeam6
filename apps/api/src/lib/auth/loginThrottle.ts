import { createHash } from 'node:crypto'
import { and, count, eq, gt, lt } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { loginAttempts } from '../../db/schema.js'

/**
 * A cap on sign-in attempts per username, so a passphrase cannot be guessed at
 * scrypt's pace forever. Postgres is the counter store: there is no Redis.
 *
 * Per username, not per address: the web app reaches the API through Vercel's
 * rewrite, so every reader can arrive from the same address and a per-address
 * cap would lock everyone out at once. The cost is that anyone who knows a
 * username can keep it locked by guessing; it unlocks
 * `LOGIN_ATTEMPT_WINDOW_MS` after they stop.
 *
 * Judgement calls, not measurements: ten tries covers a few typos with room to
 * spare, and fifteen minutes makes a dictionary of even a thousand words take
 * a day per username.
 */
export const LOGIN_ATTEMPT_LIMIT = 10
export const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000

/** Exported for `check:auth`'s cleanup; nothing else reads a key. */
export function keyFor(username: string): string {
  return createHash('sha256').update(`login:${username.trim().toLowerCase()}`).digest('hex')
}

async function attemptsSince(key: string, since: Date): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key_hash, key), gt(loginAttempts.attempted_at, since)))
  return rows[0]?.n ?? 0
}

/**
 * Records this attempt and says whether it may go ahead. Called before the
 * passphrase is checked, so a burst fired in parallel is counted as it lands
 * rather than after each scrypt finishes: every request inserts, then counts
 * what is there, and any that sees more than the limit is refused.
 *
 * A username already at the limit is refused without inserting, so a flood of
 * refused requests adds no rows.
 */
export async function admitLoginAttempt(username: string, now: Date = new Date()): Promise<boolean> {
  const key = keyFor(username)
  const since = new Date(now.getTime() - LOGIN_ATTEMPT_WINDOW_MS)
  if ((await attemptsSince(key, since)) >= LOGIN_ATTEMPT_LIMIT) return false

  await db.insert(loginAttempts).values({ key_hash: key, attempted_at: now })
  // Rows past the window decide nothing; dropping them here keeps the table to
  // one window's worth without a cron.
  await db.delete(loginAttempts).where(lt(loginAttempts.attempted_at, since))
  return (await attemptsSince(key, since)) <= LOGIN_ATTEMPT_LIMIT
}

/** A correct passphrase clears the count, so typos before it are forgiven. */
export async function clearLoginAttempts(username: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.key_hash, keyFor(username)))
}
