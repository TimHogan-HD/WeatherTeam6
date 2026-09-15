import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { formatPrecipIn, formatTempF } from '@weatherteam6/types'
import { HourlyChart } from './HourlyChart.js'
import { HOUR_MS, type SeriesDatum } from './hourlySeries.js'
import { TEMP_VIEW_H } from './chartStyle.js'

const T0 = Date.UTC(2026, 8, 14, 0)
const DAYS = ['2026-09-14', '2026-09-15', '2026-09-16']

/** 72 hours across three local days, temperature climbing one degree an hour. */
function threeDays(): SeriesDatum[] {
  return Array.from({ length: 72 }, (_, i) => ({
    t: T0 + i * HOUR_MS,
    localDate: DAYS[Math.floor(i / 24)] ?? '',
    value: 10 + i * 0.1,
    low: 8 + i * 0.1,
    high: 12 + i * 0.1,
  }))
}

function render(data: readonly SeriesDatum[], kind: 'line' | 'bar' = 'line'): string {
  return renderToStaticMarkup(
    <HourlyChart
      data={data}
      kind={kind}
      viewHeight={TEMP_VIEW_H}
      color="#fff"
      formatValue={kind === 'line' ? formatTempF : formatPrecipIn}
      title="Hourly temperature"
    />,
  )
}

describe('HourlyChart', () => {
  it('names the series and its measured range for a screen reader', () => {
    expect(render(threeDays())).toContain('aria-label="Hourly temperature: 50°F to 63°F over 3 days."')
  })

  it('counts the days it drew, not the days in the window', () => {
    // Open-Meteo pads every model out to the longest horizon in the request, so a window
    // routinely holds local days that are entirely null. Saying "3 days" over a chart that
    // drew two is the same false claim as naming a model that did not answer — and the
    // summary is the only part of this component a screen-reader user gets.
    const shortRun = threeDays().map((d) =>
      d.localDate === DAYS[2] ? { ...d, value: null, low: null, high: null } : d,
    )
    expect(render(shortRun)).toContain('over 2 days.')
    // The blank day keeps its rule and its label: the axis is a timeline, and which day
    // is empty is worth knowing.
    expect(render(shortRun)).toContain('>Wed<')
  })

  it('says day, not days, for a single one', () => {
    const oneDay = threeDays().filter((d) => d.localDate === DAYS[0])
    expect(render(oneDay)).toContain('over 1 day.')
  })

  it('labels each local day and rules between them, not at the frame', () => {
    const markup = render(threeDays())
    expect(markup).toContain('>Mon<')
    expect(markup).toContain('>Tue<')
    expect(markup).toContain('>Wed<')
    // Three days, two boundaries: the first day starts at the left edge, where
    // a rule would just be the frame.
    expect(markup.split('<line').length - 1).toBe(2)
  })

  it('labels the forecast, not the outer edge of its spread', () => {
    // The band has to fit inside the plot, so the domain covers it. But a label
    // reading 104°F because one member of 143 got there, over a median that
    // never passes 63°F, is a temperature nobody forecast.
    const wide = threeDays().map((d) => ({ ...d, low: -20, high: 40 }))
    const markup = render(wide)
    expect(markup).toContain('>63°F<')
    expect(markup).not.toContain('>104°F<')
  })

  it('draws nothing at all rather than an empty frame when no hour has a value', () => {
    // An axis with no marks reads as a forecast of nothing. The caller says why
    // it is empty instead.
    const empty = threeDays().map((d) => ({ ...d, value: null, low: null, high: null }))
    expect(render(empty)).toBe('')
  })

  it('still draws a flat series, rather than collapsing onto the frame', () => {
    const flat = threeDays().map((d) => ({ ...d, value: 20, low: null, high: null }))
    const markup = render(flat)
    expect(markup).toContain('<path')
    expect(markup).not.toContain('NaN')
  })

  it('scales a rain chart against zero, not against its own minimum', () => {
    // Otherwise the driest hour of a wet day is drawn as an empty bar and the
    // second-driest as a full one.
    const rain = threeDays().map((d, i) => ({ ...d, value: i === 0 ? 5 : 4, low: null, high: null }))
    const markup = render(rain, 'bar')
    const heights = [...markup.matchAll(/height="([\d.]+)"/g)].map((m) => Number(m[1]))
    const tallest = Math.max(...heights)
    const shortest = Math.min(...heights)
    // 4 mm against 5 mm: four fifths of the tall bar, give or take the rounding.
    expect(shortest / tallest).toBeGreaterThan(0.75)
  })
})

describe('HourlyChart, hour axis', () => {
  /** 24 hours of one local day, starting at midnight UTC. */
  function oneDay(): SeriesDatum[] {
    return Array.from({ length: 24 }, (_, i) => ({
      t: T0 + i * HOUR_MS,
      localDate: DAYS[0] ?? '',
      value: 10 + i * 0.5,
      low: 8 + i * 0.5,
      high: 12 + i * 0.5,
    }))
  }

  function renderHours(data: readonly SeriesDatum[], utcOffsetSeconds: number): string {
    return renderToStaticMarkup(
      <HourlyChart
        data={data}
        kind="range"
        axis="hour"
        utcOffsetSeconds={utcOffsetSeconds}
        viewHeight={TEMP_VIEW_H}
        color="#fff"
        formatValue={formatTempF}
        title="Temperature by hour"
      />,
    )
  }

  /** Every axis label, in order, with the x it was placed at. */
  function tickLabels(markup: string): { at: string; label: string }[] {
    return [...markup.matchAll(/left:([\d.]+)%[^>]*>([\d]{1,2} [AP]M)</g)].map((m) => ({
      at: m[1] ?? '',
      label: m[2] ?? '',
    }))
  }

  it('ticks on the location clock, not on UTC', () => {
    // **The labels are the same four strings either way** — 12 AM, 6 AM, 12 PM,
    // 6 PM — so asserting on their text proves nothing at all. What moves is
    // *where* they sit: at UTC-5 the six-hourly local boundaries are the UTC
    // 05/11/17/23 samples, five hours along from where UTC puts them. A chart
    // reading the viewer's clock would print a correct-looking axis against the
    // wrong hours, which is the exact shape of issue #33.
    const shifted = tickLabels(renderHours(oneDay(), -5 * 3600))
    const utc = tickLabels(renderHours(oneDay(), 0))

    expect(utc.map((t) => t.label)).toEqual(['12 AM', '6 AM', '12 PM', '6 PM'])
    // One fewer at UTC-5: the same four ticks are all ruled, but the last sits
    // close enough to the right edge that its label would run off the chart, so
    // the existing overflow guard drops it. The rule stays.
    expect(shifted.map((t) => t.label)).toEqual(['12 AM', '6 AM', '12 PM'])
    expect(shifted.map((t) => t.at)).not.toEqual(utc.map((t) => t.at))
    // Five hours of a 24-hour window, as a percentage of the plot.
    expect(Number(shifted[0]?.at) - Number(utc[0]?.at)).toBeCloseTo((5 / 24) * (301 / 335) * 100, 1)
  })

  it('counts hours, not days, in its summary', () => {
    expect(renderHours(oneDay(), 0)).toContain('over 24 hours.')
  })

  it('draws no ticks at all rather than ticks on the viewer clock', () => {
    // `utcOffsetSeconds` is required by this axis. Falling back to the local
    // machine would put a label under every hour that happened to be a multiple
    // of six *there* — a plausible-looking axis that is wrong for anyone
    // outside the crag's timezone.
    const markup = renderToStaticMarkup(
      <HourlyChart
        data={oneDay()}
        kind="range"
        axis="hour"
        viewHeight={TEMP_VIEW_H}
        color="#fff"
        formatValue={formatTempF}
        title="Temperature by hour"
      />,
    )
    expect(markup).not.toContain('AM<')
    expect(markup).not.toContain('PM<')
    // The marks are still drawn — an axis with no labels is not an empty chart.
    expect(markup).toContain('<rect')
  })

  it('keeps the ideal-temperature band on screen even when no hour is in it', () => {
    // The band says which part of the scale scores best. If the domain did not
    // cover it, a cold day would clip it away and "too cold" would have nothing
    // to be too cold *of* — the hot end's `fair`/`poor` pair is only ΔE 13
    // apart, so the band is what carries the judgement, not the hue alone.
    const cold = oneDay().map((d) => ({ ...d, value: -5, low: -7, high: -3 }))
    const markup = renderToStaticMarkup(
      <HourlyChart
        data={cold}
        kind="range"
        axis="hour"
        utcOffsetSeconds={0}
        viewHeight={TEMP_VIEW_H}
        color="#fff"
        formatValue={formatTempF}
        title="Temperature by hour"
        referenceBand={{ from: 10, to: 22, fill: '#band' }}
      />,
    )
    expect(markup).toContain('#band')
    // Inside the plot, not clipped to a sliver at the frame.
    const height = /fill="#band"/.test(markup)
      ? Number(/height="([\d.]+)"[^>]*fill="#band"/.exec(markup)?.[1] ?? 0)
      : 0
    expect(height).toBeGreaterThan(10)
  })
})
