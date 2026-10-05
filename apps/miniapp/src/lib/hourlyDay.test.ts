import { describe, expect, it } from 'vitest'
import { dayChips, daysOutPhrase } from './hourlyDay.js'

const days = [
  { local_date: '2026-09-15', has_deterministic: true, has_ensemble: true },
  { local_date: '2026-09-16', has_deterministic: true, has_ensemble: false },
  { local_date: '2026-09-17', has_deterministic: true, has_ensemble: true },
  { local_date: '2026-09-18', has_deterministic: true, has_ensemble: true },
]

describe('dayChips', () => {
  it('labels the window’s first day Today and keeps an undrawable day in its place', () => {
    expect(dayChips(days)).toEqual([
      { local_date: '2026-09-15', label: 'Today', drawable: true },
      { local_date: '2026-09-16', label: 'Wed', drawable: false },
      { local_date: '2026-09-17', label: 'Thu', drawable: true },
      { local_date: '2026-09-18', label: 'Fri', drawable: true },
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
