import { describe, expect, it } from 'vitest'
import { colors } from '@weatherteam6/design/tokens'
import { TEMP_BAND_C } from '@weatherteam6/types'
import { rainColor, tempColor } from './chartStyle.js'

/**
 * The temperature ramp's only real claim: its stops are the conditions score's
 * own plateaus, so a colour and a score cannot disagree about the same day.
 *
 * Asserted on the **boundaries**, because that is where a ramp built from
 * copied literals drifts from the scorer. An assertion at 15 °C and 40 °C would
 * be green against any ramp that is roughly right.
 */
describe('tempColor', () => {
  it('is neutral across exactly the band the score gives full marks for', () => {
    expect(tempColor(TEMP_BAND_C.idealMin)).toBe(colors.txt2)
    expect(tempColor(TEMP_BAND_C.idealMax)).toBe(colors.txt2)
  })

  it('turns cool one step below the ideal band and warm one step above', () => {
    expect(tempColor(TEMP_BAND_C.idealMin - 0.01)).toBe(colors.radarLight)
    expect(tempColor(TEMP_BAND_C.idealMax + 0.01)).toBe(colors.fair)
  })

  it('reaches its hot end exactly where the temperature component reaches zero', () => {
    expect(tempColor(TEMP_BAND_C.max)).toBe(colors.fair)
    expect(tempColor(TEMP_BAND_C.max + 0.01)).toBe(colors.poor)
  })

  it('has one cold step, which is the documented asymmetry and not an accident', () => {
    // -15 °C and +5 °C both score 0 and 6 respectively, and both draw the same
    // blue. If a fifth stop is ever added this assertion is the thing that
    // should fail, rather than the asymmetry being rediscovered on a device.
    expect(tempColor(-15)).toBe(tempColor(5))
  })
})

describe('rainColor', () => {
  it('steps at the conventional rain-rate bands', () => {
    expect(rainColor(0.49)).toBe(colors.radarLight)
    expect(rainColor(0.5)).toBe(colors.radarModerate)
    expect(rainColor(2.5)).toBe(colors.radarHeavy)
    expect(rainColor(7.6)).toBe(colors.radarSevere)
  })
})
