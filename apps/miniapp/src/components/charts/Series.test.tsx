import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Series } from './Series.js'
import { HOUR_MS, type SeriesDatum } from './hourlySeries.js'

/**
 * What the marks actually put in the DOM.
 *
 * A chart's failures are silent by construction: a path with a NaN coordinate,
 * a zero-height bar and a missing bar all render as nothing at all. These
 * assertions are about which of those cases produced the nothing.
 */

const T0 = Date.UTC(2026, 8, 14, 0)

/** One hour is ten user units across, so bar geometry is readable in the markup. */
const x = (t: number) => ((t - T0) / HOUR_MS) * 10
const y = (value: number) => 100 - value

function datum(index: number, value: number | null, low: number | null = null, high: number | null = null): SeriesDatum {
  return { t: T0 + index * HOUR_MS, localDate: '2026-09-14', value, low, high }
}

function render(markup: React.ReactElement): string {
  return renderToStaticMarkup(<svg>{markup}</svg>)
}

function count(markup: string, needle: string): number {
  return markup.split(needle).length - 1
}

describe('Series, line', () => {
  it('draws a gap as a gap, not a line across it', () => {
    const data = [datum(0, 10), datum(1, 12), datum(2, null), datum(3, 14), datum(4, 16)]
    const markup = render(<Series data={data} kind="line" x={x} y={y} color="#fff" />)
    expect(count(markup, '<path')).toBe(2)
  })

  it('draws an isolated hour as a dot, because a one-point path paints nothing', () => {
    const data = [datum(0, 10), datum(1, null), datum(2, 14)]
    const markup = render(<Series data={data} kind="line" x={x} y={y} color="#fff" />)
    expect(count(markup, '<path')).toBe(0)
    expect(count(markup, '<circle')).toBe(2)
  })

  it('has no band when none was asked for', () => {
    const data = [datum(0, 10, 8, 12), datum(1, 12, 10, 14)]
    const markup = render(<Series data={data} kind="line" x={x} y={y} color="#fff" />)
    expect(markup).not.toContain('Z"')
  })

  it('breaks the band where one of its edges is missing', () => {
    const data = [
      datum(0, 10, 8, 12),
      datum(1, 11, 9, 13),
      datum(2, 12, 10, null),
      datum(3, 13, 11, 15),
      datum(4, 14, 12, 16),
    ]
    const markup = render(
      <Series data={data} kind="line" x={x} y={y} color="#fff" bandColor="#abc" />,
    )
    // Two ribbons, either side of the hour with one edge. The line itself is
    // unbroken — every value is present, only the spread is unknown — so the
    // three paths are two bands and one line.
    expect(count(markup, 'fill="#abc"')).toBe(2)
    expect(count(markup, '<path')).toBe(3)
  })

  it('draws the line unbroken over an hour whose band is missing', () => {
    const data = [datum(0, 10, 8, 12), datum(1, 11, null, null), datum(2, 12, 10, 14)]
    const markup = render(
      <Series data={data} kind="line" x={x} y={y} color="#fff" bandColor="#abc" />,
    )
    const paths = markup.match(/<path[^>]*d="([^"]+)"/g) ?? []
    expect(paths.some((p) => p.includes('M0,90 L10,89 L20,88'))).toBe(true)
  })
})

describe('Series, bars', () => {
  const bars = (data: SeriesDatum[]) =>
    render(<Series data={data} kind="bar" x={x} y={y} color="#09f" baseY={100} />)

  it('puts a bar over the hour before its timestamp', () => {
    // Hourly precipitation is stamped at the end of the hour it fell in, so the
    // 02:00 sample describes 01:00-02:00. Drawing it forward moves every shower
    // an hour later — plausible on screen and wrong.
    const markup = bars([datum(1, 0), datum(2, 4)])
    expect(markup).toContain('x="11"')
    expect(markup).toContain('width="8"')
  })

  it('draws a measured zero as a stub, and an unmeasured hour as nothing', () => {
    // **"No rain" and "no forecast" must not be the same picture**, and this is
    // now the mechanism: `BAR_MIN_H` gives every hour that has a reading a
    // visible mark, however small. The run-length baseline that used to carry
    // this was replaced by it — a per-hour stub says which *hours* were
    // measured, where a line under a run only said where the run was.
    const markup = bars([datum(1, 0), datum(2, 0), datum(3, null), datum(4, null)])
    expect(count(markup, '<rect')).toBe(2)
    expect(markup).toContain('height="1.5"')
  })

  it('draws nothing at all for a window with no readings', () => {
    expect(count(bars([datum(1, null), datum(2, null)]), '<rect')).toBe(0)
  })

  it('colours each bar by its own value', () => {
    const markup = render(
      <Series
        data={[datum(1, 1), datum(2, 9)]}
        kind="bar"
        x={x}
        y={y}
        color="#09f"
        colorForValue={(v) => (v > 5 ? '#f00' : '#00f')}
        baseY={100}
      />,
    )
    expect(markup).toContain('fill="#00f"')
    expect(markup).toContain('fill="#f00"')
  })
})


describe('Series, instant bars with whiskers', () => {
  /** Temperature and wind: centred on the instant, floor supplied by the caller. */
  const marks = (data: SeriesDatum[], baseY = 100) =>
    render(
      <Series
        data={data}
        kind="bar"
        placement="instant"
        whiskers
        x={x}
        y={y}
        color="#fff"
        baseY={baseY}
      />,
    )

  it('draws a bar to the median with a whisker over it from p10 to p90', () => {
    const markup = marks([datum(0, 15, 12, 18), datum(1, 16, 13, 19)])
    expect(count(markup, '<rect')).toBe(2)
    expect(count(markup, '<line')).toBe(2)
    // y = 100 - value, so the first bar's top is at 85 and its whisker runs
    // from p90 = 18 (y 82) down to p10 = 12 (y 88).
    expect(markup).toContain('y="85"')
    expect(markup).toContain('y1="82"')
    expect(markup).toContain('y2="88"')
  })

  it('rises from the floor the caller set, not from zero', () => {
    // **The floor is the point.** A temperature has no meaningful zero, so the
    // caller passes a floor just under the coldest p10 and the axis prints it.
    // Measured from zero, a September day is twenty-four near-identical bars.
    const markup = marks([datum(0, 15, 12, 18)], 90)
    expect(markup).toContain('height="5"')
  })

  it('draws the bar with no whisker when the hour has no band', () => {
    // Both edges or neither: a whisker from p10 to the bar's own top shows half
    // a spread as if it were the whole one.
    const markup = marks([datum(0, 15, null, null)])
    expect(count(markup, '<rect')).toBe(1)
    expect(count(markup, '<line')).toBe(0)
  })

  it('draws nothing for an hour with no value, because there is nothing to colour', () => {
    const markup = marks([datum(0, null, 12, 18)])
    expect(count(markup, '<rect')).toBe(0)
    expect(count(markup, '<line')).toBe(0)
  })

  it('colours by the value and never by a band edge', () => {
    // Colouring by p90 paints an hour as too hot on the strength of one
    // member's worst run.
    const markup = render(
      <Series
        data={[datum(0, 15, 12, 40)]}
        kind="bar"
        placement="instant"
        whiskers
        x={x}
        y={y}
        color="#fff"
        baseY={100}
        colorForValue={(v) => (v > 30 ? '#hot' : '#mild')}
      />,
    )
    expect(markup).toContain('#mild')
    expect(markup).not.toContain('#hot')
  })

  it('is centred on its timestamp, because a temperature is instantaneous', () => {
    // **Not the rain convention.** `precip_mm_mean` at 15:00 is an accumulation
    // over 14:00-15:00, so its bar spans the hour before it. `temp_c_p50` at
    // 15:00 is the temperature *at* 15:00. An earlier draft reused the rain
    // placement here, which put the 16:00 reading under the axis label reading
    // "3 PM" — the day's peak an hour early, and self-consistent enough that
    // nothing else disagreed with it.
    const markup = marks([datum(1, 15, 12, 18)])
    // Hour 1 is at x=10; a width-8 mark centred there starts at 6.
    expect(markup).toContain('x="6"')
    expect(markup).toContain('width="8"')
    // The whisker sits on the same centre.
    expect(markup).toContain('x1="10"')
    expect(markup).toContain('x2="10"')
  })

  it('places its mark at the same x the line chart draws the same hour', () => {
    // The line is drawn at `x(t)`; the bar's centre must be the same instant.
    // Two views of one series that disagree about when an hour was are worse
    // than either alone.
    const markup = marks([datum(3, 15, 12, 18)])
    const left = Number(/x="([\d.]+)"/.exec(markup)?.[1])
    expect(left + 8 / 2).toBe(x(T0 + 3 * HOUR_MS))
  })
})
