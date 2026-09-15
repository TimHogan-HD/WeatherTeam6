import { Fragment } from 'react'
import { bandPath, linePath, type Point, type Scale } from './geometry.js'
import { bandRuns, valueRuns, HOUR_MS, type SeriesDatum } from './hourlySeries.js'
import {
  BAR_GAP,
  BAR_GAP_MIN_W,
  BAR_MIN_W,
  DOT_R,
  GRID_W,
  LINE_W,
  RANGE_FILL_OPACITY,
  RANGE_MIN_H,
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

export type SeriesKind = 'line' | 'bar' | 'range'

export type SeriesProps = {
  data: readonly SeriesDatum[]
  kind: SeriesKind
  /** Epoch milliseconds to user units. */
  x: Scale
  /** Value to user units, inverted by the caller. */
  y: Scale
  color: string
  /** Omitted when there is no band to draw, which is every series but temperature. */
  bandColor?: string
  /** Bars only. A bar's colour follows its own value; a line has one colour. */
  colorForValue?: (value: number) => string
  /** Bars only: the y of the baseline they grow from. */
  baseY?: number
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

function LineMarks({ data, x, y, color, bandColor }: Omit<SeriesProps, 'kind'>) {
  const bands = bandColor === undefined ? [] : bandRuns(data)
  const lines = valueRuns(data)

  return (
    <>
      {bands.map((run) => {
        const upper = pointsIn(data, run.start, run.end, x, y, (d) => d.high)
        const lower = pointsIn(data, run.start, run.end, x, y, (d) => d.low)
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

function BarMarks({ data, x, y, color, colorForValue, baseY }: Omit<SeriesProps, 'kind'>) {
  if (baseY === undefined) return null

  const { gap, width } = barGeometry(x)

  return (
    <>
      {/*
        The baseline runs under the hours that have a reading, and stops where
        they do. Without it a forecast of no rain and an hour the models never
        reached are the same picture: a zero-height bar draws nothing, and so
        does a missing one.
      */}
      {valueRuns(data).map((run) => {
        const first = data[run.start]
        const last = data[run.end]
        if (first === undefined || last === undefined) return null
        return (
          <line
            key={`base-${run.start}`}
            x1={x(first.t - HOUR_MS)}
            x2={x(last.t)}
            y1={baseY}
            y2={baseY}
            stroke={chartColors.grid}
            strokeWidth={GRID_W}
            vectorEffect="non-scaling-stroke"
          />
        )
      })}

      {data.map((d) => {
        if (d.value === null) return null
        const height = Math.max(0, baseY - y(d.value))
        if (height === 0) return null
        const fill = colorForValue === undefined ? color : colorForValue(d.value)
        return (
          <rect
            key={`bar-${d.t}`}
            x={accumulationLeft(d.t, x, gap)}
            y={baseY - height}
            width={width}
            height={height}
            rx={Math.min(BAR_GAP, width / 2)}
            fill={fill}
          />
        )
      })}
    </>
  )
}

/**
 * One floating mark per hour: the p10-p90 spread as a bar, with the median
 * ruled across it.
 *
 * **Deliberately not a bar from a baseline.** Temperature has no meaningful
 * zero — 0 °C is a different place on the scale from 0 °F, so a column measured
 * from it encodes the unit as much as the weather, and a below-zero hour would
 * draw no bar at all. Truncating the axis instead is the classic bar-chart lie.
 * A mark that spans an interval has no origin to get wrong, and the interval is
 * the thing worth showing here: it is the ensemble spread, which is what this
 * app holds and the forecast apps it was compared against do not.
 *
 * `colorForValue` is fed the **median**, never an edge. Colouring by p90 would
 * paint an hour as too hot on the strength of one member's worst run.
 */
function RangeMarks({ data, x, y, color, colorForValue }: Omit<SeriesProps, 'kind'>) {
  const { width } = barGeometry(x)
  const fillFor = (value: number): string =>
    colorForValue === undefined ? color : colorForValue(value)

  return (
    <>
      {data.map((d) => {
        // No median means no colour and no rule; the band edges alone would be
        // an unlabelled grey box. The two come from the same ensemble parse, so
        // this is a defensive case rather than an expected one.
        if (d.value === null) return null
        const left = instantLeft(d.t, x, width)
        const mid = y(d.value)

        // An hour with a median but no band — a real state, not an error. Drawn
        // as the median rule alone rather than dropped, so the hour is still
        // there and is visibly narrower than its neighbours instead of
        // borrowing their spread.
        if (d.low === null || d.high === null) {
          return (
            <line
              key={`median-${d.t}`}
              x1={left}
              x2={left + width}
              y1={mid}
              y2={mid}
              stroke={fillFor(d.value)}
              strokeWidth={LINE_W}
              vectorEffect="non-scaling-stroke"
            />
          )
        }

        const top = Math.min(y(d.high), y(d.low))
        const bottom = Math.max(y(d.high), y(d.low))
        return (
          <g key={`range-${d.t}`}>
            <rect
              x={left}
              y={top}
              width={width}
              // An ensemble that agrees exactly gives a zero-height rect, which
              // paints nothing — the same disappearing-mark problem as a
              // one-point path. RANGE_MIN_H keeps the hour visible.
              height={Math.max(RANGE_MIN_H, bottom - top)}
              rx={Math.min(BAR_GAP, width / 2)}
              fill={fillFor(d.value)}
              opacity={RANGE_FILL_OPACITY}
            />
            <line
              x1={left}
              x2={left + width}
              y1={mid}
              y2={mid}
              stroke={fillFor(d.value)}
              strokeWidth={LINE_W}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}
    </>
  )
}

export function Series(props: SeriesProps) {
  const { kind, ...rest } = props
  return (
    <Fragment>
      {kind === 'line' ? (
        <LineMarks {...rest} />
      ) : kind === 'range' ? (
        <RangeMarks {...rest} />
      ) : (
        <BarMarks {...rest} />
      )}
    </Fragment>
  )
}
