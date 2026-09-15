import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { HourlySample, HourlySeries } from '@weatherteam6/types'
import { HourlySection, bandLegend } from './HourlySection.js'
import { HOUR_MS } from './hourlySeries.js'

const T0 = Date.UTC(2026, 8, 14, 0)
const NOW = T0 + 48 * HOUR_MS

function hour(index: number, over: Partial<HourlySample> = {}): HourlySample {
  return {
    valid_at: new Date(T0 + index * HOUR_MS).toISOString(),
    local_date: index < 24 ? '2026-09-14' : '2026-09-15',
    temp_c: null,
    dewpoint_c: null,
    humidity_pct: null,
    precip_mm: null,
    wind_kmh: null,
    wind_gust_kmh: null,
    wind_dir_deg: null,
    cloud_pct: null,
    pressure_hpa: null,
    temp_c_p10: null,
    temp_c_p50: null,
    temp_c_p90: null,
    wind_kmh_p10: null,
    wind_kmh_p50: null,
    wind_kmh_p90: null,
    precip_mm_mean: null,
    precip_mm_p10: null,
    precip_mm_p90: null,
    precip_chance_pct: null,
    member_count: null,
    ...over,
  }
}

function series(hours: HourlySample[], over: Partial<HourlySeries> = {}): HourlySeries {
  return {
    location_id: 'loc',
    utc_offset_seconds: 0,
    fetched_at: new Date(NOW - 42 * 60_000).toISOString(),
    model: 'gfs_seamless',
    unavailable_models: [],
    hours,
    days: [],
    ...over,
  }
}

const warm = Array.from({ length: 48 }, (_, i) =>
  hour(i, { temp_c_p50: 15 + (i % 12), temp_c_p10: 12, temp_c_p90: 20, member_count: 143 }),
)

function render(s: HourlySeries): string {
  return renderToStaticMarkup(<HourlySection series={s} now={NOW} />)
}

describe('HourlySection', () => {
  it('draws no chart, and claims nothing about the forecast, when the ensemble is empty', () => {
    // These charts draw the ensemble. A response with no ensemble columns can still carry
    // a full deterministic hourly forecast — `model` is named right here in the fixture —
    // so "no hourly forecast for this location" would be a claim about the response
    // rather than about what could be drawn.
    const markup = render(series(Array.from({ length: 48 }, (_, i) => hour(i, { temp_c: 14 }))))
    expect(markup).not.toContain('<svg')
    expect(markup).toContain('No hourly temperature from the forecast runs yet.')
    expect(markup).toContain('No hourly rainfall from the forecast runs yet.')
    expect(markup).not.toMatch(/No hourly forecast/)
  })

  it('says a chart is missing rather than dropping it', () => {
    // A section the reader is never shown cannot be noticed as absent, so an
    // undrawn rain chart would read as a forecast of no rain.
    const markup = render(series(warm))
    expect(markup).toContain('>Rain<')
    expect(markup).toContain('No hourly rainfall from the forecast runs yet.')
    expect(markup).not.toContain('aria-label="Hourly rainfall')
  })

  it('does not legend a band it did not draw', () => {
    // Each block legends its own band. The rain block below still draws one, so
    // this asserts on the temperature legend's own wording rather than on the
    // shared phrase — an assertion that fails on a right answer is worse than
    // no assertion.
    const dry = warm.map((h) => ({ ...h, temp_c_p50: null, precip_mm_mean: 1 }))
    const markup = render(series(dry))
    expect(markup).toContain('No hourly temperature from the forecast runs yet.')
    expect(markup).not.toContain('Line: the middle')
  })

  it('calls the rain line an average, not a middle', () => {
    // `precip_mm_mean` is a mean and the band is p10-p90, so the bars are not
    // the centre of their own band: on a day nine runs in ten leave dry, the
    // band lies flat on zero under bars that do not. "The middle" would make
    // that read as a broken chart rather than as the disagreement it is.
    const markup = render(series(warm.map((h, i) => ({ ...h, precip_mm_mean: i === 3 ? 2.2 : 0 }))))
    expect(markup).toContain('Line: the average')
    // Both blocks legend their own band, and the two sentences are not the same.
    expect(markup).toContain('Line: the middle')
  })

  it('shades the rain spread, not only the average', () => {
    // p10 0, p90 4 mm on one hour: a band with a top and a floor. Without the
    // percentiles the chart said "0.4 mm" and nothing about how wrong that
    // could be.
    const spread = warm.map((h, i) =>
      i === 3 ? { ...h, precip_mm_mean: 0.4, precip_mm_p10: 0, precip_mm_p90: 4 } : h,
    )
    const markup = render(series(spread))
    expect(markup).toContain('<path')
  })

  it('draws the rain chart once there is rain data, including a measured zero', () => {
    const wet = warm.map((h, i) => ({ ...h, precip_mm_mean: i === 3 ? 2.2 : 0 }))
    const markup = render(series(wet))
    expect(markup).toContain('>Rain<')
    // A line now, not bars. The measured zeros are what make it a line at all:
    // an hour with no reading breaks the run, an hour measured at zero does not.
    expect(markup).toContain('aria-label="Hourly rainfall')
    expect(markup).toContain('<path')
  })

  it('prints how old the run behind the charts is', () => {
    expect(render(series(warm))).toContain('Forecast fetched 42 min ago')
  })

  it('says nothing about the run age when the run did not carry one', () => {
    // Null means unknown. "Fetched just now" for a run of unknown age is a
    // freshness claim nothing supports.
    const markup = render(series(warm, { fetched_at: null }))
    expect(markup).not.toContain('Forecast fetched')
  })
})

describe('bandLegend', () => {
  it('names the ensemble size when every hour agreed on one', () => {
    expect(bandLegend(143)).toContain('143 forecast runs')
  })

  it('stays silent about the size when the hours disagreed', () => {
    // The far end of the window is reached by fewer members; quoting the
    // largest attributes the whole band to a sample most of it never had.
    expect(bandLegend(null)).toBe('Line: the middle forecast · Band: where 8 in 10 land')
  })

  it('never says p10 or p90 — the locked copy rule allows those only as a legend of last resort', () => {
    expect(bandLegend(143)).not.toMatch(/p10|p50|p90|percentile/i)
  })
})
