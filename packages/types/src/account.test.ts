import { describe, it, expect } from 'vitest'
import { inviteStatus, isValidUsername, MIN_PASSPHRASE_LENGTH, passphraseProblem, type InviteSummary } from './account.js'

describe('passphraseProblem', () => {
  it('accepts a few unrelated words', () => {
    expect(passphraseProblem('granite drizzle lantern', 'kim')).toBeNull()
    expect(passphraseProblem('Tuesday-Crimp-Orbit-42', 'kim')).toBeNull()
  })

  it('refuses one character short of the minimum and accepts the minimum', () => {
    const base = 'granitebluf'
    expect(base.length).toBe(MIN_PASSPHRASE_LENGTH - 1)
    expect(passphraseProblem(base, 'kim')).not.toBeNull()
    expect(passphraseProblem(`${base}x`, 'kim')).toBeNull()
  })

  it('refuses a common word dressed up with digits, case and symbols', () => {
    expect(passphraseProblem('password1234', 'kim')).not.toBeNull()
    expect(passphraseProblem('Password1234!', 'kim')).not.toBeNull()
    expect(passphraseProblem('qwerty123456', 'kim')).not.toBeNull()
    expect(passphraseProblem('Weather-Team-6!!', 'kim')).not.toBeNull()
  })

  it('refuses repeats, including a repeated word', () => {
    expect(passphraseProblem('aaaaaaaaaaaa', 'kim')).not.toBeNull()
    expect(passphraseProblem('abababababab', 'kim')).not.toBeNull()
    expect(passphraseProblem('climbclimbclimb', 'kim')).not.toBeNull()
  })

  it('refuses digits and symbols with no words', () => {
    expect(passphraseProblem('190283746512', 'kim')).not.toBeNull()
    expect(passphraseProblem('!@#$%^&*()12', 'kim')).not.toBeNull()
  })

  it('refuses the username inside it, but not a two-letter one', () => {
    expect(passphraseProblem('granite-kimberly-lantern', 'kimberly')).not.toBeNull()
    expect(passphraseProblem('granite-JO-lantern', 'jo')).toBeNull()
  })
})

describe('isValidUsername', () => {
  it('takes lowercase and refuses capitals, spaces and the edges of its length', () => {
    expect(isValidUsername('kim')).toBe(true)
    expect(isValidUsername('Kim')).toBe(false)
    expect(isValidUsername('k i')).toBe(false)
    expect(isValidUsername('k')).toBe(false)
    expect(isValidUsername('k'.repeat(32))).toBe(true)
    expect(isValidUsername('k'.repeat(33))).toBe(false)
  })
})

describe('inviteStatus', () => {
  const now = new Date('2026-10-06T12:00:00Z')
  const invite = (overrides: Partial<InviteSummary>): InviteSummary => ({
    id: 'x',
    created_at: '2026-10-05T12:00:00Z',
    expires_at: '2026-10-07T12:00:00Z',
    used_at: null,
    joined_as: null,
    ...overrides,
  })

  it('is open before expiry and expired at it', () => {
    expect(inviteStatus(invite({}), now)).toBe('open')
    expect(inviteStatus(invite({ expires_at: now.toISOString() }), now)).toBe('expired')
  })

  it('reports a used link as joined even after it would have expired', () => {
    expect(inviteStatus(invite({ used_at: '2026-10-05T13:00:00Z', joined_as: 'kim', expires_at: '2026-10-06T00:00:00Z' }), now)).toBe('joined')
  })
})
