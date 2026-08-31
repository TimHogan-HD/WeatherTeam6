import { logger } from '../logger.js'

/**
 * A button that opens a URL. `callback_data` is closed off with `?: never`.
 *
 * The `?: never` arms are not decoration. TypeScript's excess-property check
 * against a *union* accepts an object literal that satisfies either arm, so a
 * plain two-arm union would happily accept `{ text, url, callback_data }` —
 * which Telegram answers with a 400, i.e. a non-retryable failure that costs the
 * whole message. Closing each arm makes the invalid combination a compile error.
 *
 * See `deepLink.ts` for why `url` specifically and not `web_app`.
 */
export type UrlButton = {
  readonly text: string
  readonly url: string
  readonly callback_data?: never
}

/** A button that sends `callback_data` back as a `callback_query`. */
export type CallbackButton = {
  readonly text: string
  readonly callback_data: string
  readonly url?: never
}

export type InlineKeyboardButton = UrlButton | CallbackButton

/**
 * The only `reply_markup` shape this app sends: rows of URL or callback buttons.
 *
 * Still narrow on purpose. Telegram's real `InlineKeyboardButton` is a union
 * where exactly one optional field may be set, and a wider type here would let a
 * caller send a button with none of them.
 *
 * `DisabledButton` is deliberately absent: Probe B run 1 (2026-08-31) found both
 * the phone and desktop clients draw a disabled button exactly like an enabled
 * one, so it cannot say "this model exists and does not reach here". A row of
 * plain text says that instead — see `.claude/docs/telegram-render.md` §2.
 */
export type InlineKeyboardMarkup = {
  readonly inline_keyboard: ReadonlyArray<ReadonlyArray<InlineKeyboardButton>>
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

const MAX_ATTEMPTS = 4

function botToken(): string {
  const token = process.env['TELEGRAM_BOT_TOKEN']
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN environment variable is required')
  return token
}

/**
 * The chat every message in this app goes to. Single-user by design — the same
 * boundary the webhook and `requireApiAuth` enforce.
 */
function chatId(): string {
  const id = process.env['TELEGRAM_CHAT_ID']
  if (!id) throw new Error('TELEGRAM_CHAT_ID environment variable is required')
  return id
}

/**
 * One Bot API call, with exponential backoff on transport failures and 429/5xx.
 *
 * `tolerate` is given the `description` string from a non-429 4xx body and
 * decides whether that particular rejection is a success for this caller. It
 * exists for `editMessageText`, which answers **400 "message is not modified"**
 * when the new text and markup are byte-identical to what is already on screen —
 * routine when a user re-taps the tab they are already on. Without it, a working
 * interaction logs an error indistinguishable from a real escaping 400.
 *
 * The body is read only on the 4xx branch, and only its `description` is ever
 * looked at or logged; nothing serialises the request body, which can carry the
 * user's own text.
 *
 * @throws {TelegramPermanentError} on a non-429 4xx that `tolerate` did not accept.
 * @throws {Error} on transport failure or 429/5xx after all attempts.
 */
export async function callTelegram(
  method: string,
  body: Record<string, unknown>,
  tolerate?: (description: string) => boolean,
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken()}/${method}`
  const payload = JSON.stringify(body)
  let lastErr: Error = new Error('no attempts made')

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })
      if (res.ok) return
      if (res.status !== 429 && res.status < 500) {
        const raw = await res.text().catch(() => '')
        const description = parseDescription(raw)
        if (tolerate?.(description) === true) {
          logger.debug({ method, description }, '[telegram] tolerated rejection')
          return
        }
        logger.warn(
          { method, statusCode: res.status, description: description.slice(0, 200) },
          '[telegram] call rejected',
        )
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
    if (attempt < MAX_ATTEMPTS - 1) {
      const delay = Math.pow(2, attempt) * 1000
      await new Promise<void>((r) => setTimeout(r, delay))
    }
  }
  throw lastErr
}

/**
 * The `description` field of an error body, or the raw text when it is not the
 * JSON envelope Telegram documents. Returns `''` rather than throwing, so a
 * `tolerate` predicate always gets a string to match against.
 */
function parseDescription(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && 'description' in parsed) {
      const description = (parsed as { description: unknown }).description
      if (typeof description === 'string') return description
    }
  } catch {
    // Not JSON — fall through to the raw text.
  }
  return raw
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
  // Both variables are read before the first attempt so a half-configured
  // deploy fails with the name of the missing one rather than posting to
  // `bot undefined/sendMessage`.
  const token = process.env['TELEGRAM_BOT_TOKEN']
  const chat = process.env['TELEGRAM_CHAT_ID']
  if (!token || !chat) {
    throw new Error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID environment variables are required')
  }

  await callTelegram(
    'sendMessage',
    replyMarkup
      ? { chat_id: chat, text, parse_mode: 'HTML', reply_markup: replyMarkup }
      : { chat_id: chat, text, parse_mode: 'HTML' },
  )
}

/**
 * True for the one rejection an in-place panel edit produces on its own: the new
 * text and markup are byte-identical to what is already on the message, which
 * Telegram calls a 400. Re-tapping the day or model already selected does
 * exactly that, and it is not a failure.
 *
 * Matched on Telegram's own wording. That is a string comparison against an
 * upstream API, so it can drift — but the alternative is tolerating every 400,
 * which would swallow the escaping failures that class 5 exists to catch.
 */
function isNotModified(description: string): boolean {
  return description.includes('message is not modified')
}

/**
 * Replace the text and keyboard of a message already on screen — the panel
 * mechanic. Same retry policy as `sendTelegramMessage`.
 *
 * A `null` markup **removes** the keyboard rather than leaving the old one in
 * place, so it is sent explicitly as an empty keyboard. Omitting `reply_markup`
 * from an `editMessageText` leaves the existing buttons attached to new text,
 * which is how a panel ends up with controls that no longer match what it says.
 */
export async function editTelegramMessage(
  messageId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup | null,
): Promise<void> {
  await callTelegram(
    'editMessageText',
    {
      chat_id: chatId(),
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup ?? { inline_keyboard: [] },
    },
    isNotModified,
  )
}

/**
 * Stop the client's spinner on a tapped button.
 *
 * **Call this before doing the work, not after.** The client spins until it is
 * answered and gives up at about 15 seconds; a forecast fetch can outlast that,
 * and a user staring at a dead button taps it again.
 *
 * Tolerates the two 400s that mean the query is no longer answerable — a tap
 * that arrived before a redeploy, or a retry of an update already handled. Both
 * are expected, and neither should abort the work that follows: the panel edit
 * still lands, which is what the user actually sees.
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  await callTelegram(
    'answerCallbackQuery',
    text === undefined
      ? { callback_query_id: callbackQueryId }
      : { callback_query_id: callbackQueryId, text, show_alert: false },
    (description) =>
      description.includes('query is too old') || description.includes('QUERY_ID_INVALID'),
  )
}
