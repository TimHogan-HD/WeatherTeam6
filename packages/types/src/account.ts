/**
 * Accounts: who is signed in, and the owner's invite links.
 *
 * An account comes to exist two ways, both chosen by the owner: `npm run
 * user:add`, or an invite link only the owner can mint (`POST /invites`), which
 * a friend redeems once to pick their own username and passphrase.
 */

/**
 * There is no rate limiting on login, so length is the defence. `user:add`,
 * `POST /auth/redeem` and the join screen all hold this one number.
 */
export const MIN_PASSPHRASE_LENGTH = 12
export const MAX_PASSPHRASE_LENGTH = 1024

/**
 * Words whose presence makes a passphrase one of the first guesses. Matched
 * against the passphrase's letters alone, so `Password1234!` is caught too.
 */
const COMMON_WORDS = [
  'password', 'passphrase', 'passw', 'qwerty', 'qwertyuiop', 'asdf', 'asdfgh', 'zxcvbn',
  'letmein', 'welcome', 'iloveyou', 'admin', 'login', 'secret', 'monkey', 'dragon',
  'football', 'baseball', 'sunshine', 'princess', 'abc', 'abcdef', 'abcdefgh',
  'weatherteam', 'weather', 'climbing', 'climber', 'bouldering',
]

/** Fewer different characters than this reads as a repeat (`aaaaaaaaaaaa`, `abababababab`). */
const MIN_DISTINCT_CHARACTERS = 6

/**
 * Why a new passphrase is too easy to guess, or null when it is fine. There is
 * no limit on sign-in attempts beyond scrypt's cost, so this is what stops a
 * dictionary guess. A judgement call, not a strength meter: it refuses the
 * obvious and accepts anything with real words in it.
 *
 * Shared by `POST /auth/redeem`, the join screen and `user:add`, so all three
 * refuse the same passphrases.
 */
export function passphraseProblem(passphrase: string, username: string): string | null {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) return `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`
  if (passphrase.length > MAX_PASSPHRASE_LENGTH) return `Use at most ${MAX_PASSPHRASE_LENGTH} characters.`
  if (new Set(passphrase.toLowerCase()).size < MIN_DISTINCT_CHARACTERS) return 'Too repetitive. Mix in more different characters.'
  const lower = passphrase.toLowerCase()
  const name = username.trim().toLowerCase()
  if (name.length >= 3 && lower.includes(name)) return 'Don’t include your username.'
  const letters = lower.replace(/[^a-z]/g, '')
  if (letters.length < 4) return 'Include some words, not just numbers or symbols.'
  if (COMMON_WORDS.includes(letters)) return 'Too common. Try a few unrelated words.'
  if (/^(.+?)\1+$/.test(letters)) return 'Too repetitive. Mix in more different characters.'
  return null
}

/** Lowercase so "Kim" and "kim" cannot be two accounts a friend confuses at login. */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,31}$/

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value)
}

/** `GET /me`. `can_invite` is true for the owner alone. */
export type Account = {
  username: string | null
  can_invite: boolean
}

/**
 * `POST /invites`. The code is shown once, inside the link; the server keeps
 * only its hash.
 */
export type InviteCreated = {
  id: string
  code: string
  expires_at: string
}

/**
 * One row of the owner's invite list (`GET /invites`), newest first. The code
 * is never returned again: only its hash is stored. `joined_as` is the
 * username the link created, null until it is used.
 */
export type InviteSummary = {
  id: string
  created_at: string
  expires_at: string
  used_at: string | null
  joined_as: string | null
}

export type InviteStatus = 'joined' | 'open' | 'expired'

/** Joined beats expired: a used link is reported by who used it, whatever its age. */
export function inviteStatus(invite: InviteSummary, now: Date): InviteStatus {
  if (invite.used_at !== null) return 'joined'
  return Date.parse(invite.expires_at) > now.getTime() ? 'open' : 'expired'
}

/** `POST /auth/redeem`'s body. Success answers with an `AuthLoginResponse`. */
export type RedeemInviteInput = {
  code: string
  username: string
  passphrase: string
}
