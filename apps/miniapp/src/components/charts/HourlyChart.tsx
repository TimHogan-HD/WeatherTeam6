import { spacing } from '@weatherteam6/design/tokens'
import { extent, linearScale, padExtent, type Extent } from './geometry.js'
import { dayStarts, timeExtent, valueExtent, HOUR_MS, type SeriesDatum } from './hourlySeries.js'
import { Series } from './Series.js'
import {
  GRID_W,
  PAD_BOTTOM,
  PAD_LEFT,
  PAD_RIGHT,
  PAD_TOP,
  VIEW_W,
  chartColors,
} from './chartStyle.js'
import { type } from '../../theme/tokens.css.js'
import { formatWeekday } from '../../lib/forecast.js'

/**
 * One chart: a viewBox, day gridlines, the marks, and labels.
 *
 * **The labels are HTML positioned over the SVG, not `<text>` inside it.** The
 * SVG scales with the device width, and a `<text>` scales with it — the type
 * tokens would arrive at whatever size the viewport happened to imply. Outside,
 * they wear `type.label` and are the size the design system says they are.
 *
 * Returns `null` when there is nothing to draw. An empty frame with axes reads
 * as "no rain, no wind, nothing happening"; the caller says why it is empty.
 */

export type HourlyChartProps = {
  data: readonly SeriesDatum[]
  kind: 'line' | 'bar'
  viewHeight: number
  color: string
  bandColor?: string
  colorForValue?: (value: number) => string
  /** Takes the canonical metric value and writes the displayed unit. */
  formatValue: (value: number | null) => string
  /** Names the series for a screen reader. The visible label is the caller's. */
  title: string
}

/** A day label needs this much room to its right, or it runs off the chart. */
const DAY_LABEL_W = 28

/** Degenerate spans: a flat line needs a domain of its own or it sits on the frame. */
const MIN_SPAN = 2

/** How close to the left edge a day rule has to be before it is the frame. */
const EDGE_TOLERANCE = 3

function verticalDomain(data: readonly SeriesDatum[], kind: 'line' | 'bar'): Extent | null {
  const measured = valueExtent(data)
  if (measured === null) return null
  if (kind === 'line') return padExtent(measured, 0.08, MIN_SPAN)
  // Bars are read against zero, so the baseline is zero whatever the data does
  // — a rain chart scaled to its own minimum would draw a dry hour as a
  // full-height bar. A window with no rain in it still needs a span.
  return { min: 0, max: measured.max > 0 ? measured.max * 1.1 : 1 }
}

export function HourlyChart({
  data,
  kind,
  viewHeight,
  color,
  bandColor,
  colorForValue,
  formatValue,
  title,
}: HourlyChartProps) {
  const times = timeExtent(data)
  // The labels and the summary describe the **series itself**, not the band
  // around it. The domain has to cover the band or it would be clipped, but
  // labelling its outer edge as the high says the forecast reached a value the
  // median never does — one member's worst hour printed as the temperature.
  const measured = extent(data.map((d) => d.value))
  const domain = verticalDomain(data, kind)
  if (times === null || measured === null || domain === null) return null

  // A bar covers the hour *before* its timestamp, so the window has to start an
  // hour earlier or the first bar is drawn half outside the plot.
  const xDomain: Extent = kind === 'bar' ? { min: times.min - HOUR_MS, max: times.max } : times

  const plotBottom = viewHeight - PAD_BOTTOM
  const x = linearScale(xDomain, PAD_LEFT, VIEW_W - PAD_RIGHT)
  const y = linearScale(domain, plotBottom, PAD_TOP)

  const days = dayStarts(data)
  const summary = `${title}: ${formatValue(measured.min)} to ${formatValue(measured.max)} over ${days.length} days.`

  const pctX = (value: number): string => `${(value / VIEW_W) * 100}%`
  const pctY = (value: number): string => `${(value / viewHeight) * 100}%`

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${viewHeight}`}
        width="100%"
        style={{ display: 'block', height: 'auto' }}
        role="img"
        aria-label={summary}
      >
        {days.map((day) => {
          const at = x(day.t)
          // The first day starts at the left edge — a rule there reads as the
          // frame, not as a boundary. The tolerance is not cosmetic: a bar
          // chart's window opens an hour before its first sample, which puts
          // that rule a whisker inside the plot rather than exactly on it.
          if (at <= PAD_LEFT + EDGE_TOLERANCE) return null
          return (
            <line
              key={`grid-${day.localDate}`}
              x1={at}
              x2={at}
              y1={PAD_TOP}
              y2={plotBottom}
              stroke={chartColors.grid}
              strokeWidth={GRID_W}
              vectorEffect="non-scaling-stroke"
            />
          )
        })}

        <Series
          data={data}
          kind={kind}
          x={x}
          y={y}
          color={color}
          {...(bandColor === undefined ? {} : { bandColor })}
          {...(colorForValue === undefined ? {} : { colorForValue })}
          baseY={y(domain.min)}
        />
      </svg>

      {/*
        The measured extremes, at their own height — the two values worth
        reading off a seven-day chart. Not a number on every point: 168 of them
        is a table, and a worse one than the daily rows above.
      */}
      {(measured.max === measured.min ? [measured.max] : [measured.max, measured.min]).map((value, i) => (
        <span
          key={i === 0 ? 'high' : 'low'}
          style={{
            ...type.label,
            color: chartColors.valueLabel,
            position: 'absolute',
            left: 0,
            top: pctY(y(value)),
            transform: 'translateY(-50%)',
            whiteSpace: 'nowrap',
          }}
        >
          {formatValue(value)}
        </span>
      ))}

      {days.map((day) => {
        const at = x(day.t)
        if (at > VIEW_W - PAD_RIGHT - DAY_LABEL_W) return null
        return (
          <span
            key={`label-${day.localDate}`}
            style={{
              ...type.label,
              color: chartColors.timeLabel,
              position: 'absolute',
              left: pctX(at),
              top: pctY(plotBottom),
              paddingLeft: `${spacing.micro}px`,
              whiteSpace: 'nowrap',
            }}
          >
            {formatWeekday(day.localDate)}
          </span>
        )
      })}
    </div>
  )
}
