import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { invalidateAfterFeedback } from './useFeedback.js'
import { tripKeys } from './useTrips.js'

describe('invalidateAfterFeedback', () => {
  it('makes every cached trip summary stale, so an ended trip stops asking about a day just checked in', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60_000 } } })
    client.setQueryData(tripKeys.summary('t1'), [])
    client.setQueryData(tripKeys.summary('t2'), [])
    client.setQueryData(['feedback'], [])
    client.setQueryData(tripKeys.trend('t1'), { points: [] })

    await invalidateAfterFeedback(client)

    expect(client.getQueryState(tripKeys.summary('t1'))?.isInvalidated).toBe(true)
    expect(client.getQueryState(tripKeys.summary('t2'))?.isInvalidated).toBe(true)
    expect(client.getQueryState(['feedback'])?.isInvalidated).toBe(true)
    // A check says nothing about the forecast trend.
    expect(client.getQueryState(tripKeys.trend('t1'))?.isInvalidated).toBe(false)
  })
})
