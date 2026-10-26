import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { hourlyQuery } from './useHourly.js'

const apiGet = vi.fn((_path: string) => Promise.resolve({}))
vi.mock('../lib/api.js', () => ({ apiGet: (path: string) => apiGet(path) }))

const ID = '11111111-1111-1111-1111-111111111111'

describe('hourlyQuery', () => {
  it("keeps a trip's hours and the crag screen's Profile hours in separate cache entries", () => {
    const profile = hourlyQuery(ID).queryKey
    expect(hourlyQuery(ID, null).queryKey).toEqual(profile)
    expect(hourlyQuery(ID, { first: 12, last: 20 }).queryKey).not.toEqual(profile)
    expect(hourlyQuery(ID, { first: 12, last: 20 }).queryKey).not.toEqual(hourlyQuery(ID, { first: 12, last: 21 }).queryKey)
    // Prefix invalidation of ['hourly', id] still reaches a trip's entry.
    expect(hourlyQuery(ID, { first: 12, last: 20 }).queryKey.slice(0, 2)).toEqual(['hourly', ID])
  })

  it("asks for a trip's hours in the URL, and for nothing extra without them", async () => {
    const client = new QueryClient()
    await client.fetchQuery(hourlyQuery(ID, { first: 12, last: 20 }))
    await client.fetchQuery(hourlyQuery(ID))
    expect(apiGet.mock.calls.map(([path]) => path)).toEqual([
      `/hourly/${ID}?climbFirst=12&climbLast=20`,
      `/hourly/${ID}`,
    ])
  })
})
