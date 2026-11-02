import { describe, expect, it } from 'vitest'
import { pointKeyForPlace, radarKeyFor } from './pointKey.js'

describe('pointKeyForPlace', () => {
  it('gives two saved copies of the same crag one key', () => {
    const a = pointKeyForPlace({ lat: 36.15192, lon: -115.45413, elevation_m: 1250 })
    const b = pointKeyForPlace({ lat: 36.151921, lon: -115.454134, elevation_m: 1250.2 })
    expect(a).toBe('pt:36.1519,-115.4541@1250')
    expect(b).toBe(a)
  })

  it('pads to four places so equal points spell equally', () => {
    expect(pointKeyForPlace({ lat: 36, lon: -115.5, elevation_m: 0 })).toBe(
      'pt:36.0000,-115.5000@0',
    )
  })

  it('keeps an unrecorded elevation apart from sea level', () => {
    const none = pointKeyForPlace({ lat: 36, lon: -115, elevation_m: null })
    const sea = pointKeyForPlace({ lat: 36, lon: -115, elevation_m: 0 })
    expect(none).toBe('pt:36.0000,-115.0000@none')
    expect(none).not.toBe(sea)
  })

  it('separates the same coordinates at two elevations', () => {
    expect(pointKeyForPlace({ lat: 36, lon: -115, elevation_m: 1200 })).not.toBe(
      pointKeyForPlace({ lat: 36, lon: -115, elevation_m: 1300 }),
    )
  })

  it('refuses non-finite input rather than keying it as NaN', () => {
    expect(() => pointKeyForPlace({ lat: Number.NaN, lon: 0, elevation_m: null })).toThrow()
    expect(() =>
      pointKeyForPlace({ lat: 0, lon: Number.POSITIVE_INFINITY, elevation_m: null }),
    ).toThrow()
    expect(() => pointKeyForPlace({ lat: 0, lon: 0, elevation_m: Number.NaN })).toThrow()
  })
})

describe('radarKeyFor', () => {
  it('is the coordinates alone, rounded as the point key rounds them', () => {
    expect(radarKeyFor({ lat: 44.56251, lon: -92.53379 })).toBe('r:44.5625,-92.5338')
    expect(radarKeyFor({ lat: 44.56251, lon: -92.53379 })).toBe(radarKeyFor({ lat: 44.56249, lon: -92.53381 }))
  })

  it('throws on a coordinate that is not a number, rather than keying every broken point together', () => {
    expect(() => radarKeyFor({ lat: Number.NaN, lon: -92 })).toThrow()
  })
})
