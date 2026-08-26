import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendTelegramMessage, TelegramPermanentError } from './sendMessage.js'

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
})
