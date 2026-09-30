import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type {
  ConditionsScore,
  ForecastSnapshot,
  HourlySample,
  HourlySeries,
  RecentPrecip,
  WeatherAlert,
} from '@weatherteam6/types'
import { DetailView, detailTabs, openDayInHourly } from './DetailView.js'
import { HOUR_MS } from './charts/hourlySeries.js'

/**
 * Phase 3's acceptance criteria, as rendered markup.
 *
 * Tapping a day in Daily lands on that day in Hourly; a day flagged without
 * coverage in `days[]` is not tappable; and the sections that outrank a tab —
 * the alert banner above all, the score and the sources footer — stay outside
 * the tabs where switching cannot hide them.
 *
 * Back returning to Daily rather than leaving the location is the third
 * criterion and is **not covered here.** It lives in `LocationDetail`, and the
 * target resolution is unit-tested in `lib/backTarget.test.ts`; the wiring was
 * driven in a real browser against the real API. `vitest.config.ts` is
 * `environment: 'node'` with no DOM, so it cannot be covered from here.
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
  readings: {
    model: 'gfs_seamless',
    unavailable_reason: null,
    utc_offset_seconds: 0,
    now: {
      valid_at: `${DAY_1}T12:00:00.000Z`,
      rock: { level: 'dry', qualified: true },
      friction: { level: 'good', condensing: false, qualified: true },
      score: 72,
      t_surface_c: 18,
      condensation_margin_c: 4,
    },
    today: { local_date: DAY_1, window: null, best: null },
  },
}

function ok<T>(data: T) {
  return { data, isPending: false, isError: false, refetch: () => {} }
}

type Tabs = NonNullable<Parameters<typeof DetailView>[0]['hourly']>['tabs']

function render(tabs: Partial<Tabs> = {}): string {
  return renderToStaticMarkup(
    <DetailView
      isClimbingLocation
      forecast={ok([day(DAY_1), day(DAY_2), day(DAY_3)])}
      alerts={{ data: [], isPending: false, isError: false }}
      hourly={{
        ...ok(series),
        tabs: {
          active: 'daily',
          onTabChange: () => {},
          selectedDate: DAY_1,
          onSelectDate: () => {},
          panelId: 'panel',
          ...tabs,
        },
      }}
    />,
  )
}

describe('DetailView — tabs', () => {
  it('offers six tabs to a crag and four to a city, Precip between Hourly and Rock', () => {
    expect(detailTabs(true).map((t) => t.label)).toEqual(['Overview', 'Daily', 'Hourly', 'Precip', 'Rock', 'Crag'])
    // A city has no rock and no walls: a tab opening onto an empty panel is a
    // promise the screen cannot keep.
    expect(detailTabs(false).map((t) => t.label)).toEqual(['Overview', 'Daily', 'Hourly', 'Precip'])
  })

  it('renders the open tab as the panel the header’s tabs control', () => {
    const html = render()
    expect(html).toContain('id="panel" role="tabpanel"')
  })

  it('shows the daily rows on Daily and the day charts on Hourly', () => {
    const daily = render({ active: 'daily' })
    expect(daily).toMatch(/>Next [0-9]+ days?</)
    // The seven-day strip was removed from Daily on 2026-09-28 (owner): the
    // V2 rows carry the figures, and the Hourly tab carries the charts.
    expect(daily).not.toContain('Hour by hour')

    const hourly = render({ active: 'hourly' })
    expect(hourly).not.toMatch(/>Next [0-9]+ days?</)
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
      { active: 'daily', onTabChange, selectedDate: DAY_1, onSelectDate, panelId: 'panel' },
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
    for (const active of ['overview', 'daily', 'hourly', 'rock', 'crag'] as const) {
      const html = renderToStaticMarkup(
        <DetailView
          isClimbingLocation
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
              panelId: 'panel',
            },
          }}
        />,
      )
      expect(html).toContain('Extreme Heat Warning')
      // The footer's forecast row, which no tab panel draws.
      expect(html).toContain('Forecast</dt>')
    }
  })

  it('puts the Conditions now hero on Overview and nowhere else', () => {
    // **The hero is about today, and Hourly is a day pager.** Today's reading
    // at the top of a screen showing Saturday is a claim about the wrong day;
    // the pager carries that day's own readings instead. Daily has no hero in
    // its V2 frame either.
    const render = (active: 'overview' | 'daily' | 'hourly'): string =>
      renderToStaticMarkup(
        <DetailView
          isClimbingLocation
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
              panelId: 'panel',
            },
          }}
        />,
      )

    // The score renders in the hero only once alerts settle, and this fixture
    // carries a Severe+ alert in no case — so 72 is the hero's third gauge.
    expect(render('overview')).toContain('>72<')
    expect(render('overview')).toContain('Conditions now')
    expect(render('daily')).not.toContain('Conditions now')
    expect(render('hourly')).not.toContain('Conditions now')
    // The Hourly tab's own readings come from the *series*, which this fixture
    // leaves unset — so the pager reports that rather than borrowing today's.
    expect(render('hourly')).not.toContain('>72<')
  })

  it('says so when no day in the window can be drawn, rather than showing blank charts', () => {
    const html = renderToStaticMarkup(
      <DetailView
        isClimbingLocation
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
            panelId: 'panel',
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
            panelId: 'panel',
          },
        }}
      />,
    )
    expect(html).toMatch(/>Next [0-9]+ days?</)
    expect(html).not.toContain('can&#x27;t be opened')
  })

  it('says the hourly request failed rather than that the days have no forecast', () => {
    // After an error the untappable state is permanent, so the wrong version of
    // this is not a flicker — it is a network failure permanently displayed as a
    // fact about the weather.
    const html = renderToStaticMarkup(
      <DetailView
        isClimbingLocation
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
            panelId: 'panel',
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
      <DetailView unsaved isClimbingLocation forecast={ok([day(DAY_1)])} />,
    )
    expect(html).not.toContain('role="tablist"')
    expect(html).toMatch(/>Next [0-9]+ days?</)
  })
})

describe('DetailView — the Overview tab', () => {
  // The fixture's local clock is UTC-5, so hour index 14 is 09:00 on DAY_1.
  const readingAt = (i: number, level: 'great' | 'poor') => ({
    valid_at: new Date(T0 + i * HOUR_MS).toISOString(),
    rock: { level: 'dry' as const, qualified: true },
    friction: { level, condensing: false, qualified: true },
    score: 80,
    t_surface_c: 18,
    condensation_margin_c: 4,
  })

  const withReadings: HourlySeries = {
    ...series,
    hours: series.hours.map((h, i) => ({
      ...h,
      temp_c: 15,
      // Only DAY_2 afternoon is likely to rain.
      precip_chance_pct: h.local_date === DAY_2 && i >= 40 ? 64 : 10,
    })),
    readings: {
      model: 'gfs_seamless',
      unavailable_reason: null,
      hours: [readingAt(14, 'great'), readingAt(17, 'poor')],
      days: [
        { local_date: DAY_2, window: null, best: { ...readingAt(38, 'great'), score: 91 } },
        { local_date: DAY_3, window: null, best: { ...readingAt(62, 'great'), score: 44 } },
      ],
    },
  }

  const overview = (over: { alerts?: WeatherAlert[]; climbing?: boolean } = {}): string => {
    vi.setSystemTime(new Date(T0 + 12 * HOUR_MS))
    const html = renderToStaticMarkup(
      <DetailView
        isClimbingLocation={over.climbing ?? true}
        // The rows carry the retired five-component score, 13. It must not
        // appear anywhere: Crag A is the score on every screen.
        forecast={ok([day(DAY_1), { ...day(DAY_2), score: 13 }, { ...day(DAY_3), score: 13 }])}
        alerts={{ data: over.alerts ?? [], isPending: false, isError: false }}
        conditions={ok(score)}
        hourly={{
          ...ok(withReadings),
          tabs: {
            active: 'overview',
            onTabChange: () => {},
            selectedDate: DAY_1,
            onSelectDate: () => {},
            panelId: 'panel',
          },
        }}
      />,
    )
    vi.useRealTimers()
    return html
  }

  /** The Today section's markup alone, so a figure the hero also carries cannot satisfy it. */
  const todaySection = (html: string) => html.slice(html.indexOf('>Today<'), html.indexOf('</section>', html.indexOf('>Today<')))

  it('draws today as a chart, the line coloured by the hour’s score', () => {
    const today = todaySection(overview())
    expect(today).toContain('>9a<')
    expect(today).toContain('>12p<')
    expect(today).toContain('>Score<')
    // The readout opens on an hour before anyone taps, and names every figure.
    for (const field of ['>Temp<', '>Dew<', '>Rain<', '>Wind<']) expect(today).toContain(field)
    // Both scored hours read 80, printed under their ticks.
    expect(today.match(/>80</g)?.length).toBe(2)
  })

  it('scores the next days from the Crag A readings, never the forecast row', () => {
    const html = overview()
    expect(html).toContain('Next 2 days')
    expect(html).toMatch(/>91<\/span>/)
    expect(html).toMatch(/>44<\/span>/)
    expect(html).not.toMatch(/>13<\/span>/)
  })

  it('drops the day scores under a Severe+ alert and keeps the rows', () => {
    const html = overview({ alerts: [heatWarning] })
    expect(html).toContain('Tue 9/15')
    expect(html).not.toMatch(/>91<\/span>/)
    // The line loses its score colour too: a tint with no number is the number leaking.
    expect(todaySection(html)).not.toContain('>Score<')
  })

  it('names the next likely rain from the ensemble’s wet share', () => {
    const html = overview()
    expect(html).toContain('Next likely rain')
    expect(html).toContain('Tue 9/15 · 64%')
  })

  it('gives a city a neutral chart, day ranges and no score', () => {
    const html = overview({ climbing: false })
    expect(todaySection(html)).toContain('>9a<')
    expect(todaySection(html)).not.toContain('>Score<')
    expect(html).not.toMatch(/>91<\/span>/)
    expect(html).toContain('50–68°F')
  })
})

describe('DetailView — Precip tab', () => {
  const recent: RecentPrecip = {
    hours: [
      { valid_at_local: '2026-09-13T19:00', precip_mm: 4.6, rain_mm: 4.6, snowfall_cm: 0 },
      { valid_at_local: '2026-09-13T20:00', precip_mm: 0, rain_mm: 0, snowfall_cm: 0 },
      { valid_at_local: '2026-09-15T06:00', precip_mm: 0.2, rain_mm: 0.2, snowfall_cm: 0 },
      { valid_at_local: '2026-09-15T09:00', precip_mm: 0, rain_mm: 0, snowfall_cm: 0 },
    ],
    utc_offset_seconds: 0,
    from_date: '2026-09-13',
  }

  /** Readings whose history covers the Precip window, on the same UTC clock. */
  const rock = (at: string, level: 'wet' | 'drying' | 'dry' | null, qualified = true) => ({
    valid_at: `${at}:00.000Z`,
    rock: level === null ? null : { level, qualified },
  })
  const withRock: HourlySeries = {
    ...series,
    utc_offset_seconds: 0,
    readings: {
      model: 'gfs_seamless',
      unavailable_reason: null,
      hours: [{ ...rock('2026-09-15T09:00', 'dry'), friction: null, score: null, t_surface_c: null, condensation_margin_c: null }],
      days: [],
      rock_history: [
        rock('2026-09-13T18:00', null),
        rock('2026-09-13T19:00', 'wet'),
        rock('2026-09-13T20:00', 'wet', false),
        rock('2026-09-15T06:00', 'drying'),
      ],
    },
  }

  function renderPrecip(data: RecentPrecip, isClimbingLocation = true, hourlySeries: HourlySeries = series): string {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-15T09:30:00Z'))
    const html = renderToStaticMarkup(
      <DetailView
        isClimbingLocation={isClimbingLocation}
        forecast={ok([day(DAY_1)])}
        hourly={{
          ...ok(hourlySeries),
          tabs: { active: 'precip', onTabChange: () => {}, selectedDate: DAY_1, onSelectDate: () => {}, panelId: 'panel' },
        }}
        recentPrecip={ok(data)}
      />,
    )
    vi.useRealTimers()
    return html
  }

  it('shows the rock under the rain: in the readout, as a strip, and with the aspect note once', () => {
    const html = renderPrecip(recent, true, withRock)
    // The readout opens on Today 06:00, which the model read as drying.
    expect(html).toMatch(/Dryness<\/span><span[^>]*>Drying</)
    // A cell names its rock state to a screen reader; a gap says so.
    expect(html).toContain('aria-label="Sun 18:00–19:00: Precip 0.18 in, Type Rain, Real rain Yes, Dryness Wet"')
    expect(html).toContain('aria-label="Sun 17:00–18:00: Precip No estimate for this hour, Dryness No reading"')
    // The strip and its key.
    expect(html).toContain('>Rock<')
    expect(html).toContain('Rain so far')
    expect(html).toMatch(/>Dry<\/span>.*>Drying<\/span>.*>Wet<\/span>/)
    // Sun 20:00 is unqualified, so the tab says once that aspect is unrecorded.
    expect(html).toContain('Aspect unrecorded — sunlit hours lean warm.')
  })

  it('draws no rock for a city, or before /hourly carries the history', () => {
    for (const html of [renderPrecip(recent, false, withRock), renderPrecip(recent)]) {
      expect(html).not.toContain('>Rock<')
      // No Dryness field in the readout or on any cell (the caveat may still name Dryness).
      expect(html).not.toMatch(/Dryness<\/span>/)
      expect(html).not.toContain(', Dryness ')
      expect(html).not.toContain('Aspect unrecorded')
    }
  })

  it('puts today on the top row of the hour grid', () => {
    const html = renderPrecip(recent)
    const grid = html.slice(html.indexOf('aria-label="Precipitation by hour'))
    expect(grid.indexOf('>Today<')).toBeLessThan(grid.indexOf('>Sun<'))
  })

  it('leads with the hours since the last real rain, the week total and wet hours', () => {
    const html = renderPrecip(recent)
    expect(html).toContain('Last real rain ended')
    // 2026-09-13T19:00 → 09:30 two days later.
    expect(html).toContain('>38<')
    expect(html).toContain('hours ago')
    expect(html).toContain('Sun 19:00 · that storm left 0.18 in over 1 h')
    expect(html).toContain('This week')
    expect(html).toContain('0.19 in')
    expect(html).toContain('Wet this week')
    expect(html).toContain('2 h')
  })

  it('draws the running total with each real storm, the flat run since, and a gap dashed', () => {
    const html = renderPrecip(recent)
    expect(html).toContain('Running total')
    expect(html).toContain('aria-label="Running total 0.19 in over 3 days, flat for the last 38 hours"')
    expect(html).toContain('+0.18 in')
    expect(html).toContain('no real rain · 38 h')
    // 2026-09-14 is missing from the response: bridged dashed, never a solid flat line.
    expect(html).toContain('stroke-dasharray="3 3"')
  })

  it('totals today on the location’s own date', () => {
    const html = renderPrecip(recent)
    // Today is 2026-09-15: its 06:00 shower and a dry 09:00.
    expect(html).toContain('>Today<')
    expect(html).toContain('>trace<')
    expect(html).toContain('1 wet hour<')
    // A window that ends before today has no today to total: a dash, never 0 in.
    const yesterday = { ...recent, hours: recent.hours.filter((h) => h.valid_at_local < '2026-09-15') }
    expect(renderPrecip(yesterday)).toContain('no hours yet')
  })

  it('says rain in the newest hour is falling now, never "0 hours ago"', () => {
    const raining = {
      ...recent,
      hours: [...recent.hours.slice(0, 3), { valid_at_local: '2026-09-15T09:00', precip_mm: 1.2, rain_mm: 1.2, snowfall_cm: 0 }],
    }
    const html = renderPrecip(raining)
    expect(html).toContain('Real rain in the latest hour')
    expect(html).toContain('>Now<')
    expect(html).toContain('this storm so far')
    expect(html).not.toContain('hours ago')
    expect(html).not.toContain('Last real rain ended')
  })

  it('names a lighter shower since without letting it reset the headline', () => {
    const html = renderPrecip(recent)
    expect(html).toContain('Lighter showers since (trace, last ending today 06:00)')
  })

  it('draws every hour as a tappable table, a skipped day as a gap, never a dry 0', () => {
    const html = renderPrecip(recent)
    expect(html).toContain('Every hour')
    // One button per hour: 3 days × 24.
    expect(html.match(/<button[^>]*data-cell=/g)).toHaveLength(72)
    // Sun 19:00 carried the storm; its cell says so to a screen reader.
    expect(html).toContain('aria-label="Sun 18:00–19:00: Precip 0.18 in, Type Rain, Real rain Yes"')
    // Monday is missing from the response: every hour says so, and its total is a dash.
    expect(html).toContain('aria-label="Mon 12:00–13:00: Precip No estimate for this hour"')
    expect(html).toContain('>—<')
    // Stamp 00:00 closes the previous day's last hour, so both days are named.
    expect(html).toContain('aria-label="Sun 23:00–Mon 00:00: Precip No estimate for this hour"')
    expect(html).toContain('Model estimates, not gauge readings.')
    expect(html).toContain('Open-Meteo past hours')
    // An API that did not say which models it drew names none.
    expect(html).not.toContain('Median of')
  })

  it('opens the readout on the most recent wet hour, with what it carried', () => {
    const html = renderPrecip(recent)
    // Today 06:00's shower is the newest wet hour.
    expect(html).toContain('Today 05:00–06:00')
    expect(html).toContain('aria-pressed="true" aria-label="Today 05:00–06:00')
    expect(html).toMatch(/Real rain<\/span><span[^>]*>No</)
    expect(html).toMatch(/Week so far<\/span><span[^>]*>0\.19 in</)
  })

  it('names the models whose median it drew, and ties the threshold to Dryness only at a crag', () => {
    const withModels = { ...recent, models: ['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless', 'gem_seamless'] }
    const crag = renderPrecip(withModels)
    expect(crag).toContain('Median of GFS, ECMWF, ICON and GEM. Model estimates, not gauge readings.')
    expect(crag).toContain('the amount that restarts Dryness.')
    const city = renderPrecip(withModels, false)
    expect(city).toContain('Median of GFS, ECMWF, ICON and GEM.')
    expect(city).not.toContain('Dryness')
    expect(city).not.toContain('Inspect rock')
  })

  it('calls unknown precipitation precipitation, never rain', () => {
    const legacy = {
      ...recent,
      hours: recent.hours.map(({ valid_at_local, precip_mm }) => ({ valid_at_local, precip_mm })),
    }
    const html = renderPrecip(legacy)
    expect(html).toContain('Last real precipitation ended')
    expect(html).not.toContain('Last real rain')
  })

  it('says no hour reached the line rather than that it has not rained', () => {
    const showers = { ...recent, hours: recent.hours.map((h) => ({ ...h, precip_mm: Math.min(h.precip_mm, 0.3), rain_mm: Math.min(h.precip_mm, 0.3) })) }
    const html = renderPrecip(showers)
    expect(html).toContain('>None<')
    expect(html).toContain('No hour reached 0.02 in during the past 3 days.')
    expect(html).not.toContain('Lighter showers since')
  })
})
