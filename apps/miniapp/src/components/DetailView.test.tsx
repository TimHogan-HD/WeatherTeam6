import { renderInRouter } from '../test/renderInRouter.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FRICTION_MECHANISM } from '@weatherteam6/types'
import type {
  Conditions,
  ForecastSnapshot,
  HourlyReading,
  HourlySample,
  HourlySeries,
  Location,
  WeatherAlert,
} from '@weatherteam6/types'
import { DetailView, type DetailViewProps } from './DetailView.js'
import { HOUR_MS } from './charts/hourlySeries.js'

/** The screen as a reader sees it: tags out, whitespace collapsed. */
const visible = (html: string): string => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

/**
 * What the detail screen puts on screen, rendered for real, on the Overview.
 *
 * The defects this project ships are a correct-looking screen saying a wrong
 * thing: a null rendered as 32°F, a score presented as a summary of a 103°F
 * day, a rock-drying score on a city. Typecheck and lint pass on all of those.
 */

const TODAY = '2026-08-25'
const TOMORROW = '2026-08-26'
const DAY_AFTER = '2026-08-27'

// Red Rock is UTC-7: local midnight on TODAY is 07:00Z, and "now" is 1pm local.
const MIDNIGHT = Date.parse(`${TODAY}T07:00:00.000Z`)
const NOW = Date.parse(`${TODAY}T20:10:00.000Z`)

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
    is_today: date === TODAY,
    ...over,
  }
}

function sample(i: number): HourlySample {
  return {
    valid_at: new Date(MIDNIGHT + i * HOUR_MS).toISOString(),
    local_date: i < 24 ? TODAY : TOMORROW,
    temp_c: 39.5,
    dewpoint_c: -2,
    humidity_pct: 17,
    precip_mm: 0,
    wind_kmh: 16,
    wind_gust_kmh: 32,
    wind_dir_deg: null,
    cloud_pct: null,
    pressure_hpa: null,
    temp_c_p10: 38,
    temp_c_p50: 39.5,
    temp_c_p90: 41,
    wind_kmh_p10: null,
    wind_kmh_p50: 16,
    wind_kmh_p90: null,
    precip_mm_mean: 0,
    precip_mm_p10: null,
    precip_mm_p90: null,
    precip_chance_pct: 2,
    member_count: 143,
  }
}

const hourlySeries: HourlySeries = {
  location_id: 'loc',
  utc_offset_seconds: -7 * 3600,
  fetched_at: new Date(MIDNIGHT).toISOString(),
  model: 'gfs_seamless',
  unavailable_models: [],
  readings: { model: null, unavailable_reason: 'not_a_climbing_location', hours: [], days: [] },
  hours: Array.from({ length: 48 }, (_, i) => sample(i)),
  days: [
    { local_date: TODAY, has_deterministic: true, has_ensemble: true },
    { local_date: TOMORROW, has_deterministic: true, has_ensemble: true },
  ],
}

const redRock: Location = {
  id: 'loc',
  user_id: 'u',
  name: 'Red Rock',
  lat: 36.13,
  lon: -115.43,
  elevation_m: 1200,
  is_climbing_location: true,
  rock_type: 'sandstone',
  aspect: null,
  cliff_angle: null,
  asos_station: null,
  asos_network: null,
  nws_office: null,
  nws_grid_x: null,
  nws_grid_y: null,
  timezone: null,
  created_at: `${TODAY}T00:00:00.000Z`,
  updated_at: null,
}

/** Red Rock on 2026-08-24: 103 °F, and Crag A reads `Dryness: Dry`, 58 (its friction was Poor). */
function redRockScore(): Conditions {
  return {
    location_id: 'loc',
    forecast_date: TODAY,
    readings: {
      model: 'gfs_seamless',
      unavailable_reason: null,
      utc_offset_seconds: -7 * 3600,
      now: readingHour(58),
      today: {
        local_date: TODAY,
        // 13:00-16:00Z is 6am-9am locally.
        window: { from: `${TODAY}T13:00:00.000Z`, to: `${TODAY}T16:00:00.000Z`, hours: 4, min_score: 62, qualified: false },
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

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
})

type Over = Partial<Omit<DetailViewProps, 'hourly'>> & { hourly?: HourlySeries }

/** The Overview tab of a crag, with whatever the case overrides. */
function overview(over: Over = {}): string {
  const { hourly = hourlySeries, ...rest } = over
  return renderInRouter(
    <DetailView
      isClimbingLocation
      location={redRock}
      forecast={ok([day(TODAY), day(TOMORROW), day(DAY_AFTER)])}
      alerts={alertsOk([])}
      conditions={ok(redRockScore())}
      hourly={{
        ...ok(hourly),
        tabs: {
          active: 'overview',
          onTabChange: () => {},
          selectedDate: TODAY,
          onSelectDate: () => {},
          readMs: null,
          onRead: () => {},
          panelId: 'panel',
        },
      }}
      {...rest}
    />,
  )
}

/** The hero: from the crag's name to the first card. */
function hero(html: string): string {
  const from = html.indexOf('<h1')
  if (from < 0) throw new Error('no hero')
  return html.slice(from, html.indexOf('<h2', from))
}

describe('DetailView — the Overview hero', () => {
  it('names the crag and headlines the hour’s score, with its Dryness and the hour beside it', () => {
    const h = hero(overview())
    expect(h).toContain('>Red Rock</h1>')
    expect(h).toContain('>58<')
    expect(visible(h)).toContain('Dryness: Dry')
    expect(visible(h)).toContain('Sandstone · 1pm')
  })

  it('puts the day’s good hours and score on the line under it, on the location’s clock', () => {
    // The hour's score is never alone: 9am read 100 on a day rain arrived at 1pm.
    expect(visible(hero(overview()))).toContain('Good hours: 6am–9am · Today: 71')
  })

  it('leads with weather in imperial units', () => {
    const text = visible(hero(overview()))
    expect(text).toContain('103°F')
    expect(text).toContain('gusts 20 mph')
  })

  it('never renders the old ladder word or the retired five-component score', () => {
    const html = overview({ forecast: ok([day(TODAY, { score: 80 } as Partial<ForecastSnapshot>), day(TOMORROW)]) })
    expect(html).not.toContain('Dry, settled')
    expect(html).not.toContain('>80<')
  })

  it('drops the number under a Severe+ alert, names the alert, and keeps the readings', () => {
    const html = overview({ alerts: alertsOk([heatWarning]) })
    const h = hero(html)
    expect(h).not.toContain('>58<')
    expect(h).not.toContain('Today: 71')
    expect(visible(h)).toContain('Score hidden: Extreme Heat Warning')
    expect(visible(h)).toContain('Dryness: Dry')
    // The banner sits above the hero, always (§7 rule 5).
    expect(html.indexOf('Extreme Heat Warning')).toBeLessThan(html.indexOf('<h1'))
  })

  it('holds the readings until the alerts query settles, but not the weather', () => {
    const h = hero(overview({ alerts: { data: undefined, isPending: true, isError: false } }))
    expect(h).not.toContain('>58<')
    expect(visible(h)).not.toContain('Dryness')
    expect(visible(h)).toContain('103°F')
  })

  it('shows the readings and the number when the alerts query settled as an error, and says it failed', () => {
    const html = overview({ alerts: { data: undefined, isPending: false, isError: true } })
    expect(hero(html)).toContain('>58<')
    expect(html).toContain('load alerts')
  })

  it('treats a 200 with data: null as "no conditions today", not as an error', () => {
    const html = overview({ conditions: { data: null, isPending: false, isError: false, refetch: () => {} } })
    expect(hero(html)).toContain('No conditions for today yet.')
    expect(html).not.toContain('Too far out to score')
  })

  it('says the conditions call failed rather than showing a number, with no status code', () => {
    const html = overview({ conditions: { data: undefined, isPending: false, isError: true, refetch: () => {} } })
    expect(hero(html)).toContain('load conditions. Tap to retry.')
    expect(html).not.toContain('Request failed')
    expect(visible(html)).not.toMatch(/\b(401|404|500|503)\b/)
  })

  it('never states a climbing opinion', () => {
    expect(overview({ alerts: alertsOk([heatWarning]) })).not.toMatch(/go climb|don't climb|looks great|good to go/i)
  })
})

describe('DetailView — the Overview cards', () => {
  it('says friction is an estimate once, on the Rock card', () => {
    const html = overview()
    expect(html.split(FRICTION_MECHANISM).length - 1).toBe(1)
    expect(visible(html)).toContain('How the score works')
  })

  it('shows the Rock card without a rock temperature (owner, 2026-10-19)', () => {
    const text = visible(overview())
    expect(text).toContain('Rock vs dew point')
    expect(text).toContain('Sandstone drying table')
    // 48.2 °C is 119 °F; a modelled rock temperature must not print.
    expect(text).not.toContain('119°')
  })

  it('names the air model on the Air card', () => {
    const html = overview()
    const at = html.indexOf('>Air<')
    expect(at).toBeGreaterThan(0)
    expect(html.slice(at, at + 400)).toContain('GFS')
  })

  it('says the forecast failed on the Overview, where Next days reads it', () => {
    const html = overview({ forecast: { data: undefined, isPending: false, isError: true, refetch: () => {} } })
    expect(html).toContain('load the forecast.')
  })
})

describe('DetailView — sources', () => {
  it('names the sources the response reports, not a hardcoded list', () => {
    const html = overview({ alerts: alertsOk([heatWarning]) })
    expect(html).toContain('Open-Meteo · GFS, ECMWF')
    expect(html).toContain('NWS')
  })

  it('does not claim NWS when no alert is being shown', () => {
    expect(overview()).not.toContain('NWS')
  })
})

describe('DetailView — a non-climbing location', () => {
  it('shows no score, no breakdown and no drying story', () => {
    const html = overview({ isClimbingLocation: false, location: { ...redRock, is_climbing_location: false, rock_type: null } })
    const text = visible(html)
    expect(html).not.toContain('>58<')
    expect(text).not.toMatch(/Dryness|Score breakdown|drying|How the score works/)
    // The hour's air takes the figure, with the day's high and low beside it.
    expect(text).toContain('Air now')
    expect(text).toContain('High 103° · Low 79°')
  })
})

describe('DetailView — partial and missing data', () => {
  it('renders an em dash rather than 32°F when values are null', () => {
    const blank = { ...hourlySeries, hours: hourlySeries.hours.map((h) => ({ ...h, temp_c: null, wind_kmh: null, wind_gust_kmh: null, humidity_pct: null, dewpoint_c: null })) }
    const html = overview({
      isClimbingLocation: false,
      hourly: blank,
      forecast: ok([day(TODAY, { temp_c_max: null, temp_c_min: null, wind_kmh_max: null, humidity_pct: null })]),
    })
    expect(html).not.toContain('32°')
    expect(visible(html)).not.toMatch(/(^|[^0-9])0 mph/)
    expect(html).toContain('—')
  })

  it('says today has no reading rather than relabelling tomorrow', () => {
    const html = overview({ isClimbingLocation: false, forecast: ok([day(TOMORROW), day(DAY_AFTER)]) })
    expect(html).toContain('No reading for today yet.')
  })

  it('shows the seven days alone without hourly data', () => {
    const html = renderInRouter(<DetailView isClimbingLocation={false} forecast={ok([day(TODAY)])} />)
    expect(html).toMatch(/>Next [0-9]+ days?</)
    expect(html).not.toContain('data-hero')
  })
})
