import { logger } from '../logger.js'

/**
 * The only `reply_markup` shape this app sends: rows of URL buttons.
 *
 * Narrow on purpose. Telegram's `InlineKeyboardButton` is a union where exactly
 * one optional field may be set, and a wider type here would let a caller send
 * a button with none of them — which Telegram answers with a 400, i.e. a
 * non-retryable failure that costs the whole message. See `deepLink.ts` for why
 * `url` specifically and not `web_app`.
 */
export type InlineKeyboardMarkup = {
  readonly inline_keyboard: ReadonlyArray<
    ReadonlyArray<{ readonly text: string; readonly url: string }>
  >
}

/**
 * A rejection Telegram will give identically on every future attempt — a 4xx
 * other than 429, e.g. the 400 an unsupported HTML tag or a malformed button
 * URL earns.
 *
 * Callers need to tell this apart from a transient failure. `notifyPendingAlerts`
 * releases its claim on a failed send so the next cron run retries; without this
 * distinction it released the claim for permanent failures too and re-sent the
 * identical rejected message on every run, forever.
 */
export class TelegramPermanentError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Telegram sendMessage returned ${status}`)
    this.name = 'TelegramPermanentError'
    this.status = status
  }
}

/**
 * Send a plain-text message to the single configured Telegram chat, with
 * exponential backoff retry on transport failures and 429/5xx responses.
 *
 * `replyMarkup` is left out of the request body entirely when absent, rather
 * than sent as `reply_markup: undefined`.
 *
 * @throws {TelegramPermanentError} on a non-429 4xx — retrying is pointless.
 * @throws {Error} on transport failure or 429/5xx after all attempts.
 */
export async function sendTelegramMessage(
  text: string,
  replyMarkup?: InlineKeyboardMarkup | null,
): Promise<void> {
  const token = process.env['TELEGRAM_BOT_TOKEN']
  const chatId = process.env['TELEGRAM_CHAT_ID']
  if (!token || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID environment variables are required')
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`
  const maxAttempts = 4
  let lastErr: Error = new Error('no attempts made')

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          replyMarkup
            ? { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: replyMarkup }
            : { chat_id: chatId, text, parse_mode: 'HTML' },
        ),
      })
      if (res.ok) return
      if (res.status !== 429 && res.status < 500) {
        const body = await res.text().catch(() => '')
        logger.warn({ statusCode: res.status, body: body.slice(0, 200) }, '[telegram] sendMessage rejected')
        throw new TelegramPermanentError(res.status)
      }
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      // Rethrow by type, not by message prefix — a message-shape check breaks
      // silently the moment the wording changes, and "breaks silently" here
      // means retrying a rejection three more times.
      if (lastErr instanceof TelegramPermanentError) throw lastErr
    }
    if (attempt < maxAttempts - 1) {
      const delay = Math.pow(2, attempt) * 1000
      await new Promise<void>((r) => setTimeout(r, delay))
    }
  }
  throw lastErr
}
