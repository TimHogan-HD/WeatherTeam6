import { describe, expect, it } from 'vitest'
import type { TripDayForecast } from '@weatherteam6/types'
import { forecastWords, leadLabel, tripIsOver } from './trips.js'

const forecast = (over: Partial<TripDayForecast> = {}): TripDayForecast => ({
  recorded_at: '2026-10-03T00:00:00.000Z',
  lead_days: 1,
  score: null,
  dryness: null,
  precip_mm_mean: null,
  members_wet: null,
  member_count: null,
  ...over,
})

describe('tripIsOver', () => {
  it('is over only once the last day is behind today', () => {
    expect(tripIsOver({ endDate: '2026-10-04' }, '2026-10-05')).toBe(true)
    expect(tripIsOver({ endDate: '2026-10-04' }, '2026-10-04')).toBe(false)
    expect(tripIsOver({ endDate: '2026-10-11' }, '2026-10-05')).toBe(false)
  })

  it('is never over on a date it cannot read', () => {
    expect(tripIsOver({ endDate: 'not a date' }, '2026-10-05')).toBe(false)
  })
})

describe('leadLabel', () => {
  it('names the day itself, one day, and several', () => {
    expect([0, 1, 6].map(leadLabel)).toEqual(['On the day', '1 day out', '6 days out'])
  })
})

describe('forecastWords', () => {
  it('words a scored recording as its dryness and score', () => {
    expect(forecastWords(forecast({ score: 100, dryness: 'dry' }))).toBe('Dry · 100')
    expect(forecastWords(forecast({ score: 41, dryness: 'wet' }))).toBe('Wet · 41')
  })

  it('words a weather-only recording as its rain, chance first', () => {
    expect(forecastWords(forecast({ members_wet: 50, member_count: 100, precip_mm_mean: 2.54 }))).toBe('Rain 50% · 0.10 in')
  })

  it('withholds the chance when the member counts are unknown, and says nothing for an empty recording', () => {
    expect(forecastWords(forecast({ members_wet: 3, member_count: null, precip_mm_mean: 2.54 }))).toBe('Rain 0.10 in')
    expect(forecastWords(forecast())).toBeNull()
  })
})
