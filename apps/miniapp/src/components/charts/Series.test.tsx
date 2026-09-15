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

  it('draws no bar for a measured zero, but keeps the baseline under it', () => {
    const markup = bars([datum(1, 0), datum(2, 0)])
    expect(count(markup, '<rect')).toBe(0)
    expect(count(markup, '<line')).toBe(1)
  })

  it('stops the baseline where the forecast stops', () => {
    // The whole point of the baseline: "no rain" and "no forecast" both draw
    // nothing otherwise, and they are not the same answer.
    const markup = bars([datum(1, 0), datum(2, 0), datum(3, null), datum(4, null)])
    expect(count(markup, '<line')).toBe(1)
    expect(markup).toContain('x1="0"')
    expect(markup).toContain('x2="20"')
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

describe('Series, range', () => {
  it('draws one mark per hour, spanning p10 to p90 with the median ruled across it', () => {
    const data = [datum(0, 15, 12, 18), datum(1, 16, 13, 19)]
    const markup = render(<Series data={data} kind="range" x={x} y={y} color="#fff" />)
    expect(count(markup, '<rect')).toBe(2)
    expect(count(markup, '<line')).toBe(2)
    // y = 100 - value, so p90 of 18 is the top at 82 and p10 of 12 is 88.
    expect(markup).toContain('y="82"')
    expect(markup).toContain('height="6"')
  })

  it('never measures from a baseline, so a below-zero hour still draws', () => {
    // This is the whole reason the temperature mark is not a bar. A bar from
    // zero clamps a negative value to no height at all, so the coldest hour of
    // the week is the one that disappears.
    const data = [datum(0, -4, -6, -2)]
    const markup = render(<Series data={data} kind="range" x={x} y={y} color="#fff" />)
    expect(count(markup, '<rect')).toBe(1)
    expect(markup).toContain('height="4"')
  })

  it('keeps an hour the ensemble agreed on exactly, instead of painting nothing', () => {
    // p10 === p90 is the most confident forecast there is; a zero-height rect
    // paints nothing at any fill, which would make it the one hour that
    // vanishes.
    const data = [datum(0, 15, 15, 15)]
    const markup = render(<Series data={data} kind="range" x={x} y={y} color="#fff" />)
    expect(markup).toContain('height="1"')
  })

  it('draws the median alone when the hour has no band, rather than borrowing one', () => {
    const data = [datum(0, 15, null, null)]
    const markup = render(<Series data={data} kind="range" x={x} y={y} color="#fff" />)
    expect(count(markup, '<rect')).toBe(0)
    expect(count(markup, '<line')).toBe(1)
  })

  it('draws nothing for an hour with no median, because there is no value to colour', () => {
    const data = [datum(0, null, 12, 18)]
    const markup = render(<Series data={data} kind="range" x={x} y={y} color="#fff" />)
    expect(count(markup, '<rect')).toBe(0)
    expect(count(markup, '<line')).toBe(0)
  })

  it('colours by the median and never by a band edge', () => {
    // Colouring by p90 paints an hour as too hot on the strength of one
    // member's worst run.
    const data = [datum(0, 15, 12, 40)]
    const markup = render(
      <Series
        data={data}
        kind="range"
        x={x}
        y={y}
        color="#fff"
        colorForValue={(v) => (v > 30 ? '#hot' : '#mild')}
      />,
    )
    expect(markup).toContain('#mild')
    expect(markup).not.toContain('#hot')
  })

  it('covers the hour before its timestamp, the same way a rain bar does', () => {
    // Two marks at the same x have to mean the same hour, or the temperature
    // chart and the rain chart disagree about when a shower was.
    const data = [datum(1, 15, 12, 18)]
    const markup = render(<Series data={data} kind="range" x={x} y={y} color="#fff" />)
    // Hour 1 occupies x 0-10; the gap of 2 puts the mark at x=1, width 8.
    expect(markup).toContain('x="1"')
    expect(markup).toContain('width="8"')
  })
})
