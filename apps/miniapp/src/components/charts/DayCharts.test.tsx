import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type {
  HourlyDay,
  HourlyReading,
  HourlySample,
  HourlySeries,
  ReadingsDay,
  SkyCondition,
  SkyHour,
} from '@weatherteam6/types'
import { DayCharts } from './DayCharts.js'
import { chartColorsV2, scoreRampColor } from './chartStyle.js'
import { HOUR_MS } from './hourlySeries.js'

/**
 * The Hourly tab's three cards (hybrid mockup, owner 2026-10-19): what each
 * chart draws, what it withholds, and that one read hour rings all three.
 */

const T0 = Date.UTC(2026, 8, 15, 0)
const DAY_1 = '2026-09-15'
const DAY_2 = '2026-09-16'
const DAY_3 = '2026-09-17'

const TEMP_TITLE = 'Temperature, dew point and humidity by hour'

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
    readings: { model: null, unavailable_reason: 'not_a_climbing_location', hours: [], days: [] },
    hours,
    days,
  }
}

type Score = { severeAlertEvent: string | null; alertsPending: boolean; showScore: boolean }
const OPEN: Score = { severeAlertEvent: null, alertsPending: false, showScore: true }

function render(s: HourlySeries, { date = DAY_1, readMs = null as number | null, score = undefined as Score | undefined } = {}): string {
  return renderToStaticMarkup(
    <DayCharts series={s} selectedDate={date} onSelectDate={() => {}} readMs={readMs} onRead={() => {}} score={score} />,
  )
}

/** One chart's own SVG, by the accessible title it starts with. The page is three charts. */
function chartSvg(html: string, title: string): string {
  const from = html.indexOf(`aria-label="${title}`)
  if (from < 0) throw new Error(`no chart titled ${title}`)
  return html.slice(from, html.indexOf('</svg>', from))
}

/** The `d` of the first path carrying `marker`. */
function pathD(svg: string, marker: string): string {
  const at = svg.indexOf(marker)
  if (at < 0) return ''
  const tag = svg.lastIndexOf('<path', at)
  const open = svg.indexOf(' d="', tag) + 4
  return svg.slice(open, svg.indexOf('"', open))
}

/** Every y in a path; `smoothPath` writes `x y` pairs. */
function ys(d: string): number[] {
  const nums = [...d.matchAll(/-?[0-9]+(?:\.[0-9]+)?/g)].map((m) => Number(m[0]))
  return nums.filter((_, i) => i % 2 === 1)
}

const count = (s: string, needle: string) => s.split(needle).length - 1
const visible = (html: string): string => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

const fullDay = Array.from({ length: 24 }, (_, i) => hour(i, DAY_1))

describe('DayCharts — three cards', () => {
  it('titles each card as the mockup does', () => {
    const html = render(series(fullDay))
    for (const title of ['Temperature and humidity', 'Rain', 'Wind']) expect(html).toContain(`>${title}<`)
  })

  it('draws no conditions card, sky strip or legend of the old Hourly', () => {
    const text = visible(render(series(fullDay)))
    expect(text).not.toMatch(/Conditions|Sky by hour|Average/)
  })
})

describe('DayCharts — the read hour inside each card', () => {
  /** Each card's readout, as text, in page order. */
  const readouts = (html: string): string[] =>
    [...html.matchAll(/<p data-readout=""[^>]*>(.*?)<\/p>/g)].map((m) => visible(m[1] ?? '').trim())

  it('names the hour and the figures each chart draws at it', () => {
    const day = fullDay.map((h, i) => (i === 9 ? { ...h, temp_c_p50: 10, wind_kmh_p50: 16.1, wind_gust_kmh: 32.2, precip_chance_pct: 4 } : h))
    const [temp, rain, wind] = readouts(render(series(day), { readMs: T0 + 9 * HOUR_MS }))
    // The chart's own line, the ensemble median: 10 °C is 50 °F.
    expect(temp).toBe('9 AM air 50°')
    expect(rain).toMatch(/^9 AM chance 4% amount /)
    expect(wind).toBe('9 AM wind 10 mph gusts 20 mph')
  })

  it('shows a gap as a dash, never a zero, and leaves out a series the chart does not draw', () => {
    const day = fullDay.map((h, i) => (i === 9 ? { ...h, wind_gust_kmh: null, precip_chance_pct: null } : h))
    const [, rain, wind] = readouts(render(series(day), { readMs: T0 + 9 * HOUR_MS }))
    expect(rain).toContain(`chance ${'—'}`)
    expect(wind).toContain(`gusts ${'—'}`)
    const calm = fullDay.map((h) => ({ ...h, wind_gust_kmh: null }))
    expect(readouts(render(series(calm), { readMs: T0 + 9 * HOUR_MS }))[2]).not.toContain('gusts')
  })

  it('has no readout before an hour is read, and none on a dry day', () => {
    expect(readouts(render(series(fullDay)))).toEqual([])
    const dry = fullDay.map((h) => ({ ...h, precip_mm_mean: 0, precip_chance_pct: 0 }))
    expect(readouts(render(series(dry), { readMs: T0 + 9 * HOUR_MS }))).toHaveLength(2)
  })
})

describe('DayCharts — rain', () => {
  it('draws the chance as one capsule per hour, on the smallest of 10, 20, 50 and 100% that holds the day', () => {
    const svg = chartSvg(render(series(fullDay)), 'Rain by hour')
    expect(count(svg, 'data-chance=""')).toBe(24)
    // Every hour is 30%, so the axis tops at 50%, not 100%.
    expect(svg).toContain('>50%<')
    expect(svg).not.toContain('>100%<')
    expect(render(series(fullDay))).toContain('chance left · in / hr right')
  })

  it('draws the amount as a line on its own inch scale', () => {
    const svg = chartSvg(render(series(fullDay)), 'Rain by hour')
    expect(svg).toContain(`stroke="${chartColorsV2.rain}"`)
    // 0.4 mm an hour is under the 0.02 in floor, so the scale tops at .02 in,
    // printed bare: the card's title names the unit.
    expect(svg).toContain('>.02<')
  })

  it('keeps a trace on a readable scale rather than stretching it across the plot', () => {
    const trace = fullDay.map((h) => ({ ...h, precip_mm_mean: 0.02 }))
    const svg = chartSvg(render(series(trace)), 'Rain by hour')
    const line = ys(pathD(svg, `stroke="${chartColorsV2.rain}"`))
    // floor 106, top 14: 0.02 mm of a 0.508 mm scale sits within 4 units of the floor.
    expect(Math.min(...line)).toBeGreaterThan(100)
  })

  it('shades the amount range only where the members spread', () => {
    const spread = fullDay.map((h) => ({ ...h, precip_mm_p10: 0, precip_mm_p90: 4 }))
    expect(chartSvg(render(series(spread)), 'Rain by hour')).toContain('data-range=""')
    expect(chartSvg(render(series(fullDay)), 'Rain by hour')).not.toContain('data-range=""')
  })

  it('draws the amount range from p10 to p90, not from zero', () => {
    // p10 1 mm on a 4 mm scale (floor 106, top 14) sits at y 83; a band from zero would reach the floor.
    const spread = fullDay.map((h) => ({ ...h, precip_mm_p10: 1, precip_mm_p90: 4 }))
    const band = ys(pathD(chartSvg(render(series(spread)), 'Rain by hour'), 'data-range=""'))
    expect(Math.max(...band)).toBeLessThan(90)
  })

  it('draws the chance alone when no hour has an amount, and is not called dry', () => {
    const noAmount = fullDay.map((h) => ({ ...h, precip_mm_mean: null }))
    const html = render(series(noAmount))
    const svg = chartSvg(html, 'Rain by hour')
    expect(svg).toContain('data-chance=""')
    expect(svg).not.toContain(`stroke="${chartColorsV2.rain}"`)
    expect(html).not.toContain('Dry all day')
  })

  it('says so when no hour has rain or chance', () => {
    const none = fullDay.map((h) => ({ ...h, precip_mm_mean: null, precip_chance_pct: null }))
    expect(render(series(none))).toContain('No hourly rainfall for these hours.')
  })
})

describe('DayCharts — dry all day', () => {
  const dry = fullDay.map((h) => ({ ...h, precip_mm_mean: 0, precip_chance_pct: 0 }))

  it('keeps the frame and its hour labels, draws no marks, and says every hour is 0%', () => {
    const html = render(series(dry), { readMs: T0 + 9 * HOUR_MS })
    const svg = chartSvg(html, 'Rain by hour: dry all day')
    expect(visible(html)).toContain('Dry all day')
    expect(visible(html)).toContain('0% in every hour')
    expect(svg).not.toContain('data-chance')
    expect(svg).not.toContain('data-line')
    expect(svg).not.toContain('data-bead')
    expect(svg).toContain('>10%<')
    expect(svg).toContain('>6a<')
  })

  it('draws the columns for a low-chance day instead of calling it dry, and is not dry with an hour unread', () => {
    const low = dry.map((h, i) => (i === 15 ? { ...h, precip_chance_pct: 6 } : h))
    const html = render(series(low))
    expect(html).not.toContain('Dry all day')
    expect(chartSvg(html, 'Rain by hour')).toContain('data-chance=""')
    const gap = dry.map((h, i) => (i === 15 ? { ...h, precip_chance_pct: null } : h))
    expect(render(series(gap))).not.toContain('Dry all day')
  })
})

describe('DayCharts — wind', () => {
  it('draws the ensemble range, the sustained line and the gusts as three marks', () => {
    // p90 at 60 km/h is far above the 20 km/h gusts: a range taken from the
    // gusts instead would top out a third of the way down the plot.
    const windy = fullDay.map((h) => ({ ...h, wind_kmh_p10: 5, wind_kmh_p50: 12, wind_kmh_p90: 60 }))
    const svg = chartSvg(render(series(windy)), 'Wind by hour')
    expect(svg).toContain(`stroke="${chartColorsV2.wind}"`)
    expect(svg).toContain('data-gust=""')
    const range = ys(pathD(svg, 'data-range=""'))
    // 60 km/h is 37 mph, on a scale topped at the 40 mph line (y 12).
    expect(Math.min(...range)).toBeLessThan(20)
    expect(Math.min(...range)).toBeGreaterThanOrEqual(12)
    expect(svg).toContain('>40<')
  })

  it('tops the scale at a gridline above the highest gust, so no line runs into its label', () => {
    const gusty = fullDay.map((h, i) => ({ ...h, wind_gust_kmh: i === 14 ? 47 : 20 }))
    const svg = chartSvg(render(series(gusty)), 'Wind by hour')
    // 47 km/h is 29 mph: the top line is 30 at y 12, and the gust stays at or below it.
    expect(svg).toContain('>30<')
    expect(Math.min(...ys(pathD(svg, 'data-gust=""')))).toBeGreaterThanOrEqual(11)
  })

  it('names the gust model only when gusts are drawn', () => {
    expect(render(series(fullDay))).toContain('mph · gusts GFS')
    const calm = fullDay.map((h) => ({ ...h, wind_gust_kmh: null }))
    const html = render(series(calm))
    expect(html).not.toContain('gusts GFS')
    expect(chartSvg(html, 'Wind by hour')).not.toContain('data-gust')
  })

  it('withholds the chart rather than drawing an empty one', () => {
    const none = fullDay.map((h) => ({ ...h, wind_kmh_p50: null, wind_gust_kmh: null }))
    expect(render(series(none))).toContain('No hourly wind for this day.')
  })
})

describe('DayCharts — dew point and humidity', () => {
  const humid = fullDay.map((h, i) => ({ ...h, dewpoint_c: 5, humidity_pct: 40 + i }))

  it('draws the dew point dashed, inside the plot when it sits far below the air', () => {
    const svg = chartSvg(render(series(humid)), TEMP_TITLE)
    expect(svg).toContain('data-dew=""')
    // 5 °C against a range from 12 °C: a domain from the range alone puts it under the frame.
    expect(Math.max(...ys(pathD(svg, 'data-dew=""')))).toBeLessThanOrEqual(124)
  })

  it('draws humidity on a defined 0-100% scale, not stretched to its own range', () => {
    const svg = chartSvg(render(series(humid)), TEMP_TITLE)
    // 63% on a 124→14 scale is y ≈ 54.7; stretched to its own peak it would sit at 14.
    expect(Math.min(...ys(pathD(svg, 'data-humidity=""')))).toBeGreaterThan(50)
    expect(svg).toContain('>100%<')
  })

  it('names the model only when it drew a dew point or humidity', () => {
    expect(render(series(humid))).toContain('humidity right · dew point GFS')
    const plain = render(series(fullDay))
    expect(plain).not.toContain('dew point GFS')
    expect(chartSvg(plain, 'Temperature by hour')).not.toContain('data-humidity')
  })
})

function readingHour(validAt: string, score: number): HourlyReading {
  return {
    valid_at: validAt,
    rock: { level: 'dry', qualified: true },
    friction: { level: 'good', condensing: false, qualified: true },
    score,
    t_surface_c: 18,
    condensation_margin_c: 4,
  }
}

function readingsDay(localDate: string, score: number): ReadingsDay {
  return {
    local_date: localDate,
    window: { from: `${localDate}T13:00:00.000Z`, to: `${localDate}T16:00:00.000Z`, hours: 3, min_score: score, qualified: true },
    best: readingHour(`${localDate}T13:00:00.000Z`, score),
  }
}

describe('DayCharts — the score on the air line', () => {
  const scored = (days: ReadingsDay[] = [readingsDay(DAY_1, 30)]): HourlySeries => ({
    ...series(fullDay),
    readings: {
      model: 'gfs_seamless',
      unavailable_reason: null,
      hours: fullDay.map((h) => readingHour(h.valid_at, 30)),
      days,
    },
  })
  const ramp = `stop-color="${scoreRampColor(30)}"`

  it('colours the air by each hour’s score, joined on the hour', () => {
    expect(chartSvg(render(scored(), { score: OPEN }), TEMP_TITLE.replace(', dew point and humidity', ''))).toContain(ramp)
  })

  it('draws the air neutral under a Severe+ alert, while alerts are pending, and for a city', () => {
    const title = 'Temperature by hour'
    for (const score of [
      { ...OPEN, severeAlertEvent: 'Excessive Heat Warning' },
      { ...OPEN, alertsPending: true },
      { ...OPEN, showScore: false },
    ]) {
      const svg = chartSvg(render(scored(), { score }), title)
      expect(svg).not.toContain(ramp)
      expect(svg).toContain(`stop-color="${chartColorsV2.air}"`)
    }
  })

  it('shades the good hours only while the day has a named window', () => {
    expect(count(render(scored(), { score: OPEN }), 'data-good=""')).toBe(3)
    expect(render(scored([]), { score: OPEN })).not.toContain('data-good')
    expect(render(scored(), { score: { ...OPEN, showScore: false } })).not.toContain('data-good')
  })

  it('matches the day’s window by date, never by position', () => {
    expect(render(scored([readingsDay(DAY_2, 30)]), { score: OPEN })).not.toContain('data-good')
  })
})

describe('DayCharts — one hour read across every chart', () => {
  const humid = fullDay.map((h) => ({ ...h, dewpoint_c: 5, humidity_pct: 50 }))

  it('beads the read hour on the temperature, rain and wind charts', () => {
    const html = render(series(humid), { readMs: T0 + 9 * HOUR_MS })
    for (const title of [TEMP_TITLE, 'Rain by hour', 'Wind by hour']) {
      const svg = chartSvg(html, title)
      expect(svg).toContain('data-bead=""')
      expect(svg).toContain('data-read=""')
    }
  })

  it('draws no bead when no hour is read', () => {
    expect(render(series(humid))).not.toContain('data-bead')
  })
})

describe('DayCharts — sky glyphs', () => {
  const skyHour = (stampHour: number, sky: SkyCondition | null, local_date = DAY_1): SkyHour => ({
    valid_at: new Date(T0 + stampHour * HOUR_MS).toISOString(),
    local_date,
    sky,
  })
  const withSky = (hours: SkyHour[]): HourlySeries => ({
    ...series(fullDay),
    sky: { model: 'gfs_seamless', hours, days: [{ local_date: DAY_1, summary: null }] },
  })
  // A glyph is a nested <svg>, so the chart is cut at the next card, not at the first </svg>.
  const glyphs = (html: string) => count(html.slice(0, html.indexOf('aria-label="Rain')), 'data-sky=""')

  it('draws one every three hours, by the hour each covers, and none for a gap', () => {
    // Stamps 7, 10 and 13 cover 6, 9 and 12 o'clock; 8 covers 7 and is skipped; 11 is a gap.
    const html = render(withSky([skyHour(7, 'sunny'), skyHour(8, 'cloudy'), skyHour(10, 'cloudy'), skyHour(11, null), skyHour(13, 'sunny')]))
    expect(glyphs(html)).toBe(3)
  })

  it('draws none from another day’s hours', () => {
    expect(glyphs(render(withSky([skyHour(7, 'sunny', DAY_2)])))).toBe(0)
  })
})

describe('DayCharts — day picker', () => {
  const week = [day(DAY_1), day(DAY_2, false), day(DAY_3)]

  it('shows every day, disabling the one the ensemble never reached', () => {
    const html = render(series(fullDay, week))
    expect(html).toContain('>Today<')
    expect(html).toMatch(/aria-label="Wednesday, [^"]*" disabled=""/)
    expect(html).not.toMatch(/aria-label="Thursday, [^"]*" disabled=""/)
  })

  it('marks the open day as the pressed one', () => {
    const html = render(series(fullDay, week), { date: DAY_3 })
    expect(html).toMatch(/aria-pressed="true" aria-label="Thursday, /)
    expect(html).toMatch(/aria-pressed="false" aria-label="Today, /)
    // The open day's full name heads the strip.
    expect(html).toMatch(/<p[^>]*>Thursday/)
  })
})
