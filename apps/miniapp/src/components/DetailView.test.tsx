import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ConditionsScore, ForecastSnapshot, WeatherAlert } from '@weatherteam6/types'
import { DetailView } from './DetailView.js'
import { todayUtcIso } from '../lib/forecast.js'

/**
 * What the detail screen actually puts on screen, rendered for real.
 *
 * These exist because the defects this project keeps shipping are not type
 * errors — they are a correct-looking screen saying a wrong thing: a null
 * rendered as 32°F, a score presented as a summary of a 103°F day, a
 * rock-drying score on a city. Typecheck and lint pass on all of those.
 */

/**
 * The real current UTC date, not a fixed one: `findToday` matches against the
 * API's own UTC day, so a hardcoded fixture date would make every "today"
 * assertion here start failing tomorrow.
 */
const TODAY = todayUtcIso()
const TOMORROW = todayUtcIso(new Date(Date.now() + 86_400_000))
const DAY_AFTER = todayUtcIso(new Date(Date.now() + 2 * 86_400_000))

function day(date: string, over: Partial<ForecastSnapshot> = {}): ForecastSnapshot {
  return {
    id: `snap-${date}`,
    location_id: 'loc',
    captured_at: `${date}T00:00:00.000Z`,
    forecast_date: date,
    precip_mm_p10: 0,
    precip_mm_p50: 0,
    precip_mm_p90: 0,
    temp_c_min: 26,
    temp_c_max: 39.5,
    wind_kmh_max: 34,
    humidity_pct: 17,
    model_sources: ['gfs_seamless', 'ecmwf_ifs025'],
    created_at: `${date}T00:00:00.000Z`,
    ...over,
  }
}

/** Red Rock as production actually returned it on 2026-08-24: 103 °F, temp component 0, total 80. */
function redRockScore(over: Partial<ConditionsScore> = {}): ConditionsScore {
  return {
    id: 'score',
    location_id: 'loc',
    forecast_date: TODAY,
    score: 80,
    confidence: 'high',
    component_drying_time: 40,
    component_upcoming_rain: 25,
    component_wind: 15,
    component_temp: 0,
    component_humidity: 8,
    score_breakdown: {
      drying: {
        score: 40,
        hours_since_rain: 72,
        hours_remaining: 0,
        rock_type: 'sandstone',
        modifiers: { angle: 1.15, wind: 1, humidity: 1 },
      },
      rain: { score: 25, forecast_72h_mm: 0 },
      wind: { score: 15, max_kmh: 34 },
      temp: { score: 0, temp_c: 39.5 },
      humidity: { score: 8, pct: 17 },
      total: 80,
      confidence: 'high',
      computed_at: `${TODAY}T12:00:00.000Z`,
    },
    computed_at: `${TODAY}T12:00:00.000Z`,
    created_at: `${TODAY}T12:00:00.000Z`,
    ...over,
  }
}

const heatWarning: WeatherAlert = {
  id: 'alert-1',
  location_id: 'loc',
  nws_alert_id: 'nws-1',
  event: 'Extreme Heat Warning',
  severity: 'Extreme',
  certainty: 'Observed',
  headline: 'Extreme Heat Warning in effect through August 28',
  description: null,
  effective: null,
  expires: null,
  created_at: `${TODAY}T00:00:00.000Z`,
}

function ok<T>(data: T) {
  return { data, isPending: false, isError: false, refetch: () => {} }
}

function alertsOk(data: WeatherAlert[]) {
  return { data, isPending: false, isError: false }
}

function render(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(node)
}

describe('DetailView — a climbing location', () => {
  const forecast = ok([day(TODAY), day(TOMORROW)])

  it('leads with weather in imperial units, not with the score', () => {
    const html = render(
      <DetailView
        isClimbingLocation
        asosStation="KLAS"
        forecast={forecast}
        alerts={alertsOk([])}
        conditions={ok(redRockScore())}
      />,
    )
    expect(html).toContain('103°F')
    expect(html).toContain('21 mph')
    expect(html).toContain('17%')
    // Weather appears before the score section in document order.
    expect(html.indexOf('103°F')).toBeLessThan(html.indexOf('Score 80'))
  })

  it('suppresses the state label and names the limiting component', () => {
    const html = render(
      <DetailView
        isClimbingLocation
        asosStation="KLAS"
        forecast={forecast}
        alerts={alertsOk([])}
        conditions={ok(redRockScore())}
      />,
    )
    expect(html).toContain('Score 80 (high confidence) — limited by temperature')
    expect(html).not.toContain('Dry, settled')
  })

  it('names the alert instead of a component when a Severe+ alert is active', () => {
    const html = render(
      <DetailView
        isClimbingLocation
        asosStation="KLAS"
        forecast={forecast}
        alerts={alertsOk([heatWarning])}
        conditions={ok(redRockScore())}
      />,
    )
    expect(html).toContain('Extreme Heat Warning')
    expect(html).toContain('see the Extreme Heat Warning above')
    expect(html).not.toContain('limited by temperature')
    // The alert renders above the score, always (§7 rule 5).
    expect(html.indexOf('Extreme Heat Warning')).toBeLessThan(html.indexOf('Score 80'))
  })

  it('withholds the score until the alerts query settles', () => {
    // Suppression keys on whether a Severe+ alert is active. Rendering the
    // summary first shows an unsuppressed score for a location under an active
    // warning — briefly, but that is the state the rule exists to prevent.
    const html = render(
      <DetailView
        isClimbingLocation
        asosStation="KLAS"
        forecast={forecast}
        alerts={{ data: undefined, isPending: true, isError: false }}
        conditions={ok(redRockScore())}
      />,
    )
    expect(html).not.toContain('Score 80')
    // The weather is not held up by it.
    expect(html).toContain('103°F')
  })

  it('still shows the score when the alerts query settled as an error', () => {
    const html = render(
      <DetailView
        isClimbingLocation
        asosStation="KLAS"
        forecast={forecast}
        alerts={{ data: undefined, isPending: false, isError: true }}
        conditions={ok(redRockScore())}
      />,
    )
    // Component-based suppression still runs; only the alert half is unknown.
    expect(html).toContain('Score 80 (high confidence) — limited by temperature')
    expect(html).toContain('load alerts')
  })

  it('never states a climbing opinion', () => {
    const html = render(
      <DetailView
        isClimbingLocation
        asosStation="KLAS"
        forecast={forecast}
        alerts={alertsOk([heatWarning])}
        conditions={ok(redRockScore())}
      />,
    )
    expect(html).not.toMatch(/go climb|don't climb|looks great|good to go/i)
  })

  it('caps hours since rain rather than printing the 720-hour sentinel', () => {
    const base = redRockScore()
    const breakdown = base.score_breakdown
    if (breakdown === null) throw new Error('fixture must carry a breakdown')
    const html = render(
      <DetailView
        isClimbingLocation
        asosStation="KLAS"
        forecast={forecast}
        alerts={alertsOk([])}
        conditions={ok({
          ...base,
          score_breakdown: {
            ...breakdown,
            drying: { ...breakdown.drying, hours_since_rain: 720 },
          },
        })}
      />,
    )
    expect(html).toContain('no rain in 30+ days')
    expect(html).not.toContain('720')
  })

  it('names the sources the response reports, not a hardcoded list', () => {
    const html = render(
      <DetailView
        isClimbingLocation
        asosStation="KLAS"
        forecast={forecast}
        alerts={alertsOk([])}
        conditions={ok(redRockScore())}
      />,
    )
    expect(html).toContain('Open-Meteo (gfs_seamless, ecmwf_ifs025)')
    expect(html).toContain('ACIS (KLAS)')
    expect(html).toContain('NWS')
  })

  it('names the archive branch when the location has no ASOS station', () => {
    const html = render(
      <DetailView
        isClimbingLocation
        asosStation={null}
        forecast={forecast}
        alerts={alertsOk([])}
        conditions={ok(redRockScore())}
      />,
    )
    expect(html).toContain('Open-Meteo archive')
    expect(html).not.toContain('ACIS')
  })

  it('treats a 200 with data: null as "no conditions today", not as an error', () => {
    const html = render(
      <DetailView
        isClimbingLocation
        asosStation="KLAS"
        forecast={forecast}
        alerts={alertsOk([])}
        conditions={{ data: null, isPending: false, isError: false, refetch: () => {} }}
      />,
    )
    expect(html).toContain('No conditions for today yet.')
    // Not the ladder's copy: that describes a date beyond the scoring window.
    expect(html).not.toContain('Too far out to score')
    // The weather is unaffected and still renders.
    expect(html).toContain('103°F')
  })
})

describe('DetailView — a non-climbing location', () => {
  const forecast = ok([day(TODAY)])

  it('shows no score, no breakdown and no drying story', () => {
    const html = render(
      <DetailView
        isClimbingLocation={false}
        asosStation={null}
        forecast={forecast}
        alerts={alertsOk([])}
        conditions={ok(redRockScore())}
      />,
    )
    expect(html).not.toContain('Score 80')
    expect(html).not.toContain('Conditions score')
    expect(html).not.toContain('no rain in')
    // Weather and alerts render exactly as they do for a crag.
    expect(html).toContain('103°F')
  })

  it('does not attribute a rainfall source it never used', () => {
    const html = render(
      <DetailView
        isClimbingLocation={false}
        asosStation="KLAS"
        forecast={forecast}
        alerts={alertsOk([])}
        conditions={ok(redRockScore())}
      />,
    )
    expect(html).not.toContain('ACIS')
  })
})

describe('DetailView — unsaved preview', () => {
  it('shows weather but no score, whatever the toggle says', () => {
    const html = render(
      <DetailView
        unsaved
        isClimbingLocation
        asosStation={null}
        forecast={ok([day(TODAY)])}
      />,
    )
    expect(html).toContain('103°F')
    expect(html).not.toContain('Conditions score')
    // No alerts endpoint exists for a location with no id, so NWS is not claimed.
    expect(html).not.toContain('NWS')
  })
})

describe('DetailView — partial and missing data', () => {
  it('renders an em dash rather than 32°F when values are null', () => {
    const html = render(
      <DetailView
        isClimbingLocation={false}
        asosStation={null}
        forecast={ok([
          day(TODAY, { temp_c_max: null, temp_c_min: null, wind_kmh_max: null, humidity_pct: null }),
        ])}
      />,
    )
    expect(html).not.toContain('32°F')
    expect(html).not.toContain('0 mph')
    expect(html).toContain('—')
  })

  it('says today has no reading rather than relabelling tomorrow', () => {
    const html = render(
      <DetailView
        isClimbingLocation={false}
        asosStation={null}
        forecast={ok([day(TOMORROW), day(DAY_AFTER)])}
      />,
    )
    expect(html).toContain('No reading for today yet.')
  })

  it('still shows the forecast when the conditions call failed', () => {
    const html = render(
      <DetailView
        isClimbingLocation
        asosStation="KLAS"
        forecast={ok([day(TODAY)])}
        alerts={alertsOk([])}
        conditions={{ data: undefined, isPending: false, isError: true, refetch: () => {} }}
      />,
    )
    expect(html).toContain('103°F')
    // React escapes the apostrophe, so match a stable fragment of the copy.
    expect(html).toContain('load conditions. Tap to retry.')
    // Never an HTTP status or a raw error string (§5). Checked against the
    // specific statuses this app can receive — a blanket /\b[45]\d\d\b/ matches
    // the coordinates inside the icons' SVG path data.
    expect(html).not.toContain('Request failed')
    expect(html).not.toMatch(/\b(401|404|500|503)\b/)
  })
})
