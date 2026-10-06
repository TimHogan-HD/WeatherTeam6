import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import type { InviteCreated } from '@weatherteam6/types'
import { db } from '../../db/index.js'
import { invites, users } from '../../db/schema.js'
import { hashPassword } from './password.js'

/**
 * Owner-minted invite links: the second way an account comes to exist, beside
 * `npm run user:add`. Nobody can sign themselves up. The owner mints a code,
 * sends the link, and the friend redeems it once.
 */

/** Long enough to reach a friend who checks their messages at the weekend. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** 192 bits: unguessable, so the unauthenticated redeem route needs no rate limit. */
const CODE_BYTES = 24

/** The ceiling on what the redeem route will hash. A real code is 32 characters. */
export const MAX_CODE_LENGTH = 64

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

/**
 * The owner is the account behind `DEFAULT_USER_ID`, which already owns the
 * seeded crags. An unset variable means nobody is the owner.
 */
export function isOwner(userId: string): boolean {
  const owner = process.env['DEFAULT_USER_ID']
  return owner !== undefined && owner !== '' && userId === owner
}

export async function mintInvite(createdBy: string, now: Date = new Date()): Promise<InviteCreated> {
  const code = randomBytes(CODE_BYTES).toString('base64url')
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS)
  await db.insert(invites).values({ code_hash: hashCode(code), created_by: createdBy, expires_at: expiresAt })
  return { code, expires_at: expiresAt.toISOString() }
}

export type RedeemResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invite_unusable' | 'username_taken' }

class UsernameTaken extends Error {}

/**
 * Claims the invite and creates the account in one transaction. A taken
 * username rolls the claim back, so the friend can try another name with the
 * same link. The invite is checked before the username, so a username's
 * existence is only revealed to someone holding a live invite.
 *
 * The claim is a conditional update, so two redemptions of one code racing
 * each other cannot both succeed.
 */
export async function redeemInvite(
  code: string,
  username: string,
  passphrase: string,
  now: Date = new Date(),
): Promise<RedeemResult> {
  // The route is unauthenticated, so a junk code must not buy a scrypt
  // derivation. The claim below still decides; this only turns most misses away.
  const live = await db
    .select({ id: invites.id })
    .from(invites)
    .where(and(eq(invites.code_hash, hashCode(code)), isNull(invites.used_at), gt(invites.expires_at, now)))
    .limit(1)
  if (live.length === 0) return { ok: false, reason: 'invite_unusable' }

  // scrypt before the transaction, so the transaction is not held open for it.
  const passwordHash = await hashPassword(passphrase)
  try {
    return await db.transaction(async (tx) => {
      const claimed = await tx
        .update(invites)
        .set({ used_at: now })
        .where(and(eq(invites.code_hash, hashCode(code)), isNull(invites.used_at), gt(invites.expires_at, now)))
        .returning({ id: invites.id })
      const invite = claimed[0]
      if (invite === undefined) return { ok: false, reason: 'invite_unusable' } as const

      const created = await tx
        .insert(users)
        .values({ username, password_hash: passwordHash, name: username })
        .onConflictDoNothing({ target: users.username })
        .returning({ id: users.id })
      const user = created[0]
      if (user === undefined) throw new UsernameTaken()

      await tx.update(invites).set({ used_by: user.id }).where(eq(invites.id, invite.id))
      return { ok: true, userId: user.id } as const
    })
  } catch (err) {
    if (err instanceof UsernameTaken) return { ok: false, reason: 'username_taken' }
    throw err
  }
}
