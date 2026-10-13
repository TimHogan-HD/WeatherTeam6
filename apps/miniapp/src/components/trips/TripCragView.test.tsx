import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { OutlookDay, TripDayTrend, TripOutlook, TripTrendPoint } from '@weatherteam6/types'
import { renderInRouter } from '../../test/renderInRouter.js'
import { TripCragView, TrendCard } from './TripCragView.js'
import { TripDayTrendChart } from './TripDayTrendChart.js'
import { TripTrendChart } from './TripTrendChart.js'

const settled = <T,>(data: T) => ({ data, isPending: false, isError: false, refetch: () => {} })

function day(local_date: string): OutlookDay {
  return {
    local_date,
    is_today: false,
    temp_c_max: 16,
    temp_c_min: 8,
    precip_mm_mean: 0.5,
    members_wet: 9,
    member_count: 50,
    models: ['gfs_seamless'],
  }
}

const DATES = ['2026-10-08', '2026-10-09', '2026-10-10']
const base = { locationId: 'loc', trip_days: 3 }

function view(outlook: TripOutlook, trend: readonly TripTrendPoint[] = [], days: readonly TripDayTrend[] | null = null): string {
  return renderInRouter(
    <TripCragView
      locationId="loc"
      startDate="2026-10-08"
      dates={DATES}
      today="2026-10-02"
      outlook={settled(outlook)}
      readings={null}
      isCrag
      scoresFailed={null}
      trend={settled({ points: trend, days })}
    />,
  )
}

describe('TripCragView — the outlook states', () => {
  it('says a failed outlook could not be loaded, and an empty one is not in range yet', () => {
    const failed = view({ ...base, utc_offset_seconds: null, days: null, rain_total: null, high_c_range: null })
    expect(failed).toContain('Couldn&#x27;t load the forecast for this crag.')
    expect(failed).not.toContain('Forecast opens')

    const notYet = renderInRouter(
      <TripCragView
        locationId="loc"
        startDate="2026-10-30"
        dates={['2026-10-30']}
        today="2026-10-02"
        outlook={settled<TripOutlook>({ ...base, utc_offset_seconds: 0, days: [], rain_total: null, high_c_range: null })}
        readings={null}
        isCrag
        scoresFailed={null}
        trend={settled({ points: [], days: null })}
      />,
    )
    expect(notYet).toContain('Forecast opens 15 Oct.')
    expect(notYet).not.toContain('Couldn&#x27;t load')
  })

  it('shows how much of the trip the total covers, and an empty trend honestly', () => {
    const html = view({
      ...base,
      utc_offset_seconds: 0,
      days: DATES.slice(0, 2).map(day),
      rain_total: { mean_mm: 4.572, p10_mm: 1, p90_mm: 10, member_count: 50, days_covered: 2 },
      high_c_range: { min: 16, max: 16 },
    })
    expect(html).toContain('2 of 3 days')
    expect(html).toContain('0.18 in')
    expect(html).toContain('Agreement 82%')
    expect(html).toContain('Trend starts after the next forecast update.')
  })
})

describe('TripTrendChart', () => {
  it('draws a total over part of the trip hollow, and a whole-trip total filled', () => {
    const point = (recorded_at: string, days_covered: number): TripTrendPoint => ({
      recorded_at,
      mean_mm: 5,
      p10_mm: 1,
      p90_mm: 9,
      days_covered,
      trip_days: 3,
      high_c_max: 15,
    })
    const html = renderToStaticMarkup(
      <TripTrendChart points={[point('2026-10-01T12:00:00Z', 2), point('2026-10-02T12:00:00Z', 3)]} />,
    )
    const rects = html.match(/<rect[^>]*>/g) ?? []
    expect(rects).toHaveLength(2)
    expect(rects[0]).toContain('data-partial="true"')
    expect(rects[0]).toContain('fill="none"')
    expect(rects[1]).not.toContain('data-partial')
    expect(rects[1]).not.toContain('fill="none"')
    expect(html).toContain('Hollow bars cover part of the trip.')
  })
})

const point = (recorded_at: string, mean_mm: number, high_c_max: number): TripTrendPoint => ({
  recorded_at,
  mean_mm,
  p10_mm: 0,
  p90_mm: mean_mm * 2,
  days_covered: 3,
  trip_days: 3,
  high_c_max,
})

const at = (recorded_at: string, precip_mm_mean: number | null, temp_c_max: number | null) => ({
  recorded_at,
  precip_mm_mean,
  temp_c_max,
})

const DAYS: TripDayTrend[] = [
  { local_date: '2026-10-16', first: at('2026-10-04T12:00:00Z', 2.032, 11.5), last: at('2026-10-13T12:00:00Z', 0.508, 10) },
  { local_date: '2026-10-17', first: at('2026-10-04T12:00:00Z', 2.54, 12.2), last: at('2026-10-13T12:00:00Z', 0, 13.9) },
  { local_date: '2026-10-18', first: null, last: null },
]

describe('TrendCard', () => {
  const card = (days: readonly TripDayTrend[] | null) =>
    renderToStaticMarkup(
      <TrendCard trend={settled({ points: [point('2026-10-04T12:00:00Z', 6, 12), point('2026-10-13T12:00:00Z', 0.5, 14)], days })} />,
    )

  it('opens on the by-day view, saying which two forecasts it compares', () => {
    const html = card(DAYS)
    expect(html).toMatch(/aria-pressed="true"[^>]*>By day</)
    expect(html).toMatch(/aria-pressed="false"[^>]*>Whole trip</)
    expect(html).toContain('Each trip day: the first forecast (4 Oct) against the latest (13 Oct).')
    expect(html).toContain('Rain, 4 Oct')
    expect(html).not.toContain('Forecast made on')
  })

  it('names no latest date on a trip whose days were last recorded on different days', () => {
    const ended: TripDayTrend[] = [
      { local_date: '2026-10-16', first: at('2026-10-04T12:00:00Z', 2, 11), last: at('2026-10-16T12:00:00Z', 0.5, 10) },
      { local_date: '2026-10-17', first: at('2026-10-04T12:00:00Z', 2, 11), last: at('2026-10-17T12:00:00Z', 0, 12) },
    ]
    const html = card(ended)
    expect(html).toContain('the first forecast (4 Oct) against its latest.')
    expect(html).toContain('Rain, latest')
    expect(html).not.toContain('17 Oct')
  })

  it('shows only the whole-trip chart, labelled, when the API sends no days', () => {
    const html = card(null)
    expect(html).not.toContain('aria-pressed')
    expect(html).toContain('What each forecast update said about the whole trip.')
    expect(html).toContain('Forecast made on →')
  })

  it('keeps the by-day view when the trip has days but no total yet', () => {
    const html = renderToStaticMarkup(<TrendCard trend={settled({ points: [], days: DAYS })} />)
    expect(html).not.toContain('Trend starts after the next forecast update.')
    expect(html).toContain('Fri 16')
  })
})

describe('TripDayTrendChart', () => {
  it('draws both forecasts where a day has two, and states the change under it', () => {
    const html = renderToStaticMarkup(<TripDayTrendChart days={DAYS} />)
    expect(html.match(/data-mark="first-rain"/g)).toHaveLength(2)
    expect(html.match(/data-mark="last-rain"/g)).toHaveLength(2)
    expect(html).toContain('−0.06 in · −3°')
    expect(html).toContain('−0.10 in · +3°')
    expect(html).toContain('No forecast yet')
  })

  it('draws one forecast alone with no change, and leaves a missing figure unmarked', () => {
    const once = at('2026-10-13T12:00:00Z', null, 15)
    const html = renderToStaticMarkup(
      <TripDayTrendChart days={[{ local_date: '2026-10-16', first: once, last: once }]} />,
    )
    expect(html).not.toContain('data-mark="first-rain"')
    expect(html).not.toContain('data-mark="first-high"')
    // No rain figure: no bar at all, not a zero-height one that reads as dry.
    expect(html).not.toContain('data-mark="last-rain"')
    expect(html).toContain('data-mark="last-high"')
    expect(html).toContain('one forecast so far')
    expect(html).not.toMatch(/[+−]\d/)
  })
})
