import { describe, it, expect } from 'vitest'
import { ROCK_TYPES } from './index.js'
import { rockTypeLabel, rockTypeLabelInline } from './rockTypeCopy.js'

describe('rockTypeLabel', () => {
  /**
   * The failure this module exists to prevent, asserted on the value that
   * caused it. `capitalise(rock_type)` and `{rock_type}` were fine for five
   * one-word values and render "Basalt_vesicular" for the sixth.
   */
  it('never leaks an underscore into copy', () => {
    for (const rockType of ROCK_TYPES) {
      expect(rockTypeLabel(rockType)).not.toContain('_')
      expect(rockTypeLabelInline(rockType)).not.toContain('_')
    }
  })

  it('distinguishes the three basalts by what a climber can see', () => {
    expect(rockTypeLabel('basalt')).toBe('Basalt')
    expect(rockTypeLabel('basalt_dense')).toBe('Basalt (columnar)')
    expect(rockTypeLabel('basalt_vesicular')).toBe('Basalt (flow top)')
  })

  it('covers every rock type — a missing entry would fall through to the raw value', () => {
    // `rockTypeLabel` falls back to its argument, so an unmapped type returns
    // itself and would pass a looser assertion. Compare against the raw value.
    for (const rockType of ROCK_TYPES) {
      expect(rockTypeLabel(rockType)).not.toBe(rockType)
    }
  })

  /**
   * The fallback is deliberate and worth pinning: a row written by a newer
   * deploy should render as something a person can report, not vanish and not
   * throw.
   */
  it('returns an unknown value unchanged rather than hiding it', () => {
    expect(rockTypeLabel('basalt_columnar_jointed')).toBe('basalt_columnar_jointed')
  })

  it('lowercases for mid-sentence use, parenthetical included', () => {
    expect(rockTypeLabelInline('basalt_vesicular')).toBe('basalt (flow top)')
  })
})
