import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  answerCallbackQuery,
  editTelegramMessage,
  sendTelegramMessage,
  TelegramPermanentError,
  type InlineKeyboardButton,
} from './sendMessage.js'

/**
 * Covers only the request body. The retry/backoff loop is exercised elsewhere;
 * what is new here is `reply_markup`, and the thing worth pinning is that a
 * caller passing nothing still sends the exact body it always did.
 */
describe('sendTelegramMessage request body', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token')
    vi.stubEnv('TELEGRAM_CHAT_ID', '12345')
    fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response)
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  function bodyOf(): Record<string, unknown> {
    const init = fetchMock.mock.calls[0]?.[1]
    return JSON.parse(String(init?.body)) as Record<string, unknown>
  }

  it('omits reply_markup entirely when none is passed', async () => {
    await sendTelegramMessage('hello')
    expect(bodyOf()).toEqual({ chat_id: '12345', text: 'hello', parse_mode: 'HTML' })
    expect('reply_markup' in bodyOf()).toBe(false)
  })

  it('omits reply_markup when it is null — alertKeyboard returns null for a bad id', async () => {
    await sendTelegramMessage('hello', null)
    expect('reply_markup' in bodyOf()).toBe(false)
  })

  it('includes reply_markup when one is passed', async () => {
    await sendTelegramMessage('hello', {
      inline_keyboard: [[{ text: 'View forecast', url: 'https://t.me/x/Alert?startapp=loc_1' }]],
    })
    expect(bodyOf()['reply_markup']).toEqual({
      inline_keyboard: [[{ text: 'View forecast', url: 'https://t.me/x/Alert?startapp=loc_1' }]],
    })
  })
})

/**
 * The retryable/permanent split. `notifyPendingAlerts` releases its claim on a
 * failed send so the next cron run retries; it must be able to tell a transient
 * failure from a rejection Telegram will repeat forever, or a malformed message
 * is re-sent on every run indefinitely.
 */
describe('sendTelegramMessage failure classification', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token')
    vi.stubEnv('TELEGRAM_CHAT_ID', '12345')
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('throws TelegramPermanentError on a 400 and does not retry', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('{"description":"unsupported start tag"}'),
    } as Response)

    await expect(sendTelegramMessage('bad <tag>')).rejects.toBeInstanceOf(TelegramPermanentError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('carries the status so the caller can log which rejection it was', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve(''),
    } as Response)

    await expect(sendTelegramMessage('x')).rejects.toMatchObject({ status: 403 })
  })

  // Fake timers, or the 1s/2s/4s backoff makes these two the slowest tests in
  // the suite — 14s of real sleeping to assert a branch.
  async function sendExhaustingRetries(): Promise<unknown> {
    vi.useFakeTimers()
    try {
      const result = sendTelegramMessage('x').catch((e: unknown) => e)
      await vi.advanceTimersByTimeAsync(10_000)
      return await result
    } finally {
      vi.useRealTimers()
    }
  }

  it('does NOT classify a 429 as permanent — that one is worth retrying', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, text: () => Promise.resolve('') } as Response)

    expect(await sendExhaustingRetries()).not.toBeInstanceOf(TelegramPermanentError)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('does NOT classify a 500 as permanent', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('') } as Response)

    expect(await sendExhaustingRetries()).not.toBeInstanceOf(TelegramPermanentError)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('retries a transport failure — the rethrow is by type, and a network error is not that type', async () => {
    // The two cases above never reach the rethrow: an HTTP status is handled
    // without the try block throwing. Only a rejected `fetch` — DNS, socket
    // reset, abort — lands in the catch alongside TelegramPermanentError, so
    // only this case can tell `instanceof` from `true`. With `true` there, one
    // dropped connection would end the send instead of retrying it. Found by
    // mutation testing.
    fetchMock.mockRejectedValue(new Error('ECONNRESET'))

    const err = await sendExhaustingRetries()
    expect(err).not.toBeInstanceOf(TelegramPermanentError)
    expect(err).toMatchObject({ message: 'ECONNRESET' })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('waits between attempts instead of firing all four back to back', async () => {
    // Asserting only the call count cannot see the backoff: with the sleep
    // removed, or its delay divided by a million, all four attempts still run
    // and the count still reads 4. Telegram rate-limits, so hammering it four
    // times in one tick is the failure this guards.
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('') } as Response)
    vi.useFakeTimers()
    try {
      const settled = sendTelegramMessage('x').catch(() => undefined)

      await vi.advanceTimersByTimeAsync(0)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(999)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      expect(fetchMock).toHaveBeenCalledTimes(2)

      await vi.advanceTimersByTimeAsync(10_000)
      await settled
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('sendTelegramMessage configuration', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response)
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  // Either variable missing is fatal, and each needs its own case: with only a
  // both-missing test, `||` can be swapped for `&&` and nothing fails, leaving
  // a half-configured deploy to build a request to `bot undefined/sendMessage`.
  it('refuses to send with no bot token', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
    vi.stubEnv('TELEGRAM_CHAT_ID', '12345')

    await expect(sendTelegramMessage('x')).rejects.toThrow(/TELEGRAM_BOT_TOKEN/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses to send with no chat id', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token')
    vi.stubEnv('TELEGRAM_CHAT_ID', '')

    await expect(sendTelegramMessage('x')).rejects.toThrow(/TELEGRAM_CHAT_ID/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

/**
 * A type-level assertion, checked by `tsc --noEmit` rather than at runtime.
 *
 * The `?: never` arms exist to make one specific 400 impossible to write. That
 * is a claim about the type system, so the only thing that can verify it is the
 * type system: if the union ever widens, `@ts-expect-error` finds no error to
 * suppress and the typecheck fails.
 */
describe('InlineKeyboardButton', () => {
  it('will not compile a button carrying both url and callback_data', () => {
    // @ts-expect-error — Telegram allows exactly one field; both is a 400 that
    // costs the whole message, so the arms close each other.
    const bad: InlineKeyboardButton = {
      text: 'both',
      url: 'https://example.com',
      callback_data: 'view:a1b2c3d4:v=list',
    }
    expect(bad.text).toBe('both')
  })

  it('compiles each arm on its own', () => {
    const url: InlineKeyboardButton = { text: 'open', url: 'https://example.com' }
    const callback: InlineKeyboardButton = { text: 'tap', callback_data: 'refresh:a1b2c3d4' }
    expect([url.text, callback.text]).toEqual(['open', 'tap'])
  })
})

/**
 * The two new calls. Both are the panel mechanic, and both hinge on tolerating
 * one specific 400 — a claim about an upstream API that nothing else checks.
 */
describe('editTelegramMessage', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token')
    vi.stubEnv('TELEGRAM_CHAT_ID', '12345')
    fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response)
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  function bodyOf(): Record<string, unknown> {
    return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>
  }

  it('calls editMessageText, not sendMessage', () => {
    void editTelegramMessage(7, 'hello')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/editMessageText')
  })

  it('sends an empty keyboard rather than omitting reply_markup', async () => {
    // Omitting it leaves the *old* buttons attached to the new text, which is
    // how a panel ends up offering controls that no longer match what it says.
    await editTelegramMessage(7, 'hello', null)
    expect(bodyOf()).toEqual({
      chat_id: '12345',
      message_id: 7,
      text: 'hello',
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] },
    })
  })

  it('treats "message is not modified" as success and does not retry it', async () => {
    // Routine: re-tapping the tab already showing produces byte-identical text.
    // Without the tolerate predicate this throws, and a working interaction logs
    // an error indistinguishable from a real escaping 400.
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: () =>
        Promise.resolve(
          '{"ok":false,"error_code":400,"description":"Bad Request: message is not modified"}',
        ),
    } as Response)

    await expect(editTelegramMessage(7, 'same')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('still throws on a different 400 — the escaping failures must stay visible', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: () =>
        Promise.resolve(
          '{"ok":false,"error_code":400,"description":"Bad Request: unsupported start tag"}',
        ),
    } as Response)

    await expect(editTelegramMessage(7, 'bad <tag>')).rejects.toBeInstanceOf(TelegramPermanentError)
  })

  it('does not choke on an error body that is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('<html>gateway</html>'),
    } as Response)

    await expect(editTelegramMessage(7, 'x')).rejects.toBeInstanceOf(TelegramPermanentError)
  })
})

describe('answerCallbackQuery', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token')
    fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response)
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('needs no chat id — the query id addresses the tap', async () => {
    // Deliberately no TELEGRAM_CHAT_ID stubbed: requiring one here would make
    // every tap fail on a deploy that only has the token.
    await answerCallbackQuery('q1')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      callback_query_id: 'q1',
    })
  })

  it('tolerates a query that can no longer be answered', async () => {
    // A tap that arrived before a redeploy, or a redelivered update. The work
    // after it still has to run — the panel edit is what the user sees.
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: () =>
        Promise.resolve('{"description":"Bad Request: query is too old and response timeout expired"}'),
    } as Response)

    await expect(answerCallbackQuery('q1')).resolves.toBeUndefined()
  })
})
