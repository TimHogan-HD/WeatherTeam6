import { describe, expect, it } from 'vitest'
import { AREA_ROCK, ROCK_TYPES } from '@weatherteam6/types'
import { areaRockAt, searchClimbingAreas } from './climbingAreas.js'
import { resolveRockType } from '../locations/resolveRockType.js'
import { CO_CLIMBING_AREAS } from './climbingAreasCo.js'
import { MN_CLIMBING_AREAS } from './climbingAreasMn.js'
import { UT_CLIMBING_AREAS } from './climbingAreasUt.js'

const ALL = [...MN_CLIMBING_AREAS, ...CO_CLIMBING_AREAS, ...UT_CLIMBING_AREAS]

describe('AREA_ROCK', () => {
  it.each(AREA_ROCK.map((a) => [a.name, a] as const))('%s is an area in a snapshot, with a real rock type', (_, a) => {
    expect(ALL.some((x) => x.uuid === a.area_id)).toBe(true)
    expect(ROCK_TYPES).toContain(a.rock_type)
  })

  it('a wall inherits its area’s rock: Cat Wall is Indian Creek Wingate', () => {
    const cat = searchClimbingAreas('cat wall')[0]
    expect(cat?.climbing_area?.rock).toEqual({ rock_type: 'sandstone_eolian', set_by: 'Indian Creek' })
  })

  it('a sub-area overrides a mixed parent, and the parent stays unlocked', () => {
    const lumpy = searchClimbingAreas('lumpy ridge')[0]
    expect(lumpy?.climbing_area?.rock?.set_by).toBe('Lumpy Ridge')
    const estes = searchClimbingAreas('estes park valley')[0]
    expect(estes?.climbing_area?.rock ?? null).toBeNull()
  })

  it('a save at an area’s own point is locked; a pin a kilometre away is not', () => {
    const cat = ALL.find((a) => a.name === 'Cat Wall')
    if (cat === undefined) throw new Error('no Cat Wall')
    expect(resolveRockType({ lat: cat.lat, lon: cat.lon, is_climbing_location: true, rock_type: 'granite' })).toEqual({
      rock_type: 'sandstone_eolian',
      known_crag: `openbeta/${cat.uuid}`,
    })
    expect(areaRockAt(cat.lat + 0.01, cat.lon)).toBeNull()
  })
})
