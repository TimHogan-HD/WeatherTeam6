import { describe, it, expect } from 'vitest'
import { dryingModel, type DryingModelInput, type DryingModelOutput } from './dryingModel.js'

// Phase 4 contract test. These tests assert the output shape and invariants,
// not specific values, so they pass against the current stub and remain valid
// when Phase 4 replaces it with real logic.

describe('dryingModel (contract test)', () => {
  const baseInput: DryingModelInput = {
    rockType: 'sandstone',
    cliffAngle: 45,
    rainfallEvents: [],
    asOf: new Date('2025-06-01T12:00:00Z'),
  }

  it('returns an object with the correct shape', () => {
    const result: DryingModelOutput = dryingModel(baseInput)

    expect(typeof result.hours_since_significant_rain).toBe('number')
    expect(typeof result.last_rain_mm).toBe('number')
    expect(typeof result.estimated_dry).toBe('boolean')
    expect(['low', 'medium', 'high']).toContain(result.confidence)
  })

  // These ran against `baseInput`, whose `rainfallEvents` is empty — so they
  // exercised only the 720 sentinel branch and never touched the arithmetic that
  // can actually go negative. The invariant they claimed to check was false:
  // rain dated today ends at 23:59:59Z, in the future relative to `asOf`, and
  // produced about -14h, which the Mini App rendered as "no rain in -14h".
  it('hours_since_significant_rain is non-negative — including for rain dated today', () => {
    expect(dryingModel(baseInput).hours_since_significant_rain).toBeGreaterThanOrEqual(0)

    const rainedToday = dryingModel({
      ...baseInput,
      rainfallEvents: [{ date: '2025-06-01', precip_mm: 15 }],
      asOf: new Date('2025-06-01T10:00:00Z'),
    })
    expect(rainedToday.hours_since_significant_rain).toBe(0)
    expect(rainedToday.last_rain_mm).toBe(15)
    expect(rainedToday.estimated_dry).toBe(false)
    expect(rainedToday.confidence).toBe('low')
  })

  it('last_rain_mm is non-negative', () => {
    const result = dryingModel(baseInput)
    expect(result.last_rain_mm).toBeGreaterThanOrEqual(0)
  })

  it('accepts all valid rock types without throwing', () => {
    const rockTypes: DryingModelInput['rockType'][] = [
      'sandstone',
      'limestone',
      'granite',
      'basalt',
      'unknown',
    ]
    for (const rockType of rockTypes) {
      expect(() => dryingModel({ ...baseInput, rockType })).not.toThrow()
    }
  })

  it('accepts rainfall events without throwing', () => {
    const inputWithRain: DryingModelInput = {
      ...baseInput,
      rainfallEvents: [
        { date: '2025-05-30', precip_mm: 15.2 },
        { date: '2025-05-31', precip_mm: 3.1 },
      ],
    }
    const result: DryingModelOutput = dryingModel(inputWithRain)
    expect(typeof result.hours_since_significant_rain).toBe('number')
  })
})

describe('dryingModel (behavior)', () => {
  // Rainfall date 2025-05-31 ends at 23:59:59Z. With asOf at 2025-06-01T05:00:00Z,
  // hoursSince = 5h 1s ≈ 5h.
  const asOfFiveHoursAfter = new Date('2025-06-01T05:00:00Z')

  it('granite, rain 5h ago, cliff_angle=0 → not dry, medium confidence', () => {
    const result = dryingModel({
      rockType: 'granite',
      cliffAngle: 0,
      rainfallEvents: [{ date: '2025-05-31', precip_mm: 8 }],
      asOf: asOfFiveHoursAfter,
    })
    expect(result.estimated_dry).toBe(false)
    expect(result.confidence).toBe('medium') // granite minDry=2h, maxDry=12h; 5h is between
    expect(result.hours_since_significant_rain).toBeCloseTo(5, 0)
    expect(result.last_rain_mm).toBe(8)
  })

  it('sandstone, rain 80h ago, cliff_angle=0 → dry, high confidence', () => {
    // asOf 80h after 2025-05-28T23:59:59Z
    const asOf = new Date('2025-06-01T07:59:59Z')
    const result = dryingModel({
      rockType: 'sandstone',
      cliffAngle: 0,
      rainfallEvents: [{ date: '2025-05-28', precip_mm: 12 }],
      asOf,
    })
    expect(result.estimated_dry).toBe(true)
    expect(result.confidence).toBe('high')
    expect(result.hours_since_significant_rain).toBeCloseTo(80, 0)
  })

  it('no rainfall events at all → dry, high confidence, sentinel hours', () => {
    const result = dryingModel({
      rockType: 'granite',
      cliffAngle: 30,
      rainfallEvents: [],
      asOf: asOfFiveHoursAfter,
    })
    expect(result.estimated_dry).toBe(true)
    expect(result.hours_since_significant_rain).toBe(720)
    expect(result.last_rain_mm).toBe(0)
    expect(result.confidence).toBe('high')
  })

  it('all events below 2mm threshold → treated as no rain', () => {
    const result = dryingModel({
      rockType: 'granite',
      cliffAngle: 0,
      rainfallEvents: [
        { date: '2025-05-31', precip_mm: 0.5 },
        { date: '2025-05-30', precip_mm: 1.8 },
      ],
      asOf: asOfFiveHoursAfter,
    })
    expect(result.estimated_dry).toBe(true)
    expect(result.hours_since_significant_rain).toBe(720)
    expect(result.last_rain_mm).toBe(0)
    expect(result.confidence).toBe('high')
  })

  it('cliff_angle modifier: at 13h elapsed, angle=0 → high, angle=90 → medium', () => {
    // granite maxDry=12h; at angle=0, factor=1.0, so 13h > 12h → high confidence (dry)
    // at angle=90, factor=1.3, so maxDry=15.6h → 13h < 15.6h → medium confidence (not dry)
    const asOf = new Date('2025-06-01T12:59:59Z') // 13h after 2025-05-31T23:59:59Z
    const events = [{ date: '2025-05-31', precip_mm: 8 }]

    const vertical = dryingModel({
      rockType: 'granite',
      cliffAngle: 0,
      rainfallEvents: events,
      asOf,
    })
    expect(vertical.estimated_dry).toBe(true)
    expect(vertical.confidence).toBe('high')

    const slab = dryingModel({
      rockType: 'granite',
      cliffAngle: 90,
      rainfallEvents: events,
      asOf,
    })
    expect(slab.estimated_dry).toBe(false)
    expect(slab.confidence).toBe('medium')
  })

  it('picks the most recent significant event when multiple are present', () => {
    const asOf = new Date('2025-06-01T05:00:00Z')
    const result = dryingModel({
      rockType: 'granite',
      cliffAngle: 0,
      rainfallEvents: [
        { date: '2025-05-25', precip_mm: 50 }, // older heavier event
        { date: '2025-05-31', precip_mm: 4 }, // recent smaller event
      ],
      asOf,
    })
    expect(result.last_rain_mm).toBe(4)
    expect(result.hours_since_significant_rain).toBeCloseTo(5, 0)
  })
})
