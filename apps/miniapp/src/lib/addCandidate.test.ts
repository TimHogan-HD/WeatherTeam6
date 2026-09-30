import { describe, expect, it } from 'vitest'
import { KNOWN_CRAGS } from '@weatherteam6/types'
import { fromFix } from './addCandidate.js'

const TAYLORS_FALLS = KNOWN_CRAGS.find((c) => c.slug === 'taylors-falls')

describe('fromFix', () => {
  it('names a fix inside a known crag after that crag', () => {
    const candidate = fromFix({ lat: 45.3955, lon: -92.6616, accuracy_m: 12 })
    expect(TAYLORS_FALLS).toBeDefined()
    expect(candidate.name).toBe(TAYLORS_FALLS?.name)
  })

  it('calls a fix anywhere else "Current location"', () => {
    // Minneapolis: no known crag's box reaches it.
    expect(fromFix({ lat: 44.9778, lon: -93.265, accuracy_m: 30 }).name).toBe('Current location')
  })

  it('keeps the coordinates and accuracy, and claims no elevation or timezone', () => {
    expect(fromFix({ lat: 44.9778, lon: -93.265, accuracy_m: 30 })).toEqual({
      name: 'Current location',
      lat: 44.9778,
      lon: -93.265,
      elevationM: null,
      timezone: null,
      accuracyM: 30,
    })
  })
})
