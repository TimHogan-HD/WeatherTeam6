import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES, fToC } from '@weatherteam6/types'
import { DEFAULT_DRAFT, canStep, draftFromPreferences, settingsUpdate, stepHours, stepRange } from './preferencesForm.js'

describe('draftFromPreferences', () => {
  it('opens unset ends on Crag A’s own 30–60 °F and Overview', () => {
    expect(draftFromPreferences(DEFAULT_PREFERENCES)).toEqual({
      lowF: 30,
      highF: 60,
      tab: 'overview',
      firstHour: 8,
      lastHour: 18,
    })
  })

  it('reads a stored °C end back as the whole °F it was set in', () => {
    expect(
      draftFromPreferences({
        ...DEFAULT_PREFERENCES,
        temp_low_c: fToC(15),
        temp_high_c: fToC(75),
        default_tab: 'hourly',
        climb_first_hour: 12,
      }),
    ).toEqual({ lowF: 15, highF: 75, tab: 'hourly', firstHour: 12, lastHour: 18 })
  })
})

describe('stepHours', () => {
  it('stops each end inside the day', () => {
    expect(stepHours({ first: 0, last: 18 }, 'first', -1)).toEqual({ first: 0, last: 18 })
    expect(stepHours({ first: 8, last: 23 }, 'last', 1)).toEqual({ first: 8, last: 23 })
  })

  it('always leaves room for one three-hour run', () => {
    expect(stepHours({ first: 16, last: 18 }, 'first', 1).first).toBe(16)
    expect(stepHours({ first: 8, last: 10 }, 'last', -1).last).toBe(10)
    expect(stepHours({ first: 8, last: 18 }, 'first', 1)).toEqual({ first: 9, last: 18 })
  })
})

describe('stepRange', () => {
  it('stops each end at its limit', () => {
    expect(stepRange({ ...DEFAULT_DRAFT, lowF: 0 }, 'low', -5).lowF).toBe(0)
    expect(stepRange({ ...DEFAULT_DRAFT, highF: 85 }, 'high', 5).highF).toBe(85)
  })

  it('never lets the ends come closer than 10 °F', () => {
    expect(stepRange({ ...DEFAULT_DRAFT, lowF: 50, highF: 60 }, 'low', 5).lowF).toBe(50)
    expect(stepRange({ ...DEFAULT_DRAFT, lowF: 40, highF: 50 }, 'high', -5).highF).toBe(50)
    expect(canStep({ ...DEFAULT_DRAFT, lowF: 50, highF: 60 }, 'low', 5)).toBe(false)
    expect(canStep(DEFAULT_DRAFT, 'low', 5)).toBe(true)
  })
})

describe('settingsUpdate', () => {
  it('sends nothing when nothing changed', () => {
    expect(settingsUpdate(DEFAULT_PREFERENCES, DEFAULT_DRAFT)).toBeNull()
  })

  it('sends a moved end in °C and leaves the other alone', () => {
    expect(settingsUpdate(DEFAULT_PREFERENCES, { ...DEFAULT_DRAFT, highF: 75 })).toEqual({ temp_high_c: fToC(75) })
  })

  it('sends an end moved back to the default as null, so it follows the default', () => {
    const stored = { ...DEFAULT_PREFERENCES, temp_low_c: fToC(15) }
    expect(settingsUpdate(stored, { ...DEFAULT_DRAFT, lowF: 30 })).toEqual({ temp_low_c: null })
  })

  it('sends Overview as null and any other tab by name', () => {
    expect(settingsUpdate(DEFAULT_PREFERENCES, { ...DEFAULT_DRAFT, tab: 'precip' })).toEqual({ default_tab: 'precip' })
    const stored = { ...DEFAULT_PREFERENCES, default_tab: 'precip' as const }
    expect(settingsUpdate(stored, DEFAULT_DRAFT)).toEqual({ default_tab: null })
  })

  it('sends a moved climbing hour, and one moved back to the default as null', () => {
    expect(settingsUpdate(DEFAULT_PREFERENCES, { ...DEFAULT_DRAFT, firstHour: 12 })).toEqual({ climb_first_hour: 12 })
    const stored = { ...DEFAULT_PREFERENCES, climb_last_hour: 20 }
    expect(settingsUpdate(stored, DEFAULT_DRAFT)).toEqual({ climb_last_hour: null })
  })
})
