import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type {
  ConditionsScore,
  ForecastSnapshot,
  HourlySample,
  HourlySeries,
  WeatherAlert,
} from '@weatherteam6/types'
import { DetailView, openDayInHourly } from './DetailView.js'
import { HOUR_MS } from './charts/hourlySeries.js'

/**
 * Phase 3's acceptance criteria, as rendered markup.
 *
 * Tapping a day in Daily lands on that day in Hourly; a day flagged without
 * coverage in `days[]` is not tappable; and the sections that outrank a tab —
 * the alert banner above all, the score and the sources footer — stay outside
 * the tabs where switching cannot hide them.
 *
 * `BackButton` returning to Daily rather than closing the Mini App is the third
 * criterion and is **not covered here.** It lives in `LocationDetail`, whose
 * handler is registered with Telegram's SDK — `null` in a `node` environment
 * with no DOM (see `vitest.config.ts`). It is verified on a device, and that is
 * the only place it can be.
 */

const T0 = Date.UTC(2026, 8, 14, 0)
const DAY_1 = '2026-09-14'
const DAY_2 = '2026-09-15'
const DAY_3 = '2026-09-16'

function hour(index: number, localDate: string, over: Partial<HourlySample> = {}): HourlySample {
  return {
    valid_at: new Date(T0 + index * HOUR_MS).toISOString(),
    local_date: localDate,
    temp_c: null,
    dewpoint_c: null,
    humidity_pct: null,
    precip_mm: null,
    wind_kmh: null,
    wind_gust_kmh: null,
    wind_dir_deg: null,
    cloud_pct: null,
    pressure_hpa: null,
    temp_c_p10: 12,
    temp_c_p50: 15,
    temp_c_p90: 19,
    wind_kmh_p10: null,
    wind_kmh_p50: null,
    wind_kmh_p90: null,
    precip_mm_mean: 0.4,
    precip_mm_p10: null,
    precip_mm_p90: null,
    precip_chance_pct: 30,
    member_count: 143,
    ...over,
  }
}

/**
 * Two drawable days and a third the ensemble never reached — the shape that
 * makes "not tappable" mean something. A fixture where every day is drawable
 * cannot fail the assertion it is written for.
 */
const series: HourlySeries = {
  location_id: 'loc',
  utc_offset_seconds: -5 * 3600,
  fetched_at: new Date(T0).toISOString(),
  model: 'gfs_seamless',
  unavailable_models: [],
  // None of these fixtures is about the v2 readings; each says so rather
  // than leaving the field off, because the server always sends it.
  readings: { model: null, unavailable_reason: 'not_a_climbing_location', hours: [], days: [] },
  hours: [
    ...Array.from({ length: 24 }, (_, i) => hour(i, DAY_1)),
    ...Array.from({ length: 24 }, (_, i) => hour(24 + i, DAY_2)),
  ],
  days: [
    { local_date: DAY_1, has_deterministic: true, has_ensemble: true },
    { local_date: DAY_2, has_deterministic: true, has_ensemble: true },
    { local_date: DAY_3, has_deterministic: true, has_ensemble: false },
  ],
}

function day(date: string): ForecastSnapshot {
  return {
    id: `snap-${date}`,
    location_id: 'loc',
    captured_at: `${date}T00:00:00.000Z`,
    forecast_date: date,
    precip_mm_p10: 0,
    precip_mm_p50: 1,
    precip_mm_p90: 3,
    temp_c_min: 10,
    temp_c_max: 20,
    wind_kmh_max: 14,
    humidity_pct: 40,
    model_sources: ['gfs_seamless'],
    created_at: `${date}T00:00:00.000Z`,
    is_today: date === DAY_1,
  }
}

const heatWarning: WeatherAlert = {
  id: 'alert-1',
  location_id: 'loc',
  nws_alert_id: 'nws-1',
  event: 'Extreme Heat Warning',
  severity: 'Extreme',
  certainty: 'Observed',
  headline: 'Extreme Heat Warning in effect',
  description: null,
  effective: null,
  expires: null,
  created_at: `${DAY_1}T00:00:00.000Z`,
}

const score: ConditionsScore = {
  id: 'score',
  location_id: 'loc',
  forecast_date: DAY_1,
  score: 72,
  confidence: 'high',
  component_drying_time: 32,
  component_upcoming_rain: 20,
  component_wind: 14,
  component_temp: 2,
  component_humidity: 4,
  score_breakdown: null,
  computed_at: `${DAY_1}T12:00:00.000Z`,
  created_at: `${DAY_1}T12:00:00.000Z`,
}

function ok<T>(data: T) {
  return { data, isPending: false, isError: false, refetch: () => {} }
}

type Tabs = NonNullable<Parameters<typeof DetailView>[0]['hourly']>['tabs']

function render(tabs: Partial<Tabs> = {}): string {
  return renderToStaticMarkup(
    <DetailView
      isClimbingLocation
      asosStation="KRGK"
      forecast={ok([day(DAY_1), day(DAY_2), day(DAY_3)])}
      alerts={{ data: [], isPending: false, isError: false }}
      hourly={{
        ...ok(series),
        tabs: {
          active: 'daily',
          onTabChange: () => {},
          selectedDate: DAY_1,
          onSelectDate: () => {},
          ...tabs,
        },
      }}
    />,
  )
}

describe('DetailView — tabs', () => {
  it('offers both tabs and marks the open one', () => {
    const html = render()
    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('>Daily<')
    expect(html).toContain('>Hourly<')
  })

  it('shows the daily rows on Daily and the day charts on Hourly', () => {
    const daily = render({ active: 'daily' })
    expect(daily).toContain('Next 7 days')
    // **The continuous seven-day strip lives here, not on Hourly.** It is a
    // chart about comparing days, which is what this tab is for; on Hourly it
    // answered a question that tab does not ask and pushed the charts that do
    // answer it off the screen.
    expect(daily).toContain('Hour by hour')

    const hourly = render({ active: 'hourly' })
    expect(hourly).not.toContain('Next 7 days')
    expect(hourly).not.toContain('Hour by hour')
    // One day, named in full by the pager, with its four charts.
    expect(hourly).toContain('Mon, Sep 14')
    expect(hourly).toContain('Chance of rain')
    expect(hourly).toContain('Wind')
  })

  it('makes only the days the ensemble reached tappable', () => {
    // Three forecast rows, two drawable days. The third row exists — the daily
    // forecast covers it — and must not open two empty charts.
    const html = render({ active: 'daily' })
    const rowButtons = [...html.matchAll(/<button type="button" style="appearance:none[^>]*>/g)]
    expect(rowButtons).toHaveLength(2)
    expect(html).toContain('Days without an hour-by-hour forecast can&#x27;t be opened.')
  })

  it('opens the tapped day, not whichever day the tab happened to be on', () => {
    // There is no DOM in this workspace's test environment, so the row's
    // handler is tested as the exported function the row is actually given —
    // not as a copy of it written here, which would prove only that this file
    // agrees with itself.
    const onTabChange = vi.fn()
    const onSelectDate = vi.fn()
    openDayInHourly(
      { active: 'daily', onTabChange, selectedDate: DAY_1, onSelectDate },
      DAY_2,
    )
    expect(onSelectDate).toHaveBeenCalledWith(DAY_2)
    expect(onTabChange).toHaveBeenCalledWith('hourly')
    // The date must be set before the tab opens. The other order renders Hourly
    // once on the previously selected day, which looks like the drill-down
    // working and is not.
    expect(onSelectDate.mock.invocationCallOrder[0]).toBeLessThan(
      onTabChange.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('keeps the alert banner and the sources footer outside the tabs', () => {
    // A warning a reader can switch away from is the state §7 rule 5 exists to
    // prevent, and the sources footer describes the location rather than one
    // view of it.
    for (const active of ['daily', 'hourly'] as const) {
      const html = renderToStaticMarkup(
        <DetailView
          isClimbingLocation
          asosStation="KRGK"
          forecast={ok([day(DAY_1), day(DAY_2), day(DAY_3)])}
          alerts={{ data: [heatWarning], isPending: false, isError: false }}
          conditions={ok(score)}
          hourly={{
            ...ok(series),
            tabs: {
              active,
              onTabChange: () => {},
              selectedDate: DAY_1,
              onSelectDate: () => {},
            },
          }}
        />,
      )
      expect(html).toContain('Extreme Heat Warning')
      expect(html).toContain('gfs_seamless')
    }
  })

  it('puts today’s score on Daily and keeps it off Hourly', () => {
    // **The score summary is about today, and Hourly is a day pager.** Today's
    // verdict at the top of a screen showing Saturday is a claim about the
    // wrong day; the pager carries that day's own chip instead. Moved out of
    // the test above when the section came up from the foot of the screen.
    const render = (active: 'daily' | 'hourly'): string =>
      renderToStaticMarkup(
        <DetailView
          isClimbingLocation
          asosStation="KRGK"
          forecast={ok([day(DAY_1), day(DAY_2), day(DAY_3)])}
          alerts={{ data: [], isPending: false, isError: false }}
          conditions={ok(score)}
          hourly={{
            ...ok(series),
            tabs: {
              active,
              onTabChange: () => {},
              selectedDate: DAY_1,
              onSelectDate: () => {},
            },
          }}
        />,
      )

    expect(render('daily')).toContain('Score 72')
    expect(render('hourly')).not.toContain('Score 72')
  })

  it('says so when no day in the window can be drawn, rather than showing blank charts', () => {
    const html = renderToStaticMarkup(
      <DetailView
        isClimbingLocation
        asosStation={null}
        forecast={ok([day(DAY_1)])}
        hourly={{
          ...ok({
            ...series,
            hours: [],
            days: [{ local_date: DAY_1, has_deterministic: true, has_ensemble: false }],
          }),
          tabs: {
            active: 'hourly',
            onTabChange: () => {},
            selectedDate: null,
            onSelectDate: () => {},
          },
        }}
      />,
    )
    expect(html).toContain('No hour-by-hour forecast for this location yet.')
  })

  it('does not claim the days have no forecast while the request is still in flight', () => {
    // `/hourly/:id` is the slowest query on the screen. Deriving "which days can
    // be opened" from a response that has not arrived turns a loading state into
    // a confident statement about the forecast.
    const html = renderToStaticMarkup(
      <DetailView
        isClimbingLocation
        asosStation={null}
        forecast={ok([day(DAY_1), day(DAY_2), day(DAY_3)])}
        hourly={{
          data: undefined,
          isPending: true,
          isError: false,
          refetch: () => {},
          tabs: {
            active: 'daily',
            onTabChange: () => {},
            selectedDate: null,
            onSelectDate: () => {},
          },
        }}
      />,
    )
    expect(html).toContain('Next 7 days')
    expect(html).not.toContain('can&#x27;t be opened')
  })

  it('says the hourly request failed rather than that the days have no forecast', () => {
    // After an error the untappable state is permanent, so the wrong version of
    // this is not a flicker — it is a network failure permanently displayed as a
    // fact about the weather.
    const html = renderToStaticMarkup(
      <DetailView
        isClimbingLocation
        asosStation={null}
        forecast={ok([day(DAY_1), day(DAY_2), day(DAY_3)])}
        hourly={{
          data: undefined,
          isPending: false,
          isError: true,
          refetch: () => {},
          tabs: {
            active: 'daily',
            onTabChange: () => {},
            selectedDate: null,
            onSelectDate: () => {},
          },
        }}
      />,
    )
    expect(html).not.toContain('can&#x27;t be opened')
    expect(html).toContain('Couldn&#x27;t load the hour-by-hour forecast.')
  })

  it('shows no tab bar at all on the preview path', () => {
    // `/add` has no saved row, so `/hourly/:id` has nothing to read and a
    // second tab would open on a screen that cannot have any.
    const html = renderToStaticMarkup(
      <DetailView unsaved isClimbingLocation asosStation={null} forecast={ok([day(DAY_1)])} />,
    )
    expect(html).not.toContain('role="tablist"')
    expect(html).toContain('Next 7 days')
  })
})
