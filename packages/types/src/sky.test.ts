import { describe, expect, it } from 'vitest'
import { sunDayLine, sunStrength, sunWindowLabel, SUN_DIFFER_MIN, SUN_STRONG_MIN_WM2, SUN_WEAK_BELOW_WM2 } from './sky.js'

describe('sunStrength', () => {
  it('splits at 700 and 300 W/m², inclusive at strong and exclusive at weak', () => {
    expect(sunStrength(SUN_STRONG_MIN_WM2)).toBe('strong')
    expect(sunStrength(SUN_STRONG_MIN_WM2 - 0.1)).toBe('moderate')
    expect(sunStrength(SUN_WEAK_BELOW_WM2)).toBe('moderate')
    expect(sunStrength(SUN_WEAK_BELOW_WM2 - 0.1)).toBe('weak')
    expect(sunStrength(1)).toBe('weak')
  })
  it('has no word for night, a gap or a broken value', () => {
    expect(sunStrength(0)).toBeNull()
    expect(sunStrength(null)).toBeNull()
    expect(sunStrength(Number.NaN)).toBeNull()
    expect(sunStrength(-5)).toBeNull()
  })
})

describe('sunWindowLabel', () => {
  it('names each end, and the half of the day once when they share it', () => {
    expect(sunWindowLabel({ start_hour: 8, end_hour: 16 })).toBe('8a–4p')
    expect(sunWindowLabel({ start_hour: 8, end_hour: 9 })).toBe('8–9a')
    expect(sunWindowLabel({ start_hour: 14, end_hour: 16 })).toBe('2–4p')
    expect(sunWindowLabel({ start_hour: 11, end_hour: 12 })).toBe('11a–12p')
    expect(sunWindowLabel({ start_hour: 12, end_hour: 13 })).toBe('12–1p')
  })
})

describe('sunDayLine', () => {
  const day = (sun_min: number | null, windows: [number, number][] | null, byModel: number[] = []) => ({
    sun_min,
    sun_windows: windows === null ? null : windows.map(([start_hour, end_hour]) => ({ start_hour, end_hour })),
    sun_by_model: byModel.map((m, i) => ({ model: `m${i}`, sun_min: m })),
  })

  it('is the gap mark, never "No sun", when the day was not answered', () => {
    expect(sunDayLine(day(null, null))).toEqual({ text: 'Sun —', sunny: false, gap: true })
  })

  it('says "No sun" only for none, and "under 1 h" for a little, as readings', () => {
    expect(sunDayLine(day(0, []))).toEqual({ text: 'No sun', sunny: false, gap: false })
    expect(sunDayLine(day(0.9, []))).toEqual({ text: 'No sun', sunny: false, gap: false })
    expect(sunDayLine(day(1, []))).toEqual({ text: 'Sun under 1 h', sunny: false, gap: false })
    expect(sunDayLine(day(29, []))).toEqual({ text: 'Sun under 1 h', sunny: false, gap: false })
  })

  it('lists one or two windows with the total', () => {
    expect(sunDayLine(day(480, [[8, 16]])).text).toBe('Sun 8a–4p · 8 h')
    expect(sunDayLine(day(180, [[8, 9], [14, 16]])).text).toBe('Sun 8–9a, 2–4p · 3 h')
  })

  it('says "on and off" past two windows, or when no hour was half sunny', () => {
    expect(sunDayLine(day(300, [[8, 9], [11, 12], [14, 16]])).text).toBe('Sun 5 h, on and off')
    expect(sunDayLine(day(90, [])).text).toBe('Sun 2 h, on and off')
  })

  it('gives the models’ range when they differ by three hours or more, and not below', () => {
    expect(sunDayLine(day(120, [[10, 12]], [180, 0, 60])).text).toBe('Sun 0–3 h · forecasts differ')
    expect(sunDayLine(day(120, [[10, 12]], [180, 0, 60])).sunny).toBe(false)
    expect(sunDayLine(day(120, [[10, 12]], [120, 120 - SUN_DIFFER_MIN + 1])).text).toBe('Sun 10a–12p · 2 h')
    // One model is no comparison.
    expect(sunDayLine(day(480, [[8, 16]], [480])).text).toBe('Sun 8a–4p · 8 h')
  })
})
