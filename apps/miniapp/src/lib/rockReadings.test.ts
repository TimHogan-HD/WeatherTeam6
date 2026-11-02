import { describe, expect, it } from 'vitest'
import type { HourlyReading, HourlyReadings, RockLevel } from '@weatherteam6/types'
import {
  CONDENSATION_EDGE_F,
  condensationHeadline,
  dryAgain,
  drynessNow,
  firstDampSpell,
  marginSeries,
  marginWords,
  marginZone,
  whenLabel,
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
  it('runs from the hour covering now to 42 ahead, in °F, keeping a null as a gap', () => {
    const all = Array.from({ length: 60 }, (_, i) => hour(i - 10, 'dry', i === 12 ? null : 2))
    const s = marginSeries(readings(all), NOW)
    expect(s[0]?.t).toBe(T0)
    expect(s[s.length - 1]?.t).toBe(T0 + 42 * H)
    expect(s.find((h) => h.t === T0 + 2 * H)?.marginF).toBeNull()
    expect(s[0]?.marginF).toBeCloseTo(3.6)
  })
})

describe('marginZone and marginWords', () => {
  it('names dew at or under 0°, close under the score’s 3.6° edge, clear at it', () => {
    expect(CONDENSATION_EDGE_F).toBeCloseTo(3.6)
    expect(marginZone(-0.1)).toBe('dew')
    expect(marginZone(0)).toBe('dew')
    expect(marginZone(0.1)).toBe('near')
    expect(marginZone(3.5)).toBe('near')
    expect(marginZone(CONDENSATION_EDGE_F)).toBe('clear')
  })

  it('says below for a negative margin, never a negative above', () => {
    expect(marginWords(-5.2)).toBe('5°F below')
    expect(marginWords(9)).toBe('9°F above')
    expect(marginWords(-0.3)).toBe('at dew point')
  })
})

// Margins in °C: 2 °C is the edge. 1 → near, -1 → dew, 5 → clear.
const series = (marginsC: (number | null)[]) =>
  marginSeries(readings(marginsC.map((m, i) => hour(i, 'dry', m))), NOW)

describe('firstDampSpell', () => {
  it('is null when no read hour is under the edge, an unread one included', () => {
    expect(firstDampSpell(series([5, null, 5]))).toBeNull()
  })

  it('is the first run under the edge, with its first dew hour, and counts later hours', () => {
    expect(firstDampSpell(series([5, 1, -1, -1, 1, 5, 1, 5]))).toEqual({
      fromMs: T0 + 1 * H,
      toMs: T0 + 4 * H,
      dewFromMs: T0 + 2 * H,
      clearFromMs: T0 + 5 * H,
      open: false,
      laterHours: 1,
      laterDewFromMs: null,
    })
  })

  it('ends a run at an unread hour rather than reading across it', () => {
    const s = firstDampSpell(series([1, null, 1, 5]))
    expect(s).toMatchObject({ fromMs: T0, toMs: T0, clearFromMs: null, open: false, laterHours: 1 })
  })

  it('ends a run at a missing hour, and does not call the hour after it clear', () => {
    const s = marginSeries(readings([hour(0, 'dry', 1), hour(2, 'dry', 5)]), NOW)
    expect(firstDampSpell(s)).toMatchObject({ toMs: T0, clearFromMs: null })
  })

  it('is open when the run reaches the last hour read', () => {
    expect(firstDampSpell(series([5, 1, 1]))).toMatchObject({ toMs: T0 + 2 * H, open: true, clearFromMs: null, dewFromMs: null })
  })
})

describe('condensationHeadline', () => {
  // T0 is 12:00Z; at offset 0 that is noon, and +12 h is midnight, tomorrow.
  it('gives the window in times, not a count of hours', () => {
    expect(condensationHeadline(series([5, 1, -1, -1, 1, 5]), NOW, 0)).toBe(
      'Rock near its dew point from 1 PM until 5 PM. Dew likely on the rock from 2 PM.',
    )
  })

  it('says now when the current hour is in the spell, and tomorrow by the crag’s local day', () => {
    const m = Array.from({ length: 16 }, (_, i) => (i < 14 ? -1 : 5))
    expect(condensationHeadline(series(m), NOW, 0)).toBe(
      'Rock near its dew point from now until 2 AM tomorrow. Dew likely on the rock now.',
    )
  })

  it('names the last hour read when the spell runs off the end, and later spells', () => {
    expect(condensationHeadline(series([5, 1, 5, 1]), NOW, 0)).toBe(
      'Rock near its dew point from 1 PM until 2 PM. Near it again later.',
    )
    expect(condensationHeadline(series([5, 1, 1]), NOW, 0)).toBe(
      'Rock near its dew point from 1 PM through 2 PM, the last hour read.',
    )
  })

  it('never says until an unread hour: it says the readings have a gap', () => {
    expect(condensationHeadline(series([5, 1, 1, null, 5]), NOW, 0)).toBe(
      'Rock near its dew point from 1 PM through 2 PM, then a gap in the readings.',
    )
    expect(condensationHeadline(series([5, 1, null, 5]), NOW, 0)).toBe(
      'Rock near its dew point at 1 PM, then a gap in the readings.',
    )
  })

  it('says from 1 PM, not now, when the hour covering now is missing', () => {
    const s = marginSeries(readings([hour(1, 'dry', -1), hour(2, 'dry', 5)]), NOW)
    expect(condensationHeadline(s, NOW, 0)).toBe(
      'Rock near its dew point from 1 PM until 2 PM. Dew likely on the rock from 1 PM.',
    )
  })

  it('names a later spell that reaches dew, rather than calling it near', () => {
    // 1 PM brushes the edge; 6 PM to 9 PM is under the dew point.
    expect(condensationHeadline(series([5, 1, 5, 5, 5, 5, -2, -2, -2, -2, 5]), NOW, 0)).toBe(
      'Rock near its dew point from 1 PM until 2 PM. Dew likely on the rock from 6 PM.',
    )
    expect(condensationHeadline(series([5, -1, 5, 5, -2, 5]), NOW, 0)).toBe(
      'Rock near its dew point from 1 PM until 2 PM. Dew likely on the rock from 1 PM. Dew likely on the rock again from 4 PM.',
    )
  })

  it('says clear, and counts only read hours, when nothing is under the edge', () => {
    expect(condensationHeadline(series([5, null, 5]), NOW, 0)).toBe(
      'The rock stays more than 3.6°F above its dew point for the next 2 hours.',
    )
  })

  it('is a gap, not clear, with no readings', () => {
    expect(condensationHeadline(series([null, null]), NOW, 0)).toBe('No rock readings for the hours ahead.')
    expect(condensationHeadline([], NOW, 0)).toBe('No rock readings for the hours ahead.')
  })
})

describe('whenLabel', () => {
  it('reads the day at the crag’s offset, not UTC', () => {
    // 12:00Z + 13 h is 01:00Z tomorrow; at UTC-6 that is 7 PM today.
    expect(whenLabel(T0 + 13 * H, NOW, -6 * 3600)).toBe('7 PM')
    expect(whenLabel(T0 + 13 * H, NOW, 0)).toBe('1 AM tomorrow')
    expect(whenLabel(T0 + 40 * H, NOW, 0)).toBe('4 AM Thu')
  })
})
