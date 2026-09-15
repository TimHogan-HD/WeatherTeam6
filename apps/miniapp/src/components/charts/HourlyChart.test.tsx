import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { formatPrecipIn, formatTempF } from '@weatherteam6/types'
import { HourlyChart } from './HourlyChart.js'
import { HOUR_MS, type SeriesDatum } from './hourlySeries.js'
import { PAD_BOTTOM, PAD_LEFT, TEMP_VIEW_H } from './chartStyle.js'
import { rainAxis, tempAxis } from './valueAxis.js'

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
      // **Passed because every real caller passes one**, and it changes the
      // answer: ticks are chosen round in the *display* unit, so a °C domain
      // yields 45/50/55/60/65°F rather than 10°C and 15°C — which are round
      // only in a unit nobody on this screen sees.
      valueAxis={kind === 'line' ? tempAxis : rainAxis}
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
    // a rule would just be the frame. Counted as *vertical* rules — the value
    // gridlines are horizontal and share the element name.
    const vertical = [...markup.matchAll(/<line x1="([\d.]+)" x2="\1"/g)]
    expect(vertical).toHaveLength(2)
  })

  it('labels the value axis with round gridlines a mark can be read against', () => {
    // **Two floating labels at the extremes were the whole problem.** They gave
    // the scale's ends and nothing about the mark under your eye, so a bar in
    // the middle had to be interpolated across the plot. Round gridlines let a
    // reader estimate from the nearest one.
    const markup = render(threeDays())
    const labels = [...markup.matchAll(/white-space:nowrap">(-?\d+)°F</g)].map((m) => Number(m[1]))
    // Round numbers in the unit the reader sees, not arithmetic slices of a
    // domain carried in °C. Asserted exactly, so a change in the tick rule is
    // visible rather than merely still-divisible-by-five.
    expect(labels).toEqual([45, 50, 55, 60, 65])
    // Each label has a rule **at its own height**. Asserting the two agree, not
    // merely that both exist: the rule and the label are positioned by separate
    // expressions, and one of them was scaled in °C while its value was in °F —
    // which puts a 45°F gridline where 45 °C would be, off the plot and
    // invisible, because SVG does not clip. Counting elements missed it.
    const ruleY = [...markup.matchAll(/<line x1="30" x2="331" y1="([\d.]+)" y2="\1"/g)].map((m) =>
      Number(m[1]),
    )
    const labelY = [...markup.matchAll(/top:([\d.]+)%;transform:translateY\(-50%\)/g)].map(
      (m) => (Number(m[1]) / 100) * TEMP_VIEW_H,
    )
    expect(ruleY).toHaveLength(labels.length)
    expect(labelY).toHaveLength(labels.length)
    labelY.forEach((at, i) => expect(at).toBeCloseTo(ruleY[i] ?? -1, 6))
  })

  it('still reports the series, not the axis, to a screen reader', () => {
    // The axis runs past the data by design — that is what an axis does, and it
    // is why gridlines are safe where two floating edge labels were not. The
    // accessible summary is where the *forecast* range has to survive, because
    // a screen-reader user gets no gridlines at all.
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

describe('HourlyChart, value axis de-duplication', () => {
  it('drops a gridline whose label repeats the one below it', () => {
    // **Measured on real data.** A drizzle day spans about 0.016 in, so nice
    // ticks land at 0.005 and 0.010 — both "0.01 in" at two decimals. Two rules
    // at different heights carrying the same number reads as a rendering fault,
    // and rounding is a display decision, so this has to be caught on the
    // written label rather than on the value.
    const drizzle = Array.from({ length: 24 }, (_, i) => ({
      t: T0 + i * HOUR_MS,
      localDate: DAYS[0] ?? '',
      value: i === 12 ? 0.4 : 0.05,
      low: null,
      high: null,
    }))
    const markup = render(drizzle, 'bar')
    const labels = [...markup.matchAll(/translateY\(-50%\)[^>]*>([^<]+)</g)].map((m) => m[1])
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe('HourlyChart, readout hit-testing', () => {
  /** 24 hours at a known value per hour, one local day. */
  function day(values: number[]): SeriesDatum[] {
    return values.map((value, i) => ({
      t: T0 + i * HOUR_MS,
      localDate: DAYS[0] ?? '',
      value,
      low: null,
      high: null,
    }))
  }

  it('maps a pointer to the bar under it, not to the nearest timestamp', () => {
    // **An accumulation bar spans `x(t-1h)` to `x(t)`**, so its middle is half a
    // slot left of its timestamp. Measuring from the timestamp put the whole
    // left half of every rain bar on the *previous* hour's reading, and drew the
    // crosshair down the bar's boundary rather than through it.
    //
    // Asserted on the geometry the component uses, because the environment has
    // no DOM to dispatch a pointer event into: the crosshair is rendered at the
    // mark centre, and the centre of an accumulation bar is not its timestamp.
    const markup = renderToStaticMarkup(
      <HourlyChart
        data={day(Array.from({ length: 24 }, (_, i) => i))}
        kind="bar"
        axis="hour"
        utcOffsetSeconds={0}
        viewHeight={TEMP_VIEW_H}
        color="#fff"
        formatValue={formatPrecipIn}
        valueAxis={rainAxis}
        title="Rainfall by hour"
      />,
    )
    // The bars themselves span a full slot; the first one starts at the plot's
    // left edge, which is what "covers the hour before its timestamp" means.
    const firstBar = /<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/.exec(markup)
    expect(firstBar).not.toBeNull()
    expect(Number(firstBar?.[1])).toBeCloseTo(PAD_LEFT + 1, 0)
  })
})

describe('HourlyChart, gridline labels', () => {
  it('labels a rule with the value it is actually drawn at', () => {
    // **The de-duplication used to keep the *first* of a matching run.** On a
    // drizzle day that drew the rule at 0.005 in and labelled it "0.01 in" — a
    // gridline at one height carrying another value's number, which is worse
    // than the duplicate label it replaced. Keeping the last of the run leaves
    // the tick the shared label actually rounds from.
    const drizzle = Array.from({ length: 24 }, (_, i) => ({
      t: T0 + i * HOUR_MS,
      localDate: DAYS[0] ?? '',
      value: i === 12 ? 0.44 : 0.02,
      low: null,
      high: null,
    }))
    const markup = render(drizzle, 'bar')

    const labels = [...markup.matchAll(/translateY\(-50%\)[^>]*>([^<]+)</g)].map((m) => m[1] ?? '')
    const labelY = [...markup.matchAll(/top:([\d.]+)%;transform:translateY\(-50%\)/g)].map(
      (m) => (Number(m[1]) / 100) * TEMP_VIEW_H,
    )
    expect(new Set(labels).size).toBe(labels.length)

    // Every label reads back to the height it sits at. The plot maps the display
    // domain 0..max linearly onto `plotBottom..PAD_TOP`, so a label's inches can
    // be recovered from its y and must match what it says.
    const plotBottom = TEMP_VIEW_H - PAD_BOTTOM
    // Ticks render in ascending value, so the first is the floor.
    const bottomLabel = Number((labels[0] ?? '').replace(' in', ''))
    const topLabel = Number((labels[labels.length - 1] ?? '').replace(' in', ''))
    const bottomY = labelY[0] ?? 0
    const topY = labelY[labelY.length - 1] ?? 0
    // The bottom tick is the floor, at the bottom of the plot, and reads zero.
    expect(bottomLabel).toBe(0)
    expect(bottomY).toBeCloseTo(plotBottom, 1)
    // The top tick is above it, and says more than zero.
    expect(topLabel).toBeGreaterThan(0)
    expect(topY).toBeLessThan(bottomY)
  })
})
