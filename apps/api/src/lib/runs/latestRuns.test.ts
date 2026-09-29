import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A stored read that fails must fall through to the live fetch, exactly as a
 * failed write-back already does. Before this, a database fault on the read
 * threw out of `getDeterministicRuns` and failed the whole request while the
 * upstream was fine. The SQL itself is `check:weather-runs`' job.
 */

const unreachable = (): never => {
  throw new Error('connection terminated')
}
const db = {
  selectDistinctOn: unreachable,
  select: unreachable,
}
vi.mock('../../db/index.js', () => ({ db, pool: {} }))

const fetchDeterministicHourly = vi.fn()
const fetchEnsembleRun = vi.fn()
vi.mock('../weather/openMeteo.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../weather/openMeteo.js')>()),
  fetchDeterministicHourly,
  fetchEnsembleRun,
}))

const storeDeterministicRun = vi.fn()
const storeEnsembleRun = vi.fn()
vi.mock('./storeRun.js', () => ({
  ENSEMBLE_RUN_MODEL: 'ensemble',
  storeDeterministicRun,
  storeEnsembleRun,
}))

const { getDeterministicRuns, getEnsembleRuns } = await import('./latestRuns.js')

const POINT = { id: 'loc-a', lat: 44.5694, lon: -92.5223, elevation_m: null }
const FETCHED_AT = new Date('2026-09-29T12:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
  storeDeterministicRun.mockRejectedValue(new Error('connection terminated'))
  storeEnsembleRun.mockRejectedValue(new Error('connection terminated'))
})

describe('a stored read that fails', () => {
  it('serves the deterministic runs live', async () => {
    fetchDeterministicHourly.mockResolvedValue({
      models: [{ model: 'gfs_seamless', hours: [], probability_is_shared: false }],
      unavailable_models: [],
      utc_offset_seconds: -18000,
      model_elevation_m: 240,
      fetched_at: FETCHED_AT,
    })

    const runs = await getDeterministicRuns(POINT, FETCHED_AT)

    expect(fetchDeterministicHourly).toHaveBeenCalledTimes(1)
    expect(runs.models.map((m) => m.model)).toEqual(['gfs_seamless'])
    expect(runs.fetched_at).toEqual(FETCHED_AT)
  })

  it('serves the ensemble run live', async () => {
    fetchEnsembleRun.mockResolvedValue({
      daily: { days: [], model_sources: [], utc_offset_seconds: -18000 },
      hours: [],
      fetched_at: FETCHED_AT,
    })

    const runs = await getEnsembleRuns(POINT, FETCHED_AT)

    expect(fetchEnsembleRun).toHaveBeenCalledTimes(1)
    expect(runs.fetched_at).toEqual(FETCHED_AT)
  })

  it('still throws the upstream error when the live fetch fails too', async () => {
    fetchDeterministicHourly.mockRejectedValue(new Error('upstream 503'))

    await expect(getDeterministicRuns(POINT, FETCHED_AT)).rejects.toThrow('upstream 503')
  })
})
