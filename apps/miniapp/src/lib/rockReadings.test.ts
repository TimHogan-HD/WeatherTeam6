import { describe, expect, it } from 'vitest'
import type { HourlyReading, HourlyReadings, RockLevel } from '@weatherteam6/types'
import {
  CONDENSATION_EDGE_F,
  condensationHoursAhead,
  dryAgain,
  drynessNow,
  marginSeries,
} from './rockReadings.js'

const H = 3_600_000
const T0 = Date.parse('2026-10-20T12:00:00Z')
const NOW = T0 + 10 * 60_000

const hour = (i: number, level: RockLevel | null, marginC: number | null = 5): HourlyReading => ({
  valid_at: new Date(T0 + i * H).toISOString(),
  rock: level === null ? null : { level, qualified: true },
  friction: null,
  score: null,
  t_surface_c: null,
  condensation_margin_c: marginC,
})

const readings = (hours: HourlyReading[]): HourlyReadings => ({
  model: 'gfs_seamless',
  unavailable_reason: null,
  hours,
  days: [],
})

describe('drynessNow', () => {
  it('reads the hour covering now', () => {
    expect(drynessNow(readings([hour(-1, 'wet'), hour(0, 'drying'), hour(1, 'dry')]), NOW)).toBe('Drying')
  })

  it('is a gap with no hour near now, an unread rock, or a reason there are no readings', () => {
    expect(drynessNow(readings([hour(5, 'dry')]), NOW)).toBeNull()
    expect(drynessNow(readings([hour(0, null)]), NOW)).toBeNull()
    expect(drynessNow({ ...readings([hour(0, 'dry')]), unavailable_reason: 'model_unavailable' }, NOW)).toBeNull()
    expect(drynessNow(undefined, NOW)).toBeNull()
  })
})

describe('dryAgain', () => {
  it('is now when the rock is dry now', () => {
    expect(dryAgain(readings([hour(0, 'dry')]), NOW)).toEqual({ kind: 'now' })
  })

  it('is the first dry hour ahead, skipping an unread one rather than calling it dry', () => {
    const r = readings([hour(-1, 'dry'), hour(0, 'wet'), hour(1, null), hour(2, 'drying'), hour(3, 'dry'), hour(4, 'dry')])
    expect(dryAgain(r, NOW)).toEqual({ kind: 'at', ms: T0 + 3 * H })
  })

  it('says not in the forecast, through the last hour read, when no hour ahead is dry', () => {
    expect(dryAgain(readings([hour(0, 'wet'), hour(1, 'drying'), hour(2, 'drying')]), NOW)).toEqual({
      kind: 'not-in-forecast',
      throughMs: T0 + 2 * H,
    })
  })

  it('ends the not-dry span at the last hour read, not at unread hours past it', () => {
    expect(dryAgain(readings([hour(0, 'wet'), hour(1, 'drying'), hour(2, null), hour(30, null)]), NOW)).toEqual({
      kind: 'not-in-forecast',
      throughMs: T0 + 1 * H,
    })
  })

  it('is a gap when now could not be read, never now', () => {
    expect(dryAgain(readings([hour(0, null), hour(1, 'dry')]), NOW)).toBeNull()
  })
})

describe('marginSeries', () => {
  it('runs six hours back to 42 ahead, in °F, keeping a null as a gap', () => {
    const all = Array.from({ length: 60 }, (_, i) => hour(i - 10, 'dry', i === 12 ? null : 2))
    const s = marginSeries(readings(all), NOW)
    expect(s[0]?.t).toBe(T0 - 6 * H)
    expect(s[s.length - 1]?.t).toBe(T0 + 42 * H)
    expect(s.find((h) => h.t === T0 + 2 * H)?.marginF).toBeNull()
    expect(s[0]?.marginF).toBeCloseTo(3.6)
  })
})

describe('condensationHoursAhead', () => {
  it('counts hours ahead under the score’s edge only — not past hours, not unread ones', () => {
    const s = marginSeries(readings([hour(-2, 'dry', 0), hour(1, 'dry', 1.9), hour(2, 'dry', 2), hour(3, 'dry', null)]), NOW)
    expect(CONDENSATION_EDGE_F).toBeCloseTo(3.6)
    expect(condensationHoursAhead(s, NOW)).toBe(1)
  })
})
