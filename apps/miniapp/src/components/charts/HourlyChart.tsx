import { spacing } from '@weatherteam6/design/tokens'
import { extent, linearScale, padExtent, type Extent } from './geometry.js'
import { dayStarts, timeExtent, valueExtent, HOUR_MS, type SeriesDatum } from './hourlySeries.js'
import { Series, type SeriesKind } from './Series.js'
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
import { formatLocalHour } from '../../lib/format.js'

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
  kind: SeriesKind
  viewHeight: number
  color: string
  bandColor?: string
  colorForValue?: (value: number) => string
  /** Takes the canonical metric value and writes the displayed unit. */
  formatValue: (value: number | null) => string
  /** Names the series for a screen reader. The visible label is the caller's. */
  title: string
  /**
   * `'day'` rules and labels each local calendar day — the seven-day strip.
   * `'hour'` rules and labels every `HOUR_TICK_STEP`th hour of one day, read on
   * the **location's** clock, which is why it needs the offset below.
   */
  axis?: 'day' | 'hour'
  /** Required by, and only read by, `axis: 'hour'`. Seconds, from `HourlySeries`. */
  utcOffsetSeconds?: number
  /**
   * A shaded horizontal reference range behind the marks, in the data's own
   * units — the conditions score's ideal temperature band.
   *
   * It is an annotation, not a series: it says which part of the scale is good,
   * so a mark's **position** carries "too warm" rather than its hue having to
   * carry it alone.
   */
  referenceBand?: { from: number; to: number; fill: string }
}

/** A tick label needs this much room to its right, or it runs off the chart. */
const DAY_LABEL_W = 28
/** `12 AM` is wider than `Tue`, and there are more of them in a day. */
const HOUR_LABEL_W = 34

/** Degenerate spans: a flat line needs a domain of its own or it sits on the frame. */
const MIN_SPAN = 2

/** How close to the left edge a rule has to be before it is the frame. */
const EDGE_TOLERANCE = 3

/** Every sixth hour: four labels across one day, which is what fits at 375px. */
const HOUR_TICK_STEP = 6

function verticalDomain(
  data: readonly SeriesDatum[],
  kind: SeriesKind,
  referenceBand: HourlyChartProps['referenceBand'],
): Extent | null {
  const measured =
    kind === 'bar'
      ? // Rain is read against zero and has no band, so its own values are the
        // whole domain.
        extent(data.map((d) => d.value))
      : valueExtent(data)
  if (measured === null) return null

  if (kind === 'bar') {
    // Bars are read against zero, so the baseline is zero whatever the data does
    // — a rain chart scaled to its own minimum would draw a dry hour as a
    // full-height bar. A window with no rain in it still needs a span.
    return { min: 0, max: measured.max > 0 ? measured.max * 1.1 : 1 }
  }

  // The reference band is only worth drawing if it is on screen, and clipping
  // it would move where "ideal" appears to sit. Including it in the domain
  // costs vertical room on a mild day and is what keeps the annotation honest.
  const withBand =
    referenceBand === undefined
      ? measured
      : {
          min: Math.min(measured.min, referenceBand.from),
          max: Math.max(measured.max, referenceBand.to),
        }
  return padExtent(withBand, 0.08, MIN_SPAN)
}

/**
 * The x positions to rule and label.
 *
 * Hour ticks come from the **location's** clock: `formatLocalHour` shifts by the
 * response's own `utc_offset_seconds`, and the modulo that picks every sixth
 * hour is applied to that same shifted hour. Using the viewer's clock would put
 * the ticks at 3:00, 9:00… for anyone in another timezone — labels that do not
 * line up with the hours they mark.
 */
function hourTicks(
  data: readonly SeriesDatum[],
  utcOffsetSeconds: number,
): { key: string; t: number; label: string }[] {
  const out: { key: string; t: number; label: string }[] = []
  for (const d of data) {
    const shifted = new Date(d.t + utcOffsetSeconds * 1000)
    if (shifted.getUTCHours() % HOUR_TICK_STEP !== 0) continue
    const label = formatLocalHour(d.t, utcOffsetSeconds)
    if (label === null) continue
    out.push({ key: `${d.localDate}-${shifted.getUTCHours()}`, t: d.t, label })
  }
  return out
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
  axis = 'day',
  utcOffsetSeconds,
  referenceBand,
}: HourlyChartProps) {
  const times = timeExtent(data)
  // The labels and the summary describe the **series itself**, not the band
  // around it. The domain has to cover the band or it would be clipped, but
  // labelling its outer edge as the high says the forecast reached a value the
  // median never does — one member's worst hour printed as the temperature.
  const measured = extent(data.map((d) => d.value))
  const domain = verticalDomain(data, kind, referenceBand)
  if (times === null || measured === null || domain === null) return null

  // Each kind needs a different window, because each mark sits differently
  // against its timestamp:
  //
  // - `line` is drawn at the instant and needs no room.
  // - `bar` is rain, an **accumulation** covering the hour *before* its
  //   timestamp, so the window opens an hour early or the first bar is half
  //   outside the plot.
  // - `range` is temperature, an **instantaneous** reading centred on its
  //   timestamp, so it needs half a slot of room at *each* end.
  const xDomain: Extent =
    kind === 'line'
      ? times
      : kind === 'bar'
        ? { min: times.min - HOUR_MS, max: times.max }
        : { min: times.min - HOUR_MS / 2, max: times.max + HOUR_MS / 2 }

  const plotBottom = viewHeight - PAD_BOTTOM
  const x = linearScale(xDomain, PAD_LEFT, VIEW_W - PAD_RIGHT)
  const y = linearScale(domain, plotBottom, PAD_TOP)

  // The hour axis needs the location's offset; without it the ticks would be
  // read on the viewer's clock, which is worse than having none. An axis with
  // nothing to label still draws its marks.
  const ticks =
    axis === 'hour'
      ? utcOffsetSeconds === undefined
        ? []
        : hourTicks(data, utcOffsetSeconds)
      : dayStarts(data).map((d) => ({
          key: d.localDate,
          t: d.t,
          label: formatWeekday(d.localDate),
        }))
  const labelWidth = axis === 'hour' ? HOUR_LABEL_W : DAY_LABEL_W

  // **What was drawn, not what the window contains.** Open-Meteo pads every model out to
  // the longest horizon in the request, so a 7-day window routinely contains local days
  // that are entirely null. "over 7 days" for a chart that draws five is the same false
  // claim as naming a model that did not answer — and it is the only part of this
  // component a screen-reader user has.
  const drawn = data.filter((d) => d.value !== null)
  const covered = axis === 'hour' ? drawn.length : new Set(drawn.map((d) => d.localDate)).size
  const unit = axis === 'hour' ? 'hour' : 'day'
  const summary = `${title}: ${formatValue(measured.min)} to ${formatValue(measured.max)} over ${covered} ${covered === 1 ? unit : `${unit}s`}.`

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
        {/*
          Behind the marks, so it reads as ground rather than as a series. Its
          edges are clamped to the plot: the domain already covers the band, but
          a caller passing one that does not must not paint outside the frame.
        */}
        {referenceBand === undefined ? null : (
          <rect
            x={PAD_LEFT}
            width={VIEW_W - PAD_RIGHT - PAD_LEFT}
            y={Math.max(PAD_TOP, Math.min(y(referenceBand.to), y(referenceBand.from)))}
            height={Math.max(
              0,
              Math.min(plotBottom, Math.max(y(referenceBand.to), y(referenceBand.from))) -
                Math.max(PAD_TOP, Math.min(y(referenceBand.to), y(referenceBand.from))),
            )}
            fill={referenceBand.fill}
          />
        )}

        {ticks.map((tick) => {
          const at = x(tick.t)
          // The first tick sits at the left edge — a rule there reads as the
          // frame, not as a boundary. The tolerance is not cosmetic: a bar
          // chart's window opens an hour before its first sample, which puts
          // that rule a whisker inside the plot rather than exactly on it.
          if (at <= PAD_LEFT + EDGE_TOLERANCE) return null
          return (
            <line
              key={`grid-${tick.key}`}
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

      {ticks.map((tick) => {
        const at = x(tick.t)
        if (at > VIEW_W - PAD_RIGHT - labelWidth) return null
        return (
          <span
            key={`label-${tick.key}`}
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
            {tick.label}
          </span>
        )
      })}
    </div>
  )
}
