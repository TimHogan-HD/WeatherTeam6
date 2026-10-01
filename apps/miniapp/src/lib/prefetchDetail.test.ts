import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { Location } from '@weatherteam6/types'
import { OPEN_WAIT_MS, prefetchDetail, readyToOpen } from './prefetchDetail.js'

const apiGet = vi.fn((_path: string) => Promise.resolve([]))
vi.mock('./api.js', () => ({ apiGet: (path: string) => apiGet(path) }))

const ID = '11111111-1111-1111-1111-111111111111'
const place = (climbing: boolean) => ({ id: ID, is_climbing_location: climbing }) as Location

function paths(): string[] {
  return apiGet.mock.calls.map(([path]) => path.split('/')[1] ?? '').sort()
}

describe('prefetchDetail', () => {
  beforeEach(() => apiGet.mockClear())

  it('never asks for a city’s score, walls or guidebook', async () => {
    prefetchDetail(new QueryClient(), place(false))
    await vi.waitFor(() => expect(apiGet).toHaveBeenCalledTimes(4))
    expect(paths()).toEqual(['alerts', 'forecast', 'hourly', 'recent-precip'])
  })

  it('fetches everything the crag screen reads for a crag', async () => {
    prefetchDetail(new QueryClient(), place(true))
    await vi.waitFor(() => expect(apiGet).toHaveBeenCalledTimes(7))
    expect(paths()).toEqual([
      'alerts',
      'conditions',
      'forecast',
      'guidebook',
      'hourly',
      'recent-precip',
      'walls',
    ])
  })

  it('does not fetch again while the answers are fresh — a scroll across the list costs one fetch per crag', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } })
    prefetchDetail(client, place(true))
    await vi.waitFor(() => expect(apiGet).toHaveBeenCalledTimes(7))
    prefetchDetail(client, place(true))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(apiGet).toHaveBeenCalledTimes(7)
  })
})

describe('readyToOpen', () => {
  beforeEach(() => apiGet.mockClear())

  /** Answers the hourly fetch after `hourlyMs`; returns how long `readyToOpen` took to settle. */
  async function openAfter(hourlyMs: number, client = new QueryClient()): Promise<number> {
    vi.useFakeTimers()
    try {
      apiGet.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve([]), hourlyMs)))
      let settledAt = -1
      const start = Date.now()
      void readyToOpen(client, place(true)).then(() => {
        settledAt = Date.now() - start
      })
      await vi.advanceTimersByTimeAsync(2_000)
      return settledAt
    } finally {
      vi.useRealTimers()
      apiGet.mockImplementation(() => Promise.resolve([]))
    }
  }

  it('opens as soon as the hourly series lands', async () => {
    expect(await openAfter(120)).toBe(120)
  })

  it('opens anyway at the cap when the series is slow — a tap never feels stuck', async () => {
    expect(await openAfter(1_500)).toBe(OPEN_WAIT_MS)
  })

  it('opens at once when a series is already cached, even a stale one the screen will refetch', async () => {
    const client = new QueryClient()
    client.setQueryData(['hourly', ID], { days: [] }, { updatedAt: 0 })
    expect(await openAfter(1_500, client)).toBe(0)
    expect(apiGet).not.toHaveBeenCalled()
  })
})
