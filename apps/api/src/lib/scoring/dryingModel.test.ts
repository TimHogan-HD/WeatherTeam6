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
