import { describe, expect, it } from 'vitest'
import type { HourlyReading, HourlySample } from '@weatherteam6/types'
import { rainAhead, scoreBlocks } from './conditionsBlocks.js'

// Sandstone on 2026-10-03, UTC-5: 9am local is 14:00Z.
const OFFSET = -5 * 3600
const at = (localHour: number) => new Date(Date.UTC(2026, 9, 3, localHour + 5)).toISOString()
const START = at(9)

const reading = (localHour: number, score: number | null): HourlyReading => ({
  valid_at: at(localHour),
  rock: { level: 'dry', qualified: true },
  friction: { level: 'great', condensing: false, qualified: true },
  score,
  t_surface_c: 12,
  condensation_margin_c: 5,
})

// 9am-5pm, the shape of the day the owner saw: dry, then rain from 1pm.
const SCORES = [100, 100, 85, 48, 70, 40, 0, 0, 0]
const day = SCORES.map((s, i) => reading(9 + i, s))
const clear = { severeAlertEvent: null, alertsPending: false }

describe('scoreBlocks', () => {
  it('scores each block by its worst hour, labelled on the location’s clock', () => {
    expect(scoreBlocks(day, START, OFFSET, clear)).toEqual([
      { from: at(9), label: '9am–12pm', score: 85 },
      { from: at(12), label: '12pm–3pm', score: 40 },
      { from: at(15), label: '3pm–6pm', score: 0 },
    ])
  })

  it('joins on the instant, not on position', () => {
    const shuffled = [...day].reverse()
    expect(scoreBlocks(shuffled, START, OFFSET, clear).map((b) => b.score)).toEqual([85, 40, 0])
  })

  it('has no score for a block with an hour missing, rather than the worst of the rest', () => {
    // 11am would have been the block's worst hour; without it, 100 would be a lie.
    const gap = day.filter((h) => h.valid_at !== at(11))
    expect(scoreBlocks(gap, START, OFFSET, clear)[0]?.score).toBeNull()
    const unread = day.map((h) => (h.valid_at === at(11) ? { ...h, score: null } : h))
    expect(scoreBlocks(unread, START, OFFSET, clear)[0]?.score).toBeNull()
  })

  it('drops every score under a Severe+ alert and while alerts load', () => {
    const severe = scoreBlocks(day, START, OFFSET, { severeAlertEvent: 'Flood Warning', alertsPending: false })
    expect(severe.map((b) => b.score)).toEqual([null, null, null])
    const pending = scoreBlocks(day, START, OFFSET, { severeAlertEvent: null, alertsPending: true })
    expect(pending.map((b) => b.score)).toEqual([null, null, null])
  })

  it('keeps a real 0, which is wet rock, apart from a gap', () => {
    expect(scoreBlocks(day, START, OFFSET, clear)[2]?.score).toBe(0)
  })

  it('has no blocks for an unreadable start', () => {
    expect(scoreBlocks(day, 'not a time', OFFSET, clear)).toEqual([])
  })
})

// Hourly chance of rain, each stamped at the end of the hour it covers.
const sample = (localHour: number, pct: number | null): HourlySample =>
  ({ valid_at: at(localHour), local_date: '2026-10-03', precip_chance_pct: pct }) as HourlySample
const NOW = Date.parse(at(9)) + 17 * 60_000 // 9:17am

describe('rainAhead', () => {
  it('names the hour the first likely rain begins, and the peak after it', () => {
    // Stamped 2pm = rain from 1pm.
    const hours = [sample(10, 10), sample(11, 20), sample(12, 30), sample(13, 45), sample(14, 60), sample(15, 85), sample(16, 70)]
    expect(rainAhead(hours, START, NOW)).toEqual({ from: at(13), peakPct: 85, now: false })
  })

  it('reads rain in the hour now in progress as rain now', () => {
    expect(rainAhead([sample(10, 70)], START, NOW)).toEqual({ from: at(9), peakPct: 70, now: true })
  })

  it('ignores hours already over and hours past the last block', () => {
    expect(rainAhead([sample(9, 90), sample(19, 90)], START, NOW)).toBeNull()
  })

  it('is null when nothing is likely, and when no hour carried a chance', () => {
    expect(rainAhead([sample(10, 49), sample(11, 0)], START, NOW)).toBeNull()
    expect(rainAhead([sample(10, null), sample(11, null)], START, NOW)).toBeNull()
  })
})
