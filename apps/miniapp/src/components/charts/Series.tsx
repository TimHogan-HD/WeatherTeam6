import { Fragment } from 'react'
import { bandPath, linePath, type Point, type Scale } from './geometry.js'
import { bandRuns, valueRuns, HOUR_MS, type SeriesDatum } from './hourlySeries.js'
import { BAR_GAP, BAR_GAP_MIN_W, BAR_MIN_W, DOT_R, GRID_W, LINE_W, chartColors } from './chartStyle.js'

/**
 * The marks. One component, two kinds: a line with an optional p10-p90 band,
 * and bars.
 *
 * It draws inside a viewBox someone else set up and knows nothing about axes,
 * labels or the response shape — `HourlyChart` owns those. What it does own is
 * the rule that every gap in the data is a gap on screen.
 */

export type SeriesProps = {
  data: readonly SeriesDatum[]
  kind: 'line' | 'bar'
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

function BarMarks({ data, x, y, color, colorForValue, baseY }: Omit<SeriesProps, 'kind'>) {
  if (baseY === undefined) return null

  const slot = Math.abs(x(HOUR_MS) - x(0))
  const gap = slot >= BAR_GAP_MIN_W ? BAR_GAP : 0
  const width = Math.max(BAR_MIN_W, slot - gap)

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
        // Precipitation is stamped at the **end** of the hour it fell in
        // (architecture rule), so the bar covers the hour before its timestamp.
        // Drawing it forward would move every shower an hour later.
        const right = x(d.t)
        const left = x(d.t - HOUR_MS)
        const height = Math.max(0, baseY - y(d.value))
        if (height === 0) return null
        const fill = colorForValue === undefined ? color : colorForValue(d.value)
        return (
          <rect
            key={`bar-${d.t}`}
            x={Math.min(left, right) + gap / 2}
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

export function Series(props: SeriesProps) {
  const { kind, ...rest } = props
  return <Fragment>{kind === 'line' ? <LineMarks {...rest} /> : <BarMarks {...rest} />}</Fragment>
}
