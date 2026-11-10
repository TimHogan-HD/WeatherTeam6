import { describe, expect, it } from 'vitest'
import { RADAR_BANDS, radarBeforeId, radarSource, radarStamp, radarTime } from './radar.js'

describe('radarStamp', () => {
  it('names the frame by its UTC minute', () => {
    expect(radarStamp('2026-10-26T19:25:00Z')).toBe('202610261925')
  })

  it('reads an offset time as the same instant', () => {
    expect(radarStamp('2026-10-26T14:25:00-05:00')).toBe('202610261925')
  })

  it('is null for an unreadable time, never a stamp of some other frame', () => {
    expect(radarStamp('soon')).toBeNull()
  })
})

describe('radarSource', () => {
  it("asks for the stamped frame's tiles, not IEM's moving latest", () => {
    expect(radarSource('2026-10-26T19:25:00Z')?.tiles).toEqual([
      'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202610261925/{z}/{x}/{y}.png',
    ])
  })

  it('is null without a readable time, so no radar is drawn', () => {
    expect(radarSource('')).toBeNull()
  })
})

describe('radarBeforeId', () => {
  it('goes under the first label after the last line', () => {
    const layers = [
      { id: 'background', type: 'background' },
      { id: 'road_oneway', type: 'symbol' },
      { id: 'highway', type: 'line' },
      { id: 'boundary', type: 'line' },
      { id: 'wt6-contour-labels', type: 'symbol' },
      { id: 'place_city', type: 'symbol' },
    ]
    expect(radarBeforeId(layers)).toBe('wt6-contour-labels')
  })

  it('goes on top when there is no label', () => {
    expect(radarBeforeId([{ id: 'highway', type: 'line' }])).toBeUndefined()
  })
})

describe('radarTime', () => {
  it('is null for an unreadable time', () => {
    expect(radarTime('soon')).toBeNull()
  })

  it('prints hours and minutes', () => {
    expect(radarTime('2026-10-26T19:25:00Z')).toMatch(/\d{1,2}:25/)
  })
})

describe('RADAR_BANDS', () => {
  it('run end to end with no gap or overlap, so every colour on the map has a place on the bar', () => {
    for (let i = 1; i < RADAR_BANDS.length; i++) {
      expect(RADAR_BANDS[i]!.fromDbz).toBe(RADAR_BANDS[i - 1]!.toDbz)
    }
  })

  it('join in one colour, so the bar reads as one ramp', () => {
    for (let i = 1; i < RADAR_BANDS.length; i++) {
      expect(RADAR_BANDS[i]!.colors[0]).toBe(RADAR_BANDS[i - 1]!.colors.at(-1))
    }
  })
})

describe('RADAR_BANDS colours', () => {
  it("carry IEM's ramp across each band, ends included", () => {
    expect(RADAR_BANDS.find((b) => b.label === 'Moderate')?.colors).toEqual(['#327308', '#ffe200', '#ffac00', '#f80000'])
  })
})
