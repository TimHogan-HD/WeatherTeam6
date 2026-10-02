import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { OutlookDay, TripOutlook, TripTrendPoint } from '@weatherteam6/types'
import { renderInRouter } from '../../test/renderInRouter.js'
import { TripCragView } from './TripCragView.js'
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

function view(outlook: TripOutlook, trend: readonly TripTrendPoint[] = []): string {
  return renderInRouter(
    <TripCragView
      locationId="loc"
      startDate="2026-10-08"
      dates={DATES}
      today="2026-10-02"
      outlook={settled(outlook)}
      readings={null}
      trend={settled(trend)}
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
        trend={settled([])}
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
