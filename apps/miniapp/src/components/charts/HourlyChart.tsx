import { useState } from 'react'
import { colors, radius, spacing } from '@weatherteam6/design/tokens'
import { extent, linearScale, niceTicks, padExtent, type Extent } from './geometry.js'
import { dayStarts, timeExtent, valueExtent, HOUR_MS, type SeriesDatum } from './hourlySeries.js'
import { Series, type SeriesKind } from './Series.js'
import type { ValueAxis } from './valueAxis.js'
import {
  GRID_W,
  LINE_W,
  PAD_BOTTOM,
  PAD_LEFT,
  PAD_RIGHT,
  PAD_TOP,
  MIN_TICK_GAP,
  VALUE_TICKS,
  VIEW_W,
  chartColors,
} from './chartStyle.js'
import { type } from '../../theme/tokens.css.js'
import { formatWeekday } from '../../lib/forecast.js'
import { formatLocalHourShort } from '../../lib/format.js'

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
  /**
   * The spread to shade, when it is not on `data` itself. Wind only — see
   * `Series`. Counted in the vertical domain like any other mark, so a band
   * wider than the bars is not stroked off the top of the frame.
   */
  bandData?: readonly SeriesDatum[]
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
   * Overrides the measured vertical domain.
   *
   * For a series whose scale is **defined rather than observed** — chance of
   * rain is 0-100 whatever the day did. Measuring it instead would stretch a
   * quiet day's 0-12% across the full height and draw a near-certain downpour,
   * the same defect as a per-row scale on the daily list.
   */
  domain?: Extent
  /** Passed through to the marks. See `SeriesProps.placement`. */
  placement?: 'accumulation' | 'instant'
  /** Passed through to the marks: draw the p10-p90 spread over each bar. */
  whiskers?: boolean
  /**
   * How the value gridlines are chosen and written. See `ValueAxis`.
   *
   * Omitted means the canonical unit is already what the reader sees, and the
   * ticks are written with `formatValue`.
   */
  valueAxis?: ValueAxis
}

/** A tick label needs this much room to its right, or it runs off the chart. */
const DAY_LABEL_W = 28
/** A compact `12a` is about as wide as `Tue`, but a day holds more of them. */
const HOUR_LABEL_W = 22

/** Degenerate spans: a flat line needs a domain of its own or it sits on the frame. */
const MIN_SPAN = 2

/** How close to the left edge a rule has to be before it is the frame. */
const EDGE_TOLERANCE = 3

/** Every sixth hour: four labels across one day, which is what fits at 375px. */
const HOUR_TICK_STEP = 6

/**
 * How close the readout's centre may come to either edge, as a percentage.
 *
 * The chip is centred on its mark, so at the first and last hour half of it
 * would sit outside the card — and nothing in this app clips overflow.
 */
const READOUT_EDGE_PCT = 14

function verticalDomain(data: readonly SeriesDatum[], kind: SeriesKind): Extent | null {
  // **The band counts toward the top even for bars.** A `whiskers` caller that
  // does not pass its own domain would otherwise stroke whiskers above the
  // frame — silently, because SVG does not clip by default and the overflow
  // lands under the next element. Both current callers pass a domain, so this
  // is the latent case rather than the live one.
  const measured = valueExtent(data)
  if (measured === null) return null

  if (kind === 'bar') {
    // Bars are read against zero, so the floor is zero whatever the data does —
    // a rain chart scaled to its own minimum would draw a dry hour as a
    // full-height bar. A window with no rain in it still needs a span.
    //
    // Temperature is the exception and passes an explicit domain: it has no
    // meaningful zero, so its floor is set just under the coldest reading and
    // printed on the axis.
    return { min: 0, max: measured.max > 0 ? measured.max * 1.1 : 1 }
  }

  return padExtent(measured, 0.08, MIN_SPAN)
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
    const label = formatLocalHourShort(d.t, utcOffsetSeconds)
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
  bandData,
  colorForValue,
  formatValue,
  title,
  axis = 'day',
  utcOffsetSeconds,
  domain: fixedDomain,
  placement = 'accumulation',
  whiskers = false,
  valueAxis,
}: HourlyChartProps) {
  // Which hour the pointer is over. `null` when nothing is.
  const [hover, setHover] = useState<number | null>(null)

  // **Forget the hovered hour when the series changes underneath it.** The day
  // pager swaps `data` without remounting this component, so an index held from
  // the previous day would carry over and point at another day's hour.
  //
  // Adjusted during render rather than in an effect — React's own guidance, and
  // the lint rule enforces it: an effect that calls `setState` synchronously
  // renders once with the stale value before correcting it. Keyed on the first
  // timestamp and the length rather than on `data`, which is a fresh array on
  // every render and would reset the readout continuously.
  const seriesKey = `${data[0]?.t ?? ''}-${data.length}`
  const [lastSeries, setLastSeries] = useState(seriesKey)
  if (lastSeries !== seriesKey) {
    setLastSeries(seriesKey)
    setHover(null)
  }

  const times = timeExtent(data)
  const measured = extent(data.map((d) => d.value))
  // **The band counts, even when it lives on its own series.** A wind band
  // reaching past the gusts would otherwise be filled outside the frame, where
  // SVG happily paints it over whatever is next on the page.
  const domain =
    fixedDomain ?? verticalDomain(bandData === undefined ? data : [...data, ...bandData], kind)
  if (times === null || measured === null || domain === null) return null

  // The window follows how the mark sits against its timestamp, not what kind
  // it is:
  //
  // - a line is drawn at the instant and needs no room;
  // - an **accumulation** bar covers the hour *before* its timestamp, so the
  //   window opens an hour early or the first bar is half outside the plot;
  // - an **instant** bar is centred on its timestamp, so it needs half a slot
  //   at *each* end.
  const xDomain: Extent =
    kind === 'line'
      ? times
      : placement === 'accumulation'
        ? { min: times.min - HOUR_MS, max: times.max }
        : { min: times.min - HOUR_MS / 2, max: times.max + HOUR_MS / 2 }

  const plotBottom = viewHeight - PAD_BOTTOM
  const x = linearScale(xDomain, PAD_LEFT, VIEW_W - PAD_RIGHT)
  const y = linearScale(domain, plotBottom, PAD_TOP)

  /**
   * Where an hour's mark is centred, in user units.
   *
   * A line is drawn at its instant; an **accumulation** bar covers the hour
   * before its timestamp, so its centre is half a slot to the left. Both the
   * readout's hit-testing and the crosshair read this, so they cannot disagree
   * with the mark they point at.
   */
  const markCentre = (t: number): number =>
    kind === 'bar' && placement === 'accumulation' ? (x(t) + x(t - HOUR_MS)) / 2 : x(t)

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

  // **Round gridlines, so a bar in the middle can be read.** Two labels at the
  // extremes tell you the scale's ends and nothing about the mark you are
  // looking at; the reader had to interpolate by eye across the whole plot.
  const toDisplay = valueAxis?.toDisplay ?? ((v: number) => v)
  const writeTick = valueAxis === undefined ? formatValue : valueAxis.write
  const displayDomain = { min: toDisplay(domain.min), max: toDisplay(domain.max) }
  const yDisplay = linearScale(displayDomain, plotBottom, PAD_TOP)
  // **Two gridlines that write the same string are one gridline and a lie.** On
  // a drizzle day the rain domain spans 0.016 in, so ticks at 0.005 and 0.010
  // both round to "0.01 in" — two rules at different heights carrying the same
  // number, which reads as a rendering fault. Rounding is a display decision,
  // so the de-duplication has to happen on the *written* label, not the value.
  //
  // **Of a run that writes the same string, the *last* is kept, not the first.**
  // Keeping the first draws the rule at 0.005 in and labels it "0.01 in" — a
  // gridline at one height carrying another value's number, which is worse than
  // the duplicate it was fixing. The last tick in a run is the one whose value
  // the shared label actually rounds from.
  //
  // The tick count also drops on a short plot: four ticks over the 70-unit
  // chance chart come back as six, 8.8 units apart under a 10px label.
  const plotHeight = plotBottom - PAD_TOP
  const wanted = Math.max(2, Math.min(VALUE_TICKS, Math.floor(plotHeight / MIN_TICK_GAP)))
  const valueTicks = niceTicks(displayDomain, wanted).filter((value, i, all) => {
    const next = all[i + 1]
    return next === undefined || writeTick(next) !== writeTick(value)
  })

  /**
   * Which hour the pointer is over, from a clientX.
   *
   * Reads the element's own box rather than the viewBox, because the SVG is
   * scaled to the device width — a coordinate in user units would be wrong by
   * the scale factor on every phone but the 375px reference.
   */
  const hourAt = (clientX: number, box: DOMRect): number | null => {
    if (box.width === 0) return null
    const units = ((clientX - box.left) / box.width) * VIEW_W
    let best: number | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    data.forEach((d, i) => {
      if (d.value === null) return
      // **The mark's centre, not its timestamp.** An accumulation bar spans
      // `x(t-1h)` to `x(t)`, so its middle is half a slot left of `x(t)`;
      // measuring from the timestamp put the whole left half of every rain bar
      // on the *previous* hour's reading, and drew the crosshair down the bar's
      // boundary instead of through it. Same hour-early class as the placement
      // bug in `Series.tsx`.
      const centre = markCentre(d.t)
      const distance = Math.abs(centre - units)
      if (distance < bestDistance) {
        bestDistance = distance
        best = i
      }
    })
    return best
  }

  // **The index is validated, not trusted.** `hover` indexes `data`, and `data`
  // changes under it when the day pager moves — leaving it pointing at another
  // day's hour, or past the end of a shorter series. A stale index draws a
  // crosshair with no readout beside it, or worse, the right-looking number for
  // the wrong day.
  const hovered = hover === null ? undefined : data[hover]
  const active = hovered !== undefined && hovered.value !== null ? hovered : undefined

  // Keeps the readout inside the card. At the last hour the chip's centre sits
  // at ~99% of the width, which put roughly half of it outside — and nothing in
  // this app clips overflow, so it simply hung over the edge.
  const readoutCentre = active === undefined ? 0 : (markCentre(active.t) / VIEW_W) * 100
  const readoutLeft = Math.min(100 - READOUT_EDGE_PCT, Math.max(READOUT_EDGE_PCT, readoutCentre))
  const activeLabel =
    active === undefined || active.value === null
      ? null
      : axis === 'hour' && utcOffsetSeconds !== undefined
        ? formatLocalHourShort(active.t, utcOffsetSeconds)
        : formatWeekday(active.localDate)

  return (
    <div
      style={{ position: 'relative', width: '100%', touchAction: 'pan-y' }}
      onMouseMove={(e) => setHover(hourAt(e.clientX, e.currentTarget.getBoundingClientRect()))}
      onMouseLeave={() => setHover(null)}
      // `touchAction: pan-y` above keeps the page scrollable while a horizontal
      // drag reads the chart; without it the browser claims the gesture and the
      // readout never moves.
      onTouchStart={(e) => {
        const touch = e.touches[0]
        if (touch !== undefined) {
          setHover(hourAt(touch.clientX, e.currentTarget.getBoundingClientRect()))
        }
      }}
      onTouchMove={(e) => {
        const touch = e.touches[0]
        if (touch !== undefined) {
          setHover(hourAt(touch.clientX, e.currentTarget.getBoundingClientRect()))
        }
      }}
      // **The readout is not cleared on touch end.** Lifting a finger is how a
      // phone reader finishes looking at a value; clearing here made the number
      // vanish at the exact moment they wanted to read it. The next touch moves
      // it, and leaving the chart with a mouse still clears it.
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${viewHeight}`}
        width="100%"
        style={{ display: 'block', height: 'auto' }}
        role="img"
        aria-label={summary}
      >
        {/*
          Value gridlines, behind everything. Recessive on purpose — they are a
          reading aid, not data, and a grid that competes with the marks is the
          commonest way a chart stops being readable.
        */}
        {valueTicks.map((value) => (
          <line
            key={`value-${value}`}
            x1={PAD_LEFT}
            x2={VIEW_W - PAD_RIGHT}
            // **`yDisplay`, not `y`.** The tick is in the reader's unit; `y`
            // maps the canonical one. Mixing them puts a 45°F gridline at the
            // height of 45 °C — off the plot entirely, and invisible because
            // SVG does not clip.
            y1={yDisplay(value)}
            y2={yDisplay(value)}
            stroke={chartColors.grid}
            strokeWidth={GRID_W}
            vectorEffect="non-scaling-stroke"
          />
        ))}
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
          {...(bandData === undefined ? {} : { bandData })}
          {...(colorForValue === undefined ? {} : { colorForValue })}
          baseY={y(domain.min)}
          placement={placement}
          whiskers={whiskers}
        />

        {/* The hour under the pointer, marked on the plot itself. */}
        {active === undefined ? null : (
          <line
            x1={markCentre(active.t)}
            x2={markCentre(active.t)}
            y1={PAD_TOP}
            y2={plotBottom}
            stroke={chartColors.crosshair}
            strokeWidth={LINE_W}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {valueTicks.map((value) => (
        <span
          key={`value-label-${value}`}
          style={{
            ...type.label,
            color: chartColors.valueLabel,
            position: 'absolute',
            left: 0,
            // Same scale as the rule it labels — see the note on the gridline.
            top: pctY(yDisplay(value)),
            transform: 'translateY(-50%)',
            whiteSpace: 'nowrap',
          }}
        >
          {writeTick(value)}
        </span>
      ))}

      {/*
        **The readout, which is the only way to get a bar's own number.** The
        charts draw 24 marks and label none of them; before this the reader had
        two figures at the scale's ends and had to interpolate by eye.

        It is driven by pointer and touch events rather than CSS `:hover`,
        because the app is styled with inline styles that cannot express hover
        *and* because there is no hover on a phone. A touch drag scrubs it.
      */}
      {active === undefined || active.value === null || activeLabel === null ? null : (
        <span
          style={{
            ...type.bodySm,
            color: colors.txt1,
            position: 'absolute',
            left: `${readoutLeft}%`,
            top: 0,
            transform: 'translateX(-50%)',
            backgroundColor: colors.mapCanvas,
            borderStyle: 'solid',
            borderWidth: '1px',
            borderColor: colors.line2,
            borderRadius: `${radius.chip}px`,
            padding: `${spacing.micro}px ${spacing.chipGapMd}px`,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {activeLabel} · {formatValue(active.value)}
        </span>
      )}

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
