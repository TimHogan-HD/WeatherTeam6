import { describe, expect, it } from 'vitest'
import type { Location } from '@weatherteam6/types'
import { draftFrom, updateFor } from './editLocation.js'

function location(over: Partial<Location> = {}): Location {
  return {
    id: 'loc',
    name: 'Taylors Falls',
    lat: 45.4,
    lon: -92.65,
    elevation_m: 250,
    is_climbing_location: true,
    rock_type: 'basalt_dense',
    known_crag: null,
    aspect: 'W',
    cliff_angle: 0,
    ...over,
  } as Location
}

describe('draftFrom', () => {
  it('opens an unrecorded rock type as "Not sure"', () => {
    expect(draftFrom(location({ rock_type: null })).rockType).toBe('unknown')
  })
})

describe('updateFor', () => {
  it('sends nothing when nothing changed', () => {
    const loc = location()
    expect(updateFor(loc, draftFrom(loc))).toBeNull()
  })

  it('sends a rock type change and nothing else — never the recorded aspect or angle', () => {
    const loc = location()
    expect(updateFor(loc, { rockType: 'granite' })).toEqual({ rock_type: 'granite' })
  })

  it('never sends a locked rock type', () => {
    const loc = location({ known_crag: 'taylors-falls' })
    expect(updateFor(loc, { rockType: 'granite' })).toBeNull()
  })
})
