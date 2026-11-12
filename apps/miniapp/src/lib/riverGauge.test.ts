import { describe, expect, it } from 'vitest'
import { RIVER_GAUGES, RIVER_STALE_MS, riverState, type RiverGaugeReading } from '@weatherteam6/types'
import { changeLine, formatFt, overviewLine, overviewShows, readingClock, riverTabWord, spotLine, worstRiverState } from './riverGauge.js'

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
  it('needs a point near a day back', () => {
    expect(changeLine(reading([{ msAgo: 2 * H, ft: 5 }, { msAgo: H, ft: 4.9 }]))).toBeNull()
  })

  it('says falling for a drop over the day', () => {
    expect(changeLine(reading([{ msAgo: 26 * H, ft: 4.97 }, { msAgo: H, ft: 4.88 }]))).toBe('Falling 0.09 ft in 25 h')
  })

  it('reads a day back out of 15 days of points, and names the hours the points cover', () => {
    const pts = Array.from({ length: 15 * 24 + 1 }, (_, k) => ({ msAgo: (15 * 24 - k + 1.5) * H, ft: k === 15 * 24 ? 5.0 : 5.1 + k / 500 }))
    // Newest 1.5 h old; the point nearest 25 h before it is 26.5 h old, at 5.1 + 335/500 = 5.77.
    expect(changeLine(reading(pts))).toBe('Falling 0.77 ft in 25 h')
    expect(changeLine(reading([{ msAgo: 25 * H, ft: 4.9 }, { msAgo: 0, ft: 4.9 }]))).toBe('Steady in 25 h')
  })
})

describe('riverTabWord and spotLine', () => {
  it('never says which side of the line for a stale or missing reading', () => {
    expect(riverTabWord({ kind: 'stale', height_ft: 4.5, at: new Date(NOW).toISOString() })).toBe('No recent reading')
    expect(spotLine(gauge, { kind: 'stale', height_ft: 4.5, at: new Date(NOW).toISOString() }).word).toBe('No recent reading')
    expect(spotLine(gauge, { kind: 'unavailable' }).word).toBe('No recent reading')
  })

  it('names the boulder each side of the line', () => {
    const at = new Date(NOW).toISOString()
    expect(spotLine(gauge, { kind: 'reachable', height_ft: 4.68, at })).toEqual({
      word: 'Beach boulder is reachable',
      line: 'your line is 4.95 ft',
    })
    expect(spotLine(gauge, { kind: 'high', height_ft: 5.1, at }).word).toBe('Too high for the Beach boulder')
    expect(riverTabWord({ kind: 'reachable', height_ft: 4.68, at })).toBe('Low enough')
  })

  it('lets the worst gauge speak for the tab', () => {
    const at = new Date(NOW).toISOString()
    expect(worstRiverState([{ kind: 'reachable', height_ft: 4, at }, { kind: 'unavailable' }])?.kind).toBe('unavailable')
    expect(worstRiverState([{ kind: 'unavailable' }, { kind: 'high', height_ft: 6, at }])?.kind).toBe('high')
    expect(worstRiverState([])).toBeNull()
  })
})

describe('readingClock', () => {
  it('reads on the crag clock from the forecast offset, not the device zone', () => {
    expect(readingClock('2026-11-09T13:00:00Z', -6 * 3600)).toBe('7:00 AM')
    expect(readingClock('not a time', -6 * 3600)).toBeNull()
  })
})
