import { describe, it, expect } from 'vitest'
import { resolveRockType } from './resolveRockType.js'

// Barn Bluff, Red Wing — inside the known crag's box.
const RED_WING = { lat: 44.5695, lon: -92.526 }
// Red Rock Canyon NCA — deliberately not a known crag (its box is 73 km across).
const RED_ROCK = { lat: 36.15192, lon: -115.45413 }

describe('resolveRockType', () => {
  it('overrides the requested rock type on a known crag and names the crag', () => {
    expect(resolveRockType({ ...RED_WING, is_climbing_location: true, rock_type: 'granite' })).toEqual({
      rock_type: 'carbonate_cherty',
      known_crag: 'red-wing',
    })
  })

  it('locks a known crag even when no rock type was sent', () => {
    expect(resolveRockType({ ...RED_WING, is_climbing_location: true, rock_type: null })).toEqual({
      rock_type: 'carbonate_cherty',
      known_crag: 'red-wing',
    })
  })

  it("keeps the caller's rock type anywhere else, unlocked", () => {
    expect(resolveRockType({ ...RED_ROCK, is_climbing_location: true, rock_type: 'sandstone_eolian' })).toEqual({
      rock_type: 'sandstone_eolian',
      known_crag: null,
    })
  })

  it('never locks or types a non-climbing location, even on a crag', () => {
    expect(resolveRockType({ ...RED_WING, is_climbing_location: false, rock_type: 'granite' })).toEqual({
      rock_type: null,
      known_crag: null,
    })
  })
})
