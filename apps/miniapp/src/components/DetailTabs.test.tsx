import { renderInRouter } from '../test/renderInRouter.js'
import { describe, expect, it, vi } from 'vitest'
import type {
  Conditions,
  ForecastSnapshot,
  HourlySample,
  HourlySeries,
  Location,
  RainGaugeReadings,
  RecentPrecip,
  RiverGaugeReading,
  Visit,
  WeatherAlert,
} from '@weatherteam6/types'
import { RIVER_GAUGES } from '@weatherteam6/types'
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

const score: Conditions = {
  location_id: 'loc',
  forecast_date: DAY_1,
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
    today: {
      local_date: DAY_1,
      window: null,
      best: {
        valid_at: `${DAY_1}T12:00:00.000Z`,
        rock: { level: 'dry', qualified: true },
        friction: { level: 'good', condensing: false, qualified: true },
        score: 72,
        t_surface_c: 18,
        condensation_margin_c: 4,
      },
    },
  },
}

const visibleText = (html: string): string => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

function ok<T>(data: T) {
  return { data, isPending: false, isError: false, refetch: () => {} }
}

type Tabs = NonNullable<Parameters<typeof DetailView>[0]['hourly']>['tabs']

function render(tabs: Partial<Tabs> = {}): string {
  return renderInRouter(
    <DetailView
      isClimbingLocation
      forecast={ok([day(DAY_1), day(DAY_2), day(DAY_3)])}
      alerts={{ data: [], isError: false }}
      hourly={{
        ...ok(series),
        tabs: {
          active: 'daily',
          onTabChange: () => {},
          selectedDate: DAY_1,
          onSelectDate: () => {}, readMs: null, onRead: () => {},
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
    expect(daily).toMatch(/<span>Seven days</)
    // The seven-day strip was removed from Daily on 2026-09-28 (owner): the
    // V2 rows carry the figures, and the Hourly tab carries the charts.
    expect(daily).not.toContain('Hour by hour')

    const hourly = render({ active: 'hourly' })
    expect(hourly).not.toMatch(/<span>Seven days</)
    // The day picker, then the hybrid look's three cards.
    expect(hourly).toMatch(/aria-pressed="true" aria-label="Today, /)
    for (const title of ['Temperature and humidity', 'Rain', 'Wind']) expect(hourly).toMatch(new RegExp(`<h2[^>]*><span>${title}<`))
  })

  it('makes only the days the ensemble reached tappable', () => {
    // Three forecast rows, two drawable days. The third row exists — the daily
    // forecast covers it — and must not open two empty charts.
    const html = render({ active: 'daily' })
    const rowButtons = [...html.matchAll(/<button type="button" aria-label="[^"]*score[^"]*chance of rain"/g)]
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
      { active: 'daily', onTabChange, selectedDate: DAY_1, onSelectDate, readMs: null, onRead: () => {}, panelId: 'panel' },
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
      const html = renderInRouter(
        <DetailView
          isClimbingLocation
          forecast={ok([day(DAY_1), day(DAY_2), day(DAY_3)])}
          alerts={{ data: [heatWarning], isError: false }}
          conditions={ok(score)}
          hourly={{
            ...ok(series),
            tabs: {
              active,
              onTabChange: () => {},
              selectedDate: DAY_1,
              onSelectDate: () => {}, readMs: null, onRead: () => {},
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

  it('puts the hero on Overview and nowhere else', () => {
    // **The hero is about now, and Hourly is a day pager.** Now's reading at
    // the top of a screen showing Saturday is a claim about the wrong day.
    const render = (active: 'overview' | 'daily' | 'hourly'): string =>
      renderInRouter(
        <DetailView
          isClimbingLocation
          forecast={ok([day(DAY_1), day(DAY_2), day(DAY_3)])}
          alerts={{ data: [], isError: false }}
          conditions={ok(score)}
          hourly={{
            ...ok(series),
            tabs: {
              active,
              onTabChange: () => {},
              selectedDate: DAY_1,
              onSelectDate: () => {}, readMs: null, onRead: () => {},
              panelId: 'panel',
            },
          }}
        />,
      )

    expect(render('overview')).toContain('>72<')
    expect(render('overview')).toContain('data-hero')
    expect(render('daily')).not.toContain('data-hero')
    expect(render('hourly')).not.toContain('data-hero')
    // The Hourly tab's own readings come from the *series*, which this fixture
    // leaves unset — so nothing borrows now's.
    expect(render('hourly')).not.toContain('>72<')
  })

  it('says so when no day in the window can be drawn, rather than showing blank charts', () => {
    const html = renderInRouter(
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
            onSelectDate: () => {}, readMs: null, onRead: () => {},
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
    const html = renderInRouter(
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
            onSelectDate: () => {}, readMs: null, onRead: () => {},
            panelId: 'panel',
          },
        }}
      />,
    )
    expect(html).toMatch(/<span>Seven days</)
    expect(html).not.toContain('can&#x27;t be opened')
  })

  it('says the hourly request failed rather than that the days have no forecast', () => {
    // After an error the untappable state is permanent, so the wrong version of
    // this is not a flicker — it is a network failure permanently displayed as a
    // fact about the weather.
    const html = renderInRouter(
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
            onSelectDate: () => {}, readMs: null, onRead: () => {},
            panelId: 'panel',
          },
        }}
      />,
    )
    expect(html).not.toContain('can&#x27;t be opened')
    expect(html).toContain('Couldn&#x27;t load the hour-by-hour forecast.')
  })

  it('shows no tab bar at all without hourly data', () => {
    // A tab with nothing behind it would open on a screen that cannot have any.
    const html = renderInRouter(
      <DetailView isClimbingLocation forecast={ok([day(DAY_1)])} />,
    )
    expect(html).not.toContain('role="tablist"')
    expect(html).toMatch(/<span>Seven days</)
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

  // DAY_2 (91) has two of four weather models wet; DAY_3 (44) has three, but scores under 70.
  const withSplits: HourlySeries = {
    ...withReadings,
    readings: {
      ...withReadings.readings!,
      days: withReadings.readings!.days.map((d) => ({
        ...d,
        rain_split: d.local_date === DAY_2 ? { wet: 2, models: 4 } : { wet: 3, models: 4 },
      })),
    },
  }

  const overview = (over: { alerts?: WeatherAlert[]; climbing?: boolean; splits?: boolean } = {}): string => {
    vi.setSystemTime(new Date(T0 + 12 * HOUR_MS))
    const html = renderInRouter(
      <DetailView
        isClimbingLocation={over.climbing ?? true}
        // The rows carry the retired five-component score, 13. It must not
        // appear anywhere: Crag A is the score on every screen.
        forecast={ok([day(DAY_1), { ...day(DAY_2), score: 13 }, { ...day(DAY_3), score: 13 }])}
        alerts={{ data: over.alerts ?? [], isError: false }}
        conditions={ok(score)}
        hourly={{
          ...ok(over.splits === true ? withSplits : withReadings),
          tabs: {
            active: 'overview',
            onTabChange: () => {},
            selectedDate: DAY_1,
            onSelectDate: () => {}, readMs: null, onRead: () => {},
            panelId: 'panel',
          },
        }}
      />,
    )
    vi.useRealTimers()
    return html
  }

  /**
   * The chart section's markup alone, so a figure the hero also carries cannot
   * satisfy it. Throws when the title is missing: an empty slice made every
   * `not.toContain` here pass vacuously.
   */
  /** One card's markup, by its h2. Throws when missing: an empty slice made every `not.toContain` pass vacuously. */
  const card = (html: string, title: string) => {
    const start = html.search(new RegExp(`<h2[^>]*><span>${title}<`))
    if (start < 0) throw new Error(`no "${title}" card`)
    return html.slice(start, html.indexOf('</section>', start))
  }
  const scoreRow = (today: string) => [...today.matchAll(/font-weight="700"[^>]*>([0-9]+|—)<\/text>/g)].map((m) => m[1])

  // Now is 07:00 local, so the window runs 01:00-17:00: both scored hours, 09:00 and 12:00, are in it.
  it('draws the hours around now as a chart, with each hour’s score under it', () => {
    const today = card(overview(), 'Today')
    expect(today).toContain('>9a<')
    expect(today).toContain('>12p<')
    expect(today).toContain('>now<')
    // Both scored hours read 80; the rest have no reading and show a dash, never a number.
    const row = scoreRow(today)
    expect(row.filter((s) => s === '80')).toHaveLength(2)
    expect(row.filter((s) => s !== '80' && s !== '—')).toHaveLength(0)
  })

  it('scores the next days from the Crag A readings, never the forecast row', () => {
    const next = card(overview(), 'Next days')
    expect(next).toMatch(/>91<\/b>/)
    expect(next).toMatch(/>44<\/b>/)
    expect(next).not.toMatch(/>13</)
  })

  it('keeps every score under a Severe+ alert (owner, 2026-10-29)', () => {
    const html = overview({ alerts: [heatWarning] })
    const next = card(html, 'Next days')
    expect(next).toContain('>Tue<')
    expect(next).toMatch(/>91<\/b>/)
    expect(scoreRow(card(html, 'Today'))).toEqual(scoreRow(card(overview(), 'Today')))
    expect(scoreRow(card(html, 'Today')).length).toBeGreaterThan(0)
  })

  it('dots a good day whose weather models split on rain, and keys them once (owner, 2026-11-02)', () => {
    const next = card(overview({ splits: true }), 'Next days')
    expect(next.match(/aria-label="Tue[^"]*2 of 4 weather models say it&#x27;ll be wet"/g) ?? []).toHaveLength(1)
    // Three of four on a day scored 44: the score already says it, so no dots.
    expect(next).not.toContain('3 of 4')
    expect(visibleText(next)).toMatch(/weather models that say it(&#x27;|')ll be wet/)
  })

  it('shows no dots and no key when no good day splits', () => {
    const next = card(overview(), 'Next days')
    expect(next).not.toContain('weather models')
  })

  it('names the next likely rain from the ensemble’s wet share', () => {
    const rain = visibleText(card(overview(), 'Right now'))
    expect(rain).toContain('Next rain Tue 64% · from')
  })

  it('gives a city a neutral chart, day ranges and no score', () => {
    const html = overview({ climbing: false })
    const today = card(html, 'Today')
    expect(today).toContain('>9a<')
    expect(scoreRow(today)).toHaveLength(0)
    expect(card(html, 'Next days')).not.toMatch(/>91</)
    expect(visibleText(card(html, 'Next days'))).toContain('68°/50°')
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

  function renderPrecip(
    data: RecentPrecip,
    isClimbingLocation = true,
    hourlySeries: HourlySeries = series,
    rainGauges?: RainGaugeReadings,
    extra: { location?: Location; river?: RiverGaugeReading[] | 'error'; visits?: Visit[] } = {},
  ): string {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-15T09:30:00Z'))
    const html = renderInRouter(
      <DetailView
        isClimbingLocation={isClimbingLocation}
        forecast={ok([day(DAY_1)])}
        hourly={{
          ...ok(hourlySeries),
          tabs: { active: 'precip', onTabChange: () => {}, selectedDate: DAY_1, onSelectDate: () => {}, readMs: null, onRead: () => {}, panelId: 'panel' },
        }}
        recentPrecip={ok(data)}
        {...(rainGauges === undefined ? {} : { rainGauges: ok(rainGauges) })}
        {...(extra.location === undefined ? {} : { location: extra.location })}
        {...(extra.river === undefined
          ? {}
          : { river: extra.river === 'error' ? { data: undefined, isError: true } : { data: extra.river, isError: false } })}
        {...(extra.visits === undefined ? {} : { visits: { data: extra.visits, isError: false } })}
      />,
    )
    vi.useRealTimers()
    return html
  }

  it('shows the rock under the rain: in the readout, when it is dry again, and with the aspect note once', () => {
    const html = renderPrecip(recent, true, withRock)
    // The readout opens on Today 06:00, which the model read as drying.
    expect(html).toMatch(/Dryness<\/span><span[^>]*>Drying</)
    // A cell names its rock state to a screen reader; a gap says so.
    expect(html).toContain('aria-label="Sun 6pm–7pm: Precip 0.18 in, Type Rain, Resets drying Yes, Dryness Wet"')
    expect(html).toContain('aria-label="Sun 5pm–6pm: Precip No data, Dryness No reading"')
    // The 09:00 reading, nearest now, is dry.
    expect(html).toMatch(/Dry again<\/span><b[^>]*>Now</)
    expect(html).toContain('rock is dry')
    // Sun 20:00 is unqualified, so the tab says once that the wall direction is not set.
    expect(html).toContain('Wall direction not set, so sunny hours may read warm.')
  })

  describe('rain gauges (#479)', () => {
    const noDay = (local_date: string) => ({ local_date, gauge: null, volunteer_gauge: null })
    const gauges: RainGaugeReadings = {
      airport: { station: 'DLL', distance_km: 11.8, answered: true },
      volunteer: { stations: 2, failed: 0 },
      days: [
        ...['09', '10', '11', '12'].map((d) => noDay(`2026-09-${d}`)),
        {
          local_date: '2026-09-13',
          gauge: { station: 'DLL', distance_km: 11.8, rain_mm: 10.7, hours_reported: 24, hours_expected: 24 },
          volunteer_gauge: {
            station: 'WI-SK-26',
            name: 'Baraboo 2.1 S',
            distance_km: 6,
            rain_mm: 9.6,
            report_date: '2026-09-14',
            obs_hour: 7,
          },
        },
        {
          local_date: '2026-09-14',
          gauge: { station: 'DLL', distance_km: 11.8, rain_mm: null, hours_reported: 21, hours_expected: 24 },
          volunteer_gauge: null,
        },
      ],
    }

    /** The 13th and 14th as whole days of model hours: 4.6 mm on the 13th, dry on the 14th. */
    const wholeDays: RecentPrecip = {
      ...recent,
      hours: ['2026-09-13', '2026-09-14'].flatMap((date) =>
        Array.from({ length: 24 }, (_, h) => {
          const mm = date === '2026-09-13' && h === 19 ? 4.6 : 0
          return { valid_at_local: `${date}T${String(h).padStart(2, '0')}:00`, precip_mm: mm, rain_mm: mm, snowfall_cm: 0 }
        }),
      ),
    }

    /** One row of the grid's markup, from its name to the end of the row. */
    const gridRow = (html: string, name: string) => {
      const start = html.indexOf(`>${name}</th>`)
      return start < 0 ? '' : html.slice(start, html.indexOf('</tr>', start))
    }

    it('answers first, over each gauge’s own whole days, then a grid of every source by day', () => {
      const html = renderPrecip(wholeDays, true, series, gauges)
      expect(html).toContain('Rain gauges')
      // One kind of gauge: no tab strip.
      expect(html).not.toContain('role="tablist" aria-label="Gauges"')
      // The airport's 14th is partial, so only the 13th counts for it: 0.42 in against the models' 0.18 in.
      expect(html).toContain('The models ran drier than the gauges')
      expect(html).toContain('Airport 0.42 in · models 0.18 in, over 1 whole day')
      expect(html).toContain('Volunteer 0.38 in · models 0.18 in, over 1 whole day')
      // Columns run oldest first, Wed the 9th to Mon the 14th, then the total.
      expect(html).toMatch(/>Wed<\/th>[^]*?>Mon<\/th>[^]*?>6 days<\/th>/)
      // The 9th to 12th are outside the window the models drew: no figure, never 0, and so no total.
      const models = gridRow(html, 'Models')
      expect(models).toMatch(/aria-label="no figure"[^]*?>0\.18<\/td>[^]*?>0<\/td>[^]*?>—<\/td>$/)
      // A short airport day is part, never a drier total; a day with no report withholds the total.
      expect(gridRow(html, 'Airport')).toMatch(/>0\.42<\/td>[^]*?>part<\/td>[^]*?aria-label="total withheld/)
      expect(gridRow(html, 'Volunteer')).toMatch(/>0\.38<\/td>/)
      // The stations are named once, in the footnote.
      expect(html).toContain('Inches. Airport DLL 7 mi · volunteer 4 mi.')
      expect(html).toContain('Volunteers read at 7 am, so overnight rain can land a day off.')
      // Every gauge answered, so an empty day is no report, not a failure.
      expect(html).toContain('aria-label="no report"')
      expect(html).not.toContain('no reading')
      expect(html).not.toContain('did not answer')
    })

    it('never sets a part day of the models beside a gauge’s whole day', () => {
      // The fixture's 13th has two model hours: partial, so nothing to compare.
      const html = renderPrecip(recent, true, series, gauges)
      expect(gridRow(html, 'Models')).toContain('>part</td>')
      expect(html).toContain('No whole day at a gauge to set beside the models yet.')
      expect(html).not.toContain('The models ran')
    })

    it('says a failed read, and never calls an empty day unreported then', () => {
      const html = renderPrecip(wholeDays, true, series, {
        ...gauges,
        airport: { station: 'DLL', distance_km: 11.8, answered: false },
        volunteer: { stations: 2, failed: 1 },
        days: gauges.days.map((d) => noDay(d.local_date)),
      })
      expect(html).toContain('The airport gauge at DLL did not answer. 1 of 2 volunteer gauges did not answer.')
      expect(gridRow(html, 'Airport')).toContain('aria-label="no reading"')
      expect(gridRow(html, 'Volunteer')).toContain('aria-label="no reading"')
      expect(html).not.toContain('no report')
    })

    describe('with a river gauge (#589)', () => {
      const robinson: Location = {
        id: 'loc',
        user_id: 'u',
        name: 'Robinson Park',
        lat: 46.12,
        lon: -92.87,
        elevation_m: 300,
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
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: null,
        known_crag: 'robinson-park',
      }
      const gauge = RIVER_GAUGES['robinson-park']![0]!
      // Hourly from 15 days back to 09:00 UTC on the 15th, 30 min before the test's now; 4.68 ft at the end.
      const NOW_MS = Date.parse('2026-09-15T09:00:00Z')
      const reading: RiverGaugeReading = {
        ...gauge,
        points: Array.from({ length: 15 * 24 }, (_, k) => ({
          at: new Date(NOW_MS - (15 * 24 - 1 - k) * 3_600_000).toISOString(),
          height_ft: k === 15 * 24 - 1 ? 4.68 : k === 15 * 24 - 26 ? 4.74 : 4.9,
        })),
      }
      const visit: Visit = { id: 'v1', observed_at: '2026-09-13T17:00:00Z', observed_conditions: 'dry', message: 'Beach boulder just reachable.' }

      it('puts the river beside the rain in tabs, each with its word', () => {
        const html = renderPrecip(wholeDays, true, series, gauges, { location: robinson, river: [reading], visits: [visit] })
        expect(html).toContain('role="tablist" aria-label="Gauges"')
        expect(html).toMatch(/>Rain<\/span><span[^>]*>Models drier</)
        expect(html).toMatch(/>River<\/span><span[^>]*>Low enough</)
        // The visit is listed under the tabs, with the river at the time and their own words.
        expect(html).toContain('Your visits')
        expect(html).toContain('You saw dry · River 4.90 ft')
        expect(html).toContain('Beach boulder just reachable.')
        // And tagged above its day in the grid.
        expect(html).toMatch(/>Visit<\/span>/)
      })

      it('draws the river alone, with its line, change and chart, where there is no rain gauge', () => {
        const html = renderPrecip(wholeDays, true, series, undefined, { location: robinson, river: [reading], visits: [visit] })
        expect(html).toContain('River gauge')
        expect(html).not.toContain('role="tablist" aria-label="Gauges"')
        expect(html).toMatch(/>4\.68<small[^>]*>ft</)
        expect(html).toContain('falling 0.06 ft in 25 h')
        expect(html).toContain('Beach boulder is reachable')
        expect(html).toContain('your line is 4.95 ft')
        expect(html).toContain('Your visit · Sep 13')
        expect(html).toContain('check the water before you cross')
      })

      it('shows a gap, never the last figure, when the newest reading is too old', () => {
        const stale = { ...reading, points: reading.points.slice(0, -8) }
        const html = renderPrecip(wholeDays, true, series, undefined, { location: robinson, river: [stale] })
        // The last reading, 4.90 ft 8 h ago, is never printed as now.
        expect(html).not.toMatch(/>4\.90<small/)
        expect(html).toMatch(/>—<\/span>/)
        expect(html).toContain('No recent reading')
        expect(html).toContain('too old to show')
      })

      it('says no reading on the tab when the river request failed, never low enough', () => {
        const html = renderPrecip(wholeDays, true, series, gauges, { location: robinson, river: 'error' })
        expect(html).toMatch(/>River<\/span><span[^>]*>No reading</)
      })

      it('draws no River tab at a crag with no river gauge, even when a reading is passed', () => {
        const html = renderPrecip(wholeDays, true, series, gauges, { location: { ...robinson, known_crag: null }, river: [reading] })
        expect(html).not.toContain('role="tablist" aria-label="Gauges"')
      })
    })

    it('draws no card where no gauge is in reach', () => {
      const html = renderPrecip(recent, true, series, { airport: null, volunteer: { stations: 0, failed: 0 }, days: gauges.days.map((d) => noDay(d.local_date)) })
      expect(html).not.toContain('Rain gauges')
    })
  })

  it('draws no rock for a city, or before /hourly carries the history', () => {
    for (const html of [renderPrecip(recent, false, withRock), renderPrecip(recent)]) {
      expect(html).not.toContain('>Rock<')
      // No Dryness field in the readout or on any cell (the caveat may still name Dryness).
      expect(html).not.toMatch(/Dryness<\/span>/)
      expect(html).not.toContain(', Dryness ')
      expect(html).not.toContain('Wall direction not set')
    }
    // A city has no rock to dry.
    expect(renderPrecip(recent, false, withRock)).not.toContain('Dry again')
  })

  it('puts today on the top row of the hour grid', () => {
    const html = renderPrecip(recent)
    const grid = html.slice(html.indexOf('aria-label="Precipitation by hour'))
    expect(grid.indexOf('>Today<')).toBeLessThan(grid.indexOf('>Sun<'))
  })

  it('leads with the hours since the last rain of any size, the week total and hours with rain', () => {
    const html = renderPrecip(recent)
    expect(html).toContain('Last rain<')
    // Today 06:00's trace → 09:30 (owner, 2026-11-02: not Sunday's storm, 38 hours back).
    expect(html).toContain('>3<')
    expect(html).toContain('hours ago')
    expect(html).toContain('today 6am · trace over 1 h')
    expect(html).toContain('This week')
    expect(html).toMatch(/This week<\/span><b[^>]*>0\.19 in</)
    expect(html).toContain('2 hours with rain')
  })

  it('has no running-total chart (owner, 2026-10-19)', () => {
    expect(renderPrecip(recent)).not.toContain('Running total')
  })

  it('totals today on the location’s own date', () => {
    const html = renderPrecip(recent)
    // Today is 2026-09-15: its 06:00 shower and a dry 09:00.
    expect(html).toContain('>Today<')
    expect(html).toContain('>trace<')
    expect(html).toContain('1 hour with rain<')
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
    expect(html).toContain('Raining now')
    expect(html).toContain('so far, over')
    expect(html).not.toContain('hours ago')
    expect(html).not.toContain('Last rain<')
  })

  it('names the real rain the drying clock runs from under a lighter shower since', () => {
    const html = renderPrecip(recent)
    expect(html).toContain('Last real rain: Sun 7pm · 0.18 in over 1 h')
    // With nothing lighter since, the headline is the real rain and says it once.
    const stormOnly = { ...recent, hours: recent.hours.filter((h) => h.valid_at_local < '2026-09-15') }
    expect(renderPrecip(stormOnly)).not.toContain('Last real rain')
  })

  it('draws every hour as a tappable table, a skipped day as a gap, never a dry 0', () => {
    const html = renderPrecip(recent)
    expect(html).toContain('Every hour')
    // One button per hour: 3 days × 24.
    expect(html.match(/<button[^>]*data-cell=/g)).toHaveLength(72)
    // Sun 19:00 carried the storm; its cell says so to a screen reader.
    expect(html).toContain('aria-label="Sun 6pm–7pm: Precip 0.18 in, Type Rain, Resets drying Yes"')
    // Monday is missing from the response: every hour says so, and its total is a dash.
    expect(html).toContain('aria-label="Mon 12pm–1pm: Precip No data"')
    expect(html).toContain('>—<')
    // Stamp 00:00 closes the previous day's last hour, so both days are named.
    expect(html).toContain('aria-label="Sun 11pm–Mon 12am: Precip No data"')
    expect(html).toContain('Open-Meteo past hours')
    // An API that did not say which models it drew names none.
    expect(html).not.toContain('forecasts.')
  })

  it('opens the readout on the most recent wet hour, with what it carried', () => {
    const html = renderPrecip(recent)
    // Today 06:00's shower is the newest wet hour.
    expect(html).toContain('Today 5am–6am')
    expect(html).toContain('aria-pressed="true" aria-label="Today 5am–6am')
    // 0.2 mm: enough to set drying back, short of the 0.5 mm that stops climbing.
    expect(html).toMatch(/Resets drying<\/span><span[^>]*>Partly</)
    expect(html).toMatch(/Week so far<\/span><span[^>]*>0\.19 in</)
  })

  it('names the models it drew, and ties the threshold to drying only at a crag', () => {
    const withModels = { ...recent, models: ['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless', 'gem_seamless'] }
    const crag = renderPrecip(withModels)
    expect(crag).toContain('From GFS, ECMWF, ICON and GEM forecasts.')
    expect(crag).toContain('lighter showers set drying back by less')
    const city = renderPrecip(withModels, false)
    expect(city).toContain('From GFS, ECMWF, ICON and GEM forecasts.')
    expect(city).not.toContain('Dryness')
    expect(city).not.toContain('drying back')
    expect(city).not.toContain('Check the rock')
  })

  it('says what radar overruled, and names radar only when it decided an hour (#468)', () => {
    const checked: RecentPrecip = {
      ...recent,
      models: ['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless', 'gem_seamless'],
      rain_radar: true,
      hours: [
        { valid_at_local: '2026-09-13T19:00', precip_mm: 0, rain_mm: 0, snowfall_cm: 0, model_precip_mm: 7.6 },
        ...recent.hours.slice(1),
      ],
    }
    const html = renderPrecip(checked)
    expect(html).toContain('Radar saw none of the models&#x27; 0.30 in at the crag, last Sun 7pm.')
    expect(html).toContain('ICON and GEM forecasts, checked against NOAA radar.')
    // Sunday's storm is gone: no real rain is left in the window.
    expect(html).not.toContain('Last real rain')
    expect(renderPrecip(checked, false)).toContain('Radar saw none of the models&#x27; 0.30 in here, last Sun 7pm.')
    // Without the flag, radar is never named and nothing is said overruled.
    const plain = renderPrecip({ ...recent, models: checked.models })
    expect(plain).not.toContain('radar')
    expect(plain).not.toContain('Radar')
  })

  it('calls unknown precipitation precipitation, never rain', () => {
    const legacy = {
      ...recent,
      hours: recent.hours.map(({ valid_at_local, precip_mm }) => ({ valid_at_local, precip_mm })),
    }
    const html = renderPrecip(legacy)
    expect(html).toContain('Last precipitation')
    expect(html).not.toContain('Last rain')
  })

  it('headlines a light shower and says no real rain fell, rather than that it has not rained', () => {
    const showers = { ...recent, hours: recent.hours.map((h) => ({ ...h, precip_mm: Math.min(h.precip_mm, 0.3), rain_mm: Math.min(h.precip_mm, 0.3) })) }
    const html = renderPrecip(showers)
    expect(html).not.toContain('>None<')
    expect(html).toContain('No real rain in the past 3 days')
    // And a window with no precipitation at all says None, and only the span.
    const dry = { ...recent, hours: recent.hours.map((h) => ({ ...h, precip_mm: 0, rain_mm: 0 })) }
    const dryHtml = renderPrecip(dry)
    expect(dryHtml).toContain('>None<')
    expect(dryHtml).toContain('in the past 3 days')
    expect(dryHtml).not.toContain('real rain in the past')
  })
})
