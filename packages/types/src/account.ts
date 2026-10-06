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
  code: string
  expires_at: string
}

/** `POST /auth/redeem`'s body. Success answers with an `AuthLoginResponse`. */
export type RedeemInviteInput = {
  code: string
  username: string
  passphrase: string
}
