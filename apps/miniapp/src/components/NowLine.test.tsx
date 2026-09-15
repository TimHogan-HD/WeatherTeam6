import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ForecastSnapshot, HourlySample } from '@weatherteam6/types'
import { NowLine } from './NowLine.js'

/**
 * The now-line replaced a 36px hero that showed a daily *maximum* as the
 * largest number on the screen. These assertions are about it not quietly
 * recreating that.
 */

const DATE = '2026-09-15'

const today: ForecastSnapshot = {
  id: 'snap',
  location_id: 'loc',
  captured_at: `${DATE}T00:00:00.000Z`,
  forecast_date: DATE,
  precip_mm_p10: 0,
  precip_mm_p50: 0,
  precip_mm_p90: 0,
  temp_c_min: 26,
  temp_c_max: 39.5,
  wind_kmh_max: 34,
  humidity_pct: 17,
  model_sources: ['gfs_seamless'],
  created_at: `${DATE}T00:00:00.000Z`,
  is_today: true,
  score: 80,
  confidence: 'high',
}

function hour(over: Partial<HourlySample> = {}): HourlySample {
  return {
    valid_at: `${DATE}T18:00:00.000Z`,
    local_date: DATE,
    temp_c: 31,
    dewpoint_c: null,
    humidity_pct: 22,
    precip_mm: null,
    wind_kmh: 14,
    wind_gust_kmh: null,
    wind_dir_deg: null,
    cloud_pct: 15,
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

describe('NowLine', () => {
  it('labels the high and low even when there is no current reading', () => {
    // **The case that matters.** With no hour, an unlabelled pair leaves
    // `103°F  79°F` alone at the top of the screen, `temp_c_max` first, in the
    // slot the hero used to occupy — the exact §3 error this component exists
    // to prevent, distinguished only by opacity.
    const html = renderToStaticMarkup(
      <NowLine hour={null} today={today} severeAlertEvent={null} alertsPending={false} showScore />,
    )
    expect(html).toContain('High')
    expect(html).toContain('Low')
    expect(html).toContain('103°F')
    expect(html).toContain('79°F')
  })

  it('shows the current hour as the reading, distinct from the day’s high', () => {
    const html = renderToStaticMarkup(
      <NowLine
        hour={hour()}
        today={today}
        severeAlertEvent={null}
        alertsPending={false}
        showScore
      />,
    )
    // 31 °C now against a 39.5 °C high — two different numbers, which is the
    // whole reason this component reads the hourly run.
    expect(html).toContain('88°F')
    expect(html).toContain('103°F')
  })

  it('holds the score chip until the alerts query settles', () => {
    // `severeAlertEvent` is null for a pending query exactly as for "no severe
    // alert", and the banner renders nothing in that window — so a location
    // under a warning would flash a lime score with nothing above it.
    const pending = renderToStaticMarkup(
      <NowLine hour={hour()} today={today} severeAlertEvent={null} alertsPending showScore />,
    )
    expect(pending).not.toContain('>80<')

    const settled = renderToStaticMarkup(
      <NowLine
        hour={hour()}
        today={today}
        severeAlertEvent={null}
        alertsPending={false}
        showScore
      />,
    )
    expect(settled).toContain('>80<')
  })

  it('drops the chip entirely under a severe alert', () => {
    const html = renderToStaticMarkup(
      <NowLine
        hour={hour()}
        today={today}
        severeAlertEvent="Excessive Heat Warning"
        alertsPending={false}
        showScore
      />,
    )
    expect(html).not.toContain('>80<')
  })

  it('shows no score at all for a location that has none', () => {
    const html = renderToStaticMarkup(
      <NowLine
        hour={hour()}
        today={today}
        severeAlertEvent={null}
        alertsPending={false}
        showScore={false}
      />,
    )
    expect(html).not.toContain('>80<')
  })

  it('omits a missing reading rather than rendering it as a plausible zero', () => {
    const html = renderToStaticMarkup(
      <NowLine
        hour={hour({ temp_c: null, wind_kmh: null, humidity_pct: null, cloud_pct: null })}
        today={today}
        severeAlertEvent={null}
        alertsPending={false}
        showScore
      />,
    )
    expect(html).not.toContain('32°F')
    expect(html).not.toContain('0 mph')
    expect(html).not.toContain('RH 0%')
  })
})
