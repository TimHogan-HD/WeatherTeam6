import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { HourlyDay, HourlySample, HourlySeries } from '@weatherteam6/types'
import { DayCharts, stepDay } from './DayCharts.js'
import { HOUR_MS } from './hourlySeries.js'

/**
 * The day view's **headers and domains**, which is where its claims live.
 *
 * There was no test file here at all until a review found two defects in this
 * component that a green suite could not see — a day with no rain data reading
 * "none", and a peak-hour percentage printed as if it were the day's. Both were
 * one assertion away.
 */

const T0 = Date.UTC(2026, 8, 15, 0)
const DAY_1 = '2026-09-15'
const DAY_2 = '2026-09-16'
const DAY_3 = '2026-09-17'

function hour(index: number, localDate: string, over: Partial<HourlySample> = {}): HourlySample {
  return {
    valid_at: new Date(T0 + index * HOUR_MS).toISOString(),
    local_date: localDate,
    temp_c: null,
    dewpoint_c: null,
    humidity_pct: null,
    precip_mm: null,
    wind_kmh: null,
    wind_gust_kmh: 20,
    wind_dir_deg: null,
    cloud_pct: null,
    pressure_hpa: null,
    temp_c_p10: 12,
    temp_c_p50: 15,
    temp_c_p90: 19,
    wind_kmh_p10: null,
    wind_kmh_p50: 8,
    wind_kmh_p90: null,
    precip_mm_mean: 0.4,
    precip_chance_pct: 30,
    member_count: 143,
    ...over,
  }
}

function day(local_date: string, has_ensemble = true): HourlyDay {
  return { local_date, has_deterministic: true, has_ensemble }
}

function series(hours: HourlySample[], days: HourlyDay[] = [day(DAY_1)]): HourlySeries {
  return {
    location_id: 'loc',
    utc_offset_seconds: 0,
    fetched_at: new Date(T0).toISOString(),
    model: 'gfs_seamless',
    unavailable_models: [],
    hours,
    days,
  }
}

function render(s: HourlySeries, date = DAY_1): string {
  return renderToStaticMarkup(
    <DayCharts series={s} selectedDate={date} onSelectDate={() => {}} />,
  )
}

const fullDay = Array.from({ length: 24 }, (_, i) => hour(i, DAY_1))

describe('DayCharts headers', () => {
  it('states the day’s temperature range, not the band around it', () => {
    // The axis edges are the *scale* — for these bars, a floor under the coldest
    // p10. The header is the only place the forecast range appears.
    expect(render(series(fullDay))).toContain('59°F')
  })

  it('totals the rain from the hours that have a reading', () => {
    // 24 hours at 0.4 mm is 9.6 mm, which is 0.38 in.
    expect(render(series(fullDay))).toContain('0.38 in')
  })

  it('says nothing about rainfall when no hour carries any', () => {
    // **The defect this replaces.** `?? 0` across an all-null day summed to
    // zero, and the header printed "none" — a forecast of a dry day — directly
    // beside the block's own "no hourly rainfall for this day". "Dry" and
    // "unknown" are different answers.
    const dry = fullDay.map((h) => ({ ...h, precip_mm_mean: null }))
    const html = render(series(dry))
    expect(html).toContain('No hourly rainfall for this day.')
    expect(html).not.toContain('>none<')
  })

  it('counts only the measured hours when coverage is partial', () => {
    // Two hours at 0.4 mm is 0.8 mm = 0.03 in. The 22 null hours contribute
    // nothing rather than reading as measured zeroes.
    const partial = fullDay.map((h, i) => (i < 2 ? h : { ...h, precip_mm_mean: null }))
    expect(render(series(partial))).toContain('0.03 in')
  })

  it('labels the chance figure as a peak, not as the day’s chance', () => {
    // A bare "70%" beside "Chance of rain" reads as the day's chance when it is
    // one hour's. Its siblings are labelled ("gusts 21 mph", a total), so this
    // one was the odd figure out.
    const spike = fullDay.map((h, i) => ({ ...h, precip_chance_pct: i === 12 ? 70 : 5 }))
    expect(render(series(spike))).toContain('peak 70%')
  })

  it('labels the wind figure as gusts, which is what it reads', () => {
    expect(render(series(fullDay))).toContain('gusts 12 mph')
  })

  it('withholds a header figure rather than inventing one when a series is empty', () => {
    const noWind = fullDay.map((h) => ({ ...h, wind_kmh_p50: null, wind_gust_kmh: null }))
    const html = render(series(noWind))
    expect(html).toContain('No hourly wind for this day.')
    expect(html).not.toContain('>gusts')
  })
})

describe('DayCharts pager', () => {
  const week = [day(DAY_1), day(DAY_2, false), day(DAY_3)]

  it('skips a day the ensemble never reached', () => {
    expect(stepDay(week, DAY_1, 1)).toBe(DAY_3)
    expect(stepDay(week, DAY_3, -1)).toBe(DAY_1)
  })

  it('stops at the ends rather than wrapping', () => {
    expect(stepDay(week, DAY_3, 1)).toBeNull()
    expect(stepDay(week, DAY_1, -1)).toBeNull()
  })

  it('walks in from the matching end when the day has left the window', () => {
    // The window rolls forward as runs are collected, so a date in route state
    // can drop out of `days[]`. Both arrows dead is a screen with no way off it.
    expect(stepDay(week, '2026-09-01', 1)).toBe(DAY_1)
    expect(stepDay(week, '2026-09-01', -1)).toBe(DAY_3)
  })

  it('names how far out the open day is, counted from the window’s own first day', () => {
    const html = render(series(fullDay, week), DAY_1)
    expect(html).toContain('today')
  })
})
