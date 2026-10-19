import { describe, expect, it } from 'vitest'
import type { Location } from '@weatherteam6/types'
import { OPENED_FROM_MAP, openedFromMap } from './backTarget.js'
import { swipeDirection, swipeOf, switcherOptions, switchState } from './cragSwitch.js'

const place = (id: string, name: string) => ({ id, name }) as Location

describe('the crag switcher', () => {
  it('lists the saved places in order, adding the one being read if the list predates it', () => {
    const saved = [place('a', 'Red Wing'), place('b', 'Barn Bluff')]
    expect(switcherOptions(saved, place('b', 'Barn Bluff')).map((o) => o.id)).toEqual(['a', 'b'])
    expect(switcherOptions(saved, place('c', 'Taylors Falls')).map((o) => o.id)).toEqual(['a', 'b', 'c'])
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
