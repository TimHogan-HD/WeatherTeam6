import { describe, expect, it } from 'vitest'
import type { RecentPrecip, RecentPrecipHour } from '@weatherteam6/types'
import {
  eventSpan,
  formatSince,
  intensityOf,
  precipDays,
  precipEvents,
  precipSummary,
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
    // Newest first.
    expect(events.map((e) => [e.startLocal, e.endLocal, e.wetHours])).toEqual([
      ['2026-09-22T14:00', '2026-09-22T15:00', 1],
      ['2026-09-22T09:00', '2026-09-22T12:00', 2],
    ])
    expect(events[1]?.totalMm).toBe(3)
    expect(events[1]?.peakMmPerHour).toBe(2)
  })

  it('measures the lull by the stamps, so missing hours count like dry ones', () => {
    // The API drops a null hour: two wet stamps three hours apart are two events.
    const events = precipEvents([h('2026-09-22T10:00', 1), h('2026-09-22T13:00', 1)])
    expect(events).toHaveLength(2)
  })

  it('names rain, snow and a mix, and withholds the kind when any hour is unknown', () => {
    expect(precipEvents([h('2026-09-22T10:00', 1)])[0]?.kind).toBe('rain')
    expect(precipEvents([h('2026-09-22T10:00', 1, { rain_mm: 0, snowfall_cm: 1.4 })])[0]?.kind).toBe('snow')
    expect(
      precipEvents([h('2026-09-22T10:00', 1), h('2026-09-22T11:00', 1, { rain_mm: 0, snowfall_cm: 1 })])[0]?.kind,
    ).toBe('mix')
    // One hour inside the hour both kinds fell.
    expect(precipEvents([h('2026-09-22T10:00', 1, { rain_mm: 0.5, snowfall_cm: 0.3 })])[0]?.kind).toBe('mix')
    // A response from an API that predates the fields: unknown, never rain.
    const legacy: RecentPrecipHour = { valid_at_local: '2026-09-22T10:00', precip_mm: 1 }
    expect(precipEvents([legacy])[0]?.kind).toBeNull()
    expect(precipEvents([legacy])[0]?.snowCm).toBeNull()
  })
})

describe('precipDays', () => {
  it('keeps a skipped date as a gap rather than a dry day', () => {
    const days = precipDays([h('2026-09-20T12:00', 0), h('2026-09-22T12:00', 1.5)])
    expect(days).toEqual([
      { localDate: '2026-09-20', totalMm: 0, kind: null },
      { localDate: '2026-09-21', totalMm: null, kind: null },
      { localDate: '2026-09-22', totalMm: 1.5, kind: 'rain' },
    ])
  })

  it('returns nothing for an empty window', () => {
    expect(precipDays([])).toEqual([])
  })
})

describe('precipSummary', () => {
  const recent: RecentPrecip = {
    hours: [h('2026-09-27T19:00', 0.4), h('2026-09-27T20:00', 1.1), h('2026-09-27T21:00', 0), h('2026-09-28T09:00', 0)],
    // UTC-6: 15:00Z is 09:00 on the location's clock.
    utc_offset_seconds: -6 * 3600,
    from_date: '2026-09-22',
  }

  it('measures hours since the last wet hour on the location clock, not the viewer’s', () => {
    const s = precipSummary(recent, Date.UTC(2026, 8, 28, 15, 0))
    expect(s.lastWet?.valid_at_local).toBe('2026-09-27T20:00')
    // 20:00 → 09:00 the next day. Read in UTC it would be 19 hours.
    expect(s.hoursSinceLast).toBe(13)
    expect(s.wettest?.precip_mm).toBe(1.1)
    expect(s.wetHours).toBe(2)
    expect(s.endingLocal).toBe('2026-09-28T09:00')
  })

  it('reports no last hour, not a zero, when nothing fell', () => {
    const s = precipSummary({ ...recent, hours: [h('2026-09-28T09:00', 0)] }, Date.UTC(2026, 8, 28, 15))
    expect(s.lastWet).toBeNull()
    expect(s.hoursSinceLast).toBeNull()
    expect(s.wettest).toBeNull()
  })
})

describe('formatting', () => {
  it('spans midnight with both days named', () => {
    const [e] = precipEvents([h('2026-09-26T23:00', 1), h('2026-09-27T00:00', 1), h('2026-09-27T02:00', 1)])
    expect(e === undefined ? '' : eventSpan(e)).toBe('Sat 22:00–Sun 02:00')
  })

  it('classifies intensity at the AMS edges', () => {
    expect(intensityOf(2.4)).toBe('Light')
    expect(intensityOf(2.5)).toBe('Moderate')
    expect(intensityOf(7.6)).toBe('Moderate')
    expect(intensityOf(7.7)).toBe('Heavy')
  })

  it('switches to days at 48 hours', () => {
    expect(formatSince(47)).toBe('47h')
    expect(formatSince(52)).toBe('2d 4h')
  })
})
