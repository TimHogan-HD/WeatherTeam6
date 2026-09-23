import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FRICTION_MECHANISM,
  ROCK_TEMPERATURE_MECHANISM,
  type ConditionsReadings,
  type ConditionsScore,
  type ForecastSnapshot,
  type HourlyReading,
  type HourlySample,
  type HourlySeries,
} from '@weatherteam6/types'
import { CONDITIONS_NOW_LABEL, ConditionsNow, type ConditionsNowProps } from './ConditionsNow.js'

/**
 * The now-line and the readings became one card. Two families of assertion:
 *
 * - **The now-line's own**, ported unchanged from `NowLine.test.tsx`. It
 *   replaced a 36px hero that showed a daily *maximum* as the largest number
 *   on the screen, and nothing here may quietly recreate that.
 * - **The block's**: one label for one moment, two halves that fail
 *   independently, and a measurements panel that explains exactly what is on
 *   screen and names the model behind each figure.
 *
 * The panel's open state is not covered — there is no DOM and no click. Its
 * content is always in the markup (`hidden` when closed), so what it *says* is
 * covered here and what it *decides* is covered in `packages/types`.
 */

const DATE = '2026-09-15'
const NOW = `${DATE}T18:00:00.000Z`

beforeEach(() => {
  vi.setSystemTime(new Date(NOW))
})

afterEach(() => {
  vi.useRealTimers()
})

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
    valid_at: NOW,
    local_date: DATE,
    temp_c: 31,
    dewpoint_c: 4,
    humidity_pct: 22,
    precip_mm: 0,
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

function series(h: HourlySample | null, model: string | null = 'gfs_seamless'): HourlySeries {
  return {
    location_id: 'loc',
    utc_offset_seconds: 0,
    fetched_at: NOW,
    model,
    unavailable_models: [],
    readings: { model: null, unavailable_reason: 'not_a_climbing_location', hours: [], days: [] },
    hours: h === null ? [] : [h],
    days: [],
  }
}

const reading: HourlyReading = {
  valid_at: NOW,
  rock: { level: 'dry', qualified: true },
  friction: { level: 'poor', condensing: false, qualified: true },
  score: 58,
  t_surface_c: 52,
  condensation_margin_c: 20,
}

function scored(readings: Partial<ConditionsReadings> = {}): ConditionsScore {
  return {
    id: 'score',
    location_id: 'loc',
    forecast_date: DATE,
    score: 88,
    confidence: 'high',
    component_drying_time: null,
    component_upcoming_rain: null,
    component_wind: null,
    component_temp: null,
    component_humidity: null,
    score_breakdown: null,
    computed_at: NOW,
    created_at: NOW,
    readings: {
      model: 'gfs_seamless',
      unavailable_reason: null,
      utc_offset_seconds: 0,
      now: reading,
      today: null,
      ...readings,
    },
  }
}

const settled = <T,>(data: T) => ({ data, isPending: false, isError: false, refetch: () => {} })
const pending = { data: undefined, isPending: true, isError: false, refetch: () => {} }
const failed = { data: undefined, isPending: false, isError: true, refetch: () => {} }

function render(over: Partial<ConditionsNowProps> = {}): string {
  const props: ConditionsNowProps = {
    forecast: settled([today]),
    series: series(hour()),
    alertsPending: false,
    severeAlertEvent: null,
    ...over,
  }
  return renderToStaticMarkup(<ConditionsNow {...props} />)
}

const count = (html: string, needle: string): number => html.split(needle).length - 1

describe('ConditionsNow — the weather line', () => {
  it('labels the high and low even when there is no current reading', () => {
    // **The case that matters.** With no hour, an unlabelled pair leaves
    // `103°F  79°F` alone at the top of the screen, `temp_c_max` first, in the
    // slot the hero used to occupy.
    const html = render({ series: series(null) })
    expect(html).toContain('High')
    expect(html).toContain('Low')
    expect(html).toContain('103°F')
    expect(html).toContain('79°F')
  })

  it('shows the current hour as the reading, distinct from the day’s high', () => {
    const html = render()
    // 31 °C now against a 39.5 °C high — two different numbers, which is the
    // whole reason this reads the hourly run.
    expect(html).toContain('88°F')
    expect(html).toContain('103°F')
  })

  it('never shows the five-component score', () => {
    // `today.score` is the retired scorer's 80, and `scored()` carries 88 on
    // the same row. Neither is the v2 number, and neither may appear.
    const html = render({ conditions: settled(scored()) })
    expect(html).not.toContain('>80<')
    expect(html).not.toContain('>88<')
  })

  it('omits a missing reading rather than rendering it as a plausible zero', () => {
    const html = render({
      series: series(
        hour({ temp_c: null, wind_kmh: null, humidity_pct: null, cloud_pct: null }),
      ),
    })
    expect(html).not.toContain('32°F')
    expect(html).not.toContain('0 mph')
    expect(html).not.toContain('RH 0%')
  })
})

describe('ConditionsNow — one block', () => {
  it('heads the weather and the readings with one label', () => {
    // Two labels in one card is two claims about one moment again — the thing
    // this block replaced.
    const html = render({ conditions: settled(scored()) })
    expect(count(html, CONDITIONS_NOW_LABEL)).toBe(1)
    expect(html).toContain('Dryness')
    expect(html).toContain('Friction')
    expect(html).toContain('>58<')
  })

  it('shows no readings where the caller passed none', () => {
    // The Hourly tab, the preview, and a city all omit `conditions`. The
    // weather is still about now; a rock reading is not owed.
    const html = render()
    expect(html).toContain(CONDITIONS_NOW_LABEL)
    expect(html).toContain('88°F')
    expect(html).not.toContain('Dryness')
  })

  it('keeps the weather when the readings failed', () => {
    const html = render({ conditions: failed })
    expect(html).toContain('88°F')
    expect(html).toContain('Couldn&#x27;t load conditions.')
  })

  it('keeps the readings when the forecast failed', () => {
    const html = render({ forecast: failed, conditions: settled(scored()) })
    expect(html).toContain('Couldn&#x27;t load the forecast.')
    expect(html).toContain('Dryness')
  })

  /**
   * **The number waits for the alerts query.** `severeAlertEvent: null` is also
   * what a query in flight looks like, so drawing the readings before it
   * settles shows an unsuppressed score under a warning that has not arrived.
   */
  it('holds the readings until the alerts query settles', () => {
    const html = render({ conditions: settled(scored()), alertsPending: true })
    expect(html).not.toContain('>58<')
    expect(html).not.toContain('Dryness')
    // The weather does not wait on alerts; it carries no number to suppress.
    expect(html).toContain('88°F')
  })

  it('drops the number and keeps the readings under a Severe+ alert', () => {
    const html = render({
      conditions: settled(scored()),
      severeAlertEvent: 'Extreme Heat Warning',
    })
    expect(html).not.toContain('>58<')
    expect(html).toContain('Poor')
    expect(html).toContain('Extreme Heat Warning')
  })

  it('renders nothing for readings a newer client expected and an older API did not send', () => {
    const { readings: _omit, ...withoutReadings } = scored()
    const html = render({ conditions: settled(withoutReadings) })
    expect(html).not.toContain('Dryness')
    // Not "the model didn't answer": that would blame the forecast model for
    // our own release ordering.
    expect(html).not.toContain('didn')
  })

  it('is one skeleton while nothing has arrived for either half', () => {
    const html = render({ forecast: pending, conditions: pending })
    expect(html).not.toContain(CONDITIONS_NOW_LABEL)
    expect(html).toContain('aria-hidden')
  })
})

describe('ConditionsNow — the measurements panel', () => {
  it('is collapsed, and its control says what it controls', () => {
    const html = render({ conditions: settled(scored()) })
    expect(html).toContain('Measurements')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toMatch(/aria-controls="([^"]+)"[\s\S]*id="\1" hidden=""/)
  })

  it('carries the dew point, which nothing on screen had read', () => {
    const html = render()
    // 4 °C.
    expect(html).toContain('Dew point')
    expect(html).toContain('39°F')
  })

  it('carries the rock figures and says the rock temperature is modelled', () => {
    const html = render({ conditions: settled(scored()) })
    // 52 °C surface; a 20 °C margin is 36 °F as an interval — and would be
    // 68°F through `formatTempF`, which is the bug the delta conversion stops.
    expect(html).toContain('126°F')
    expect(html).toContain('36°F above')
    expect(html).not.toContain('68°F above')
    expect(html).toContain(ROCK_TEMPERATURE_MECHANISM)
    expect(html).toContain(FRICTION_MECHANISM)
  })

  it('explains no gauge that is not on screen', () => {
    // Readings held for alerts: the panel must not carry their caveats, or
    // their rock figures, ahead of the gauges they explain.
    const html = render({ conditions: settled(scored()), alertsPending: true })
    expect(html).not.toContain(FRICTION_MECHANISM)
    expect(html).not.toContain('Rock temperature')
    expect(html).toContain('Dew point')
  })

  it('names the model once when both halves came from it', () => {
    const html = render({ conditions: settled(scored()) })
    expect(count(html, 'Open-Meteo (gfs_seamless)')).toBe(1)
  })

  /**
   * **The air columns and the readings need not be one model's.** The weather
   * model is chosen by coverage; the readings always come from the thermal
   * model (issue #155). Naming one with the other is a false attribution.
   */
  it('names each half with its own model when they differ', () => {
    const html = render({
      series: series(hour(), 'ncep_hrrr_conus'),
      conditions: settled(scored()),
    })
    expect(html).toContain('Open-Meteo (ncep_hrrr_conus)')
    expect(html).toContain('Open-Meteo (gfs_seamless)')
  })

  it('has no control when there is nothing to open', () => {
    const html = render({ series: undefined })
    expect(html).not.toContain('Measurements')
  })
})
