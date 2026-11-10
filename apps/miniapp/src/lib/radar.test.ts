import { describe, expect, it } from 'vitest'
import { radarNoCoverage, radarRainIn } from '@weatherteam6/design/tokens'
import {
  HATCH_ALPHA,
  HATCH_SPACING_PX,
  RADAR_BANDS,
  RAIN_SCALE,
  forecastSource,
  frameLabel,
  hatchNoCoverage,
  hatchSourceUrl,
  radarBeforeId,
  radarSource,
  radarStamp,
  radarTime,
  rainEndOf,
  rainPeriodLabel,
  rainSource,
  timelineFrames,
} from './radar.js'

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

const TILE = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0'

describe('forecastSource', () => {
  it("asks for the run the API named, by the frame's minute into it", () => {
    expect(forecastSource('2026-11-10T14:00:00Z', '2026-11-10T22:00:00Z')?.tiles).toEqual([
      `${TILE}/hrrr::REFD-F0480-202611101400/{z}/{x}/{y}.png`,
    ])
  })

  it('pads a short lead to four digits', () => {
    expect(forecastSource('2026-11-10T14:00:00Z', '2026-11-10T14:30:00Z')?.tiles?.[0]).toContain('REFD-F0030-')
  })

  it.each([
    ['an unreadable run', 'soon', '2026-11-10T16:00:00Z'],
    ['an unreadable frame', '2026-11-10T14:00:00Z', 'soon'],
    ['a frame at the run itself', '2026-11-10T14:00:00Z', '2026-11-10T14:00:00Z'],
    ['a frame before the run', '2026-11-10T14:00:00Z', '2026-11-10T13:30:00Z'],
  ])('is null for %s, never another frame', (_name, runAt, validAt) => {
    expect(forecastSource(runAt, validAt)).toBeNull()
  })
})

describe('rainSource', () => {
  const period = { start_at: '2026-11-09T15:00:00Z', end_at: '2026-11-10T15:00:00Z' }

  it("asks for the total ending at the period's end, by its hours", () => {
    const hatched = TILE.replace(/^https:/, 'wt6hatch:')
    expect(rainSource(period, 24)?.tiles).toEqual([`${hatched}/mrms::p24h-202611101500/{z}/{x}/{y}.png`])
    expect(rainSource(period, 72)?.tiles).toEqual([`${hatched}/mrms::p72h-202611101500/{z}/{x}/{y}.png`])
  })

  it('is fetched from IEM over https once the map unwraps it', () => {
    expect(hatchSourceUrl(rainSource(period, 24)?.tiles?.[0] ?? '')).toBe(`${TILE}/mrms::p24h-202611101500/{z}/{x}/{y}.png`)
  })

  it('credits MRMS, not the radar composite', () => {
    expect(rainSource(period, 24)?.attribution).toMatch(/^Rain totals: NOAA MRMS/)
  })

  it('is null for an unreadable end', () => {
    expect(rainSource({ ...period, end_at: 'soon' }, 24)).toBeNull()
  })
})

describe('timelineFrames', () => {
  const layers = {
    past: ['2026-11-10T15:45:00Z', '2026-11-10T15:50:00Z'],
    rain_24h: null,
    rain_72h: null,
    forecast: { run_at: '2026-11-10T14:00:00Z', frames: ['2026-11-10T16:00:00Z', '2026-11-10T16:30:00Z'] },
  }

  it('runs the past hour of radar, then the forecast', () => {
    expect(timelineFrames(layers).map((f) => `${f.kind} ${f.validAt}`)).toEqual([
      'radar 2026-11-10T15:45:00Z',
      'radar 2026-11-10T15:50:00Z',
      'forecast 2026-11-10T16:00:00Z',
      'forecast 2026-11-10T16:30:00Z',
    ])
  })

  it('draws each forecast frame from the forecast run, never the radar composite', () => {
    const ahead = timelineFrames(layers).filter((f) => f.kind === 'forecast')
    expect(ahead.every((f) => f.source.tiles?.[0]?.includes('hrrr::REFD-'))).toBe(true)
  })

  it('is radar alone without a forecast', () => {
    expect(timelineFrames({ ...layers, forecast: null }).map((f) => f.kind)).toEqual(['radar', 'radar'])
  })

  it('is empty without radar: a forecast with no radar to start from has no "now"', () => {
    expect(timelineFrames({ ...layers, past: null })).toEqual([])
  })

  it('leaves out a frame whose time is unreadable rather than drawing another', () => {
    expect(timelineFrames({ ...layers, past: ['soon', '2026-11-10T15:50:00Z'], forecast: null })).toHaveLength(1)
  })
})

describe('frameLabel', () => {
  it('says which is radar and which is forecast', () => {
    expect(frameLabel({ kind: 'radar', validAt: '2026-10-26T19:25:00Z' })).toMatch(/^Radar \d{1,2}:25/)
    expect(frameLabel({ kind: 'forecast', validAt: '2026-10-26T19:30:00Z' })).toMatch(/^Forecast \d{1,2}:30/)
  })
})

describe('rainPeriodLabel', () => {
  it('names the hours and when they end', () => {
    expect(rainPeriodLabel({ start_at: '2026-11-09T15:00:00Z', end_at: '2026-11-10T15:00:00Z' }, 24)).toMatch(/^Rain in the past 24 h, to \d{1,2}:00/)
  })

  it('names no end for an unreadable one', () => {
    expect(rainPeriodLabel({ start_at: '', end_at: 'soon' }, 72)).toBe('Rain in the past 72 h')
  })
})

describe('RAIN_SCALE', () => {
  it('runs from the lightest rain to the heaviest, in the order IEM ramps them', () => {
    const colors = RAIN_SCALE.segments.flatMap((s) => s.colors)
    const marks = Object.keys(radarRainIn).map(Number).sort((a, b) => a - b)
    expect(colors).toEqual(marks.map((m) => radarRainIn[m as keyof typeof radarRainIn]))
  })
})

describe('rainEndOf', () => {
  const period = { start_at: '2026-11-09T09:00:00Z', end_at: '2026-11-10T09:00:00Z' }

  it("reads the end from the drawn tile's own stamp, not the newest listing", () => {
    const drawn = rainSource(period, 24)?.tiles?.[0] ?? null
    expect(rainEndOf(drawn, 24)).toBe('2026-11-10T09:00:00Z')
  })

  it('is null for a tile of another layer or span', () => {
    expect(rainEndOf(rainSource(period, 72)?.tiles?.[0] ?? null, 24)).toBeNull()
    expect(rainEndOf(radarSource('2026-11-10T09:00:00Z')?.tiles?.[0] ?? null, 24)).toBeNull()
    expect(rainEndOf(null, 24)).toBeNull()
  })
})

describe('hatchSourceUrl', () => {
  it('is null for a tile asked for over https, which the map fetches itself', () => {
    expect(hatchSourceUrl('https://mesonet.agron.iastate.edu/x.png')).toBeNull()
  })
})

describe('hatchNoCoverage', () => {
  const grey = [1, 3, 5].map((i) => parseInt(radarNoCoverage.slice(i, i + 2), 16))
  const width = HATCH_SPACING_PX * 2
  /** A tile row by row: 'g' IEM's grey, 'r' a rain colour, '.' clear. */
  const tile = (cells: string): Uint8ClampedArray =>
    new Uint8ClampedArray(
      [...cells].flatMap((c) => (c === 'g' ? [...grey, 255] : c === 'r' ? [0, 6, 255, 255] : [0, 0, 0, 0])),
    )
  const alphaAt = (pixels: Uint8ClampedArray, x: number, y: number) => pixels[(y * width + x) * 4 + 3]

  it('keeps the grey only on every eighth diagonal, faint, and clears the rest', () => {
    const pixels = tile('g'.repeat(width * 2))
    expect(hatchNoCoverage(pixels, width)).toBe(true)
    expect(alphaAt(pixels, 0, 0)).toBe(HATCH_ALPHA)
    expect(alphaAt(pixels, HATCH_SPACING_PX - 1, 1)).toBe(HATCH_ALPHA)
    expect(alphaAt(pixels, 1, 0)).toBe(0)
    expect(alphaAt(pixels, 0, 1)).toBe(0)
  })

  it('leaves rain and clear pixels as IEM drew them', () => {
    const cells = 'r.' + 'g'.repeat(width - 2)
    const pixels = tile(cells)
    hatchNoCoverage(pixels, width)
    expect([...pixels.slice(0, 8)]).toEqual([0, 6, 255, 255, 0, 0, 0, 0])
  })

  it('says when a tile had no grey, so it can be passed on unchanged', () => {
    expect(hatchNoCoverage(tile('r.'.repeat(width)), width)).toBe(false)
  })

  it('leaves a half-clear pixel of the same grey alone: only IEM\'s solid fill is no coverage', () => {
    const pixels = new Uint8ClampedArray([...grey, 128])
    expect(hatchNoCoverage(pixels, 1)).toBe(false)
    expect(pixels[3]).toBe(128)
  })
})
