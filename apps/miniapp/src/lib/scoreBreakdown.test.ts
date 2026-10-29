import { describe, expect, it } from 'vitest'
import type { HourlyReading, HourlySample, ScoreLimit } from '@weatherteam6/types'
import { breakdownCount, breakdownRows, easesAt } from './scoreBreakdown.js'

const T0 = Date.parse('2026-10-29T18:00:00.000Z')
const HOUR = 3_600_000
const at = (i: number) => new Date(T0 + i * HOUR).toISOString()

const reading = (i: number, held: ScoreLimit[] | null | undefined): HourlyReading => ({
  valid_at: at(i),
  rock: { level: 'drying', qualified: true },
  friction: null,
  score: held === null ? null : 60,
  t_surface_c: null,
  condensation_margin_c: null,
  ...(held === undefined ? {} : { held_back_by: held }),
})

const sample = (i: number, over: Partial<HourlySample> = {}): HourlySample =>
  ({ valid_at: at(i), local_date: i < 6 ? '2026-10-29' : '2026-10-30', temp_c: 20, dewpoint_c: 14, ...over }) as HourlySample

describe('easesAt', () => {
  it('finds the first hour ahead that no longer names the cause', () => {
    const rs = [reading(0, ['humidity']), reading(1, ['humidity']), reading(2, ['heat']), reading(3, [])]
    expect(easesAt('humidity', rs, T0)?.valid_at).toBe(at(2))
  })

  it('stops at an unscored hour: the cause may have eased inside it', () => {
    const rs = [reading(0, ['humidity']), reading(1, null), reading(2, [])]
    expect(easesAt('humidity', rs, T0)).toBeNull()
  })

  it('stops at an hour from an older API with no held_back_by', () => {
    expect(easesAt('humidity', [reading(0, ['humidity']), reading(1, undefined), reading(2, [])], T0)).toBeNull()
  })

  it('says nothing when the readings end before it eases', () => {
    expect(easesAt('humidity', [reading(0, ['humidity']), reading(1, ['humidity'])], T0)).toBeNull()
  })

  it('never answers with the hour it starts from', () => {
    expect(easesAt('humidity', [reading(0, [])], T0)).toBeNull()
  })
})

describe('breakdownRows', () => {
  const base = {
    readings: [reading(0, ['heat', 'wet_rock']), reading(7, ['wet_rock']), reading(8, [])],
    hours: [sample(0, { temp_c: 31 }), sample(7, { temp_c: 15 }), sample(8)],
    sameModel: true,
    rangeF: { low: 30, high: 60 },
    utcOffsetSeconds: 0,
    todayDate: '2026-10-29',
  }

  it('names a later day before the hour it eases', () => {
    const rows = breakdownRows({ ...base, limits: ['heat', 'wet_rock'], now: reading(0, ['heat', 'wet_rock']) })
    expect(rows[0]).toMatchObject({
      label: 'Heat',
      figure: 'air 88°F',
      rule: 'Points come off once the air is above your 60°F high.',
      eases: 'Eases ≈ Fri 1am, when the air drops to 59°F',
    })
    expect(rows[1]).toMatchObject({ label: 'Wet rock', figure: 'rock drying', eases: 'Eases ≈ Fri 2am' })
  })

  it('quotes the range as unknown rather than guessing it', () => {
    const rows = breakdownRows({ ...base, rangeF: null, limits: ['heat'], now: reading(0, ['heat']) })
    expect(rows[0]?.rule).toBe('Points come off once the air is above your range.')
  })

  it('omits the eases without the server’s local date for that hour', () => {
    const rows = breakdownRows({ ...base, hours: [sample(0)], limits: ['heat'], now: reading(0, ['heat']) })
    expect(rows[0]?.eases).toBeNull()
  })
})

describe('breakdownCount', () => {
  it('agrees with its number', () => {
    expect(breakdownCount(1)).toBe('1 thing costs points')
    expect(breakdownCount(3)).toBe('3 things cost points')
  })
})
