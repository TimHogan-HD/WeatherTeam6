import { describe, expect, it } from 'vitest'
import { webhookSecretAccepted } from './webhookAuth.js'

/**
 * Issue #27. Before this, the only gate on `POST /api/telegram/webhook` was the
 * `chat.id` in the request *body* — which anyone who knows the chat id can
 * write. `secret_token` is the one part of the request an outsider cannot forge,
 * because Telegram echoes it from a value only `setWebhook` and this server know.
 *
 * Kept pure — no env reads, no Express types — for the same reason
 * `validateInitData` is: the route stays a thin gate and the decision is
 * directly testable.
 */
describe('webhookSecretAccepted', () => {
  const SECRET = 'a-long-random-webhook-secret'

  it('accepts anything when no secret is configured', () => {
    // Deliberate: making the header mandatory the moment this deploys would
    // take the bot offline until setWebhook is re-run with the token. The
    // chat.id check still runs in that window.
    expect(webhookSecretAccepted(undefined, undefined)).toBe(true)
    expect(webhookSecretAccepted('anything', undefined)).toBe(true)
    expect(webhookSecretAccepted(undefined, '')).toBe(true)
  })

  it('accepts the matching token once a secret is configured', () => {
    expect(webhookSecretAccepted(SECRET, SECRET)).toBe(true)
  })

  it('rejects a wrong, missing, or empty token once a secret is configured', () => {
    expect(webhookSecretAccepted('wrong', SECRET)).toBe(false)
    expect(webhookSecretAccepted(undefined, SECRET)).toBe(false)
    expect(webhookSecretAccepted('', SECRET)).toBe(false)
  })

  it('rejects a token that merely shares a prefix', () => {
    expect(webhookSecretAccepted(SECRET.slice(0, -1), SECRET)).toBe(false)
    expect(webhookSecretAccepted(SECRET + 'x', SECRET)).toBe(false)
  })

  it('compares digests, so a length mismatch does not throw', () => {
    // timingSafeEqual throws on unequal-length buffers; hashing first is what
    // makes a short token a clean `false` rather than a 500.
    expect(() => webhookSecretAccepted('x', SECRET)).not.toThrow()
    expect(webhookSecretAccepted('x', SECRET)).toBe(false)
  })

  it('takes the first value when the header arrives repeated', () => {
    // Node types repeatable headers as an array; stringifying one would compare
    // against "secret,attacker" and fail a legitimate request.
    expect(webhookSecretAccepted([SECRET, 'attacker'], SECRET)).toBe(true)
    expect(webhookSecretAccepted(['attacker', SECRET], SECRET)).toBe(false)
  })
})
