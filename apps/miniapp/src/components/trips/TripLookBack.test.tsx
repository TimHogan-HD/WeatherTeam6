import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TripDayForecast, TripDayLookBack } from '@weatherteam6/types'
import { GAUGE_SOURCE, LOOK_BACK_SOURCE, TripLookBackView, checkInState, gaugeLine } from './TripLookBack.js'

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
  return renderToStaticMarkup(
    <TripLookBackView summary={settled(days)} trend={settled({ points: [], days: null })} nowMs={Date.now()} />,
  )
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

  it('prints a volunteer report with its morning-to-morning window, and explains it', () => {
    const html = view([
      {
        local_date: '2026-10-29',
        outcome: null,
        first: null,
        last: null,
        gauge: null,
        volunteer_gauge: {
          station: 'WI-PC-38',
          name: 'Hager City 1.8 WNW',
          distance_km: 6.1,
          rain_mm: 10.67,
          report_date: '2026-10-30',
          obs_hour: 7,
        },
      },
      { local_date: '2026-10-30', outcome: null, first: null, last: null, volunteer_gauge: null },
    ])
    expect(html).toContain('Volunteer gauge at Hager City 1.8 WNW, 4 mi away: 0.42 in, 7 am 29 Oct – 7 am 30 Oct')
    expect(html.match(/Volunteer gauge at/g)).toHaveLength(1)
    expect(html).toContain(GAUGE_SOURCE)
  })

  it('does not explain a gauge line on a trip that has none', () => {
    const html = view([{ local_date: '2026-10-10', outcome: null, first: null, last: null, gauge: null }])
    expect(html).toContain(LOOK_BACK_SOURCE)
    expect(html).not.toContain(GAUGE_SOURCE)
  })
})

describe('check-in', () => {
  const now = new Date(2026, 10, 3, 12, 0).getTime()
  const day = (local_date: string, checked_in?: boolean): TripDayLookBack => ({
    local_date,
    outcome: null,
    first: null,
    last: null,
    ...(checked_in === undefined ? {} : { checked_in }),
  })
  const render = (days: TripDayLookBack[], onCheckIn?: (d: string) => void) =>
    renderToStaticMarkup(
      <TripLookBackView summary={settled(days)} trend={settled({ points: [], days: null })} onCheckIn={onCheckIn} nowMs={now} />,
    )

  it('asks about a day not yet checked in, and says so of one that was', () => {
    const html = render([day('2026-10-24', false), day('2026-10-25', true)], () => {})
    expect(html.match(/How was it\?/g)).toHaveLength(1)
    expect(html).toContain('You checked this day in')
  })

  it('still asks when an older API sent no checked_in', () => {
    expect(checkInState(day('2026-10-24'), now)).toBe('open')
  })

  it('stops asking once the day is past the limit a check can be dated', () => {
    expect(checkInState(day('2026-09-03', false), now)).toBe('closed')
    expect(render([day('2026-09-03', false)], () => {})).not.toContain('How was it?')
  })

  it('offers nothing without a handler: a city on a trip has no check', () => {
    const html = render([day('2026-10-24', false)])
    expect(html).not.toContain('How was it?')
    expect(html).not.toContain('checked this day in')
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
