import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type {
  HourlyDay,
  HourlyReading,
  HourlySample,
  HourlySeries,
  ReadingsDay,
} from '@weatherteam6/types'
import { DayCharts } from './DayCharts.js'
import { chartColorsV2 } from './chartStyle.js'
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
    precip_mm_p10: null,
    precip_mm_p90: null,
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
    // None of these fixtures is about the v2 readings; each says so rather
    // than leaving the field off, because the server always sends it.
    readings: { model: null, unavailable_reason: 'not_a_climbing_location', hours: [], days: [] },
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

describe('DayCharts day chips', () => {
  const week = [day(DAY_1), day(DAY_2, false), day(DAY_3)]

  it('shows every day, disabling the one the ensemble never reached', () => {
    // Dropping the day would shift every later chip left, and a reader
    // counting from Today would land on the wrong one.
    const html = render(series(fullDay, week), DAY_1)
    expect(html).toContain('>Today<')
    expect(html).toMatch(/disabled=""[^>]*>Wed</)
    expect(html).not.toMatch(/disabled=""[^>]*>Thu</)
  })

  it('marks the open day as the pressed chip', () => {
    const html = render(series(fullDay, week), DAY_3)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Thu</)
    expect(html).toMatch(/aria-pressed="false"[^>]*>Today</)
  })

  it('names how far out the open day is, counted from the window’s own first day', () => {
    expect(render(series(fullDay, week), DAY_1)).toContain('>today<')
    expect(render(series(fullDay, week), DAY_3)).toContain('>in 2 days<')
  })
})

function readingHour(score: number, over: Partial<HourlyReading> = {}): HourlyReading {
  return {
    valid_at: new Date(T0).toISOString(),
    rock: { level: 'dry', qualified: true },
    friction: { level: 'good', condensing: false, qualified: true },
    score,
    t_surface_c: 18,
    condensation_margin_c: 4,
    ...over,
  }
}

function readingsDay(localDate: string, score: number): ReadingsDay {
  return {
    local_date: localDate,
    window: {
      from: `${localDate}T13:00:00.000Z`,
      to: `${localDate}T16:00:00.000Z`,
      hours: 4,
      min_score: score,
      qualified: true,
    },
    best: readingHour(score),
  }
}

function withReadings(s: HourlySeries, days: ReadingsDay[]): HourlySeries {
  return {
    ...s,
    readings: { model: 'gfs_seamless', unavailable_reason: null, hours: [], days },
  }
}

const OPEN_SCORE = { severeAlertEvent: null, alertsPending: false, showScore: true }

describe('DayCharts — the readings belong to the day on screen', () => {
  const week = [readingsDay(DAY_1, 30), readingsDay(DAY_2, 85)]

  function withScore(date: string, days = week): string {
    return renderToStaticMarkup(
      <DayCharts
        series={withReadings(
          series(
            [...Array.from({ length: 24 }, (_, i) => hour(i, DAY_1)),
             ...Array.from({ length: 24 }, (_, i) => hour(i + 24, DAY_2))],
            [day(DAY_1), day(DAY_2)],
          ),
          days,
        )}
        selectedDate={date}
        onSelectDate={() => {}}
        score={OPEN_SCORE}
      />,
    )
  }

  it('shows the paged day’s own score, not the first row’s', () => {
    // The reader paged to Wednesday to ask about Wednesday. The readings
    // section at the top of the Daily tab is about today and cannot answer it.
    expect(withScore(DAY_2)).toContain('>85<')
    expect(withScore(DAY_2)).not.toContain('>30<')
    expect(withScore(DAY_1)).toContain('>30<')
  })

  it('matches the readings to the day by date, never by position', () => {
    // The readings' days and the hours' days are built by different paths and
    // windowed separately. Lining them up by index holds until one side drops a
    // day, and then puts the wrong reading on every day after it while still
    // looking right.
    const shifted = [readingsDay(DAY_2, 85)]
    expect(withScore(DAY_2, shifted)).toContain('>85<')
    expect(withScore(DAY_1, shifted)).not.toContain('>85<')
  })

  it('draws no chip for a day the model said nothing about', () => {
    expect(withScore(DAY_1, [])).not.toContain('>30<')
  })

  it('drops the number under a severe alert but keeps the two readings', () => {
    // The words are the same fact the warning is about, and they now come from
    // physics that sees heat. The number is what suppression removes.
    const html = renderToStaticMarkup(
      <DayCharts
        series={withReadings(
          series(Array.from({ length: 24 }, (_, i) => hour(i, DAY_1))),
          week,
        )}
        selectedDate={DAY_1}
        onSelectDate={() => {}}
        score={{ severeAlertEvent: 'Excessive Heat Warning', alertsPending: false, showScore: true }}
      />,
    )
    expect(html).not.toContain('>30<')
    expect(html).toContain('Excessive Heat Warning')
    expect(visible(html)).toContain('Friction Good')
  })

  it('holds the number until the alerts query settles', () => {
    // `severeAlertEvent` is null for a pending query exactly as for "no severe
    // alert", so a number drawn early sits under a warning yet to arrive.
    const html = renderToStaticMarkup(
      <DayCharts
        series={withReadings(
          series(Array.from({ length: 24 }, (_, i) => hour(i, DAY_1))),
          week,
        )}
        selectedDate={DAY_1}
        onSelectDate={() => {}}
        score={{ severeAlertEvent: null, alertsPending: true, showScore: true }}
      />,
    )
    expect(html).not.toContain('>30<')
  })


/** The panel as a reader sees it — tags out, whitespace collapsed. */
const visible = (html: string): string => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

  it('says the friction reading is an estimate wherever it renders one', () => {
    // A Phase 3 acceptance criterion, and this tab renders a friction level
    // without the Daily tab's section anywhere on screen.
    expect(visible(withScore(DAY_1))).toContain('Friction is estimated')
  })

  it('draws nothing at all with no readings', () => {
    expect(render(series(fullDay))).not.toContain('>30<')
    expect(render(series(fullDay))).not.toMatch(/friction/i)
  })
})

/**
 * One chart's own SVG, by the accessible title it carries.
 *
 * **Scoped, because the page is four charts.** A bare `toContain('<line')`
 * passes on the temperature chart's whiskers however the rain chart is drawn —
 * green against an implementation with the feature removed, which is the whole
 * of defect class 11.
 */
/** The `d` of the first `<path>` painted with `fill`, or an empty string. */
function pathWithFill(svg: string, fill: string): string {
  const at = svg.indexOf(`fill="${fill}"`)
  if (at < 0) return ''
  const open = svg.lastIndexOf(' d="', at)
  if (open < 0) return ''
  const start = open + 4
  return svg.slice(start, svg.indexOf('"', start))
}

function chartSvg(html: string, title: string): string {
  // The title reaches the markup as the start of the SVG's `aria-label`.
  const from = html.indexOf(`aria-label="${title}:`)
  if (from < 0) throw new Error(`no chart titled ${title}`)
  return html.slice(from, html.indexOf('</svg>', from))
}

describe('DayCharts — the spread is drawn on every series that has one', () => {
  it('shades the rain spread under its line', () => {
    // The line is the members' mean and the band their p10-p90, so an hour nine
    // runs in ten leave dry draws a line lifting off a band flat underneath it.
    const spread = Array.from({ length: 24 }, (_, i) =>
      hour(i, DAY_1, { precip_mm_mean: 0.4, precip_mm_p10: 0, precip_mm_p90: 4 }),
    )
    const svg = chartSvg(render(series(spread)), 'Rainfall by hour')
    // **The band's own fill, not just "a path".** The line is a `<path>` too,
    // so a bare tag assertion passes with the band deleted.
    expect(svg).toContain(`fill="${chartColorsV2.rainBand}"`)
    expect(render(series(spread))).toContain('8 in 10 runs')
  })

  it('shades the wind spread under the line, and keeps the gusts as their own', () => {
    // Two different things: the band is how much the runs *disagree*, the
    // whisker is how hard it may gust inside any one of them. The fixture puts
    // the ensemble's p90 (60 km/h, 37 mph) well above the gusts (20 km/h, 12
    // mph), so the two cannot be confused for one another — a band taken from
    // the gust range instead would leave the chart topping out around 12 mph.
    const windy = Array.from({ length: 24 }, (_, i) =>
      hour(i, DAY_1, {
        wind_kmh_p10: 5,
        wind_kmh_p50: 12,
        wind_kmh_p90: 60,
        wind_gust_kmh: 20,
      }),
    )
    const html = render(series(windy))
    const svg = chartSvg(html, 'Wind by hour')
    // Three marks, each its own: the ribbon, the sustained line, the gust line.
    expect(svg).toContain(`fill="${chartColorsV2.windBand}"`)
    expect(svg).toContain(`stroke="${chartColorsV2.wind}"`)
    expect(svg).toContain(`stroke="${chartColorsV2.gust}"`)
    // **The ribbon is the ensemble's, not the gust range wearing its colour.**
    // The chart's scale is set by the caller either way, so only the ribbon's
    // own reach separates them: p90 at 60 km/h is the top of the plot, and the
    // gusts' 20 km/h is two thirds of the way down it.
    // Located by string, never by a regex built from the colour: an `rgba()`
    // token is full of regex metacharacters, and the pattern quietly matched
    // nothing rather than failing.
    const ribbon = pathWithFill(svg, chartColorsV2.windBand)
    // `bandPath` writes `M x,y L x,y … Z`, so every second number is a y.
    const ys = [...ribbon.matchAll(/,(-?[0-9.]+)/g)].map((m) => Number(m[1]))
    expect(ys.length).toBeGreaterThan(0)
    expect(Math.min(...ys)).toBeLessThan(15)
    expect(html).toContain('Gusts')
    expect(html).toContain('8 in 10 runs')
  })
})

describe('DayCharts — dew point and humidity', () => {
  const humid = Array.from({ length: 24 }, (_, i) =>
    hour(i, DAY_1, { dewpoint_c: 5, humidity_pct: 40 + i }),
  )

  it('draws the dew point on the temperature chart as a dashed line of its own colour', () => {
    const svg = chartSvg(render(series(humid)), 'Temperature by hour')
    expect(svg).toContain(`stroke="${chartColorsV2.dewPoint}"`)
    expect(svg).toContain('stroke-dasharray')
    expect(render(series(humid))).toContain('Dew point')
  })

  it('keeps the dew point inside the plot when it sits far below the air', () => {
    // 5 °C against a band from 12 °C: a domain taken from the band alone puts
    // the dew point below the frame, where SVG draws it over the next chart.
    const svg = chartSvg(render(series(humid)), 'Temperature by hour')
    const at = svg.indexOf(`stroke="${chartColorsV2.dewPoint}"`)
    const open = svg.lastIndexOf(' d="', at) + 4
    const d = svg.slice(open, svg.indexOf('"', open))
    const ys = [...d.matchAll(/,(-?[0-9.]+)/g)].map((m) => Number(m[1]))
    expect(ys.length).toBeGreaterThan(0)
    // DAY_VIEW_H 122 less the 16-unit axis strip.
    expect(Math.max(...ys)).toBeLessThanOrEqual(106)
  })

  it('draws humidity and states the day’s range', () => {
    const html = render(series(humid))
    chartSvg(html, 'Humidity by hour')
    expect(html).toContain('40–63%')
  })

  it('names the model the dew point and humidity came from, and only when one is drawn', () => {
    expect(render(series(humid))).toContain('Dew point and humidity: Open-Meteo · GFS')
    // The default fixture carries neither column.
    expect(render(series(fullDay))).not.toContain('Dew point and humidity')
    expect(render(series(fullDay))).toContain('No hourly humidity for this day.')
    expect(render(series(fullDay))).not.toContain('>Dew point<')
  })
})

/** Tags out, whitespace collapsed — the card as a reader sees it. */
const visibleText = (html: string): string => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

describe('DayCharts — the conditions card', () => {
  const hours = Array.from({ length: 24 }, (_, i) => hour(i, DAY_1))
  const readingHours: HourlyReading[] = hours.map((h, i) =>
    readingHour(80, {
      valid_at: h.valid_at,
      friction: i < 3 ? { level: 'fair', condensing: false, qualified: true } : { level: 'great', condensing: false, qualified: true },
    }),
  )

  function withStrip(score = OPEN_SCORE, days = [readingsDay(DAY_1, 80)]): string {
    return renderToStaticMarkup(
      <DayCharts
        series={{
          ...series(hours),
          readings: { model: 'gfs_seamless', unavailable_reason: null, hours: readingHours, days },
        }}
        selectedDate={DAY_1}
        onSelectDate={() => {}}
        score={score}
      />,
    )
  }

  it('reads the friction strip aloud as runs of words, joined on the instant', () => {
    expect(withStrip()).toContain('Friction by hour: 00–02 Fair, 03–23 Great')
  })

  it('keys the strip by name, because a colour cannot be read aloud', () => {
    const text = visibleText(withStrip())
    for (const word of ['Poor', 'Fair', 'Good', 'Great']) expect(text).toContain(word)
  })

  it('says which hour the readings are from, not that it is the best one', () => {
    // `best` is the worst hour of the best three-hour run — calling it the
    // best hour would be a claim the model does not make.
    const text = visibleText(withStrip())
    expect(text).toContain('Readings at 00:00')
    expect(text).not.toContain('Best hour')
  })

  it('shades the good hours on the temperature chart only while the card names them', () => {
    expect(withStrip()).toContain(`fill="${chartColorsV2.goodHours}"`)
    expect(withStrip(OPEN_SCORE, [])).not.toContain(`fill="${chartColorsV2.goodHours}"`)
    expect(render(series(fullDay))).not.toContain(`fill="${chartColorsV2.goodHours}"`)
  })

  it('draws no strip, tiles or shading for a city', () => {
    const html = withStrip({ severeAlertEvent: null, alertsPending: false, showScore: false })
    expect(html).not.toContain('Friction by hour')
    expect(html).not.toContain(`fill="${chartColorsV2.goodHours}"`)
  })
})

describe('DayCharts — a trace of rain', () => {
  it('keeps a readable scale rather than stretching a trace across the plot', () => {
    // 0.02 mm an hour: scaled to its own peak, every tick rounded to "0" and
    // the kept one sat at the top of the plot, labelling it zero.
    const trace = Array.from({ length: 24 }, (_, i) => hour(i, DAY_1, { precip_mm_mean: 0.02 }))
    const html = render(series(trace))
    const block = html.slice(html.indexOf('>Rain<'), html.indexOf('>Chance of rain<'))
    expect(block).toContain('>0.02<')
    expect(block.match(/>0</g)?.length ?? 0).toBeLessThanOrEqual(1)
  })
})
