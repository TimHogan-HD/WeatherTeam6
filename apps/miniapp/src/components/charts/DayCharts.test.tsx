import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type {
  HourlyDay,
  HourlyReading,
  HourlySample,
  HourlySeries,
  ReadingsDay,
} from '@weatherteam6/types'
import { DayCharts, stepDay } from './DayCharts.js'
import { chartColors } from './chartStyle.js'
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

describe('DayCharts pager', () => {
  const week = [day(DAY_1), day(DAY_2, false), day(DAY_3)]

  it('skips a day the ensemble never reached', () => {
    expect(stepDay(week, DAY_1, 1)).toBe(DAY_3)
    expect(stepDay(week, DAY_3, -1)).toBe(DAY_1)
  })

  it('stops at the ends rather than wrapping', () => {
    expect(stepDay(week, DAY_3, 1)).toBeNull()
    expect(stepDay(week, DAY_1, -1)).toBeNull()
  })

  it('walks in from the matching end when the day has left the window', () => {
    // The window rolls forward as runs are collected, so a date in route state
    // can drop out of `days[]`. Both arrows dead is a screen with no way off it.
    expect(stepDay(week, '2026-09-01', 1)).toBe(DAY_1)
    expect(stepDay(week, '2026-09-01', -1)).toBe(DAY_3)
  })

  it('names how far out the open day is, counted from the window’s own first day', () => {
    const html = render(series(fullDay, week), DAY_1)
    expect(html).toContain('today')
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

  it('draws nothing at all on the preview path, which has no readings', () => {
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
    expect(svg).toContain(`fill="${chartColors.rainBand}"`)
    expect(render(series(spread))).toContain('Where 8 in 10 runs land')
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
    expect(svg).toContain(`fill="${chartColors.windBand}"`)
    expect(svg).toContain(`stroke="${chartColors.wind}"`)
    expect(svg).toContain(`stroke="${chartColors.gust}"`)
    // **The ribbon is the ensemble's, not the gust range wearing its colour.**
    // The chart's scale is set by the caller either way, so only the ribbon's
    // own reach separates them: p90 at 60 km/h is the top of the plot, and the
    // gusts' 20 km/h is two thirds of the way down it.
    // Located by string, never by a regex built from the colour: an `rgba()`
    // token is full of regex metacharacters, and the pattern quietly matched
    // nothing rather than failing.
    const ribbon = pathWithFill(svg, chartColors.windBand)
    // `bandPath` writes `M x,y L x,y … Z`, so every second number is a y.
    const ys = [...ribbon.matchAll(/,(-?[0-9.]+)/g)].map((m) => Number(m[1]))
    expect(ys.length).toBeGreaterThan(0)
    expect(Math.min(...ys)).toBeLessThan(15)
    expect(html).toContain('Gusts')
    expect(html).toContain('Where 8 in 10 runs land')
  })
})
