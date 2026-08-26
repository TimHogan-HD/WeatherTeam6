import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Covers `runAlertsCheck`'s orchestration only — the fan-out, the error
 * aggregation, and the `null`-means-unavailable branch. The Drizzle calls are
 * stubbed, so nothing here says anything about the SQL; that is what
 * `check:*` scripts are for.
 *
 * The concurrency test is the point of the file. Locations used to run
 * sequentially, each carrying up to ~7s of `fetchWithRetry` backoff, so an NWS
 * outage across ~10 locations blew the function's 60s limit and killed the
 * request **before `notifyPendingAlerts()` ran** — pending alerts stayed
 * undelivered across every retry (issue #27 part 3). A serial regression here
 * would not fail a typecheck and would not fail any assertion about output,
 * so the overlap is asserted directly.
 */

const fetchNwsAlerts = vi.fn()

// Chainable stubs shaped like the Drizzle builder calls this module makes:
//   await db.select({...}).from(t)
//   await db.insert(t).values(v).onConflictDoUpdate(s)
//   await db.delete(t).where(w)
const selectFrom = vi.fn()
const db = {
  select: () => ({ from: selectFrom }),
  insert: () => ({ values: () => ({ onConflictDoUpdate: () => Promise.resolve(undefined) }) }),
  delete: () => ({ where: () => Promise.resolve(undefined) }),
}

vi.mock('../../db/index.js', () => ({ db, pool: {} }))
vi.mock('../weather/nwsAlerts.js', () => ({ fetchNwsAlerts }))
vi.mock('../telegram/sendMessage.js', () => ({
  sendTelegramMessage: vi.fn(),
  TelegramPermanentError: class extends Error {},
}))

const { runAlertsCheck } = await import('./checkAlerts.js')

const LOCATIONS = [
  { id: 'loc-a', lat: '36.1', lon: '-115.4' },
  { id: 'loc-b', lat: '34.0', lon: '-116.1' },
  { id: 'loc-c', lat: '38.0', lon: '-109.5' },
]

beforeEach(() => {
  vi.clearAllMocks()
  selectFrom.mockResolvedValue(LOCATIONS)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runAlertsCheck', () => {
  it('processes every location', async () => {
    fetchNwsAlerts.mockResolvedValue([])
    await runAlertsCheck()
    expect(fetchNwsAlerts).toHaveBeenCalledTimes(3)
  })

  it('returns early when there are no locations', async () => {
    selectFrom.mockResolvedValue([])
    await runAlertsCheck()
    expect(fetchNwsAlerts).not.toHaveBeenCalled()
  })

  it('fetches locations concurrently, not one after another', async () => {
    // Each call records a start, waits a beat, then records an end. Run in
    // parallel every start lands before any end; run serially the log strictly
    // alternates start/end. Asserting the ordering — rather than gating the
    // resolution on all three having started — means a serial regression FAILS
    // here in ~60ms instead of deadlocking and hanging CI.
    const events: string[] = []

    fetchNwsAlerts.mockImplementation(async (lat: number) => {
      events.push(`start:${lat}`)
      await new Promise((resolve) => setTimeout(resolve, 20))
      events.push(`end:${lat}`)
      return []
    })

    await runAlertsCheck()

    expect(events).toHaveLength(6)
    expect(events.slice(0, 3).every((e) => e.startsWith('start:'))).toBe(true)
  })

  it('one location failing does not stop the others', async () => {
    fetchNwsAlerts
      .mockRejectedValueOnce(new Error('NWS exploded'))
      .mockResolvedValue([])

    await expect(runAlertsCheck()).rejects.toThrow(/NWS exploded/)
    // The rejection is reported, but every location was still attempted —
    // that is what Promise.allSettled buys over Promise.all.
    expect(fetchNwsAlerts).toHaveBeenCalledTimes(3)
  })

  it('aggregates every failure into one thrown error', async () => {
    fetchNwsAlerts
      .mockRejectedValueOnce(new Error('first failed'))
      .mockRejectedValueOnce(new Error('second failed'))
      .mockResolvedValue([])

    await expect(runAlertsCheck()).rejects.toThrow(/2 error\(s\)/)
  })

  it('treats a null NWS result as unavailable, not as an error', async () => {
    // `null` means the fetch could not be trusted — distinct from `[]`, which
    // means NWS confirmed no active alerts and triggers the pruning delete.
    fetchNwsAlerts.mockResolvedValue(null)
    await expect(runAlertsCheck()).resolves.toBeUndefined()
  })
})
