import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * `secret_token` verification for `POST /api/telegram/webhook` (issue #27).
 *
 * Telegram echoes the value registered with `setWebhook` in the
 * `X-Telegram-Bot-Api-Secret-Token` header. It is the only part of the request
 * an outsider cannot forge: the previous sole gate was the `chat.id` in the
 * request *body*, which anyone who knows the chat id can write.
 *
 * **Pure by design** — no env reads, no Express types — for the same reason
 * `validateInitData` is: the route stays a thin gate and the decision is
 * directly testable. It lives here rather than in the route module because
 * importing that module pulls in the database client, which throws at import
 * time when `DATABASE_URL` is unset.
 */
export function webhookSecretAccepted(
  provided: string | string[] | undefined,
  expected: string | undefined,
): boolean {
  // Deliberately permissive when unconfigured. Making the header mandatory the
  // moment this deploys would take the bot offline until `setWebhook` is re-run
  // with the token, since Telegram does not send the header until then. The
  // caller's `chat.id` check still runs in that window, exactly as before.
  if (expected === undefined || expected === '') return true

  // Node types repeatable headers as an array. Take the first rather than
  // stringifying, which would compare against `"secret,attacker"`.
  const value = Array.isArray(provided) ? provided[0] : provided
  if (value === undefined || value === '') return false

  // Hash first: `timingSafeEqual` throws on unequal-length buffers, so comparing
  // raw tokens would turn a short guess into a 500 and leak the length. Equal
  // digests also make the comparison itself constant-time.
  const a = createHash('sha256').update(value).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}
