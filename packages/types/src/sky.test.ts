import { describe, expect, it } from 'vitest'
import { sunDayHours, sunStrength, sunWindowLabel, SUN_DIFFER_MIN, SUN_STRONG_MIN_WM2, SUN_WEAK_BELOW_WM2 } from './sky.js'

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

describe('sunDayHours', () => {
  const day = (sun_min: number | null, windows: [number, number][] | null, byModel: number[] = []) => ({
    sun_min,
    sun_windows: windows === null ? null : windows.map(([start_hour, end_hour]) => ({ start_hour, end_hour })),
    sun_by_model: byModel.map((m, i) => ({ model: `m${i}`, sun_min: m })),
  })

  it('is the gap mark, never "None", when the day was not answered', () => {
    expect(sunDayHours(day(null, null))).toEqual({ value: '—', gap: true, differ: false })
    expect(sunDayHours(day(300, null))).toEqual({ value: '—', gap: true, differ: false })
  })

  it('says "None" only for none, and "under 1 h" for a little, as readings', () => {
    expect(sunDayHours(day(0, []))).toEqual({ value: 'None', gap: false, differ: false })
    expect(sunDayHours(day(0.9, []))).toEqual({ value: 'None', gap: false, differ: false })
    expect(sunDayHours(day(1, []))).toEqual({ value: 'under 1 h', gap: false, differ: false })
    expect(sunDayHours(day(29, []))).toEqual({ value: 'under 1 h', gap: false, differ: false })
  })

  it('gives the hours only, whatever the windows', () => {
    expect(sunDayHours(day(480, [[8, 16]])).value).toBe('8 h')
    expect(sunDayHours(day(300, [[8, 9], [11, 12], [14, 16]])).value).toBe('5 h')
    expect(sunDayHours(day(90, [])).value).toBe('2 h')
  })

  it('gives the models’ range when they differ by three hours or more, and not below', () => {
    expect(sunDayHours(day(120, [[10, 12]], [180, 0, 60]))).toEqual({ value: '0–3 h', gap: false, differ: true })
    expect(sunDayHours(day(120, [[10, 12]], [120, 120 - SUN_DIFFER_MIN + 1])).value).toBe('2 h')
    // One model is no comparison.
    expect(sunDayHours(day(480, [[8, 16]], [480])).value).toBe('8 h')
  })
})
