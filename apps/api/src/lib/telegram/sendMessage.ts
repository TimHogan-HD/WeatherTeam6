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
 * Send a plain-text message to the single configured Telegram chat, with
 * exponential backoff retry on transport failures and 429/5xx responses.
 *
 * `replyMarkup` is left out of the request body entirely when absent, rather
 * than sent as `reply_markup: undefined`.
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
        throw new Error(`Telegram sendMessage returned ${res.status}`)
      }
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      if (lastErr.message.startsWith('Telegram sendMessage returned')) throw lastErr
    }
    if (attempt < maxAttempts - 1) {
      const delay = Math.pow(2, attempt) * 1000
      await new Promise<void>((r) => setTimeout(r, delay))
    }
  }
  throw lastErr
}
