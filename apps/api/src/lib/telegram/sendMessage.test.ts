import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendTelegramMessage } from './sendMessage.js'

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
