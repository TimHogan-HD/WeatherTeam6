import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchLatestRadar } from './iemRadar.js'

const answer = (status: number, body: unknown): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response

describe('fetchLatestRadar', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("returns the composite's valid time as an ISO instant", async () => {
    fetchMock.mockResolvedValueOnce(
      answer(200, { meta: { product: 'N0Q', site: 'USCOMP', valid: '2026-10-26T19:25:00Z', radar_quorum: '143/147' } }),
    )
    await expect(fetchLatestRadar()).resolves.toEqual({ valid_at: '2026-10-26T19:25:00.000Z' })
  })

  it.each([
    ['no meta', {}],
    ['a missing valid time', { meta: { product: 'N0Q' } }],
    ['an unreadable valid time', { meta: { valid: 'soon' } }],
    ['a numeric valid time', { meta: { valid: 1_761_506_700 } }],
  ])('is null for %s, never a made-up time', async (_name, body) => {
    fetchMock.mockResolvedValueOnce(answer(200, body))
    await expect(fetchLatestRadar()).resolves.toBeNull()
  })

  it('is null on a 4xx without retrying', async () => {
    fetchMock.mockResolvedValueOnce(answer(404, {}))
    await expect(fetchLatestRadar()).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('is null once every retry has failed', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const result = fetchLatestRadar()
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
