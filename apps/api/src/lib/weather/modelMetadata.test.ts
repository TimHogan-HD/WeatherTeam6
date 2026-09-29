import { describe, it, expect } from 'vitest'
import {
  COLLECTED_MODELS,
  MODEL_SOURCES,
  REFETCH_BACKSTOP_MS,
  metadataUrl,
  needsFetch,
  parseDatasetRun,
  planCollection,
  sourceKey,
  staleSources,
  type Availability,
  type CollectedModel,
  type DatasetRun,
} from './modelMetadata.js'

const NOW = new Date('2026-09-28T18:00:00Z')
const hoursAgo = (h: number): Date => new Date(NOW.getTime() - h * 3_600_000)

/** Every source in the table, each last published at `at`. */
function everySourceAt(at: Date): Map<string, DatasetRun> {
  const out = new Map<string, DatasetRun>()
  for (const list of Object.values(MODEL_SOURCES)) {
    for (const s of list) out.set(sourceKey(s), { availableAt: at })
  }
  return out
}

describe('needsFetch', () => {
  const quiet: Availability = everySourceAt(hoursAgo(4))

  it('skips a model none of whose parts published since our copy', () => {
    expect(needsFetch('ecmwf_ifs025', hoursAgo(3), quiet, NOW)).toBe(false)
  })

  it('fetches a blend when only one of its parts published since our copy', () => {
    const runs = everySourceAt(hoursAgo(4))
    runs.set('forecast:ncep_hrrr_conus', { availableAt: hoursAgo(0.5) })
    expect(needsFetch('gfs_seamless', hoursAgo(1), runs, NOW)).toBe(true)
    expect(needsFetch('ecmwf_ifs025', hoursAgo(1), runs, NOW)).toBe(false)
  })

  it('fetches when any part could not be read', () => {
    const runs = everySourceAt(hoursAgo(4))
    runs.delete('forecast:dwd_icon_d2')
    expect(needsFetch('icon_seamless', hoursAgo(1), runs, NOW)).toBe(true)
  })

  it('fetches with no stored copy', () => {
    expect(needsFetch('ecmwf_ifs025', null, quiet, NOW)).toBe(true)
  })

  it('refetches at the backstop even when the metadata says nothing changed', () => {
    const justUnder = new Date(NOW.getTime() - REFETCH_BACKSTOP_MS + 60_000)
    const atBackstop = new Date(NOW.getTime() - REFETCH_BACKSTOP_MS)
    const frozen = everySourceAt(new Date('2026-05-01T00:00:00Z'))
    expect(needsFetch('gem_seamless', justUnder, frozen, NOW)).toBe(false)
    expect(needsFetch('gem_seamless', atBackstop, frozen, NOW)).toBe(true)
  })
})

describe('planCollection', () => {
  it('fetches changed and never-stored models, and confirms the rest against their stored fetch', () => {
    const runs = everySourceAt(hoursAgo(4))
    runs.set('forecast:ncep_nbm_conus', { availableAt: hoursAgo(0.2) })
    const stored = new Map<string, Date>(
      COLLECTED_MODELS.filter((m) => m !== 'ncep_hrrr_conus').map((m) => [m, hoursAgo(2)]),
    )

    const plan = planCollection(stored, runs, NOW)

    expect([...plan.fetch].sort()).toEqual(['ncep_hrrr_conus', 'ncep_nbm_conus'])
    expect(plan.confirm.map((c) => c.model).sort()).toEqual(
      ['ecmwf_ifs025', 'ensemble', 'gem_seamless', 'gfs_seamless', 'icon_seamless'],
    )
    expect(plan.confirm.every((c) => c.fetched_at.getTime() === hoursAgo(2).getTime())).toBe(true)
  })

  it('fetches everything when no metadata could be read', () => {
    const stored = new Map<string, Date>(COLLECTED_MODELS.map((m) => [m, hoursAgo(1)]))
    const plan = planCollection(stored, new Map(), NOW)
    expect(plan.fetch).toEqual(COLLECTED_MODELS)
    expect(plan.confirm).toEqual([])
  })
})

describe('MODEL_SOURCES', () => {
  it('maps every collected model to at least one source', () => {
    for (const model of COLLECTED_MODELS) {
      expect(MODEL_SOURCES[model as CollectedModel].length, model).toBeGreaterThan(0)
    }
  })

  it('does not list the GEM names Open-Meteo retired in May 2026', () => {
    const datasets = Object.values(MODEL_SOURCES).flat().map((s) => s.dataset)
    expect(datasets).not.toContain('cmc_gem_gdps')
    expect(datasets).not.toContain('cmc_gem_rdps')
  })

  it('reads ensemble datasets from the ensemble host', () => {
    expect(metadataUrl({ host: 'ensemble', dataset: 'cmc_gem_geps' })).toBe(
      'https://ensemble-api.open-meteo.com/data/cmc_gem_geps/static/meta.json',
    )
    expect(metadataUrl({ host: 'forecast', dataset: 'ncep_gfs013' })).toBe(
      'https://api.open-meteo.com/data/ncep_gfs013/static/meta.json',
    )
  })
})

describe('parseDatasetRun', () => {
  it('reads Unix seconds', () => {
    expect(parseDatasetRun({ last_run_availability_time: 1790622375 })?.availableAt.toISOString()).toBe(
      '2026-09-28T19:06:15.000Z',
    )
  })

  it.each([null, 'x', {}, { last_run_availability_time: '1790622375' }, { last_run_availability_time: 0 }])(
    'returns null for %j, so the model is fetched',
    (body) => {
      expect(parseDatasetRun(body)).toBeNull()
    },
  )
})

describe('staleSources', () => {
  it('names a source whose last run is older than 36 hours, and only that one', () => {
    const runs = new Map<string, DatasetRun>([
      ['forecast:cmc_gem_gdps_15km', { availableAt: hoursAgo(13) }],
      ['forecast:retired', { availableAt: hoursAgo(37) }],
    ])
    expect(staleSources(runs, NOW)).toEqual(['forecast:retired'])
  })
})
