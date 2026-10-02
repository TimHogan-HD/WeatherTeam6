import { describe, expect, it } from 'vitest'
import { bottomNav } from '@weatherteam6/design/tokens'
import { arrivalScrollY, navGeometry, sectionFor } from './bottomNav.js'

describe('arrivalScrollY', () => {
  it('returns the list to where it was left, however the reader comes back', () => {
    expect(arrivalScrollY('/', 'PUSH', 840)).toBe(840)
    expect(arrivalScrollY('/', 'POP', 840)).toBe(840)
    expect(arrivalScrollY('/profile', 'PUSH', 120)).toBe(120)
  })

  it('opens any other screen at its top unless the reader went back to it', () => {
    expect(arrivalScrollY('/location/abc/wall/w1', 'PUSH', 600)).toBe(0)
    expect(arrivalScrollY('/location/abc', 'REPLACE', 600)).toBe(0)
    expect(arrivalScrollY('/location/abc', 'POP', 600)).toBe(600)
  })

  it('opens a screen never scrolled at its top', () => {
    expect(arrivalScrollY('/', 'POP', undefined)).toBe(0)
  })
})

describe('sectionFor', () => {
  it('puts the list, a location and its guidebook screens under Conditions', () => {
    expect(sectionFor('/')).toBe('conditions')
    expect(sectionFor('/location/abc')).toBe('conditions')
    expect(sectionFor('/location/abc/wall/w/route/r')).toBe('conditions')
  })

  it('names each other section by its own route', () => {
    expect(sectionFor('/crags')).toBe('crags')
    expect(sectionFor('/map')).toBe('map')
    expect(sectionFor('/trips')).toBe('trips')
    expect(sectionFor('/trips/abc/crag/def')).toBe('trips')
    expect(sectionFor('/profile')).toBe('profile')
  })

  it('does not match a route that only shares a prefix', () => {
    expect(sectionFor('/mapping')).toBe('conditions')
  })

  /** Tasks you finish and leave carry their own back control and no bar. */
  it('shows no bar over the add flow, feedback or a location editor', () => {
    expect(sectionFor('/add')).toBeNull()
    expect(sectionFor('/feedback')).toBeNull()
    expect(sectionFor('/location/abc/edit')).toBeNull()
    expect(sectionFor('/trips/new')).toBeNull()
  })

  it('keeps the bar on a guidebook screen whose ids merely contain "edit"', () => {
    expect(sectionFor('/location/abc/wall/edit')).toBe('conditions')
  })
})

describe('navGeometry', () => {
  const ROW = 460

  it('gives the lit tab its pill width and shares the rest equally', () => {
    const { widths } = navGeometry(ROW, 'map')
    const map = bottomNav.tabs.find((t) => t.key === 'map')?.pillW
    expect(widths[2]).toBe(map)
    const others = widths.filter((_, i) => i !== 2)
    expect(new Set(others).size).toBe(1)
    const total = widths.reduce((s, w) => s + w, 0) + bottomNav.gap * (widths.length - 1)
    expect(total).toBeCloseTo(ROW)
  })

  it('puts the pill exactly over the lit tab, at either end of the row', () => {
    for (const key of ['crags', 'conditions', 'profile'] as const) {
      const { widths, pill } = navGeometry(ROW, key)
      const i = bottomNav.tabs.findIndex((t) => t.key === key)
      const left = widths.slice(0, i).reduce((s, w) => s + w + bottomNav.gap, 0)
      expect(pill.left).toBeCloseTo(left)
      expect(ROW - pill.left - pill.right).toBeCloseTo(widths[i] ?? -1)
    }
  })

  it('never gives an unlit tab a negative width', () => {
    const { widths } = navGeometry(100, 'conditions')
    for (const w of widths) expect(w).toBeGreaterThanOrEqual(0)
  })
})
