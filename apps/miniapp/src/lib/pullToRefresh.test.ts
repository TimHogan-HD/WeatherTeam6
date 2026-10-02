import { describe, expect, it } from 'vitest'
import type { ConditionsReadings } from '@weatherteam6/types'
import { PULL_ARM_PX, PULL_MAX_PX, pullMessage, pullOffset, scoresFreshness } from './pullToRefresh.js'

const NOW = Date.parse('2026-10-01T15:00:00.000Z')

const readings = (over: Partial<ConditionsReadings>): ConditionsReadings => ({
  model: 'gfs_seamless',
  unavailable_reason: null,
  utc_offset_seconds: 0,
  now: null,
  today: null,
  checked_at: '2026-10-01T14:56:00.000Z',
  ...over,
})

describe('pullOffset', () => {
  it('does not move for an upward or zero pull', () => {
    expect(pullOffset(0)).toBe(0)
    expect(pullOffset(-40)).toBe(0)
  })

  it('arms within a comfortable pull and never passes its limit', () => {
    expect(pullOffset(200)).toBeGreaterThanOrEqual(PULL_ARM_PX)
    expect(pullOffset(10_000)).toBeLessThanOrEqual(PULL_MAX_PX)
    expect(pullOffset(60)).toBeLessThan(pullOffset(120))
  })
})

describe('pullMessage', () => {
  it('asks for a release only once the pull is armed', () => {
    expect(pullMessage({ kind: 'pulling', offset: PULL_ARM_PX - 1 })).toBe('Pull to refresh')
    expect(pullMessage({ kind: 'pulling', offset: PULL_ARM_PX })).toBe('Release to refresh')
  })

  it('says when a refresh failed rather than calling it up to date', () => {
    expect(pullMessage({ kind: 'settled', ok: false })).toBe('Couldn’t refresh')
    expect(pullMessage({ kind: 'settled', ok: true })).toBe('Up to date')
  })
})

describe('scoresFreshness', () => {
  it('names the one model and the oldest check across cards', () => {
    const line = scoresFreshness(
      [readings({ checked_at: '2026-10-01T14:56:00.000Z' }), readings({ checked_at: '2026-10-01T14:20:00.000Z' })],
      NOW,
    )
    expect(line).toBe('GFS · checked 40 min ago')
  })

  it('ignores cards without readings: a city, or one still loading', () => {
    expect(scoresFreshness([readings({}), null, undefined, readings({ model: null, checked_at: null })], NOW)).toBe(
      'GFS · checked 4 min ago',
    )
  })

  it('withholds the line when any scored card cannot say when it was checked', () => {
    const { checked_at: _omit, ...older } = readings({})
    expect(scoresFreshness([readings({}), older], NOW)).toBeNull()
    expect(scoresFreshness([readings({}), readings({ checked_at: null })], NOW)).toBeNull()
  })

  it('withholds a check stamped in the future rather than printing a negative age', () => {
    expect(scoresFreshness([readings({ checked_at: '2026-10-01T15:05:00.000Z' })], NOW)).toBeNull()
  })

  it('says nothing when no card has a score to be fresh about', () => {
    expect(scoresFreshness([], NOW)).toBeNull()
  })

  it('stops naming a model when the cards came from different ones', () => {
    expect(scoresFreshness([readings({}), readings({ model: 'ecmwf_ifs025' })], NOW)).toBe('Scores checked 4 min ago')
  })
})
