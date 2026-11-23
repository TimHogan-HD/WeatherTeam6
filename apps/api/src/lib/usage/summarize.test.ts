import { describe, expect, it } from 'vitest'
import { MAX_GAP_MS, summarizeUsage, type UsageRow } from './summarize.js'

const T0 = Date.parse('2026-11-23T15:00:00Z')
function row(visit: string, screen: string, tab: string | null, offsetMs: number): UsageRow {
  return { visit_id: visit, screen, tab, at: new Date(T0 + offsetMs) }
}

describe('summarizeUsage', () => {
  it('counts each screen and tab across visits, most opened first', () => {
    const summary = summarizeUsage([
      row('v1', '/', null, 0),
      row('v1', '/location/:id', 'overview', 10_000),
      row('v2', '/location/:id', 'precip', 40_000),
      row('v1', '/location/:id', 'precip', 100_000),
    ])
    expect(summary.events).toBe(4)
    expect(summary.visits).toBe(2)
    expect(summary.screens.map((s) => [s.label, s.count])).toEqual([
      ['/location/:id · precip', 2],
      ['/', 1],
      ['/location/:id · overview', 1],
    ])
  })

  it('times a screen by the gap to the same visit’s next event, sorting rows that arrive out of order', () => {
    const summary = summarizeUsage([
      row('v1', '/trips', null, 30_000),
      row('v2', '/map', null, 5_000), // another visit's event in between must not end v1's
      row('v1', '/', null, 0),
    ])
    expect(summary.screens.find((s) => s.label === '/')?.medianSeconds).toBe(30)
    expect(summary.screens.find((s) => s.label === '/map')?.medianSeconds).toBeNull()
  })

  it('gives no time to a last event, or to a gap at or past the cap', () => {
    const summary = summarizeUsage([
      row('v1', '/', null, 0),
      row('v1', '/map', null, MAX_GAP_MS),
      row('v1', '/trips', null, MAX_GAP_MS + MAX_GAP_MS - 1),
    ])
    const by = new Map(summary.screens.map((s) => [s.label, s.medianSeconds]))
    expect(by.get('/')).toBeNull()
    expect(by.get('/map')).toBe(Math.round((MAX_GAP_MS - 1) / 1000))
    expect(by.get('/trips')).toBeNull()
  })

  it('takes the median, not the mean', () => {
    const summary = summarizeUsage([
      row('v1', '/', null, 0),
      row('v1', '/map', null, 10_000),
      row('v1', '/', null, 20_000),
      row('v1', '/map', null, 30_000),
      row('v1', '/', null, 40_000),
      row('v1', '/map', null, 280_000),
    ])
    expect(summary.screens.find((s) => s.label === '/')?.medianSeconds).toBe(10)
  })

  it('reports nothing for no rows', () => {
    expect(summarizeUsage([])).toEqual({ events: 0, visits: 0, screens: [] })
  })
})
