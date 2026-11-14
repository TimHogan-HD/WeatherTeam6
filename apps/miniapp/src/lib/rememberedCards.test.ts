import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { Conditions } from '@weatherteam6/types'
import type { RememberedCards } from './rememberedCards.js'

/** Local times, so the day boundary is this machine's, as it is the phone's. */
const at = (hour: number, minute = 0, day = 15) => new Date(2026, 9, day, hour, minute).getTime()

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  }
}

async function load(storage: Storage | 'throws'): Promise<typeof import('./rememberedCards.js')> {
  vi.resetModules()
  const boom = (): never => {
    throw new Error('SecurityError: storage is disabled')
  }
  vi.stubGlobal('window', {
    localStorage:
      storage === 'throws' ? { getItem: boom, setItem: boom, removeItem: boom } : storage,
  })
  return import('./rememberedCards.js')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const snapshot = (savedAt: number): RememberedCards => ({
  savedAt,
  cards: { a: { forecast: [], conditions: null, alerts: [] } },
})

describe('isUsable', async () => {
  const { isUsable } = await load(memoryStorage())

  it('takes a snapshot from earlier the same day', () => {
    expect(isUsable(at(8), at(19, 59))).toBe(true)
  })

  it('refuses one past the maximum age, even on the same day', () => {
    expect(isUsable(at(7), at(19, 1))).toBe(false)
  })

  /** Yesterday's `is_today` would print yesterday's figures as today's. */
  it('refuses one from before midnight', () => {
    expect(isUsable(at(23, 50, 14), at(0, 10))).toBe(false)
  })

  it('refuses one stamped in the future', () => {
    expect(isUsable(at(10), at(9))).toBe(false)
  })
})

describe('snapshotCards', async () => {
  const { snapshotCards } = await load(memoryStorage())
  const answer = <T,>(data: T | undefined, dataUpdatedAt: number) => ({ data, dataUpdatedAt })
  // Never read here — `snapshotCards` only carries it — so no full row is built.
  const conditions = { readings: undefined } as unknown as Conditions

  it('stamps the snapshot with its oldest fetch', () => {
    const got = snapshotCards([
      {
        id: 'a',
        isClimbingLocation: true,
        forecast: answer([], at(9, 30)),
        conditions: answer(conditions, at(9, 10)),
        alerts: answer([], at(9, 20)),
      },
    ])
    expect(got).toEqual({ savedAt: at(9, 10), cards: { a: { forecast: [], conditions, alerts: [] } } })
  })

  /** A disabled query's `dataUpdatedAt` is 0, which would stamp the snapshot 1970. */
  it('saves a non-crag without conditions, and ignores its conditions stamp', () => {
    const got = snapshotCards([
      {
        id: 'city',
        isClimbingLocation: false,
        forecast: answer([], at(9)),
        conditions: answer<Conditions | null>(undefined, 0),
        alerts: answer([], at(9)),
      },
    ])
    expect(got).toEqual({ savedAt: at(9), cards: { city: { forecast: [], conditions: null, alerts: [] } } })
  })

  it('leaves out a card missing any answer', () => {
    const base = {
      isClimbingLocation: true,
      forecast: answer([], at(9)),
      conditions: answer(conditions, at(9)),
      alerts: answer([], at(9)),
    }
    expect(
      snapshotCards([
        { ...base, id: 'no-forecast', forecast: answer(undefined, 0) },
        { ...base, id: 'no-alerts', alerts: answer(undefined, 0) },
        { ...base, id: 'no-conditions', conditions: answer(undefined, 0) },
      ]),
    ).toBeNull()
  })
})

describe('rememberedCards', () => {
  it('gives back what was saved', async () => {
    const store = await load(memoryStorage())
    store.rememberCards(snapshot(at(9)))
    expect(store.rememberedCards(at(10))).toEqual(snapshot(at(9)))
  })

  it('gives back nothing once the snapshot is too old', async () => {
    const store = await load(memoryStorage())
    store.rememberCards(snapshot(at(9)))
    expect(store.rememberedCards(at(22))).toBeUndefined()
  })

  it('gives back nothing after forgetting', async () => {
    const store = await load(memoryStorage())
    store.rememberCards(snapshot(at(9)))
    store.forgetCards()
    expect(store.rememberedCards(at(10))).toBeUndefined()
  })

  it('ignores a value that is not a snapshot', async () => {
    const storage = memoryStorage()
    const store = await load(storage)
    for (const raw of ['not json', 'null', '[]', '{"savedAt":"9"}', '{"savedAt":1,"cards":null}']) {
      storage.setItem('wt6.cards', raw)
      expect(store.rememberedCards(at(10))).toBeUndefined()
    }
  })

  it('survives storage that throws', async () => {
    const store = await load('throws')
    expect(() => store.rememberCards(snapshot(at(9)))).not.toThrow()
    expect(store.rememberedCards(at(10))).toBeUndefined()
    expect(() => store.forgetCards()).not.toThrow()
  })
})

describe('seedFreshCards', () => {
  const conditions = { location_id: 'a', forecast_date: '2026-10-15' } as unknown as Conditions
  const fresh = (savedAt: number): RememberedCards => ({
    savedAt,
    cards: {
      a: { forecast: [], conditions, alerts: [] },
      city: { forecast: [], conditions: null, alerts: [] },
    },
  })

  it('seeds a fresh snapshot stamped with its real age', async () => {
    const { seedFreshCards } = await load(memoryStorage())
    const qc = new QueryClient()
    expect(seedFreshCards(qc, fresh(at(10, 5)), at(10, 12))).toBe(true)
    expect(qc.getQueryData(['conditions', 'a'])).toBe(conditions)
    expect(qc.getQueryState(['forecast', 'a'])?.dataUpdatedAt).toBe(at(10, 5))
    expect(qc.getQueryData(['alerts', 'city'])).toEqual([])
  })

  it('never seeds a null conditions answer', async () => {
    const { seedFreshCards } = await load(memoryStorage())
    const qc = new QueryClient()
    seedFreshCards(qc, fresh(at(10, 5)), at(10, 12))
    expect(qc.getQueryState(['conditions', 'city'])).toBeUndefined()
  })

  it('leaves a stale snapshot out of the cache', async () => {
    const { seedFreshCards } = await load(memoryStorage())
    const qc = new QueryClient()
    expect(seedFreshCards(qc, fresh(at(10, 5)), at(10, 20))).toBe(false)
    expect(seedFreshCards(qc, fresh(at(10, 58)), at(11, 1))).toBe(false)
    expect(qc.getQueryCache().getAll()).toHaveLength(0)
  })

  it('never overwrites an answer already in the cache', async () => {
    const { seedFreshCards } = await load(memoryStorage())
    const qc = new QueryClient()
    const live = [{ id: 'live' }]
    qc.setQueryData(['alerts', 'a'], live)
    seedFreshCards(qc, fresh(at(10, 5)), at(10, 12))
    expect(qc.getQueryData(['alerts', 'a'])).toBe(live)
  })
})
