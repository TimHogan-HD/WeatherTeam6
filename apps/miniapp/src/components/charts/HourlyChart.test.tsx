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

  it('labels a line chart with the series, because nothing else states it', () => {
    // **The seven-day strip has no heading figure**, so these two labels are
    // the only numbers on screen. Its domain is padded around the p10-p90 band,
    // so labelling the domain here prints one member's worst hour as the
    // forecast — measured on this fixture, 113°F over a median that never
    // passes 63°F.
    const wide = threeDays().map((d) => ({ ...d, low: -20, high: 40 }))
    const markup = render(wide)
    expect(markup).toContain('>63°F<')
    expect(markup).not.toContain('>104°F<')
    expect(markup).not.toContain('>113°F<')
  })

  it('labels a bar chart with the domain it drew against', () => {
    // **The two labels are the scale, not the series.** They sit at the top and
    // bottom of the plot and say what the marks are measured against — which,
    // for a bar chart on a non-zero floor, is the one thing a reader cannot
    // infer from the picture.
    //
    // The series' own extremes are the caller's job: `ChartBlock` prints them
    // right-aligned in the heading, where a figure can be labelled. An earlier
    // version printed the measured min and max *at their own heights* inside
    // the plot, which reads as annotations floating in the chart and says
    // nothing about where the bars begin.
    //
    // The fixture's medians run 50-63°F and its band runs wider, so a domain
    // label must sit *outside* the series range. Asserting that rather than a
    // literal is what distinguishes "labels the scale" from "labels the
    // series"; a test pinned to two numbers would pass either way.
    // A bar chart *is* accompanied by a heading figure — `DayCharts` prints the
    // day's own range — so the labels are free to be the scale, and for a bar
    // they have to be: the floor is the one thing the picture cannot show.
    // Rain's floor is zero whatever the data does.
    const rain = threeDays().map((d) => ({ ...d, value: 3, low: null, high: null }))
    const markup = render(rain, 'bar')
    const labels = [...markup.matchAll(/white-space:nowrap">([^<]*in)</g)].map((m) => m[1])
    expect(labels).toEqual(['0.13 in', '0 in'])
  })

  it('still reports the series, not the domain, to a screen reader', () => {
    // The accessible summary is the one place the *forecast* range has to
    // survive, because a screen-reader user gets no heading figure and no
    // visual scale. A band edge quoted there would be a temperature nobody
    // forecast.
    const wide = threeDays().map((d) => ({ ...d, low: -20, high: 40 }))
    expect(render(wide)).toContain('aria-label="Hourly temperature: 50°F to 63°F')
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
        kind="bar" placement="instant" whiskers
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
    return [...markup.matchAll(/left:([\d.]+)%[^>]*>([\d]{1,2}[ap])</g)].map((m) => ({
      at: m[1] ?? '',
      label: m[2] ?? '',
    }))
  }

  it('ticks on the location clock, not on UTC', () => {
    // **The labels are the same four strings either way** — 12a, 6a, 12p, 6p
    // — so asserting on their text proves nothing at all. What moves is
    // *where* they sit: at UTC-5 the six-hourly local boundaries are the UTC
    // 05/11/17/23 samples, five hours along from where UTC puts them. A chart
    // reading the viewer's clock would print a correct-looking axis against the
    // wrong hours, which is the exact shape of issue #33.
    const shifted = tickLabels(renderHours(oneDay(), -5 * 3600))
    const utc = tickLabels(renderHours(oneDay(), 0))

    expect(utc.map((t) => t.label)).toEqual(['12a', '6a', '12p', '6p'])
    // One fewer at UTC-5: all four ticks are ruled, but the last sits close
    // enough to the right edge that its label would run off the chart, so the
    // overflow guard drops it. The rule stays. Compact labels did not change
    // this — the tick is five hours further right, not merely wider.
    expect(shifted.map((t) => t.label)).toEqual(['12a', '6a', '12p'])
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
        kind="bar" placement="instant" whiskers
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


})
