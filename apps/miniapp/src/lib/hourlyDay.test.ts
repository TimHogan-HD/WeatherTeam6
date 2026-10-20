import { describe, expect, it } from 'vitest'
import type { HourlySample } from '@weatherteam6/types'
import { dayChips, daysOutPhrase, defaultReadHour, dryDay } from './hourlyDay.js'

describe('dryDay', () => {
  const H = 3_600_000
  const START = Date.parse('2026-09-28T05:00:00Z')
  const day = (chances: (number | null)[], mean: number | null = 0) =>
    chances.map(
      (c, i) =>
        ({
          valid_at: new Date(START + i * H).toISOString(),
          local_date: '2026-09-28',
          precip_chance_pct: c,
          precip_mm_mean: mean,
        }) as HourlySample,
    )

  it('is dry only when every hour is 0%', () => {
    expect(dryDay(day([0, 0, 0]), '2026-09-28')).toBe(true)
  })

  it('is not dry once any hour has any chance, however small', () => {
    expect(dryDay(day([0, 1, 0]), '2026-09-28')).toBe(false)
    expect(dryDay(day([0, 9, 4]), '2026-09-28')).toBe(false)
  })

  it('is not dry when sub-trace amounts add up past measurable at 0% chance', () => {
    expect(dryDay(day([0, 0, 0], 0.04), '2026-09-28')).toBe(false)
    expect(dryDay(day([0, 0, 0], 0.03), '2026-09-28')).toBe(true)
  })

  it('is not dry when an hour was never read, since that hour could be the wet one', () => {
    expect(dryDay(day([0, null, 0]), '2026-09-28')).toBe(false)
    expect(dryDay(day([0, 0, 0], null), '2026-09-28')).toBe(false)
    expect(dryDay(day([0, 0]), '2026-09-29')).toBe(false)
  })
})

describe('defaultReadHour', () => {
  const OFFSET = -5 * 3600
  const H = 3_600_000
  // Local midnight on 9/28 is 05:00Z.
  const START = Date.parse('2026-09-28T05:00:00Z')
  const hours = Array.from(
    { length: 48 },
    (_, i) => ({ valid_at: new Date(START + i * H).toISOString(), local_date: i < 24 ? '2026-09-28' : '2026-09-29' }) as HourlySample,
  )

  it('reads the hour every other "now" on the crag reads: 14:20 is 14:00, 14:40 is 15:00', () => {
    expect(defaultReadHour(hours, '2026-09-28', OFFSET, START + 14 * H + 20 * 60_000)).toBe(START + 14 * H)
    expect(defaultReadHour(hours, '2026-09-28', OFFSET, START + 14 * H + 40 * 60_000)).toBe(START + 15 * H)
  })

  it('reads noon on today once now has rolled into tomorrow’s first hour', () => {
    expect(defaultReadHour(hours, '2026-09-28', OFFSET, START + 23 * H + 40 * 60_000)).toBe(START + 12 * H)
  })

  it('reads noon on the location’s clock on any other day, not the viewer’s', () => {
    expect(defaultReadHour(hours, '2026-09-29', OFFSET, START + 14 * H)).toBe(START + 36 * H)
  })

  it('falls back to the day’s first hour without a noon, and is null for a day with none', () => {
    const morning = hours.slice(24, 30)
    expect(defaultReadHour(morning, '2026-09-29', OFFSET, START)).toBe(START + 24 * H)
    expect(defaultReadHour(hours, '2026-10-01', OFFSET, START)).toBeNull()
  })
})

const days = [
  { local_date: '2026-09-15', has_deterministic: true, has_ensemble: true },
  { local_date: '2026-09-16', has_deterministic: true, has_ensemble: false },
  { local_date: '2026-09-17', has_deterministic: true, has_ensemble: true },
  { local_date: '2026-09-18', has_deterministic: true, has_ensemble: true },
]

describe('dayChips', () => {
  it('labels the window’s first day Today and keeps an undrawable day in its place', () => {
    expect(dayChips(days)).toEqual([
      { local_date: '2026-09-15', label: 'Today', name: 'Today', dayOfMonth: '15', date: 'September 15', drawable: true },
      { local_date: '2026-09-16', label: 'Wed', name: 'Wednesday', dayOfMonth: '16', date: 'September 16', drawable: false },
      { local_date: '2026-09-17', label: 'Thu', name: 'Thursday', dayOfMonth: '17', date: 'September 17', drawable: true },
      { local_date: '2026-09-18', label: 'Fri', name: 'Friday', dayOfMonth: '18', date: 'September 18', drawable: true },
    ])
  })
})

describe('daysOutPhrase', () => {
  it('counts from the window’s first day, not the viewer’s clock', () => {
    expect(daysOutPhrase(days, '2026-09-15')).toBe('today')
    expect(daysOutPhrase(days, '2026-09-16')).toBe('tomorrow')
    expect(daysOutPhrase(days, '2026-09-18')).toBe('in 3 days')
    expect(daysOutPhrase(days, '2026-09-01')).toBeNull()
  })
})
