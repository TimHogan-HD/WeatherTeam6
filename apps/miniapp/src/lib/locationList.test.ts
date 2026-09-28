import { describe, expect, it } from 'vitest'
import type {
  ConditionsReadings,
  ConditionsScore,
  HourlyReading,
  Location,
  WeatherAlert,
} from '@weatherteam6/types'
import { cardSummary, readingTone, scoreTone, sortLocations } from './locationList.js'

const reading = (over: Partial<HourlyReading> = {}): HourlyReading => ({
  valid_at: '2026-09-28T18:00:00Z',
  rock: { level: 'dry', qualified: true },
  friction: { level: 'great', condensing: false, qualified: true },
  score: 91,
  t_surface_c: 18,
  condensation_margin_c: 6,
  ...over,
})

const conditions = (now: HourlyReading | null): ConditionsScore => {
  const readings: ConditionsReadings = {
    model: 'gfs_seamless',
    unavailable_reason: null,
    utc_offset_seconds: -18000,
    now,
    today: null,
  }
  // Only `readings` is read; the five-component fields are dead (Phase 5).
  return { readings } as ConditionsScore
}

const alert = (severity: string): WeatherAlert =>
  ({ id: 'a', event: 'Extreme Heat Warning', severity, headline: null }) as WeatherAlert

const loc = (id: string, name: string): Location => ({ id, name }) as Location

describe('cardSummary', () => {
  it('prints nothing for a location whose conditions were never asked for', () => {
    expect(cardSummary(undefined, [], false)).toBeNull()
  })

  it('prints nothing for a response from an API older than the readings', () => {
    // Absent is "the server did not send it", not "the model could not read it".
    expect(cardSummary({} as ConditionsScore, [], false)).toBeNull()
  })

  it('carries the score once alerts have settled with nothing severe', () => {
    expect(cardSummary(conditions(reading()), [], false)?.score).toBe(91)
  })

  it('withholds the number while alerts are still loading, and keeps the readings', () => {
    const s = cardSummary(conditions(reading()), undefined, true)
    expect(s?.score).toBeNull()
    expect(s?.readings.map((f) => f.value)).toEqual(['Dry', 'Great'])
  })

  it('withholds the number under a Severe alert', () => {
    expect(cardSummary(conditions(reading()), [alert('Severe')], false)?.score).toBeNull()
  })
})

describe('readingTone', () => {
  const s = cardSummary(
    conditions(reading({ rock: { level: 'drying', qualified: true } })),
    [],
    false,
  )
  const [dryness, friction] = s?.readings ?? []

  it('takes each tone from the level the word was made from', () => {
    const r = reading({ rock: { level: 'drying', qualified: true } })
    expect(dryness && readingTone(dryness, r)).toBe('fair')
    expect(friction && readingTone(friction, r)).toBe('good')
  })

  it('maps every rung', () => {
    const tone = (rock: 'wet' | 'drying' | 'dry', fr: 'poor' | 'fair' | 'good' | 'great') => {
      const r = reading({
        rock: { level: rock, qualified: true },
        friction: { level: fr, condensing: false, qualified: true },
      })
      return [
        readingTone({ label: 'Dryness', value: '' }, r),
        readingTone({ label: 'Friction', value: '' }, r),
      ]
    }
    expect(tone('wet', 'poor')).toEqual(['poor', 'poor'])
    expect(tone('drying', 'fair')).toEqual(['fair', 'fair'])
    expect(tone('dry', 'good')).toEqual(['good', 'good'])
    expect(tone('dry', 'great')).toEqual(['good', 'good'])
  })

  it('gives a field it does not recognise no tone rather than a borrowed one', () => {
    expect(readingTone({ label: 'Score', value: '91' }, reading())).toBeNull()
    expect(readingTone({ label: 'Dryness', value: 'Dry' }, null)).toBeNull()
  })
})

describe('scoreTone', () => {
  it('uses the SCORE_BANDS rungs, inclusive at each floor', () => {
    expect(scoreTone(100)).toBe('good')
    expect(scoreTone(60)).toBe('good')
    expect(scoreTone(59)).toBe('fair')
    expect(scoreTone(40)).toBe('fair')
    expect(scoreTone(39)).toBe('poor')
    expect(scoreTone(0)).toBe('poor')
  })
})

describe('sortLocations', () => {
  const list = [loc('a', 'red wing'), loc('b', 'Baraboo'), loc('c', 'Willow River'), loc('d', 'Chicago')]

  it('keeps the added order, as a copy', () => {
    const out = sortLocations(list, 'added', null)
    expect(out.map((l) => l.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(out).not.toBe(list)
  })

  it('sorts by name ignoring case, without touching its input', () => {
    expect(sortLocations(list, 'name', null).map((l) => l.name)).toEqual([
      'Baraboo',
      'Chicago',
      'red wing',
      'Willow River',
    ])
    expect(list.map((l) => l.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('ranks by score, highest first, with the unscored after in added order', () => {
    // `d` (a city) and `a` (a withheld number) have nothing to rank by. Ranking
    // them as 0 would put them below `b`, which reads as hopeless.
    const scores = new Map<string, number | null>([
      ['a', null],
      ['b', 0],
      ['c', 99],
      ['d', null],
    ])
    expect(sortLocations(list, 'score', scores).map((l) => l.id)).toEqual(['c', 'b', 'a', 'd'])
  })

  it('keeps the added order while scores are still settling', () => {
    expect(sortLocations(list, 'score', null).map((l) => l.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})
