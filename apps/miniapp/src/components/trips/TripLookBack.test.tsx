import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TripDayForecast, TripDayLookBack } from '@weatherteam6/types'
import { GAUGE_SOURCE, LOOK_BACK_SOURCE, TripLookBackView, gaugeLine } from './TripLookBack.js'

const settled = <T,>(data: T) => ({ data, isPending: false, isError: false, refetch: () => {} })

const said = (recorded_at: string, lead_days: number, score: number): TripDayForecast => ({
  recorded_at,
  lead_days,
  score,
  dryness: 'dry',
  precip_mm_mean: 0,
  members_wet: 0,
  member_count: 50,
})

function view(days: TripDayLookBack[]): string {
  return renderToStaticMarkup(<TripLookBackView summary={settled(days)} trend={settled({ points: [], days: null })} />)
}

describe('TripLookBackView', () => {
  it('sets what the day turned out beside what was said first and last', () => {
    const html = view([
      {
        local_date: '2026-10-10',
        outcome: { score: 40, dryness: 'drying', rain_mm: 1.27, temp_c_max: 10, temp_c_min: 2 },
        first: said('2026-10-04T12:00:00Z', 6, 88),
        last: said('2026-10-09T12:00:00Z', 1, 61),
      },
    ])
    expect(html).toContain('Said first')
    expect(html).toContain('Dry · 88')
    expect(html).toContain('6 days out')
    expect(html).toContain('Said last')
    expect(html).toContain('Dry · 61')
    expect(html).toContain('score 40 · 0.05 in · high 50° · low 36°')
  })

  it('draws one recording once, and a day with nothing recorded as not recorded', () => {
    const once = said('2026-10-09T12:00:00Z', 1, 70)
    const html = view([
      { local_date: '2026-10-10', outcome: null, first: once, last: once },
    ])
    expect(html).toContain('Said first')
    expect(html).not.toContain('Said last')
    expect(html).toContain('Not recorded')
  })

  it('prints the gauge day under the columns, and nothing for a day without one', () => {
    const html = view([
      {
        local_date: '2026-10-10',
        outcome: null,
        first: null,
        last: null,
        gauge: { station: 'DLL', distance_km: 13.2, rain_mm: 6.35, hours_reported: 24, hours_expected: 24 },
      },
      { local_date: '2026-10-11', outcome: null, first: null, last: null, gauge: null },
      // An older API: no field at all.
      { local_date: '2026-10-12', outcome: null, first: null, last: null },
    ])
    expect(html).toContain('Rain gauge at DLL, 8 mi away: 0.25 in')
    expect(html.match(/Rain gauge at/g)).toHaveLength(1)
    expect(html).toContain(GAUGE_SOURCE)
  })

  it('does not explain a gauge line on a trip that has none', () => {
    const html = view([{ local_date: '2026-10-10', outcome: null, first: null, last: null, gauge: null }])
    expect(html).toContain(LOOK_BACK_SOURCE)
    expect(html).not.toContain(GAUGE_SOURCE)
  })
})

describe('gaugeLine', () => {
  const g = { station: 'DLL', distance_km: 13.2, hours_reported: 24, hours_expected: 24 }

  it('says a short day was short rather than printing a total that may have missed the rain', () => {
    expect(gaugeLine({ ...g, rain_mm: null, hours_reported: 19 })).toBe('Rain gauge at DLL, 8 mi away: not every hour reported')
  })

  it('prints a measured dry day as 0 in, and nothing at all without a gauge', () => {
    expect(gaugeLine({ ...g, rain_mm: 0 })).toBe('Rain gauge at DLL, 8 mi away: 0 in')
    expect(gaugeLine(null)).toBeNull()
    expect(gaugeLine(undefined)).toBeNull()
  })

  it('never says a gauge is 0 mi away', () => {
    expect(gaugeLine({ ...g, distance_km: 0.4, rain_mm: 0 })).toContain('1 mi away')
  })
})
