import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { windowValue, type HourlyDay, type HourlySample, type HourlySeries, type SunHour } from '@weatherteam6/types'
import { hourRows, savedMode, type HourlyView } from '../../lib/hourlyRows.js'
import { HourlyRows } from '../HourlyRows.js'
import { CHANCE_FIGURE_MIN, HourlyCharts, chanceOpacity } from './HourlyCharts.js'
import { HOUR_MS } from './hourlySeries.js'
import { floorInstant } from './liquid.js'

/**
 * Hourly as charts (owner, 2026-11-24, `hourly-chart-view.html` variant A):
 * the charts draw the rows the list prints, the chips pick which, and a gap is
 * a gap on every chart.
 */

// UTC offset 0, so stamp n is n o'clock local.
const T0 = Date.UTC(2026, 8, 15, 0)
const DAY_1 = '2026-09-15'
const DAY_2 = '2026-09-16'
const at = (h: number) => new Date(T0 + h * HOUR_MS).toISOString()

function hour(h: number, over: Partial<HourlySample> = {}): HourlySample {
  return {
    valid_at: at(h),
    local_date: h < 24 ? DAY_1 : DAY_2,
    temp_c: null,
    dewpoint_c: 5,
    humidity_pct: 60,
    precip_mm: null,
    wind_kmh: null,
    wind_gust_kmh: 30,
    wind_dir_deg: 270,
    cloud_pct: null,
    pressure_hpa: null,
    temp_c_p10: 12,
    temp_c_p50: 15,
    temp_c_p90: 19,
    wind_kmh_p10: 10,
    wind_kmh_p50: 16,
    wind_kmh_p90: 24,
    precip_mm_mean: 0,
    precip_mm_p10: null,
    precip_mm_p90: null,
    precip_chance_pct: 0,
    member_count: 143,
    ...over,
  }
}

const day = (local_date: string): HourlyDay => ({ local_date, has_deterministic: true, has_ensemble: true })

function series(hours: HourlySample[], over: Partial<HourlySeries> = {}): HourlySeries {
  return {
    location_id: 'loc',
    utc_offset_seconds: 0,
    fetched_at: at(0),
    model: 'gfs_seamless',
    unavailable_models: [],
    readings: { model: null, unavailable_reason: 'not_a_climbing_location', hours: [], days: [] },
    hours,
    days: [day(DAY_1), day(DAY_2)],
    ...over,
  }
}

const twoDays = Array.from({ length: 49 }, (_, h) => hour(h))
const CITY = { showScore: false }

function render(s: HourlySeries, view: HourlyView, readMs: number | null = null): string {
  const r = hourRows(s, DAY_1, CITY, (w) => windowValue(w, 0))
  return renderToStaticMarkup(
    <HourlyCharts
      rows={r.rows}
      rainTopIn={r.scale.rainTopIn}
      good={r.good}
      scored={r.scored}
      view={view}
      utcOffsetSeconds={0}
      nowMs={0}
      readMs={readMs}
      onRead={() => {}}
    />,
  )
}

/** One chart's own SVG, by the accessible title it starts with. */
function chartSvg(html: string, title: string): string {
  const from = html.indexOf(`aria-label="${title}`)
  if (from < 0) throw new Error(`no chart titled ${title}`)
  return html.slice(from, html.indexOf('</svg>', from))
}
const visible = (html: string): string => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
const count = (s: string, needle: string) => s.split(needle).length - 1
const readouts = (html: string): string[] => [...html.matchAll(/<p data-readout=""[^>]*>(.*?)<\/p>/g)].map((m) => visible(m[1] ?? '').trim())

const RAIN = 'Chance of rain by hour'
const WIND = 'Wind by hour'
const SUN = 'Minutes of sun'
const TEMP = 'Temperature, dew point and humidity by hour'

describe('HourlyCharts — the chips pick the charts', () => {
  it('stacks all four under All, and draws one alone under any other view', () => {
    const all = render(series(twoDays), 'all')
    for (const t of ['Temperature and humidity', 'Rain', 'Wind']) expect(all).toContain(`>${t}<`)
    const rain = render(series(twoDays), 'rain')
    expect(rain).toContain('>Rain<')
    expect(rain).not.toContain('>Wind<')
    expect(rain).not.toContain('>Temperature and humidity<')
  })

  it('draws a chart alone taller than in the stack', () => {
    const height = (html: string, title: string) => {
      const svg = html.slice(html.lastIndexOf('<svg', html.indexOf(`aria-label="${title}`)))
      return Number(/viewBox="0 0 390 (\d+)"/.exec(svg)?.[1])
    }
    expect(height(render(series(twoDays), 'wind'), WIND)).toBeGreaterThan(height(render(series(twoDays), 'all'), WIND))
  })
})

describe('HourlyCharts — the read hour is the row’s', () => {
  it('reads each chart at the row’s own figures, rain from the stamp at the hour’s end', () => {
    // The 9 AM row is 9 to 10 AM: its air is the 9:00 sample's, its rain the 10:00 stamp's.
    const hours = twoDays.map((h, i) =>
      i === 9 ? { ...h, temp_c_p50: 10 } : i === 10 ? { ...h, precip_chance_pct: 70, precip_mm_mean: 2.54 } : h,
    )
    const [temp, rain, wind] = readouts(render(series(hours), 'all', T0 + 9 * HOUR_MS))
    expect(temp).toBe('9 AM air 50° dew 41° humidity 60%')
    expect(rain).toBe('9 AM chance 70% rain .10 in')
    expect(wind).toBe('9 AM wind 10 mph W gusts 19 mph')
  })

  it('prints a gap as a dash in the chip, never a zero', () => {
    const hours = twoDays.map((h, i) => (i === 10 ? { ...h, precip_chance_pct: null, precip_mm_mean: null } : i === 9 ? { ...h, wind_kmh_p50: null, wind_gust_kmh: null } : h))
    const [, rain, wind] = readouts(render(series(hours), 'all', T0 + 9 * HOUR_MS))
    expect(rain).toBe('9 AM chance — rain —')
    expect(wind).toBe('9 AM wind — gusts —')
  })

  it('has no readout before an hour is read', () => {
    expect(readouts(render(series(twoDays), 'all'))).toEqual([])
  })

  it('picks the hour a pointer is inside, not the nearest stamp', () => {
    const hours = [0, 1, 2].map((h) => T0 + h * HOUR_MS)
    // 1:50 is inside the 1 AM row, though 2:00 is nearer.
    expect(floorInstant(hours, T0 + 1.83 * HOUR_MS)).toBe(T0 + HOUR_MS)
    expect(floorInstant(hours, T0 + 2.5 * HOUR_MS)).toBe(T0 + 2 * HOUR_MS)
    expect(floorInstant(hours, T0 - HOUR_MS)).toBe(T0)
    expect(floorInstant([], T0)).toBeNull()
  })
})

describe('HourlyCharts — rain as chance cells over inch bars', () => {
  it('writes a chance from the threshold up, leaves lower ones quiet, and dashes an unanswered one', () => {
    // Row n reads stamp n + 1.
    const hours = twoDays.map((h, i) =>
      i === 3 ? { ...h, precip_chance_pct: CHANCE_FIGURE_MIN } : i === 4 ? { ...h, precip_chance_pct: CHANCE_FIGURE_MIN - 1 } : i === 5 ? { ...h, precip_chance_pct: null } : h,
    )
    const svg = chartSvg(render(series(hours), 'rain'), RAIN)
    expect(svg).toContain(`>${CHANCE_FIGURE_MIN}</text>`)
    expect(svg).not.toContain(`>${CHANCE_FIGURE_MIN - 1}</text>`)
    expect(count(svg, 'data-chance-gap')).toBe(1)
    // A 0% hour is a faint cell, so only the unanswered hour has none.
    expect(count(svg, 'data-chance="0"')).toBe(21)
  })

  it('draws an hour’s inches as a bar, a dry hour as none and an unanswered hour as a dashed gap', () => {
    const hours = twoDays.map((h, i) => (i === 7 ? { ...h, precip_mm_mean: 1.27 } : i === 8 ? { ...h, precip_mm_mean: null } : h))
    const svg = chartSvg(render(series(hours), 'rain'), RAIN)
    expect(count(svg, 'data-rain=""')).toBe(1)
    expect(count(svg, 'data-rain-gap')).toBe(1)
  })

  it('prints the same inch scale the list’s Rain column heads', () => {
    const hours = twoDays.map((h, i) => (i === 7 ? { ...h, precip_mm_mean: 6 } : h))
    // 6 mm is 0.24 in, so the scale tops at 0.30 in, as the list's head does.
    expect(visible(chartSvg(render(series(hours), 'rain'), RAIN))).toContain('.30')
  })

  it('keeps every chance figure legible on its cell', () => {
    expect(chanceOpacity(100)).toBeLessThanOrEqual(0.45)
    expect(chanceOpacity(0)).toBeGreaterThan(0)
    expect(chanceOpacity(80)).toBeGreaterThan(chanceOpacity(40))
  })
})

describe('HourlyCharts — gaps break, never bridge', () => {
  it('breaks the wind line and its range at an unanswered hour', () => {
    const hours = twoDays.map((h, i) => (i === 12 ? { ...h, wind_kmh_p50: null, wind_kmh_p10: null, wind_kmh_p90: null } : h))
    const svg = chartSvg(render(series(hours), 'wind'), WIND)
    expect(count(svg, 'data-line=""')).toBe(2)
    expect(count(svg, 'data-range=""')).toBe(2)
  })

  it('withholds the wind chart rather than drawing an empty one', () => {
    const calm = twoDays.map((h) => ({ ...h, wind_kmh_p50: null }))
    expect(visible(render(series(calm), 'wind'))).toContain('No hourly wind for this day.')
  })

  it('marks an unanswered daylight hour of sun as a gap, and names night once per run', () => {
    // Row n reads the sun stamped n + 1.
    const sun: SunHour[] = Array.from({ length: 24 }, (_, i) => {
      const light = i >= 8 && i <= 18
      return { valid_at: at(i + 1), local_date: DAY_1, daylight: light, sun_min: !light ? 0 : i === 12 ? null : 40, shortwave_wm2: null, cloud_pct: 20 }
    })
    const svg = chartSvg(render(series(twoDays, { sky: { model: 'gfs_seamless', hours: [], sun, days: [] } }), 'sun'), SUN)
    expect(count(svg, 'data-sun-gap')).toBe(1)
    expect(count(svg, 'data-sun=""')).toBe(10)
    expect(count(svg, 'data-night')).toBe(2)
  })

  it('draws the air neutral and names no score for a city', () => {
    const html = render(series(twoDays), 'temp')
    expect(visible(html)).not.toContain('coloured by score')
    expect(chartSvg(html, TEMP)).toContain('data-line')
  })
})

describe('HourlyRows — List or Chart', () => {
  afterEach(() => vi.unstubAllGlobals())
  // The second day: the first is today on the chip strip, and today folds the hours already over.
  const renderRows = (readMs: number | null = null) =>
    renderToStaticMarkup(<HourlyRows series={series(twoDays)} selectedDate={DAY_2} onSelectDate={() => {}} readMs={readMs} onRead={() => {}} showScore={false} />)
  const stub = (values: Record<string, string>) =>
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => values[k] ?? null, setItem: () => {} } })

  it('opens on the list, with the switch beside the chips', () => {
    const html = renderRows()
    expect(html).toContain('aria-pressed="true" aria-label="List"')
    expect(html).toContain('aria-pressed="false" aria-label="Chart"')
    expect(html).toContain('<ol')
    expect(html).not.toContain(`aria-label="${TEMP}`)
  })

  it('draws the charts instead of the rows once Chart was chosen on this device', () => {
    stub({ 'wt6.hourlyMode': 'chart' })
    const html = renderRows()
    expect(html).toContain(`aria-label="${TEMP}`)
    expect(html).not.toContain('<ol')
    // No column heads over a chart.
    expect(html).not.toContain('>Hour<')
  })

  it('lists the read hour’s figures under a single chart', () => {
    stub({ 'wt6.hourlyMode': 'chart', 'wt6.hourlyView': 'wind' })
    const html = renderRows(T0 + 33 * HOUR_MS)
    expect(html).toContain('Dew point')
    expect(visible(renderRows())).toContain('Drag across the chart to read an hour.')
  })

  it('reads junk or unavailable storage as the list', () => {
    stub({ 'wt6.hourlyMode': 'grid' })
    expect(savedMode()).toBe('list')
    vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('denied') } } })
    expect(savedMode()).toBe('list')
  })
})
