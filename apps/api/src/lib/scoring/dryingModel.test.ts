import { describe, it, expect } from 'vitest'
import { dryingModel, type DryingModelInput, type DryingModelOutput } from './dryingModel.js'

const baseInput: DryingModelInput = {
  rockType: 'sandstone',
  cliffAngle: 45,
  rainfallEvents: [],
  asOf: new Date('2025-06-01T12:00:00Z'),
}

describe('dryingModel (contract test)', () => {
  it('returns an object with the correct shape', () => {
    const result: DryingModelOutput = dryingModel(baseInput)

    expect(typeof result.hours_since_significant_rain).toBe('number')
    expect(typeof result.last_rain_mm).toBe('number')
    expect(typeof result.estimated_dry).toBe('boolean')
    expect(['low', 'medium', 'high']).toContain(result.confidence)
  })

  it('hours_since_significant_rain is non-negative', () => {
    const result = dryingModel(baseInput)
    expect(result.hours_since_significant_rain).toBeGreaterThanOrEqual(0)
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

describe('dryingModel (real behavior)', () => {
  const asOf = new Date('2025-06-01T12:00:00Z') // noon UTC June 1

  it('returns last_rain_mm = 0 when no significant events (>2mm)', () => {
    const result = dryingModel({
      ...baseInput,
      rainfallEvents: [{ date: '2025-05-30', precip_mm: 1.5 }],
      asOf,
    })
    expect(result.last_rain_mm).toBe(0)
  })

  it('returns the most recent significant event precip as last_rain_mm', () => {
    const result = dryingModel({
      ...baseInput,
      rainfallEvents: [
        { date: '2025-05-28', precip_mm: 10 },
        { date: '2025-05-30', precip_mm: 5 }, // most recent > 2mm
      ],
      asOf,
    })
    expect(result.last_rain_mm).toBe(5)
  })

  it('computes hours_since_significant_rain correctly', () => {
    // Last significant rain: 2025-05-30 at noon UTC
    // asOf: 2025-06-01 at noon UTC → 48 hours later
    const result = dryingModel({
      ...baseInput,
      rainfallEvents: [{ date: '2025-05-30', precip_mm: 8 }],
      asOf,
    })
    expect(result.hours_since_significant_rain).toBeCloseTo(48, 0)
  })

  it('reports estimated_dry=false for granite after 1h (max_dry=12h × modifier)', () => {
    // 1h since rain, granite max = 12h × 0.7+0.3 = ~10h (cliff_angle=45 → modifier=1.0 → 12h)
    const oneHourLater = new Date('2025-05-30T13:00:00Z')
    const result = dryingModel({
      rockType: 'granite',
      cliffAngle: 45,
      rainfallEvents: [{ date: '2025-05-30', precip_mm: 5 }],
      asOf: oneHourLater,
    })
    expect(result.estimated_dry).toBe(false)
  })

  it('reports estimated_dry=true for granite after 15h (max_dry≈12h at cliff_angle=45)', () => {
    // 15h since rain (noon + 15h = next day 03:00), granite max = 12h × 1.0 = 12h → dry
    const fifteenHoursLater = new Date('2025-05-31T03:00:00Z')
    const result = dryingModel({
      rockType: 'granite',
      cliffAngle: 45,
      rainfallEvents: [{ date: '2025-05-30', precip_mm: 5 }],
      asOf: fifteenHoursLater,
    })
    expect(result.estimated_dry).toBe(true)
  })

  it('vertical wall (cliff_angle=0) dries faster than flat slab (cliff_angle=90)', () => {
    const events = [{ date: '2025-05-30', precip_mm: 5 }]
    const asOf24h = new Date('2025-05-31T12:00:00Z') // 24h after last rain noon

    const vertical = dryingModel({ ...baseInput, cliffAngle: 0, rainfallEvents: events, asOf: asOf24h })
    const flat = dryingModel({ ...baseInput, cliffAngle: 90, rainfallEvents: events, asOf: asOf24h })

    // For sandstone: vertical max = 72 × 0.7 = 50.4h, flat max = 72 × 1.3 = 93.6h
    // At 24h: vertical closer to dry (50.4h) than flat (93.6h)
    // Both should be not dry at 24h since sandstone min is 24-72h
    // But vertical's max_dry is lower, so it would be "dry" sooner
    // At 50h vertical should be dry, flat not yet
    const asOf51h = new Date('2025-06-01T15:00:00Z') // ~51h after noon May 30
    const vertical51 = dryingModel({ ...baseInput, cliffAngle: 0, rainfallEvents: events, asOf: asOf51h })
    const flat51 = dryingModel({ ...baseInput, cliffAngle: 90, rainfallEvents: events, asOf: asOf51h })
    expect(vertical51.estimated_dry).toBe(true)   // 51h >= 50.4h
    expect(flat51.estimated_dry).toBe(false)       // 51h < 93.6h
  })

  it('confidence is low with <3 events', () => {
    const result = dryingModel({ ...baseInput, rainfallEvents: [{ date: '2025-05-30', precip_mm: 0 }] })
    expect(result.confidence).toBe('low')
  })

  it('confidence is medium with 3-6 events', () => {
    const events = Array.from({ length: 4 }, (_, i) => ({
      date: `2025-05-${27 + i}`,
      precip_mm: 0,
    }))
    const result = dryingModel({ ...baseInput, rainfallEvents: events })
    expect(result.confidence).toBe('medium')
  })

  it('confidence is high with >=7 events', () => {
    const events = Array.from({ length: 7 }, (_, i) => ({
      date: `2025-05-${25 + i}`,
      precip_mm: 0,
    }))
    const result = dryingModel({ ...baseInput, rainfallEvents: events })
    expect(result.confidence).toBe('high')
  })

  it('returns estimated_dry=false with no data (zero hours since rain)', () => {
    const result = dryingModel({ ...baseInput, rainfallEvents: [] })
    // 0 events → hoursSince = 0 * 24 = 0 < maxDry
    expect(result.estimated_dry).toBe(false)
    expect(result.hours_since_significant_rain).toBe(0)
  })

  it('ignores sub-threshold events (<=2mm) when finding last significant rain', () => {
    const result = dryingModel({
      ...baseInput,
      rainfallEvents: [
        { date: '2025-05-25', precip_mm: 20 }, // significant — old
        { date: '2025-05-31', precip_mm: 2 },  // exactly 2mm — NOT significant (must be >2)
      ],
      asOf,
    })
    // Should use May 25 event (6 days * 24 + 0h = 168h since noon May 25 to noon June 1)
    expect(result.hours_since_significant_rain).toBeCloseTo(168, 0)
    expect(result.last_rain_mm).toBe(20)
  })
})
