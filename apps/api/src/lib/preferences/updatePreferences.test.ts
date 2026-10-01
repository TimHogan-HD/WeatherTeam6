import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES, fToC } from '@weatherteam6/types'
import { parsePreferencesUpdate, planPreferencesUpdate, preferencesFromRow } from './updatePreferences.js'

describe('parsePreferencesUpdate', () => {
  it('accepts whole °F converted to °C, including both limits', () => {
    expect(parsePreferencesUpdate({ temp_low_c: fToC(0), temp_high_c: fToC(85) })).toEqual({
      temp_low_c: fToC(0),
      temp_high_c: fToC(85),
    })
  })

  it('refuses an end outside its limits', () => {
    expect(parsePreferencesUpdate({ temp_low_c: fToC(-1) })).toHaveProperty('error')
    expect(parsePreferencesUpdate({ temp_low_c: fToC(51) })).toHaveProperty('error')
    expect(parsePreferencesUpdate({ temp_high_c: fToC(39) })).toHaveProperty('error')
    expect(parsePreferencesUpdate({ temp_high_c: fToC(86) })).toHaveProperty('error')
    expect(parsePreferencesUpdate({ temp_high_c: '60' })).toHaveProperty('error')
  })

  it('takes null as "back to the default"', () => {
    expect(parsePreferencesUpdate({ temp_low_c: null, default_tab: null })).toEqual({
      temp_low_c: null,
      default_tab: null,
    })
  })

  it('accepts a crag tab and refuses anything else', () => {
    expect(parsePreferencesUpdate({ default_tab: 'hourly' })).toEqual({ default_tab: 'hourly' })
    expect(parsePreferencesUpdate({ default_tab: 'radar' })).toHaveProperty('error')
  })

  it('refuses an unknown key rather than ignoring it, and an empty body', () => {
    expect(parsePreferencesUpdate({ ideal_temp_min_c: 10 })).toHaveProperty('error')
    expect(parsePreferencesUpdate({})).toHaveProperty('error')
    expect(parsePreferencesUpdate([])).toHaveProperty('error')
  })
})

describe('planPreferencesUpdate', () => {
  it('merges the update over what is stored', () => {
    const current = { ...DEFAULT_PREFERENCES, default_tab: 'precip' as const }
    const plan = planPreferencesUpdate(current, { temp_high_c: fToC(70) })
    expect(plan).toEqual({ ok: true, next: { temp_low_c: null, temp_high_c: fToC(70), default_tab: 'precip' } })
  })

  it('checks the gap against the default end a one-ended range sits under', () => {
    // Low 50 °F under the default high of 60 °F: exactly the 10 °F minimum.
    expect(planPreferencesUpdate(DEFAULT_PREFERENCES, { temp_low_c: fToC(50) }).ok).toBe(true)
    // High 40 °F over the default low of 30 °F: also 10 °F.
    expect(planPreferencesUpdate(DEFAULT_PREFERENCES, { temp_high_c: fToC(40) }).ok).toBe(true)
    // Low 45 °F against a stored high of 50 °F: 5 °F, refused.
    const stored = { ...DEFAULT_PREFERENCES, temp_high_c: fToC(50) }
    expect(planPreferencesUpdate(stored, { temp_low_c: fToC(45) })).toMatchObject({ ok: false, status: 409 })
  })
})

describe('preferencesFromRow', () => {
  it('reads no row as every default, and a stored tab it does not know as unset', () => {
    expect(preferencesFromRow(undefined)).toEqual(DEFAULT_PREFERENCES)
    expect(preferencesFromRow({ temp_low_c: 1, temp_high_c: null, default_tab: 'radar' })).toEqual({
      temp_low_c: 1,
      temp_high_c: null,
      default_tab: null,
    })
  })
})
