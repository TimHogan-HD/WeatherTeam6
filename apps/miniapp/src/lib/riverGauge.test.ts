import { describe, expect, it } from 'vitest'
import { RIVER_GAUGES, RIVER_STALE_MS, riverState, type RiverGaugeReading } from '@weatherteam6/types'
import { changeLine, formatFt, overviewLine, overviewShows, readingClock } from './riverGauge.js'

const NOW = Date.parse('2026-11-09T15:00:00Z')
const H = 3_600_000
const gauge = RIVER_GAUGES['robinson-park']![0]!
const reading = (points: { msAgo: number; ft: number }[]): RiverGaugeReading => ({
  ...gauge,
  points: points.map((p) => ({ at: new Date(NOW - p.msAgo).toISOString(), height_ft: p.ft })),
})

describe('formatFt', () => {
  it('is an em dash for a missing height, never 0.00 ft', () => {
    expect(formatFt(null)).toBe('—')
    expect(formatFt(Number.NaN)).toBe('—')
    expect(formatFt(4.9)).toBe('4.90 ft')
  })
})

describe('overviewShows', () => {
  it('hides only a fresh reading at or under the line', () => {
    expect(overviewShows(riverState(reading([{ msAgo: H, ft: gauge.reachable_at_or_below_ft }]), NOW))).toBe(false)
    expect(overviewShows(riverState(reading([{ msAgo: H, ft: gauge.reachable_at_or_below_ft + 0.01 }]), NOW))).toBe(true)
  })

  it('shows when USGS gave nothing, so silence never reads as low', () => {
    expect(overviewShows(riverState(reading([]), NOW))).toBe(true)
  })

  it('shows an old low reading as stale, not as low', () => {
    const r = reading([{ msAgo: RIVER_STALE_MS + H, ft: 4.2 }])
    expect(overviewShows(riverState(r, NOW))).toBe(true)
    expect(overviewLine(r, NOW, -6 * 3600).value).toMatch(/^No river reading since /)
  })
})

describe('overviewLine', () => {
  it('names the height and the line when above it', () => {
    expect(overviewLine(reading([{ msAgo: H, ft: 5.2 }]), NOW)).toEqual({
      label: 'Best Boulder in Minnesota V5',
      value: 'Too high: river 5.20 ft, climbable at 4.95 ft or lower',
    })
  })

  it('names no height when there is none', () => {
    expect(overviewLine(reading([]), NOW).value).toBe('No river reading from USGS')
  })
})

describe('changeLine', () => {
  it('needs most of a day of points', () => {
    expect(changeLine(reading([{ msAgo: 2 * H, ft: 5 }, { msAgo: H, ft: 4.9 }]))).toBeNull()
  })

  it('says falling for a drop over the day', () => {
    expect(changeLine(reading([{ msAgo: 24 * H, ft: 4.97 }, { msAgo: H, ft: 4.88 }]))).toBe('Falling 0.09 ft over 23 h')
  })

  it('names the span the points cover, not the window asked for', () => {
    // USGS's lag: newest 1.5 h old, first at the window's 26 h edge.
    expect(changeLine(reading([{ msAgo: 26 * H, ft: 5.1 }, { msAgo: 1.5 * H, ft: 5.0 }]))).toBe('Falling 0.10 ft over 25 h')
    // The early part of the window missing.
    expect(changeLine(reading([{ msAgo: 19 * H, ft: 4.9 }, { msAgo: H, ft: 4.95 }]))).toBe('Rising 0.05 ft over 18 h')
  })
})

describe('readingClock', () => {
  it('reads on the crag clock from the forecast offset, not the device zone', () => {
    expect(readingClock('2026-11-09T13:00:00Z', -6 * 3600)).toBe('7:00 AM')
    expect(readingClock('not a time', -6 * 3600)).toBeNull()
  })
})
