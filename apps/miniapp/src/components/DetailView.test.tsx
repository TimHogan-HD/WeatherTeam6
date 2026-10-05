import { renderInRouter } from '../test/renderInRouter.js'
import { describe, expect, it } from 'vitest'
import { FRICTION_MECHANISM } from '@weatherteam6/types'
import type {
  Conditions,
  ForecastSnapshot,
  HourlyReading,
  WeatherAlert,
} from '@weatherteam6/types'
import { DetailView } from './DetailView.js'

/** The panel as a reader sees it — tags out, whitespace collapsed. */
const visible = (html: string): string => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

/**
 * What the detail screen actually puts on screen, rendered for real.
 *
 * These exist because the defects this project keeps shipping are not type
 * errors — they are a correct-looking screen saying a wrong thing: a null
 * rendered as 32°F, a score presented as a summary of a 103°F day, a
 * rock-drying score on a city. Typecheck and lint pass on all of those.
 */

/**
 * Fixed dates, safely — `findToday` now reads the server's `is_today` flag
 * rather than comparing against the client's clock (#33), so the fixture no
 * longer has to track the real date to keep its "today" assertions meaningful.
 *
 * These were derived from `Date.now()` precisely because the old client matched
 * on a UTC date it computed itself; a hardcoded date would have started failing
 * the next day. That coupling is gone.
 */
const TODAY = '2026-08-25'
const TOMORROW = '2026-08-26'
const DAY_AFTER = '2026-08-27'

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
    // The server's decision, as the API now sends it.
    is_today: date === TODAY,
    ...over,
  }
}

/** Red Rock on 2026-08-24: 103 °F, and Crag A reads `Rock: Dry`, `Friction: Poor`, 58. */
function redRockScore(): Conditions {
  return {
    location_id: 'loc',
    forecast_date: TODAY,
    readings: {
      model: 'gfs_seamless',
      unavailable_reason: null,
      // Red Rock is UTC-7, so the window's 13:00-16:00Z is 6am-9am locally.
      utc_offset_seconds: -7 * 3600,
      now: readingHour(58),
      today: {
        local_date: TODAY,
        window: {
          from: `${TODAY}T13:00:00.000Z`,
          to: `${TODAY}T16:00:00.000Z`,
          hours: 4,
          min_score: 62,
          qualified: false,
        },
        best: readingHour(71),
      },
    },
  }
}

function readingHour(score: number, over: Partial<HourlyReading> = {}): HourlyReading {
  return {
    valid_at: `${TODAY}T20:00:00.000Z`,
    rock: { level: 'dry', qualified: false },
    friction: { level: 'poor', condensing: false, qualified: false },
    score,
    t_surface_c: 48.2,
    condensation_margin_c: 21.4,
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

const render = renderInRouter

describe('DetailView — a climbing location', () => {
  const forecast = ok([day(TODAY), day(TOMORROW)])

  it('leads with weather in imperial units, not with the score', () => {
    const html = render(
      <DetailView
        isClimbingLocation
        forecast={forecast}
        alerts={alertsOk([])}
        conditions={ok(redRockScore())}
      />,
    )
    expect(html).toContain('High 103°')
    // **Wind and humidity moved, and that is the design.** They were the day's
    // *maxima* sitting in a hero that read as present conditions. The now-line
    // carries the current hour's readings instead — absent here, because this
    // fixture passes no hourly data — and the day's wind is the Hourly tab's
    // own chart. The day's high and low are still on this line.
    expect(html).toContain('Low 79°')
    // Weather appears before the readings section in document order.
    expect(visible(html).indexOf('High 103°')).toBeLessThan(visible(html).indexOf('Friction Poor'))
  })

  /**
   * **The phase's acceptance criterion, on the day it was written for.** The
   * five-component score for this fixture is 80 and its ladder word was "Dry,
   * settled" — for 103 °F, because heat could cost at most 12 of 100 points.
   * The readings come from physics that sees heat, so the headline cannot be
   * reassuring here however the number lands.
   */
  it('leads with the two readings and never renders the old ladder word', () => {
    const html = render(
      <DetailView
        isClimbingLocation
        forecast={forecast}
        alerts={alertsOk([])}
        conditions={ok(redRockScore())}
      />,
    )
    expect(visible(html)).toContain('Friction Poor')
    expect(html).toContain('>71<')
    expect(html).not.toContain('Dry, settled')
    // The five-component score is still on the response and must not reach the
    // screen — two numbers for the same day is worse than either.
    expect(html).not.toContain('>80<')
  })

  it('names the window on the location clock, not the viewer’s', () => {
    const html = render(
      <DetailView
        isClimbingLocation
        forecast={forecast}
        alerts={alertsOk([])}
        conditions={ok(redRockScore())}
      />,
    )
    expect(visible(html)).toContain('Good hours 6am–9am')
  })

  it('says the friction reading is an estimate, on the screen', () => {
    // Phase 3 acceptance criterion, § Open Questions 6 of the handoff.
    const html = render(
      <DetailView
        isClimbingLocation
        forecast={forecast}
        alerts={alertsOk([])}
        conditions={ok(redRockScore())}
      />,
    )
    // Said once, in the measurements panel, not under the gauges.
    expect(html).toContain(FRICTION_MECHANISM)
    expect(visible(html)).not.toContain('Friction is estimated, not measured')
  })

  it('drops the number under a Severe+ alert but keeps the readings', () => {
    const html = render(
      <DetailView
        isClimbingLocation
        forecast={forecast}
        alerts={alertsOk([heatWarning])}
        conditions={ok(redRockScore())}
      />,
    )
    expect(html).toContain('Extreme Heat Warning')
    expect(html).toContain('Score hidden: Extreme Heat Warning')
    // The words stay — they are the same fact the warning is about. The number
    // is the part that reads as actionable, and it is what goes.
    expect(visible(html)).toContain('Friction Poor')
    expect(html).not.toContain('>71<')
    // The alert renders above the readings, always (§7 rule 5).
    expect(visible(html).indexOf('Extreme Heat Warning')).toBeLessThan(
      visible(html).indexOf('Friction Poor'),
    )
  })

  it('withholds the whole section until the alerts query settles', () => {
    // Suppression keys on whether a Severe+ alert is active. Rendering the
    // summary first shows an unsuppressed score for a location under an active
    // warning — briefly, but that is the state the rule exists to prevent.
    const html = render(
      <DetailView
        isClimbingLocation
        forecast={forecast}
        alerts={{ data: undefined, isPending: true, isError: false }}
        conditions={ok(redRockScore())}
      />,
    )
    expect(html).not.toContain('>71<')
    expect(visible(html)).not.toContain('Friction Poor')
    // The weather is not held up by it.
    expect(html).toContain('High 103°')
  })

  it('shows the readings and the number when the alerts query settled as an error', () => {
    const html = render(
      <DetailView
        isClimbingLocation
        forecast={forecast}
        alerts={{ data: undefined, isPending: false, isError: true }}
        conditions={ok(redRockScore())}
      />,
    )
    // The query settled with no data, so nothing is suppressed — and the
    // failure is stated above rather than reading as "no alerts".
    expect(visible(html)).toContain('Friction Poor')
    expect(html).toContain('>71<')
    expect(html).toContain('load alerts')
  })

  it('never states a climbing opinion', () => {
    const html = render(
      <DetailView
        isClimbingLocation
        forecast={forecast}
        alerts={alertsOk([heatWarning])}
        conditions={ok(redRockScore())}
      />,
    )
    expect(html).not.toMatch(/go climb|don't climb|looks great|good to go/i)
  })

  it('names the sources the response reports, not a hardcoded list', () => {
    const html = render(
      <DetailView
        isClimbingLocation
        forecast={forecast}
        alerts={alertsOk([heatWarning])}
        conditions={ok(redRockScore())}
      />,
    )
    expect(html).toContain('Open-Meteo · GFS, ECMWF')
    expect(html).toContain('NWS')
  })

  it('does not claim NWS when no alert is being shown', () => {
    // An empty result is not "NWS says no alerts": /alerts/:id reads the
    // weather_alerts table, populated by a cron that is not yet registered, so
    // empty can equally mean NWS has never been asked. The bot uses the same
    // rule and the two must not disagree about the same location.
    const html = render(
      <DetailView
        isClimbingLocation
        forecast={forecast}
        alerts={alertsOk([])}
        conditions={ok(redRockScore())}
      />,
    )
    expect(html).not.toContain('NWS')
  })

  it('treats a 200 with data: null as "no conditions today", not as an error', () => {
    const html = render(
      <DetailView
        isClimbingLocation
        forecast={forecast}
        alerts={alertsOk([])}
        conditions={{ data: null, isPending: false, isError: false, refetch: () => {} }}
      />,
    )
    expect(html).toContain('No conditions for today yet.')
    // Not the ladder's copy: that describes a date beyond the scoring window.
    expect(html).not.toContain('Too far out to score')
    // The weather is unaffected and still renders.
    expect(html).toContain('High 103°')
  })
})

describe('DetailView — a non-climbing location', () => {
  const forecast = ok([day(TODAY)])

  it('shows no score, no breakdown and no drying story', () => {
    const html = render(
      <DetailView
        isClimbingLocation={false}
        forecast={forecast}
        alerts={alertsOk([])}
        conditions={ok(redRockScore())}
      />,
    )
    expect(html).not.toContain('Score 80')
    expect(html).not.toContain('Conditions score')
    expect(html).not.toContain('no rain in')
    // Weather and alerts render exactly as they do for a crag.
    expect(html).toContain('High 103°')
  })
})

describe('DetailView — partial and missing data', () => {
  it('renders an em dash rather than 32°F when values are null', () => {
    const html = render(
      <DetailView
        isClimbingLocation={false}
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
        forecast={ok([day(TOMORROW), day(DAY_AFTER)])}
      />,
    )
    expect(html).toContain('No reading for today yet.')
  })

  it('still shows the forecast when the conditions call failed', () => {
    const html = render(
      <DetailView
        isClimbingLocation
        forecast={ok([day(TODAY)])}
        alerts={alertsOk([])}
        conditions={{ data: undefined, isPending: false, isError: true, refetch: () => {} }}
      />,
    )
    expect(html).toContain('High 103°')
    // React escapes the apostrophe, so match a stable fragment of the copy.
    expect(html).toContain('load conditions. Tap to retry.')
    // Never an HTTP status or a raw error string (§5). Checked against the
    // specific statuses this app can receive — a blanket /\b[45]\d\d\b/ matches
    // the coordinates inside the icons' SVG path data.
    expect(html).not.toContain('Request failed')
    // Visible text only: v2 sets weights in the markup, and `font-weight:500`
    // is not a status code.
    expect(visible(html)).not.toMatch(/\b(401|404|500|503)\b/)
  })
})
