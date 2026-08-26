import type { InlineKeyboardMarkup } from './sendMessage.js'

/**
 * Deep link from an alert message into the Mini App's location detail screen.
 *
 * **Direct Link Mini App, plain `url` button — not `web_app`.** `startapp` is a
 * Direct Link mechanism: a `web_app` button opens an *inline-button* Mini App
 * and does not deliver `start_param` at all, so the app would launch on the
 * list with no idea which location the alert was about.
 *
 * The base is fixed by the @BotFather registration (bot username
 * `WeatherTeam6_bot`, Direct Link short name `Alert`, registered 2026-08-26).
 * Neither half is derivable from `TELEGRAM_BOT_TOKEN`, and both are stable for
 * the life of the bot, so this is a constant rather than another environment
 * variable the deploy would have to be taught about.
 *
 * `loc_<uuid>` with the dashes intact — `startapp`'s charset is
 * `A-Z a-z 0-9 _ -`, so a UUID passes through unchanged. Deliberately *not*
 * stripped and reinserted: reinsertion at fixed offsets turns a corrupted
 * parameter into a well-formed but *wrong* UUID, which reaches the API and 404s
 * instead of falling back to the list.
 */
export const MINI_APP_DIRECT_LINK = 'https://t.me/WeatherTeam6_bot/Alert'

/** Mirrors `isUuid` in `lib/http.ts` — same shape, no Express dependency. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `null` for anything that is not a UUID, so a bad id yields no link at all. */
export function locationDeepLink(locationId: string): string | null {
  if (!UUID_RE.test(locationId)) return null
  return `${MINI_APP_DIRECT_LINK}?startapp=loc_${locationId}`
}

/**
 * The alert message's inline keyboard, or `null` when no valid link can be
 * built.
 *
 * `null` rather than a best-effort URL on purpose. Telegram rejects a malformed
 * button URL with a 400, `sendTelegramMessage` treats a 400 as non-retryable,
 * and `notifyPendingAlerts` then releases the claim and retries the identical
 * broken message forever — so a bad link would cost the whole notification, not
 * just the button. A message with no button still tells the user about the
 * alert.
 */
export function alertKeyboard(locationId: string): InlineKeyboardMarkup | null {
  const url = locationDeepLink(locationId)
  if (url === null) return null
  return { inline_keyboard: [[{ text: 'View forecast', url }]] }
}
