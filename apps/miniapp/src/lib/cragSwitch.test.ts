import { describe, expect, it } from 'vitest'
import type { Location } from '@weatherteam6/types'
import { OPENED_FROM_MAP, openedFromMap } from './backTarget.js'
import { swipeDirection, swipeOf, switcherOptions, switchState } from './cragSwitch.js'

const place = (id: string, name: string) => ({ id, name }) as Location

describe('the crag switcher', () => {
  it('puts the place being read first, then the rest in saved order, wrapping round', () => {
    const saved = [place('a', 'Red Wing'), place('b', 'Barn Bluff'), place('c', 'Taylors Falls')]
    expect(switcherOptions(saved, place('a', 'Red Wing')).map((o) => o.id)).toEqual(['a', 'b', 'c'])
    expect(switcherOptions(saved, place('b', 'Barn Bluff')).map((o) => o.id)).toEqual(['b', 'c', 'a'])
    expect(switcherOptions(saved, place('c', 'Taylors Falls')).map((o) => o.id)).toEqual(['c', 'a', 'b'])
  })

  it('adds the place being read, first, when the saved list predates it', () => {
    const saved = [place('a', 'Red Wing'), place('b', 'Barn Bluff')]
    expect(switcherOptions(saved, place('d', 'Sandstone')).map((o) => o.id)).toEqual(['d', 'a', 'b'])
  })

  it('swipes from the side moved toward', () => {
    expect(swipeDirection(['a', 'b', 'c'], 'a', 'c')).toBe(1)
    expect(swipeDirection(['a', 'b', 'c'], 'c', 'b')).toBe(-1)
  })

  it('keeps a map-opened crag returning to the map across a switch', () => {
    const next = switchState({ ...OPENED_FROM_MAP }, 1)
    expect(openedFromMap(next)).toBe(true)
    expect(swipeOf(next)).toBe(1)
  })

  it('reads no swipe from a plain arrival or a reload with no state', () => {
    for (const state of [null, undefined, {}, OPENED_FROM_MAP, { swipe: 2 }]) expect(swipeOf(state)).toBeNull()
  })
})
