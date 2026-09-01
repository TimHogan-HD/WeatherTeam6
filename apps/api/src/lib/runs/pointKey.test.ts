import { describe, it, expect } from 'vitest'
import { pointKeyForCoords, pointKeyForLocation } from './pointKey.js'

describe('pointKeyForLocation', () => {
  it('prefixes the uuid so it cannot collide with a coordinate key', () => {
    expect(pointKeyForLocation('00000000-0000-0000-0000-000000000001')).toBe(
      'loc:00000000-0000-0000-0000-000000000001',
    )
  })

  it('refuses an empty id', () => {
    // Constrains the `!locationId` guard: without it every caller with a missing
    // id shares the single key `loc:`.
    expect(() => pointKeyForLocation('')).toThrow()
  })
})

describe('pointKeyForCoords', () => {
  it('rounds to four places so a re-geocode lands on the same key', () => {
    // Constrains COORD_PLACES. At three places these two collide; at five they
    // start two separate histories for the same crag.
    expect(pointKeyForCoords(36.15192, -115.45413)).toBe('pt:36.1519,-115.4541')
    expect(pointKeyForCoords(36.151921, -115.454134)).toBe('pt:36.1519,-115.4541')
  })

  it('pads to four places rather than emitting a shorter key', () => {
    expect(pointKeyForCoords(36, -115.5)).toBe('pt:36.0000,-115.5000')
  })

  it('refuses a coordinate that is not a finite number', () => {
    // Constrains the `Number.isFinite` guard. `toFixed` on NaN yields the string
    // "NaN", so every broken point on earth would share the key pt:NaN,NaN and
    // their runs would be indistinguishable.
    expect(() => pointKeyForCoords(Number.NaN, 0)).toThrow()
    expect(() => pointKeyForCoords(0, Number.POSITIVE_INFINITY)).toThrow()
  })
})
