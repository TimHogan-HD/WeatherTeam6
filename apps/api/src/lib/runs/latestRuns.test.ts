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
const { TRAILING_DAYS } = await import('./deterministicFetch.js')
const { THERMAL_MODEL } = await import('./hourlyReadings.js')
const { DETERMINISTIC_MODELS } = await import('../weather/openMeteo.js')

const POINT = { id: 'loc-a', lat: 44.5694, lon: -92.5223, elevation_m: null }
const FETCHED_AT = new Date('2026-09-29T12:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
  storeDeterministicRun.mockRejectedValue(new Error('connection terminated'))
  storeEnsembleRun.mockRejectedValue(new Error('connection terminated'))
})

const HOUR = { valid_at_local: '2026-09-29T07:00', temp_c: 10, precip_mm: 0 }

/** Answers each request with every model it asked for, as upstream does. */
function answerEveryModel(): void {
  fetchDeterministicHourly.mockImplementation(async (_point: unknown, models: readonly string[]) => ({
    models: models.map((model) => ({ model, hours: [HOUR], probability_is_shared: false })),
    unavailable_models: [],
    utc_offset_seconds: -18000,
    model_elevation_m: 240,
    fetched_at: FETCHED_AT,
  }))
}

describe('a stored read that fails', () => {
  it('serves the deterministic runs live', async () => {
    answerEveryModel()

    const runs = await getDeterministicRuns(POINT, FETCHED_AT)

    expect(runs.models.map((m) => m.model).sort()).toEqual([...DETERMINISTIC_MODELS].sort())
    expect(runs.unavailable_models).toEqual([])
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

/**
 * Issue #176: the cold path asked for no trailing days and stored that run,
 * and `collect-runs` then kept it as current until GFS next published — a new
 * crag had no `T_mass`, so no friction and no score, for hours.
 */
describe('a place with nothing stored', () => {
  it('fetches the thermal model with its trailing history, as collect-runs does', async () => {
    answerEveryModel()

    await getDeterministicRuns(POINT, FETCHED_AT)

    const thermal = fetchDeterministicHourly.mock.calls.filter(([, models]) =>
      (models as string[]).includes(THERMAL_MODEL),
    )
    expect(thermal).toHaveLength(1)
    expect(thermal[0]?.[3]).toBe(TRAILING_DAYS)
    // The forecast-only request carries no history: +71% storage when it did.
    const others = fetchDeterministicHourly.mock.calls.filter(
      ([, models]) => !(models as string[]).includes(THERMAL_MODEL),
    )
    expect(others).toHaveLength(1)
    expect(others[0]?.[3] ?? 0).toBe(0)
  })

  it('stores only the thermal model out of the rain-median request, with its median', async () => {
    answerEveryModel()
    storeDeterministicRun.mockResolvedValue([])

    const runs = await getDeterministicRuns(POINT, FETCHED_AT)

    const storedModels = storeDeterministicRun.mock.calls.flatMap(([, result]) =>
      (result as { models: { model: string }[] }).models.map((m) => m.model),
    )
    expect(storedModels.filter((m) => m === THERMAL_MODEL)).toHaveLength(1)
    expect(storedModels.sort()).toEqual([...DETERMINISTIC_MODELS].sort())
    const thermalStore = storeDeterministicRun.mock.calls.find(([, result]) =>
      (result as { models: { model: string }[] }).models.some((m) => m.model === THERMAL_MODEL),
    )
    expect(thermalStore?.[2]).not.toBeNull()
    expect(runs.models.find((m) => m.model === THERMAL_MODEL)?.rain_models).not.toBeNull()
  })
})
