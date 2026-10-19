import { describe, expect, it } from 'vitest'
import { pageMotion } from './pageMotion.js'

describe('pageMotion', () => {
  it('fades a crag in from the list or the map, and back out to either', () => {
    expect(pageMotion('/', '/location/a')).toBe('fade')
    expect(pageMotion('/map', '/location/a')).toBe('fade')
    expect(pageMotion('/location/a', '/')).toBe('fade')
    expect(pageMotion('/location/a', '/map')).toBe('fade')
  })

  it('slides in going deeper and back coming out', () => {
    expect(pageMotion('/location/a', '/location/a/wall/w')).toBe('in')
    expect(pageMotion('/location/a/wall/w', '/location/a/wall/w/route/r')).toBe('in')
    expect(pageMotion('/location/a/wall/w', '/location/a')).toBe('back')
    expect(pageMotion('/trips', '/trips/t')).toBe('in')
    expect(pageMotion('/trips/t/crag/a', '/trips/t')).toBe('back')
  })

  it('treats a task screen as on top of everything, whatever its path', () => {
    expect(pageMotion('/location/a', '/feedback')).toBe('in')
    expect(pageMotion('/feedback', '/location/a')).toBe('back')
    expect(pageMotion('/', '/add')).toBe('in')
    expect(pageMotion('/trips/t', '/trips/t/edit')).toBe('in')
    expect(pageMotion('/trips/new', '/trips')).toBe('back')
  })

  it('keeps still between sections and between crags', () => {
    expect(pageMotion('/', '/map')).toBeNull()
    expect(pageMotion('/trips', '/profile')).toBeNull()
    expect(pageMotion('/location/a', '/location/b')).toBeNull()
    expect(pageMotion('/location/a', '/location/a')).toBeNull()
  })
})
