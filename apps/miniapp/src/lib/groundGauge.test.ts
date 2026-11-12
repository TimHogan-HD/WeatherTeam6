import { describe, expect, it } from 'vitest'
import type { SoilPoint } from '@weatherteam6/types'
import {
  GROUND_STALE_MS,
  groundChartModel,
  groundNear,
  groundState,
  groundTabWord,
  groundTrend,
  groundWord,
  ordinalPct,
} from './groundGauge.js'

const HOUR = 3_600_000
const NOW = Date.UTC(2026, 10, 12, 19)
const CHICAGO = -6 * 3600

const pt = (msAgo: number, over: Partial<SoilPoint> = {}): SoilPoint => ({
  at: new Date(NOW - msAgo).toISOString(),
  vwc_5: 0.234,
  pct_5: 0.473,
  temp_5_c: 6.6,
  vwc_20: 0.236,
  pct_20: 0.83,
  temp_20_c: 7.7,
  ...over,
})

describe('groundWord', () => {
  it("uses the owner's bands, each edge on the wetter side", () => {
    expect([0.1, 0.249, 0.25, 0.749, 0.75, 0.899, 0.9, 0.99].map(groundWord)).toEqual([
      'Drier than usual',
      'Drier than usual',
      'Typical',
      'Typical',
      'Wetter than usual',
      'Wetter than usual',
      'Soaked',
      'Soaked',
    ])
  })
})

describe('groundState', () => {
  it('reads the newest row, and 20 cm at or over the 75th as still wet below', () => {
    const s = groundState([pt(5 * HOUR, { vwc_5: 0.3 }), pt(HOUR)], NOW)
    expect(s).toMatchObject({ kind: 'reading', top: { vwc: 0.234, pct: 0.473, word: 'Typical' }, wetBelow: true })
    expect(groundTabWord(s)).toBe('Typical')
    const dry = groundState([pt(HOUR, { pct_20: 0.749 })], NOW)
    expect(dry.kind === 'reading' && dry.wetBelow).toBe(false)
  })

  it('skips an empty newest row rather than reading it as dry', () => {
    const empty = pt(0, { vwc_5: null, pct_5: null, temp_5_c: null, vwc_20: null, pct_20: null, temp_20_c: null })
    expect(groundState([pt(2 * HOUR, { vwc_5: 0.25 }), empty], NOW)).toMatchObject({ kind: 'reading', top: { vwc: 0.25 } })
  })

  it('withholds frozen ground at 0 °C and below, never a figure', () => {
    expect(groundState([pt(HOUR, { temp_5_c: 0 })], NOW)).toMatchObject({ kind: 'frozen', temp_c: 0 })
    expect(groundTabWord(groundState([pt(HOUR, { temp_5_c: -1.8 })], NOW))).toBe('Frozen')
  })

  it('withholds a reading with no temperature to rule frost out', () => {
    expect(groundState([pt(HOUR, { temp_5_c: null })], NOW)).toEqual({ kind: 'unavailable' })
  })

  it('drops only the 20 cm line when 20 cm is frozen or unread', () => {
    const s = groundState([pt(HOUR, { temp_20_c: -0.2 })], NOW)
    expect(s).toMatchObject({ kind: 'reading', below: null, wetBelow: false })
  })

  it('says a reading past the stale line is too old, never stands it for now', () => {
    expect(groundState([pt(GROUND_STALE_MS + 1)], NOW)).toMatchObject({ kind: 'stale' })
    expect(groundState([pt(GROUND_STALE_MS)], NOW).kind).toBe('reading')
    expect(groundState([], NOW)).toEqual({ kind: 'unavailable' })
    expect(groundTabWord({ kind: 'unavailable' })).toBe('No reading')
  })
})

describe('ordinalPct', () => {
  it('names a percentile the way it is said, capped at 99th', () => {
    expect([0.01, 0.02, 0.03, 0.11, 0.12, 0.13, 0.46, 0.82, 1].map(ordinalPct)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '11th',
      '12th',
      '13th',
      '46th',
      '82nd',
      '99th',
    ])
  })
})

describe('groundTrend', () => {
  it('says drying since the peak when the peak came after the low', () => {
    // Nov 2 dry, Nov 4 storm, drying since.
    const pts = [
      pt(10 * 24 * HOUR, { vwc_5: 0.232 }),
      pt(8 * 24 * HOUR, { vwc_5: 0.306 }),
      pt(HOUR, { vwc_5: 0.234 }),
    ]
    expect(groundTrend(pts, CHICAGO)).toBe('Down 7.2 points since Nov 4')
  })

  it('says wetting since the low when the low came after the peak', () => {
    const pts = [pt(10 * 24 * HOUR, { vwc_5: 0.3 }), pt(5 * 24 * HOUR, { vwc_5: 0.22 }), pt(HOUR, { vwc_5: 0.25 })]
    expect(groundTrend(pts, CHICAGO)).toBe('Up 3.0 points since Nov 7')
  })

  it('measures from the last turn, never a wetter peak at the window edge', () => {
    // Oct 29 storm, dried to Nov 3, wetted to Nov 7, drying since.
    const pts = [
      pt(14 * 24 * HOUR, { vwc_5: 0.32 }),
      pt(9 * 24 * HOUR, { vwc_5: 0.22 }),
      pt(5 * 24 * HOUR, { vwc_5: 0.26 }),
      pt(HOUR, { vwc_5: 0.234 }),
    ]
    expect(groundTrend(pts, CHICAGO)).toBe('Down 2.6 points since Nov 7')
  })

  it('leaves frozen hours out of the trend, and is steady under half a point', () => {
    const pts = [pt(3 * 24 * HOUR, { vwc_5: 0.1, temp_5_c: -2 }), pt(2 * 24 * HOUR, { vwc_5: 0.232 }), pt(HOUR, { vwc_5: 0.234 })]
    expect(groundTrend(pts, CHICAGO)).toBe('Steady since Nov 10')
    expect(groundTrend([pt(HOUR)], CHICAGO)).toBeNull()
  })
})

describe('groundChartModel', () => {
  it('breaks the line at a gap and at a frozen hour, and marks a partial rain day as a gap, never a dry one', () => {
    const pts = [pt(30 * HOUR), pt(29 * HOUR), pt(20 * HOUR), pt(19 * HOUR, { temp_5_c: -1 }), pt(18 * HOUR), pt(17 * HOUR)]
    const m = groundChartModel(
      pts,
      [
        { local_date: '2026-11-10', rain_mm: 5 },
        { local_date: '2026-11-11', rain_mm: null },
        { local_date: '2026-11-12', rain_mm: 0 },
      ],
      CHICAGO,
      NOW,
    )
    expect(m?.runs.map((r) => r.length)).toEqual([2, 1, 2])
    expect(m?.rain).toEqual([{ midMs: Date.UTC(2026, 10, 10, 18), mm: 5 }])
    expect(m?.rainGaps).toEqual([Date.UTC(2026, 10, 11, 18)])
    expect(m?.rainTopMm).toBe(25.4)
  })

  it('draws nothing with no usable hour in the window', () => {
    expect(groundChartModel([pt(16 * 24 * HOUR)], [], CHICAGO, NOW)).toBeNull()
  })
})

describe('groundNear', () => {
  it('reads a visit within an hour, never a neighbour from further off or a frozen hour', () => {
    const pts = [pt(10 * HOUR, { vwc_5: 0.247 }), pt(5 * HOUR, { vwc_5: 0.3, temp_5_c: -1 })]
    expect(groundNear(pts, NOW - 10.5 * HOUR)).toBeCloseTo(0.247)
    expect(groundNear(pts, NOW - 5 * HOUR)).toBeNull()
    expect(groundNear(pts, NOW - 12 * HOUR)).toBeNull()
  })
})
