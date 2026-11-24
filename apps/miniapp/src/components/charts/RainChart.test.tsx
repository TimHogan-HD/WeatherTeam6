import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { HourlySample } from '@weatherteam6/types'
import { DAY_SCALES, RainChart } from './DayCharts.js'
import { HOUR_MS } from './hourlySeries.js'
import { timeAxis } from './liquid.js'

/**
 * The rain chart in blocks (owner, 2026-10-30), which the Precip tab draws for
 * its next 48 hours. These were Hourly's tests until Hourly became rows
 * (2026-11-24); the chart is the same one at 24 hours, in threes.
 */

const T0 = Date.UTC(2026, 8, 15, 0)
const DAY_1 = '2026-09-15'

function hour(index: number, over: Partial<HourlySample> = {}): HourlySample {
  return {
    valid_at: new Date(T0 + index * HOUR_MS).toISOString(),
    local_date: DAY_1,
    temp_c: null,
    dewpoint_c: null,
    humidity_pct: null,
    precip_mm: null,
    wind_kmh: null,
    wind_gust_kmh: null,
    wind_dir_deg: null,
    cloud_pct: null,
    pressure_hpa: null,
    temp_c_p10: null,
    temp_c_p50: null,
    temp_c_p90: null,
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

const fullDay = Array.from({ length: 24 }, (_, i) => hour(i))

function render(hours: readonly HourlySample[], dry: { title: string; note: string } | null = null): string {
  const instants = hours.map((h) => Date.parse(h.valid_at))
  const axis = timeAxis(instants[0]!, instants[instants.length - 1]!, DAY_SCALES)
  return renderToStaticMarkup(
    <RainChart
      axis={axis}
      instants={instants}
      utcOffsetSeconds={0}
      nowMs={T0}
      read={{ ms: null, onRead: () => {} }}
      hours={hours}
      dry={dry}
    />,
  )
}

const count = (s: string, needle: string) => s.split(needle).length - 1

describe('RainChart — blocks', () => {
  it('draws eight 3-hour blocks over a day, each with its inches on top and its chance underneath, on a printed inch scale', () => {
    const svg = render(fullDay)
    expect(count(svg, 'data-block=""')).toBe(8)
    expect(count(svg, 'data-amount=""')).toBe(8)
    expect(count(svg, 'data-chance=""')).toBe(8)
    // Three hours of 0.4 mm is 1.2 mm, 0.047 in; every hour is 30%.
    expect(svg).toContain('>.05&quot;<')
    expect(svg).toContain('>30%<')
    // A small day keeps the 0.2 in scale, so it reads small.
    expect(svg).toContain('>.2&quot;<')
  })

  it('adds up the hours’ means but takes the likeliest hour’s chance, never a sum', () => {
    const day = fullDay.map((h, i) => (i < 3 ? { ...h, precip_mm_mean: 10, precip_chance_pct: [10, 20, 40][i] ?? null } : h))
    const svg = render(day)
    expect(svg).toContain('>1.2&quot;<')
    expect(svg).toContain('>40%<')
    expect(svg).not.toContain('>70%<')
  })

  it('withholds a block with an unread hour rather than adding up the rest', () => {
    const day = fullDay.map((h, i) => (i === 4 ? { ...h, precip_mm_mean: null, precip_chance_pct: null } : h))
    const svg = render(day)
    expect(count(svg, 'data-amount=""')).toBe(7)
    expect(count(svg, '>—<')).toBe(2)
  })

  it('calls a trace a trace', () => {
    const svg = render(fullDay.map((h) => ({ ...h, precip_mm_mean: 0.02 })))
    expect(count(svg, '>tr<')).toBe(8)
  })

  it('says so when no hour has rain or chance', () => {
    expect(render(fullDay.map((h) => ({ ...h, precip_mm_mean: null, precip_chance_pct: null })))).toContain(
      'No hourly rainfall for these hours.',
    )
  })

  it('draws no marks on a day its caller calls dry, and keeps the scale', () => {
    const html = render(
      fullDay.map((h) => ({ ...h, precip_mm_mean: 0, precip_chance_pct: 0 })),
      { title: 'Dry all day', note: '0% in every hour' },
    )
    expect(html).toContain('Dry all day')
    expect(html).not.toContain('data-amount')
    expect(html).toContain('>.2&quot;<')
  })
})
