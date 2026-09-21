import { describe, it, expect } from 'vitest'
import { mergeDeterministic } from './mergeRuns.js'
import type { DeterministicResult, ModelHourly } from '../weather/openMeteo.js'

const model = (name: string): ModelHourly => ({
  model: name,
  hours: [],
  probability_is_shared: false,
})

const result = (over: Partial<DeterministicResult> = {}): DeterministicResult => ({
  models: [model('gfs_seamless')],
  unavailable_models: [],
  utc_offset_seconds: -18000,
  model_elevation_m: 1200,
  fetched_at: new Date('2026-09-21T12:00:00Z'),
  ...over,
})

describe('mergeDeterministic', () => {
  /**
   * **The property `latestBatchAt` depends on and nothing else asserts.** One
   * stored batch shares one `fetched_at`, because that timestamp is what
   * identifies a batch — selecting "newest per model" instead would mix a model
   * collected an hour ago with one collected now and print them under a single
   * header. Two `fetched_at` values out of here would split one collection into
   * two batches, and a panel would then render half of it.
   */
  it('collapses the two responses onto one fetched_at', () => {
    const merged = mergeDeterministic(
      result({ fetched_at: new Date('2026-09-21T12:00:03Z') }),
      result({
        models: [model('ecmwf_ifs025')],
        fetched_at: new Date('2026-09-21T12:00:01Z'),
      }),
    )
    expect(merged!.fetched_at.toISOString()).toBe('2026-09-21T12:00:01.000Z')
  })

  it('takes the older of the two, whichever side it is on', () => {
    const early = new Date('2026-09-21T12:00:00Z')
    const late = new Date('2026-09-21T12:00:30Z')
    expect(mergeDeterministic(result({ fetched_at: late }), result({ fetched_at: early }))!
      .fetched_at).toEqual(early)
    expect(mergeDeterministic(result({ fetched_at: early }), result({ fetched_at: late }))!
      .fetched_at).toEqual(early)
  })

  it('keeps every model and every unavailable name from both sides', () => {
    const merged = mergeDeterministic(
      result({ models: [model('gfs_seamless')], unavailable_models: [] }),
      result({
        models: [model('ecmwf_ifs025'), model('icon_seamless')],
        unavailable_models: ['ncep_hrrr_conus'],
      }),
    )
    expect(merged!.models.map((m) => m.model)).toEqual([
      'gfs_seamless',
      'ecmwf_ifs025',
      'icon_seamless',
    ])
    expect(merged!.unavailable_models).toEqual(['ncep_hrrr_conus'])
  })

  it('returns the surviving side when the other request failed', () => {
    const only = result()
    expect(mergeDeterministic(null, only)).toBe(only)
    expect(mergeDeterministic(only, null)).toBe(only)
    expect(mergeDeterministic(null, null)).toBeNull()
  })

  /**
   * A response with no coverage still carries an offset — 0 — and 0 is a real
   * offset for Iceland, Ghana and Britain in winter. Taking it because it is
   * falsy is the defect `buildHourlySeries` documents at its own offset
   * selection, so this keys on whether models came back.
   */
  it('takes the offset from whichever side actually carried models', () => {
    const empty = result({ models: [], utc_offset_seconds: 0 })
    const real = result({ models: [model('ecmwf_ifs025')], utc_offset_seconds: -18000 })
    expect(mergeDeterministic(empty, real)!.utc_offset_seconds).toBe(-18000)
    // And the reverse: a real offset of 0 on the side that has models survives.
    const utc = result({ models: [model('gfs_seamless')], utc_offset_seconds: 0 })
    const other = result({ models: [], utc_offset_seconds: -18000 })
    expect(mergeDeterministic(utc, other)!.utc_offset_seconds).toBe(0)
  })

  it('keeps an elevation from either side rather than losing it to a null', () => {
    const withElev = result({ model_elevation_m: 1200 })
    const without = result({ model_elevation_m: null })
    expect(mergeDeterministic(without, withElev)!.model_elevation_m).toBe(1200)
    expect(mergeDeterministic(withElev, without)!.model_elevation_m).toBe(1200)
  })
})
