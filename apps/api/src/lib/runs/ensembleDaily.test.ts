import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DailyForecast } from '../weather/openMeteo.js'

/**
 * `getEnsembleDaily` — the forecast's daily figures, read from the run
 * `collect-runs` stored instead of a second live fetch. What must hold: a
 * stored run is used only when it says what a live fetch would, and anything
 * short of that fetches live. The SQL itself is `check:weather-runs`' job.
 */

let storedRows: unknown[] | Error = []
const chain = {
  from: () => chain,
  where: () => chain,
  orderBy: () => chain,
  limit: () => (storedRows instanceof Error ? Promise.reject(storedRows) : Promise.resolve(storedRows)),
}
vi.mock('../../db/index.js', () => ({ db: { select: () => chain }, pool: {} }))

const fetchEnsembleRun = vi.fn()
vi.mock('../weather/openMeteo.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../weather/openMeteo.js')>()),
  fetchEnsembleRun,
}))

const storeEnsembleRun = vi.fn()
vi.mock('./storeRun.js', () => ({ ENSEMBLE_RUN_MODEL: 'ensemble', storeDeterministicRun: vi.fn(), storeEnsembleRun }))

const { getEnsembleDaily, parseStoredDaily } = await import('./latestRuns.js')

const POINT = { lat: 45.3955, lon: -92.6616, elevation_m: 250 }
const OFFSET = -18000 // CDT
// 07:00 local on 2026-09-29.
const NOW = new Date('2026-09-29T12:00:00Z')
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)

function day(date: string, overrides: Partial<Record<keyof DailyForecast, unknown>> = {}): Record<string, unknown> {
  return {
    date,
    precip_mm_p10: 0,
    precip_mm_p50: 0.4,
    precip_mm_p90: 2.1,
    temp_c_min: 9.5,
    temp_c_max: 18.25,
    wind_kmh_max: 14,
    humidity_pct: 71,
    dewpoint_c: 8,
    shortwave_wm2: 210,
    ...overrides,
  }
}
const storedRow = (days: unknown[], checkedMinutesAgo = 10) => ({
  daily: { days, model_sources: ['gfs_seamless', 'icon_seamless'] },
  offset: OFFSET,
  checked_at: minutesAgo(checkedMinutesAgo).toISOString(),
})

const LIVE = {
  daily: { days: [day('2026-09-29', { temp_c_max: 99 })], model_sources: ['gfs_seamless'], utc_offset_seconds: OFFSET },
  hours: [],
  fetched_at: NOW,
}

beforeEach(() => {
  vi.clearAllMocks()
  storedRows = []
  fetchEnsembleRun.mockResolvedValue(LIVE)
  storeEnsembleRun.mockResolvedValue(null)
})

describe('getEnsembleDaily', () => {
  it('reads a fresh stored run that starts today, and fetches nothing', async () => {
    storedRows = [storedRow([day('2026-09-29'), day('2026-09-30')])]

    const daily = await getEnsembleDaily(POINT, NOW)

    expect(fetchEnsembleRun).not.toHaveBeenCalled()
    expect(daily.days.map((d) => d.date)).toEqual(['2026-09-29', '2026-09-30'])
    expect(daily.days[0]?.temp_c_max).toBe(18.25)
    expect(daily.utc_offset_seconds).toBe(OFFSET)
    expect(daily.model_sources).toEqual(['gfs_seamless', 'icon_seamless'])
  })

  it('fetches past a run that started yesterday — it reaches one day less far — and stores the fetch', async () => {
    storedRows = [storedRow([day('2026-09-28'), day('2026-09-29')])]

    const daily = await getEnsembleDaily(POINT, NOW)

    expect(fetchEnsembleRun).toHaveBeenCalledTimes(1)
    expect(storeEnsembleRun).toHaveBeenCalledTimes(1)
    expect(daily.days[0]?.temp_c_max).toBe(99)
  })

  it('fetches when nothing is stored', async () => {
    const daily = await getEnsembleDaily(POINT, NOW)
    expect(fetchEnsembleRun).toHaveBeenCalledTimes(1)
    expect(daily.days[0]?.temp_c_max).toBe(99)
  })

  it('fetches past a stored day with a gap in it, rather than scoring the gap', async () => {
    storedRows = [storedRow([day('2026-09-29', { precip_mm_p50: null })])]
    await getEnsembleDaily(POINT, NOW)
    expect(fetchEnsembleRun).toHaveBeenCalledTimes(1)
  })

  it('fetches when the collection has stopped, and falls back to the stored run only if that fails', async () => {
    storedRows = [storedRow([day('2026-09-29')], 120)]

    await getEnsembleDaily(POINT, NOW)
    expect(fetchEnsembleRun).toHaveBeenCalledTimes(1)

    fetchEnsembleRun.mockRejectedValue(new Error('upstream 503'))
    const daily = await getEnsembleDaily(POINT, NOW)
    expect(daily.days[0]?.temp_c_max).toBe(18.25)
  })

  it('throws the upstream error when there is nothing stored to fall back to', async () => {
    fetchEnsembleRun.mockRejectedValue(new Error('upstream 503'))
    await expect(getEnsembleDaily(POINT, NOW)).rejects.toThrow('upstream 503')
  })

  it('fetches when the stored read itself fails', async () => {
    storedRows = new Error('connection terminated')
    const daily = await getEnsembleDaily(POINT, NOW)
    expect(daily.days[0]?.temp_c_max).toBe(99)
  })

  it('uses the live run even when storing it fails', async () => {
    storeEnsembleRun.mockRejectedValue(new Error('connection terminated'))
    const daily = await getEnsembleDaily(POINT, NOW)
    expect(daily.days[0]?.temp_c_max).toBe(99)
  })
})

describe('parseStoredDaily', () => {
  const ok = { days: [day('2026-09-29')], model_sources: ['gfs_seamless'] }

  it('accepts a full day', () => {
    expect(parseStoredDaily(ok)).toEqual(ok)
  })

  it.each([
    ['a null figure', { ...ok, days: [day('2026-09-29', { temp_c_max: null })] }],
    ['a missing figure', { ...ok, days: [day('2026-09-29', { humidity_pct: undefined })] }],
    ['a non-finite figure', { ...ok, days: [day('2026-09-29', { wind_kmh_max: Number.NaN })] }],
    ['a figure stored as text', { ...ok, days: [day('2026-09-29', { temp_c_min: '9.5' })] }],
    ['a malformed date', { ...ok, days: [day('29/09/2026')] }],
    ['no days', { ...ok, days: [] }],
    ['no model list', { days: ok.days }],
    ['nothing stored', null],
  ])('rejects %s', (_label, value) => {
    expect(parseStoredDaily(value)).toBeNull()
  })
})
