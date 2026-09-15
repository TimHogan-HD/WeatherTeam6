import { Fragment } from 'react'
import { bandPath, linePath, type Point, type Scale } from './geometry.js'
import { bandRuns, valueRuns, HOUR_MS, type SeriesDatum } from './hourlySeries.js'
import {
  BAR_GAP,
  BAR_GAP_MIN_W,
  BAR_MIN_H,
  BAR_MIN_W,
  BAR_RADIUS,
  DOT_R,
  LINE_W,
  WHISKER_W,
  chartColors,
} from './chartStyle.js'

/**
 * The marks. One component, two kinds: a line with an optional p10-p90 band,
 * and bars.
 *
 * It draws inside a viewBox someone else set up and knows nothing about axes,
 * labels or the response shape — `HourlyChart` owns those. What it does own is
 * the rule that every gap in the data is a gap on screen.
 */

export type SeriesKind = 'line' | 'bar'

export type SeriesProps = {
  data: readonly SeriesDatum[]
  kind: SeriesKind
  /** Epoch milliseconds to user units. */
  x: Scale
  /** Value to user units, inverted by the caller. */
  y: Scale
  color: string
  /**
   * The p10-p90 ribbon. Omitted where the series has no spread to draw — the
   * chance of rain, which is itself a measure of agreement and has no band of
   * its own.
   *
   * Drawn **behind** bars as well as under a line. On bars it is the only way
   * to read spread at seven days' width: a whisker on each of 168 two-pixel
   * bars is a hedge, not a chart. Per-day charts have room for the whiskers and
   * use both.
   */
  bandColor?: string
  /**
   * The series the band is taken from, when it is not the marks' own.
   *
   * Wind is the only caller: its whisker runs from sustained to gust — a
   * different variable, not a spread — so the ensemble p10-p90 has nowhere to
   * live on the same datum. Defaults to `data`, which is every other chart.
   */
  bandData?: readonly SeriesDatum[]
  /** Bars only. A bar's colour follows its own value; a line has one colour. */
  colorForValue?: (value: number) => string
  /** Bars only: the y of the plot floor they grow from. */
  baseY?: number
  /**
   * Bars only. Where the mark sits against its timestamp:
   *
   * - `accumulation` (default) spans the hour *before* it — rain, and the
   *   chance of that rain, because both describe what fell between 14:00 and
   *   15:00.
   * - `instant` is centred on it — temperature and wind are readings *at* 15:00.
   *
   * Reusing one rule for both put the day's peak an hour early under a
   * correct-looking axis. See `accumulationLeft` / `instantLeft` below.
   */
  placement?: 'accumulation' | 'instant'
  /** Bars only: draw the p10-p90 spread as a whisker over each bar. */
  whiskers?: boolean
}

function pointsIn(
  data: readonly SeriesDatum[],
  from: number,
  to: number,
  x: Scale,
  y: Scale,
  pick: (d: SeriesDatum) => number | null,
): Point[] {
  const out: Point[] = []
  for (let i = from; i <= to; i += 1) {
    const d = data[i]
    if (d === undefined) continue
    const value = pick(d)
    if (value === null) continue
    out.push({ x: x(d.t), y: y(value) })
  }
  return out
}

function LineMarks({ data, x, y, color, bandColor, bandData }: Omit<SeriesProps, 'kind'>) {
  const source = bandData ?? data
  const bands = bandColor === undefined ? [] : bandRuns(source)
  const lines = valueRuns(data)

  return (
    <>
      {bands.map((run) => {
        const upper = pointsIn(source, run.start, run.end, x, y, (d) => d.high)
        const lower = pointsIn(source, run.start, run.end, x, y, (d) => d.low)
        const path = bandPath(upper, lower)
        // A one-hour band is a ribbon of zero width — nothing to fill. The line
        // still draws its dot there, so the hour is not lost.
        if (path === '') return null
        return <path key={`band-${run.start}`} d={path} fill={bandColor} stroke="none" />
      })}

      {lines.map((run) => {
        const points = pointsIn(data, run.start, run.end, x, y, (d) => d.value)
        const path = linePath(points)
        if (path !== '') {
          return (
            <path
              key={`line-${run.start}`}
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={LINE_W}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )
        }
        // A single hour surrounded by gaps. `linePath` returns '' for it rather
        // than an `M` with no line command, which paints nothing at any stroke
        // width — the hour would vanish with no way to tell it apart from the
        // gap around it.
        const only = points[0]
        if (only === undefined) return null
        return <circle key={`dot-${run.start}`} cx={only.x} cy={only.y} r={DOT_R} fill={color} />
      })}
    </>
  )
}

/** The horizontal slot one hour occupies, and the mark drawn inside it. */
function barGeometry(x: Scale): { gap: number; width: number } {
  const slot = Math.abs(x(HOUR_MS) - x(0))
  const gap = slot >= BAR_GAP_MIN_W ? BAR_GAP : 0
  return { gap, width: Math.max(BAR_MIN_W, slot - gap) }
}

/**
 * A **rain** bar's left edge: it covers the hour *before* its timestamp.
 *
 * Precipitation is an accumulation — `precip_mm_mean` at 15:00 is the rain that
 * fell between 14:00 and 15:00 (architecture rule) — so the mark has to span
 * the hour it accumulated over. Drawing it forward moves every shower an hour
 * later.
 */
function accumulationLeft(t: number, x: Scale, gap: number): number {
  return Math.min(x(t), x(t - HOUR_MS)) + gap / 2
}

/**
 * An **instantaneous** mark's left edge: it is centred on its timestamp.
 *
 * `temp_c_p50` at 15:00 is the temperature *at* 15:00, not an average over the
 * hour before it, so it does not span a preceding hour the way rain does.
 *
 * **These two placements must stay different, and an earlier draft of this file
 * had them the same.** Reusing the accumulation rule here put the 16:00 reading
 * in the slot the axis heads "3 PM", so the day's peak read an hour early —
 * plausible, self-consistent, and wrong. Phase 2's temperature *line* has always
 * been drawn at `x(t)`; this is the same instant, given width.
 */
function instantLeft(t: number, x: Scale, width: number): number {
  return x(t) - width / 2
}

/**
 * Bars, optionally with a whisker for the ensemble spread.
 *
 * **The bar rises from the plot floor, which is not always zero.** For rain,
 * chance of rain and wind the floor *is* zero and the height is the value. For
 * temperature the caller sets a floor just under the coldest p10, because a
 * temperature has no meaningful zero — a 24-hour column measured from 0 °F
 * would be twenty identical near-full bars. The axis prints that floor, and the
 * reader compares bar **tops** and colours rather than areas.
 *
 * An earlier build drew temperature as a floating 35%-opacity box to avoid the
 * truncated baseline. It was technically defensible and visually unreadable —
 * a column of pale grey boxes where the mockup has a legible orange-to-red
 * profile. The truncation is labelled; the washed-out chart was not fixable.
 */
function BarMarks({
  data,
  x,
  y,
  color,
  bandColor,
  bandData,
  colorForValue,
  baseY,
  placement = 'accumulation',
  whiskers = false,
}: Omit<SeriesProps, 'kind'>) {
  if (baseY === undefined) return null

  const { gap, width } = barGeometry(x)
  const half = width / 2
  const bandSource = bandData ?? data
  const bands = bandColor === undefined ? [] : bandRuns(bandSource)

  return (
    <>
      {/*
        The spread, behind the bars. Drawn first so a bar is never dimmed by the
        ribbon over it — the bar is the forecast and the band is the doubt
        around it, and reversing that reads as a confident chart of nothing.
      */}
      {bands.map((run) => {
        const upper = pointsIn(bandSource, run.start, run.end, x, y, (d) => d.high)
        const lower = pointsIn(bandSource, run.start, run.end, x, y, (d) => d.low)
        const path = bandPath(upper, lower)
        if (path === '') return null
        return <path key={`band-${run.start}`} d={path} fill={bandColor} stroke="none" />
      })}

      {data.map((d) => {
        if (d.value === null) return null
        const left =
          placement === 'accumulation'
            ? accumulationLeft(d.t, x, gap)
            : instantLeft(d.t, x, width)
        const top = y(d.value)
        // **A minimum height, so a zero hour is a stub and not a hole.** A
        // zero-height rect paints nothing, and an hour with a real 0% chance of
        // rain would then look identical to one the models never reached.
        const height = Math.max(BAR_MIN_H, baseY - top)
        const fill = colorForValue === undefined ? color : colorForValue(d.value)

        return (
          <Fragment key={`bar-${d.t}`}>
            <rect
              x={left}
              y={baseY - height}
              width={width}
              height={height}
              rx={Math.min(BAR_RADIUS, width / 2)}
              fill={fill}
            />
            {/*
              The spread, drawn over the bar. **Both edges or nothing** — a
              whisker from p10 to the bar's own top shows half a spread as if it
              were the whole one, and a run of bars each missing a different
              edge looks like the ensemble tightening and loosening at random.
            */}
            {!whiskers || d.low === null || d.high === null ? null : (
              <line
                x1={left + half}
                x2={left + half}
                y1={y(d.high)}
                y2={y(d.low)}
                stroke={chartColors.whisker}
                strokeWidth={WHISKER_W}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </Fragment>
        )
      })}
    </>
  )
}

export function Series(props: SeriesProps) {
  const { kind, ...rest } = props
  return <Fragment>{kind === 'line' ? <LineMarks {...rest} /> : <BarMarks {...rest} />}</Fragment>
}
