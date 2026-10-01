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
  it('turns the stored angle into climbers’ degrees — a stored slab opens as a slab', () => {
    expect(draftFrom(location({ cliff_angle: 20 })).wallAngle).toBe(-20)
    expect(draftFrom(location({ cliff_angle: -30 })).wallAngle).toBe(30)
    expect(draftFrom(location({ cliff_angle: null })).wallAngle).toBeNull()
  })

  it('opens a free-text aspect the model cannot read as unrecorded', () => {
    expect(draftFrom(location({ aspect: 'sunny side' })).aspect).toBeNull()
    expect(draftFrom(location({ aspect: ' nne ' })).aspect).toBe('NNE')
  })

  it('opens an unrecorded rock type as "Not sure"', () => {
    expect(draftFrom(location({ rock_type: null })).rockType).toBe('unknown')
  })
})

describe('updateFor', () => {
  it('sends nothing when nothing changed', () => {
    const loc = location()
    expect(updateFor(loc, draftFrom(loc))).toBeNull()
  })

  it('sends only the field that changed', () => {
    const loc = location()
    expect(updateFor(loc, { ...draftFrom(loc), aspect: 'SW' })).toEqual({ aspect: 'SW' })
    expect(updateFor(loc, { ...draftFrom(loc), wallAngle: 15 })).toEqual({ wall_angle_deg: 15 })
  })

  it('sends a cleared field as null, which the API reads as "not recorded"', () => {
    const loc = location()
    expect(updateFor(loc, { ...draftFrom(loc), aspect: null, wallAngle: null })).toEqual({
      aspect: null,
      wall_angle_deg: null,
    })
  })

  it('leaves an untouched free-text aspect alone rather than clearing it', () => {
    const loc = location({ aspect: 'sunny side' })
    expect(updateFor(loc, { ...draftFrom(loc), wallAngle: 10 })).toEqual({ wall_angle_deg: 10 })
  })

  it('never sends a locked rock type', () => {
    const loc = location({ known_crag: 'taylors-falls' })
    expect(updateFor(loc, { ...draftFrom(loc), rockType: 'granite' })).toBeNull()
  })

  it('sends an unlocked rock type change', () => {
    const loc = location()
    expect(updateFor(loc, { ...draftFrom(loc), rockType: 'granite' })).toEqual({ rock_type: 'granite' })
  })
})
