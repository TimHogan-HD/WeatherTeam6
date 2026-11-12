import { describe, expect, it } from 'vitest'
import { localDaySpan, riverChartModel } from './riverChart.js'

const NOW = Date.parse('2026-11-12T18:00:00Z')
const H = 3_600_000
const at = (hAgo: number, ft: number) => ({ at: new Date(NOW - hAgo * H).toISOString(), height_ft: ft })

describe('riverChartModel', () => {
  it('is null with nothing inside the 15 days', () => {
    expect(riverChartModel([], 4.95, NOW)).toBeNull()
    expect(riverChartModel([at(16 * 24, 4.5)], 4.95, NOW)).toBeNull()
  })

  it('breaks the line at a gap rather than drawing across it', () => {
    const m = riverChartModel([at(10, 4.7), at(9, 4.71), at(5, 4.72), at(4, 4.73), at(1, 4.74)], 4.95, NOW)!
    expect(m.runs.map((r) => r.length)).toEqual([2, 3])
  })

  it('keeps a lone point as a run of one, so it is drawn as a dot', () => {
    const m = riverChartModel([at(10, 4.7), at(1, 4.74)], 4.95, NOW)!
    expect(m.runs.map((r) => r.length)).toEqual([1, 1])
    expect(m.latest).toEqual({ ms: NOW - H, ft: 4.74 })
  })

  it('covers the line as well as the points, so the dashed line is always on the chart', () => {
    const m = riverChartModel([at(2, 4.0), at(1, 4.1)], 4.95, NOW)!
    expect(m.lo).toBeLessThanOrEqual(4.0)
    expect(m.hi).toBeGreaterThanOrEqual(4.95)
    expect(m.ticks[0]).toBe(m.lo)
  })
})

describe('localDaySpan', () => {
  it('is the crag-clock day around an instant', () => {
    // Noon Nov 8 in Minnesota (UTC-6) is 18:00 UTC; its day runs 06:00 UTC Nov 8 to 06:00 UTC Nov 9.
    const span = localDaySpan(Date.parse('2026-11-08T18:00:00Z'), -6 * 3600)
    expect(new Date(span.startMs).toISOString()).toBe('2026-11-08T06:00:00.000Z')
    expect(new Date(span.endMs).toISOString()).toBe('2026-11-09T06:00:00.000Z')
  })
})
