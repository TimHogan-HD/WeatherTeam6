import { describe, expect, it } from 'vitest'
import { MAX_GAP_MS, summarizeUsage, type UsageRow } from './summarize.js'

const T0 = Date.parse('2026-11-23T15:00:00Z')
function row(user: string, screen: string, tab: string | null, offsetMs: number): UsageRow {
  return { username: user === 'u1' ? 'tim' : 'sam', user_id: user, screen, tab, at: new Date(T0 + offsetMs) }
}

describe('summarizeUsage', () => {
  it('counts each screen and tab per account, most opened first', () => {
    const [tim] = summarizeUsage([
      row('u1', '/', null, 0),
      row('u1', '/location/:id', 'overview', 10_000),
      row('u1', '/location/:id', 'precip', 40_000),
      row('u1', '/location/:id', 'precip', 100_000),
    ])
    expect(tim?.username).toBe('tim')
    expect(tim?.events).toBe(4)
    expect(tim?.screens.map((s) => [s.label, s.count])).toEqual([
      ['/location/:id · precip', 2],
      ['/', 1],
      ['/location/:id · overview', 1],
    ])
  })

  it('times a screen by the gap to the same account’s next event, sorting rows that arrive out of order', () => {
    const [tim] = summarizeUsage([
      row('u1', '/trips', null, 30_000),
      row('u2', '/map', null, 5_000), // another account's event in between must not end Tim's
      row('u1', '/', null, 0),
    ])
    const home = tim?.screens.find((s) => s.label === '/')
    expect(home?.medianSeconds).toBe(30)
  })

  it('gives no time to a last event, or to a gap at or past the cap', () => {
    const [tim] = summarizeUsage([
      row('u1', '/', null, 0),
      row('u1', '/map', null, MAX_GAP_MS),
      row('u1', '/trips', null, MAX_GAP_MS + MAX_GAP_MS - 1),
    ])
    const by = new Map(tim?.screens.map((s) => [s.label, s.medianSeconds]))
    expect(by.get('/')).toBeNull()
    expect(by.get('/map')).toBe(Math.round((MAX_GAP_MS - 1) / 1000))
    expect(by.get('/trips')).toBeNull()
  })

  it('takes the median, not the mean', () => {
    const [tim] = summarizeUsage([
      row('u1', '/', null, 0),
      row('u1', '/map', null, 10_000),
      row('u1', '/', null, 20_000),
      row('u1', '/map', null, 30_000),
      row('u1', '/', null, 40_000),
      row('u1', '/map', null, 280_000),
    ])
    expect(tim?.screens.find((s) => s.label === '/')?.medianSeconds).toBe(10)
  })

  it('reports nothing for no rows', () => {
    expect(summarizeUsage([])).toEqual([])
  })
})
