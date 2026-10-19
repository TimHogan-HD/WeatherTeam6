import { describe, expect, it } from 'vitest'
import { isEdgeSwipe, ownsEdgeSwipe } from './edgeSwipe.js'

describe('isEdgeSwipe', () => {
  it('takes a swipe that starts at the left edge and travels right', () => {
    expect(isEdgeSwipe({ x: 6, y: 400 }, { x: 120, y: 420 })).toBe(true)
  })

  it('refuses one that starts away from the edge, such as a chart scrub', () => {
    expect(isEdgeSwipe({ x: 40, y: 400 }, { x: 200, y: 400 })).toBe(false)
  })

  it('refuses a short drag and a scroll that drifts right', () => {
    expect(isEdgeSwipe({ x: 6, y: 400 }, { x: 50, y: 400 })).toBe(false)
    expect(isEdgeSwipe({ x: 6, y: 400 }, { x: 100, y: 560 })).toBe(false)
  })

  it('refuses a swipe to the left', () => {
    expect(isEdgeSwipe({ x: 20, y: 400 }, { x: -80, y: 400 })).toBe(false)
  })
})

describe('ownsEdgeSwipe', () => {
  it('belongs to the installed app only, never a browser tab with its own back gesture', () => {
    expect(ownsEdgeSwipe(true, undefined)).toBe(true)
    expect(ownsEdgeSwipe(false, true)).toBe(true)
    expect(ownsEdgeSwipe(false, false)).toBe(false)
    expect(ownsEdgeSwipe(false, undefined)).toBe(false)
  })
})
