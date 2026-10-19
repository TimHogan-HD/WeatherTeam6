import { describe, expect, it } from 'vitest'
import type { HourlyReading, HourlySample, HourlySeries, ReadingsDay } from '@weatherteam6/types'
import { SCORE_BAR_HOURS, scoreBarWindow } from './scoreBars.js'

const OFFSET = -5 * 3600
const H = 3_600_000
// Local midnight on 9/28 is 05:00Z; the series runs three days from there.
const START = Date.parse('2026-09-28T05:00:00Z')
const at = (hour: number) => new Date(START + hour * H).toISOString()
const dateOf = (hour: number) => (hour < 24 ? '2026-09-28' : hour < 48 ? '2026-09-29' : '2026-09-30')

const sample = (hour: number, over: Partial<HourlySample> = {}) =>
  ({ valid_at: at(hour), local_date: dateOf(hour), precip_chance_pct: 5, ...over }) as HourlySample

const reading = (hour: number, score: number | null): HourlyReading => ({
  valid_at: at(hour),
  rock: { level: 'dry', qualified: true },
  friction: { level: 'great', condensing: false, qualified: true },
  score,
  t_surface_c: 18,
  condensation_margin_c: 6,
})

const series = (opts: { readings?: HourlyReading[]; days?: ReadingsDay[]; hours?: HourlySample[] } = {}) =>
  ({
    utc_offset_seconds: OFFSET,
    hours: opts.hours ?? Array.from({ length: 72 }, (_, i) => sample(i)),
    readings: {
      model: 'gfs_seamless',
      unavailable_reason: null,
      hours: opts.readings ?? Array.from({ length: 72 }, (_, i) => reading(i, 80)),
      days: opts.days ?? [],
    },
  }) as unknown as HourlySeries

const clear = { severeAlertEvent: null, alertsPending: false }
// 14:40 local on 9/28.
const NOW = START + 14 * H + 40 * 60_000

describe('scoreBarWindow', () => {
  it('runs 36 hours from the hour now is in', () => {
    const w = scoreBarWindow(series(), NOW, clear)!
    expect(w.hours).toHaveLength(SCORE_BAR_HOURS)
    expect(w.hours[0]!.ms).toBe(START + 14 * H)
    expect(w.hours.at(-1)!.ms).toBe(START + 49 * H)
  })

  it('joins readings on the instant, so a missing reading is a stub, never a neighbour’s score', () => {
    const readings = Array.from({ length: 72 }, (_, i) => reading(i, i)).filter((r) => r.valid_at !== at(16))
    const w = scoreBarWindow(series({ readings }), NOW, clear)!
    expect(w.hours[1]!.score).toBe(15)
    expect(w.hours[2]!.score).toBeNull()
    expect(w.hours[3]!.score).toBe(17)
  })

  it('withholds every score under a Severe+ alert and keeps the dryness and the rain', () => {
    const w = scoreBarWindow(series(), NOW, { severeAlertEvent: 'Flood Warning', alertsPending: false })!
    expect(w.hours.every((h) => h.score === null && h.withheldByAlert)).toBe(true)
    expect(w.hours[0]!.dryness).toBe('Dry')
    expect(w.hours[0]!.chancePct).toBe(5)
  })

  it('withholds every score while alerts load, without claiming an alert', () => {
    const w = scoreBarWindow(series(), NOW, { severeAlertEvent: null, alertsPending: true })!
    expect(w.hours.every((h) => h.score === null && !h.withheldByAlert)).toBe(true)
  })

  it('marks an hour as likely rain at 50% and not below, and an unknown chance as neither', () => {
    const hours = Array.from({ length: 72 }, (_, i) =>
      sample(i, { precip_chance_pct: i === 14 ? 50 : i === 15 ? 49 : i === 16 ? null : 5 }),
    )
    const w = scoreBarWindow(series({ hours }), NOW, clear)!
    expect(w.hours.slice(0, 3).map((h) => h.rainLikely)).toEqual([true, false, false])
    expect(w.hours[2]!.chancePct).toBeNull()
  })

  it('lists a best run only when it starts in the span and its score survives suppression', () => {
    const window = (from: number, to: number) => ({ from: at(from), to: at(to), hours: 3, min_score: 70, qualified: true })
    const days = [
      // Today's run started at 10:00, before the bars do.
      { local_date: '2026-09-28', window: window(10, 12), best: reading(12, 70) },
      { local_date: '2026-09-29', window: window(24 + 11, 24 + 13), best: reading(24 + 13, 91) },
      { local_date: '2026-09-30', window: window(48 + 11, 48 + 13), best: reading(48 + 13, 88) },
    ] as ReadingsDay[]
    const w = scoreBarWindow(series({ days }), NOW, clear)!
    expect(w.best).toEqual([
      { local_date: '2026-09-29', fromMs: START + 35 * H, toMs: START + 37 * H, score: 91 },
    ])
    expect(scoreBarWindow(series({ days }), NOW, { severeAlertEvent: 'Flood Warning', alertsPending: false })!.best).toEqual([])
  })

  it('is null when the series has no hour in the span', () => {
    expect(scoreBarWindow(series({ hours: [] }), NOW, clear)).toBeNull()
  })
})
