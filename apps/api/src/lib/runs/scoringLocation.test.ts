import { describe, it, expect } from 'vitest'
import { DEFAULT_CLIFF_ANGLE_DEG, scoringLocationFor, type ScoringLocationRow } from './scoringLocation.js'

const row = (over: Partial<ScoringLocationRow> = {}): ScoringLocationRow => ({
  lat: '36.13',
  lon: '-115.43',
  is_climbing_location: true,
  rock_type: 'sandstone',
  aspect: null,
  cliff_angle: null,
  ...over,
})

describe('scoringLocationFor', () => {
  it('is null for a location that is not a crag — the readings are never asked for', () => {
    expect(scoringLocationFor(row({ is_climbing_location: false, aspect: 'S', cliff_angle: '0' }))).toBeNull()
  })

  it('substitutes the placeholders and records no wall when nothing was recorded', () => {
    expect(scoringLocationFor(row({ rock_type: null }))).toEqual({
      rockType: 'unknown',
      lat: 36.13,
      lon: -115.43,
      cliffAngleDeg: DEFAULT_CLIFF_ANGLE_DEG,
      wall: null,
    })
  })

  it('builds a wall only when aspect and angle were both recorded', () => {
    expect(scoringLocationFor(row({ aspect: 'SE' }))?.wall).toBeNull()
    expect(scoringLocationFor(row({ cliff_angle: '10' }))?.wall).toBeNull()
    expect(scoringLocationFor(row({ aspect: 'SE', cliff_angle: '-15' }))).toEqual({
      rockType: 'sandstone',
      lat: 36.13,
      lon: -115.43,
      cliffAngleDeg: -15,
      wall: { lat: 36.13, lon: -115.43, aspectDeg: 135, cliffAngleDeg: -15 },
    })
  })

  it('treats a recorded 0 as vertical, not as missing', () => {
    expect(scoringLocationFor(row({ aspect: 'N', cliff_angle: '0' }))?.wall).toEqual({
      lat: 36.13,
      lon: -115.43,
      aspectDeg: 0,
      cliffAngleDeg: 0,
    })
  })

  it('records no wall for free-text aspect rather than defaulting it to south', () => {
    // `aspectToDegrees('south-ish')` would answer 180 — a fabricated sun-facing wall.
    expect(scoringLocationFor(row({ aspect: 'south-ish', cliff_angle: '0' }))?.wall).toBeNull()
  })
})
