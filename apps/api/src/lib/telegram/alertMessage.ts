import { escapeTelegramHtml } from '@weatherteam6/types'

/**
 * The alert notification text.
 *
 * Its own module, with no database import, so it can be tested directly —
 * `checkAlerts.ts` pulls in `db`, which throws at import time when
 * `DATABASE_URL` is unset and takes any test importing it down with it.
 *
 * **Sent with `parse_mode: 'HTML'`, so every interpolated value is escaped.**
 * All of these routinely contain `&` — NWS headlines especially, and a location
 * the user named "Bear & Cub". Telegram rejects malformed markup with a 400,
 * which `sendTelegramMessage` treats as non-retryable: `notifyPendingAlerts`
 * then releases the claim and retries the identical broken message on every
 * subsequent run, so the alert is never delivered and the failure repeats every
 * 15 minutes (issue #26).
 */
export function formatAlertMessage(
  locationName: string,
  event: string,
  severity: string,
  headline: string | null,
): string {
  const tier = severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase()
  const reason = headline ?? event
  return `⚠️ <b>${escapeTelegramHtml(tier)} alert</b> — ${escapeTelegramHtml(locationName)}\n${escapeTelegramHtml(event)}: ${escapeTelegramHtml(reason)}`
}
