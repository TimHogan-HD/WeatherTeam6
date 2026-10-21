import { describe, expect, it } from 'vitest'
import type { Location } from '@weatherteam6/types'
import { OPENED_FROM_MAP, openedFromMap } from './backTarget.js'
import { recentOf, swipeDirection, swipeOf, switcherOptions, switchState } from './cragSwitch.js'

const place = (id: string, name: string) => ({ id, name }) as Location

describe('the crag switcher', () => {
  const saved = [place('a', 'Red Wing'), place('b', 'Barn Bluff'), place('c', 'Taylors Falls'), place('d', 'Sandstone')]
  const ids = (options: { id: string }[]) => options.map((o) => o.id)

  it('opens with the place being read first, then the rest in saved order', () => {
    expect(ids(switcherOptions(saved, place('c', 'Taylors Falls'), []))).toEqual(['c', 'a', 'b', 'd'])
  })

  it('puts the place just left second, so it is one tap back', () => {
    const fromA = ids(switcherOptions(saved, place('a', 'Red Wing'), []))
    const atC = ids(switcherOptions(saved, place('c', 'Taylors Falls'), fromA))
    expect(atC).toEqual(['c', 'a', 'b', 'd'])
    const atB = ids(switcherOptions(saved, place('b', 'Barn Bluff'), atC))
    expect(atB).toEqual(['b', 'c', 'a', 'd'])
    expect(ids(switcherOptions(saved, place('c', 'Taylors Falls'), atB))).toEqual(['c', 'b', 'a', 'd'])
  })

  it('drops a place no longer saved and appends one saved since', () => {
    const recent = ['b', 'gone', 'a']
    expect(ids(switcherOptions(saved, place('a', 'Red Wing'), recent))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('adds the place being read, first, when the saved list predates it', () => {
    const older = [place('a', 'Red Wing'), place('b', 'Barn Bluff')]
    expect(ids(switcherOptions(older, place('e', 'Willow River'), []))).toEqual(['e', 'a', 'b'])
  })

  it('swipes from the side moved toward', () => {
    expect(swipeDirection(['a', 'b', 'c'], 'a', 'c')).toBe(1)
    expect(swipeDirection(['a', 'b', 'c'], 'c', 'b')).toBe(-1)
  })

  it('keeps a map-opened crag returning to the map across a switch', () => {
    const next = switchState({ ...OPENED_FROM_MAP }, 1, ['a', 'b'])
    expect(openedFromMap(next)).toBe(true)
    expect(swipeOf(next)).toBe(1)
    expect(recentOf(next)).toEqual(['a', 'b'])
  })

  it('reads no order from a plain arrival or a malformed state', () => {
    for (const state of [null, undefined, {}, OPENED_FROM_MAP, { recent: 'a' }]) expect(recentOf(state)).toEqual([])
  })

  it('reads no swipe from a plain arrival or a reload with no state', () => {
    for (const state of [null, undefined, {}, OPENED_FROM_MAP, { swipe: 2 }]) expect(swipeOf(state)).toBeNull()
  })
})
