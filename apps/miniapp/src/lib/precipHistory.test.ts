import { describe, expect, it } from 'vitest'
import type { RecentPrecipHour } from '@weatherteam6/types'
import {
  dayLabel,
  formatSince,
  hourGrid,
  hourKind,
  precipDays,
  precipEvents,
  precipSummary,
  runningTotal,
} from './precipHistory.js'

function h(at: string, mm: number, over: Partial<RecentPrecipHour> = {}): RecentPrecipHour {
  return { valid_at_local: at, precip_mm: mm, rain_mm: mm, snowfall_cm: 0, ...over }
}

describe('precipEvents', () => {
  it('merges across a one-hour lull and splits across two dry hours', () => {
    const events = precipEvents([
      h('2026-09-22T10:00', 1),
      h('2026-09-22T11:00', 0),
      h('2026-09-22T12:00', 2),
      h('2026-09-22T13:00', 0),
      h('2026-09-22T14:00', 0),
      h('2026-09-22T15:00', 0.5),
    ])
    // Newest first; a span runs from an hour before the first stamp.
    expect(events.map((e) => [e.startLocal, e.endLocal, e.spanHours])).toEqual([
      ['2026-09-22T14:00', '2026-09-22T15:00', 1],
      ['2026-09-22T09:00', '2026-09-22T12:00', 3],
    ])
    expect(events[1]?.totalMm).toBe(3)
  })

  it('measures the lull by the stamps, so missing hours count like dry ones', () => {
    // The API drops a null hour: two wet stamps three hours apart are two events.
    expect(precipEvents([h('2026-09-22T10:00', 1), h('2026-09-22T13:00', 1)])).toHaveLength(2)
  })

  it('names rain, snow and a mix, and withholds the kind when any hour is unknown', () => {
    expect(precipEvents([h('2026-09-22T10:00', 1)])[0]?.kind).toBe('rain')
    expect(precipEvents([h('2026-09-22T10:00', 1, { rain_mm: 0, snowfall_cm: 1.4 })])[0]?.kind).toBe('snow')
    expect(
      precipEvents([h('2026-09-22T10:00', 1), h('2026-09-22T11:00', 1, { rain_mm: 0, snowfall_cm: 1 })])[0]?.kind,
    ).toBe('mix')
    // A response from an API that predates the fields: unknown, never rain.
    const legacy: RecentPrecipHour = { valid_at_local: '2026-09-22T10:00', precip_mm: 1 }
    expect(precipEvents([legacy])[0]?.kind).toBeNull()
    expect(hourKind(legacy)).toBeNull()
  })
})

describe('precipDays', () => {
  it('keeps a skipped date as a gap rather than a dry day', () => {
    expect(precipDays([h('2026-09-20T12:00', 0), h('2026-09-22T12:00', 1.5)])).toEqual([
      { localDate: '2026-09-20', totalMm: 0 },
      { localDate: '2026-09-21', totalMm: null },
      { localDate: '2026-09-22', totalMm: 1.5 },
    ])
  })

  it('returns nothing for an empty window', () => {
    expect(precipDays([])).toEqual([])
  })
})

describe('hourGrid', () => {
  it('lays each date out as 24 stamps, telling a skipped hour from one still to come', () => {
    const hours = [h('2026-09-22T00:00', 0), h('2026-09-22T02:00', 1.2), h('2026-09-22T03:00', 0)]
    const [row] = hourGrid(precipDays(hours), hours)
    expect(row).toHaveLength(24)
    expect(row?.[0]).toEqual({ state: 'value', hour: hours[0] })
    // 01:00 sits inside the window with no hour behind it: a gap, not dry.
    expect(row?.[1]).toEqual({ state: 'missing' })
    expect(row?.[2]).toEqual({ state: 'value', hour: hours[1] })
    // After the newest stamp the hours have not happened yet.
    expect(row?.[4]).toEqual({ state: 'ahead' })
    expect(row?.[23]).toEqual({ state: 'ahead' })
  })
})

describe('precipSummary', () => {
  // UTC-6: 15:00Z is 09:00 on the location's clock.
  const offset = -6 * 3600
  const now = Date.UTC(2026, 8, 28, 15, 0)

  it('dates the last real rain from the hour that restarts Dryness, not from a trace after it', () => {
    const s = precipSummary(
      {
        hours: [
          h('2026-09-27T18:00', 0.3),
          h('2026-09-27T19:00', 0.6),
          h('2026-09-27T20:00', 0.5),
          h('2026-09-27T21:00', 0.1),
          h('2026-09-27T22:00', 0),
          h('2026-09-28T06:00', 0.2),
          h('2026-09-28T09:00', 0),
        ],
        utc_offset_seconds: offset,
        from_date: '2026-09-22',
      },
      now,
    )
    // 0.5 mm is the line itself, so 20:00 counts; 21:00 and 06:00 do not.
    expect(s.lastReal?.valid_at_local).toBe('2026-09-27T20:00')
    // 20:00 → 09:00 the next day on the location's clock. Read in UTC it would be 19.
    expect(s.hoursSinceReal).toBe(13)
    expect(s.lastRealEvent).toMatchObject({ startLocal: '2026-09-27T17:00', endLocal: '2026-09-27T21:00', spanHours: 4 })
    expect(s.lighterSince.map((x) => x.valid_at_local)).toEqual(['2026-09-27T21:00', '2026-09-28T06:00'])
    expect(s.wetHours).toBe(5)
    expect(s.totalMm).toBeCloseTo(1.7)
    expect(s.endingLocal).toBe('2026-09-28T09:00')
  })

  it('reports no last real rain, not a zero, when only showers fell', () => {
    const s = precipSummary(
      { hours: [h('2026-09-28T06:00', 0.4), h('2026-09-28T09:00', 0)], utc_offset_seconds: offset, from_date: null },
      now,
    )
    expect(s.lastReal).toBeNull()
    expect(s.hoursSinceReal).toBeNull()
    expect(s.lastRealEvent).toBeNull()
    // Every shower counts as "since", because there is no real rain to be since.
    expect(s.lighterSince).toHaveLength(1)
    expect(s.wetHours).toBe(1)
  })
})

describe('runningTotal', () => {
  it('accumulates hour by hour, positioned by where each hour ends, and flags a skipped hour', () => {
    const hours = [h('2026-09-22T01:00', 1), h('2026-09-22T02:00', 0.5), h('2026-09-22T05:00', 2)]
    const { points, spanHours } = runningTotal(precipDays(hours), hours)
    expect(spanHours).toBe(24)
    expect(points.map((p) => [p.at, p.totalMm, p.gapBefore])).toEqual([
      [1, 1, false],
      [2, 1.5, false],
      // 03:00 and 04:00 are missing: not dry, a gap.
      [5, 3.5, true],
    ])
  })

  it('draws nothing for an empty window', () => {
    expect(runningTotal([], [])).toEqual({ points: [], spanHours: 0 })
  })
})

describe('formatting', () => {
  it('switches to days at 48 hours', () => {
    expect(formatSince(47)).toBe('47h')
    expect(formatSince(52)).toBe('2d 4h')
  })

  it('names the location’s own today', () => {
    expect(dayLabel('2026-09-29T13:00', '2026-09-29')).toBe('Today')
    expect(dayLabel('2026-09-28T13:00', '2026-09-29')).toBe('Mon')
  })
})
