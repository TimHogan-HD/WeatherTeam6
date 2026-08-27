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
const deleteWhere = vi.fn((_where: unknown) => Promise.resolve(undefined))
const db = {
  select: () => ({ from: selectFrom }),
  insert: () => ({ values: () => ({ onConflictDoUpdate: () => Promise.resolve(undefined) }) }),
  delete: () => ({ where: deleteWhere }),
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

  // The three below are the assertions the comment above was already making in
  // prose. Without them, replacing `if (alerts === null)` with `if (true)` —
  // i.e. never trusting NWS at all, never pruning anything — left this whole
  // file green. Found by mutation testing.

  it('does NOT prune when the fetch was unavailable', async () => {
    // The prune deletes stored rows, and `notified_at` goes with them, so an
    // alert that reappears re-notifies. A failed fetch must never reach it.
    fetchNwsAlerts.mockResolvedValue(null)
    await runAlertsCheck()
    expect(deleteWhere).not.toHaveBeenCalled()
  })

  it('DOES prune when NWS confirms there are no active alerts', async () => {
    // `[]` is a measurement, not a gap: NWS was asked and said none. Anything
    // still stored has been cancelled and must go.
    fetchNwsAlerts.mockResolvedValue([])
    await runAlertsCheck()
    expect(deleteWhere).toHaveBeenCalledTimes(LOCATIONS.length)
  })

  it('scopes the prune to the alerts NWS did not return, not to the whole location', async () => {
    // The `activeIds.length > 0` branch matters: taking the empty-set path with
    // active alerts present would delete the rows just upserted — `notified_at`
    // included — and re-send every live alert on the next run.
    fetchNwsAlerts.mockResolvedValue([])
    await runAlertsCheck()
    const wholeLocation = boundValues(deleteWhere.mock.calls[0]?.[0])

    vi.clearAllMocks()
    selectFrom.mockResolvedValue(LOCATIONS)
    fetchNwsAlerts.mockResolvedValue([
      {
        nws_alert_id: 'urn:oid:2.49.0.1.840.0.abc123',
        event: 'Flash Flood Warning',
        severity: 'Severe',
        certainty: 'Likely',
        headline: 'Flash Flood Warning',
        description: 'Water',
        effective: null,
        expires: null,
      },
    ])
    await runAlertsCheck()
    const scoped = boundValues(deleteWhere.mock.calls[0]?.[0])

    expect(scoped).not.toEqual(wholeLocation)
    expect(scoped).toContain('urn:oid:2.49.0.1.840.0.abc123')
  })
})

/**
 * The literal values Drizzle bound into a `where` clause.
 *
 * Walks `SQL.queryChunks` rather than serialising the object: a Drizzle SQL
 * node holds a reference to its table, and the table's columns point back at
 * it, so `JSON.stringify` throws on the cycle.
 */
function boundValues(clause: unknown): unknown[] {
  const out: unknown[] = []
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (node === null || typeof node !== 'object') return
    const rec = node as { queryChunks?: unknown; value?: unknown }
    if (rec.queryChunks !== undefined) visit(rec.queryChunks)
    else if ('value' in rec) out.push(rec.value)
  }
  visit(clause)
  return out.flat()
}
