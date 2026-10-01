import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES, fToC } from '@weatherteam6/types'
import { DEFAULT_DRAFT, canStep, draftFromPreferences, settingsUpdate, stepRange } from './preferencesForm.js'

describe('draftFromPreferences', () => {
  it('opens unset ends on Crag A’s own 30–60 °F and Overview', () => {
    expect(draftFromPreferences(DEFAULT_PREFERENCES)).toEqual({ lowF: 30, highF: 60, tab: 'overview' })
  })

  it('reads a stored °C end back as the whole °F it was set in', () => {
    expect(draftFromPreferences({ temp_low_c: fToC(15), temp_high_c: fToC(75), default_tab: 'hourly' })).toEqual({
      lowF: 15,
      highF: 75,
      tab: 'hourly',
    })
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
})
