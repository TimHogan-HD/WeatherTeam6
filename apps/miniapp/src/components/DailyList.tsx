import { colors, spacing, radius } from '@weatherteam6/design/tokens'
import {
  EM_DASH,
  formatPrecipIn,
  formatTempF,
  type ForecastSnapshot,
  type HourlySample,
  type HourlySeries,
} from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { bareButton, card, row, stack } from '../theme/styles.js'
import { formatWeekday } from '../lib/forecast.js'
import { linearScale, niceTicks, unionExtent, type Extent } from './charts/geometry.js'
import { chartColors, scoreColor, tempColor } from './charts/chartStyle.js'
import { identityAxis, rainAxis, tempAxis, type ValueAxis } from './charts/valueAxis.js'
import { daySpread } from './charts/hourlySeries.js'
import { Segmented } from './Segmented.js'

/**
 * The seven daily rows, with a metric toggle and a range bar per row.
 *
 * **The bar's scale is shared by all seven rows.** An earlier design normalised
 * each row to its own min/max, which drew the identical bar on every row
 * whatever the values were — a chart that cannot be wrong is a chart that says
 * nothing. Comparing days to each other is the entire job of this list.
 *
 * Rows are tappable and open that day in the Hourly tab. A day the hourly
 * response cannot draw is not tappable: `onSelectDay` is omitted for it rather
 * than opening an empty drill-down.
 */

/**
 * Three metrics, as the mockup specifies.
 *
 * A fourth, wind, was added in the first build because the row this replaced
 * carried a wind figure on every day and dropping it would have deleted the
 * only place six of the seven days' wind could be read. **The Hourly tab now
 * has a wind chart of its own**, with gusts, so that reason is gone and the
 * toggle is back to three.
 */
export type DailyMetric = 'temperature' | 'rain' | 'score'

const METRIC_OPTIONS: readonly { value: DailyMetric; label: string }[] = [
  { value: 'temperature', label: 'Temp' },
  { value: 'rain', label: 'Rain' },
  { value: 'score', label: 'Climbing' },
]

/**
 * How each metric is labelled on the axis under the rows.
 *
 * Ticks are chosen and positioned in **display** units, never in canonical
 * ones: 10 °C is a round number and 50°F is the one the reader sees. Doing half
 * of this in each space is a bug this module has already shipped twice — the
 * rule and its label drawn at different heights, invisible because SVG does not
 * clip.
 */
function axisFor(metric: DailyMetric): ValueAxis {
  if (metric === 'temperature') return tempAxis
  if (metric === 'rain') return rainAxis
  // A score is already the number a reader sees, and carries no unit.
  return identityAxis('')
}

/**
 * How many gridlines the row track gets.
 *
 * Three. `niceTicks` rounds the step outward, so asking for four returns six on
 * a 0-100 score — six labels across a ~200px track, which collide. Asking for
 * three returns three or four, and fewer still when no round step fits, which is
 * the common case for a week whose highs span six degrees.
 */
const AXIS_TICKS = 3

/** A tick's position across the track, as a percentage. Display units in, percent out. */
function tickScale(domain: Extent, tick: number): number {
  return linearScale(domain, 0, 100)(tick)
}

/**
 * What one row's bar spans, in the metric's own units, or `null` when the day
 * has no value for it.
 *
 * A **range** for temperature (the day's low to its high) and a bar **from
 * zero** for rain and score, because those two are magnitudes and temperature
 * is not — the same distinction the hourly charts make between a range mark and
 * a bar.
 */
export function rowSpan(day: ForecastSnapshot, metric: DailyMetric): { from: number; to: number } | null {
  if (metric === 'temperature') {
    // Both ends or neither. A bar from an unknown low to a known high would
    // read as a cold night nobody forecast.
    if (day.temp_c_min === null || day.temp_c_max === null) return null
    return { from: day.temp_c_min, to: day.temp_c_max }
  }
  if (metric === 'rain') {
    if (day.precip_mm_p50 === null) return null
    return { from: 0, to: day.precip_mm_p50 }
  }
  // `score` is optional on the type and **absent entirely** for a non-climbing
  // location — the route omits the merge rather than sending nulls. `null` with
  // an `unavailable_reason` means withheld, and both are "no bar", never a zero
  // one: zero is a real score meaning conditions are as bad as they get.
  if (day.score === null || day.score === undefined) return null
  return { from: 0, to: day.score }
}

/**
 * The ensemble's spread for one row — the band behind the bar.
 *
 * **This is the answer to "what else could happen", and it is the only part of
 * a daily row that changes as the week goes on.** Two days at the same forecast
 * high are not the same forecast if one of them is three days out.
 *
 * Where each metric's spread comes from, and why they differ:
 *
 * - **temperature** — from the hourly run, because `temp_c_min`/`temp_c_max`
 *   on the row are already medians of the members' own extremes and have no
 *   percentiles beside them. `null` when the run does not reach the day.
 * - **rain** — `precip_mm_p10`-`precip_mm_p90`, which the row does carry.
 * - **score** — nothing. A conditions score has no ensemble; its uncertainty is
 *   `confidence`, which the row prints as a word instead.
 */
export function rowSpread(
  day: ForecastSnapshot,
  metric: DailyMetric,
  hours: readonly HourlySample[],
): { from: number; to: number } | null {
  if (metric === 'temperature') return daySpread(hours, day.forecast_date)
  if (metric === 'rain') {
    // Both ends or neither: a band from a known p10 to an unknown p90 would
    // draw a narrow, confident-looking forecast out of half a measurement.
    if (day.precip_mm_p10 === null || day.precip_mm_p90 === null) return null
    return { from: day.precip_mm_p10, to: day.precip_mm_p90 }
  }
  return null
}

/** The metric's value, written in the unit a reader sees. */
function rowValue(day: ForecastSnapshot, metric: DailyMetric): string {
  if (metric === 'temperature') {
    return `${formatTempF(day.temp_c_max)} / ${formatTempF(day.temp_c_min)}`
  }
  if (metric === 'rain') return formatPrecipIn(day.precip_mm_p50)
  // Not `formatX(null)`: the shared formatters' em dash is for a *measurement*
  // that is missing, and a score is not a measurement. Same glyph, and it has
  // to be the same glyph, but it is reached by its own branch so a future
  // "withheld" wording lands here and not in a unit formatter.
  return day.score === null || day.score === undefined ? EM_DASH : `${day.score}`
}

/**
 * The domain every row's bar is drawn against.
 *
 * Score is a **fixed** 0-100 — its scale is defined, not measured, and letting
 * a week of poor days stretch to fill the width would make 40 look like a good
 * day. Temperature and rain are measured across the whole week so the rows are
 * comparable; rain is anchored at zero for the same reason its hourly bars are.
 */
export function sharedDomain(
  days: readonly ForecastSnapshot[],
  metric: DailyMetric,
  hours: readonly HourlySample[] = [],
): Extent | null {
  if (metric === 'score') return { min: 0, max: 100 }
  const pick = (
    fn: (d: ForecastSnapshot) => { from: number; to: number } | null,
  ): (Extent | null)[] =>
    days.map((d) => {
      const span = fn(d)
      return span === null ? null : { min: Math.min(span.from, span.to), max: Math.max(span.from, span.to) }
    })

  // **The band is inside the domain, not clipped by it.** A p90 beyond the
  // week's warmest median would otherwise run off the end of every track it
  // touches — and because these are plain divs with no overflow, it would run
  // off silently, drawing a narrow band where the widest one belongs.
  const measured = unionExtent([
    ...pick((d) => rowSpan(d, metric)),
    ...pick((d) => rowSpread(d, metric, hours)),
  ])
  if (measured === null) return null
  if (metric === 'rain') {
    return { min: 0, max: measured.max > 0 ? measured.max : 1 }
  }
  // A week that never varies still needs a width, or every bar is a hairline at
  // the same place and the comparison the list exists for is impossible.
  return measured.max === measured.min
    ? { min: measured.min - 1, max: measured.max + 1 }
    : measured
}

/**
 * Row geometry. Bars are percentages of the row's own width, so there is no
 * viewBox here — but the axis under the list has to line its labels up with the
 * same track, which is what the two gutters are for.
 */
const BAR_TRACK_H = 14
const BAR_H = 6
/** The weekday column, and the value column on the right. */
const DOW_W = 30
const VALUE_W = 78

/**
 * One row's track: gridlines, the ensemble band, and the forecast bar.
 *
 * **The bar alone was the thing the reader called decorative, and they were
 * right.** A filled track scaled to the week's own high and low says only
 * "warmer than Tuesday, cooler than Saturday" — which the numbers to its right
 * already say, in degrees. What it could not say was how much any of it is
 * worth. The band says that: it is where 8 in 10 forecast runs land, it widens
 * with every day further out, and two days with the same forecast high stop
 * looking like the same forecast.
 *
 * The gridlines are the other half. A bar that starts and ends nowhere in
 * particular cannot be read off; one crossing a labelled 90° line can.
 */
function RangeBar({
  span,
  spread,
  domain,
  ticks,
  toDisplay,
  fill,
  bandColor,
  gradient,
}: {
  span: { from: number; to: number } | null
  /** The ensemble's range. `null` for a metric or a day that has none. */
  spread: { from: number; to: number } | null
  /**
   * `null` when **no** day in the week has this metric, in which case there is
   * no scale to draw against and every row is an empty track. The track still
   * renders: dropping it collapses the row layout, which reads as a glitch
   * rather than as a week with no reading in it.
   *
   * In **display** units, like everything else positioned here.
   */
  domain: Extent | null
  ticks: readonly number[]
  toDisplay: (canonical: number) => number
  fill: string
  bandColor: string
  /** Overrides the flat fill — temperature runs from the day's low to its high. */
  gradient?: string
}) {
  const scale = domain === null ? null : linearScale(domain, 0, 100)
  const place = (range: { from: number; to: number } | null): { left: number; width: number } | null => {
    if (range === null || scale === null) return null
    const a = scale(toDisplay(range.from))
    const b = scale(toDisplay(range.to))
    const left = Math.min(a, b)
    // A single-point range — a flat day, or a zero-rain day — would be a
    // zero-width div, which paints nothing: the same vanishing mark as a
    // zero-height bar. One percent keeps it on screen.
    return { left, width: Math.max(1, Math.max(a, b) - left) }
  }

  const bar = place(span)
  const band = place(spread)

  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        height: `${BAR_TRACK_H}px`,
      }}
    >
      {/* The scale itself, behind everything. */}
      {scale === null
        ? null
        : ticks.map((tick) => (
            <div
              key={tick}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${scale(tick)}%`,
                width: '1px',
                backgroundColor: chartColors.grid,
              }}
            />
          ))}

      {/*
        The spread. Full height, under the bar, so the bar is never dimmed by
        it — the bar is the forecast and this is the doubt around it.
      */}
      {band === null ? null : (
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${band.left}%`,
            width: `${band.width}%`,
            borderRadius: `${radius.stepBar}px`,
            backgroundColor: bandColor,
          }}
        />
      )}

      {/*
        A day with no value keeps its track and draws no bar. The empty track is
        the "absences are drawn, not omitted" rule: a row that simply lost its
        bar is indistinguishable from a row whose value happened to be zero.
      */}
      {bar === null ? null : (
        <div
          style={{
            position: 'absolute',
            top: `${(BAR_TRACK_H - BAR_H) / 2}px`,
            height: `${BAR_H}px`,
            left: `${bar.left}%`,
            width: `${bar.width}%`,
            borderRadius: `${radius.stepBar}px`,
            background: gradient ?? fill,
          }}
        />
      )}
    </div>
  )
}

/**
 * The bar's colour, by metric.
 *
 * Temperature uses the same ramp as the hourly charts, fed the day's **high** —
 * the figure the score's temperature component is computed from, so the colour
 * and the score agree about which end of the day matters. Rain uses the rain
 * accent rather than the intensity ramp: a daily total is not an hourly rate,
 * and the ramp's thresholds are rates.
 */

/**
 * The temperature bar is a **gradient from the day's low to its high**, so the
 * bar shows the day's swing rather than one colour standing in for both ends.
 *
 * `null` for every other metric: rain, wind and score are magnitudes from zero,
 * where the whole bar means one value and a gradient across it would imply a
 * range nobody forecast.
 */
function gradientFor(day: ForecastSnapshot, metric: DailyMetric): string | null {
  if (metric !== 'temperature') return null
  if (day.temp_c_min === null || day.temp_c_max === null) return null
  return `linear-gradient(90deg, ${tempColor(day.temp_c_min)}, ${tempColor(day.temp_c_max)})`
}

function barFill(day: ForecastSnapshot, metric: DailyMetric): string {
  if (metric === 'temperature') {
    return day.temp_c_max === null ? colors.line2 : tempColor(day.temp_c_max)
  }
  if (metric === 'rain') return colors.rain
  // Score is the one metric the status colours are *for* — this bar is the
  // conditions ladder. The rungs come from `SCORE_BANDS`, the same constant
  // `stateLabel` switches on, so a bar can never go amber on a day the words
  // call "Mostly dry".
  //
  // Four rungs onto three colours: 'Dry, settled' and 'Mostly dry' share lime,
  // because the palette has three status hues and those two rungs agree about
  // the only thing a colour can say here.
  const score = day.score
  if (score === null || score === undefined) return colors.line2
  return scoreColor(score)
}

/**
 * The band's colour, matched to the bar it sits behind.
 *
 * Score has no band and never reaches here; the fallback exists so a future
 * metric cannot fail silently by drawing a transparent one.
 */
function bandColorFor(metric: DailyMetric): string {
  return metric === 'rain' ? chartColors.rainBand : chartColors.temperatureBand
}

export type DailyListProps = {
  days: readonly ForecastSnapshot[]
  metric: DailyMetric
  onMetricChange: (metric: DailyMetric) => void
  /**
   * Opens a day in the Hourly tab. Omitted when there is no hourly data at all
   * (the `/add` preview), which makes every row plain text rather than a
   * button that does nothing.
   */
  onSelectDay?: (localDate: string) => void
  /**
   * The dates the hourly response can actually draw. A date outside this set is
   * rendered but not tappable — the acceptance criterion for the drill-down.
   * Omit when `onSelectDay` is omitted.
   */
  drawableDates?: ReadonlySet<string>
  /** Hides the climbing-score option for a location that has no score at all. */
  showScoreMetric: boolean
  /**
   * The hourly run, for the temperature band behind each row.
   *
   * **Not for drawing hours** — the rows show days. It is here because the
   * ensemble's daily spread exists nowhere else: `temp_c_min`/`temp_c_max` on
   * a forecast row are already medians of the members' own extremes, with no
   * percentiles beside them. Absent on the `/add` preview, and absent while the
   * query is in flight, which draws the rows with no band rather than with a
   * narrow one.
   */
  hourly?: HourlySeries
}

export function DailyList({
  days,
  metric,
  onMetricChange,
  onSelectDay,
  drawableDates,
  showScoreMetric,
  hourly,
}: DailyListProps) {
  const options = showScoreMetric ? METRIC_OPTIONS : METRIC_OPTIONS.filter((o) => o.value !== 'score')
  const hours = hourly?.hours ?? []
  const valueAxis = axisFor(metric)

  // **Everything below this line is in display units.** The domain, the ticks,
  // the bars and the bands all go through `toDisplay` once, here or in
  // `RangeBar`, and nothing mixes the two spaces. Positioning a label in one
  // and its rule in the other is a bug this module has shipped twice, and both
  // times it was invisible: the mark landed off-plot, where nothing clips it.
  const canonical = sharedDomain(days, metric, hours)
  const domain: Extent | null =
    canonical === null
      ? null
      : { min: valueAxis.toDisplay(canonical.min), max: valueAxis.toDisplay(canonical.max) }
  const ticks = domain === null ? [] : niceTicks(domain, AXIS_TICKS)
  const bandColor = bandColorFor(metric)
  return (
    <section style={stack(spacing.listGapSm)}>
      <div style={{ ...row(spacing.chipGapMd), justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span style={type.label}>Next 7 days</span>
        <Segmented
          as="radio"
          label="Compare days by"
          options={options}
          value={metric}
          onChange={onMetricChange}
        />
      </div>
      {days.map((day) => {
        const tappable =
          onSelectDay !== undefined && drawableDates?.has(day.forecast_date) === true
        const body = (
          <div style={{ ...row(spacing.chipGapMd), width: '100%' }}>
            {/*
              The weekday alone. Seven rows never repeat one, and the full date
              cost 86px of a 335px row — a third of the width — to say something
              the position already says. The open day's full date is in the
              Hourly pager, where there is room for it.
            */}
            <span style={{ ...type.calDay, minWidth: `${DOW_W}px` }}>
              {formatWeekday(day.forecast_date)}
            </span>
            <RangeBar
              span={rowSpan(day, metric)}
              spread={rowSpread(day, metric, hours)}
              domain={domain}
              ticks={ticks}
              toDisplay={valueAxis.toDisplay}
              fill={barFill(day, metric)}
              bandColor={bandColor}
              {...(gradientFor(day, metric) === null
                ? {}
                : { gradient: gradientFor(day, metric) as string })}
            />
            <span
              style={{
                ...stack(0),
                minWidth: `${VALUE_W}px`,
                alignItems: 'flex-end',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ ...type.bodyMd, color: colors.txt2 }}>{rowValue(day, metric)}</span>
              {/*
                How much the score is worth, in the scorer's own word.
                **Only on the score metric**, because that is the only thing
                `confidence` describes — the other two carry their uncertainty
                as a band, which is a measurement rather than a label. Absent
                entirely for a city, whose rows have no score fields at all.
              */}
              {metric === 'score' && day.confidence !== undefined ? (
                <span style={{ ...type.labelSm, color: colors.txt5 }}>{day.confidence}</span>
              ) : null}
            </span>
          </div>
        )
        const rowStyle = {
          ...card,
          padding: `${spacing.cellPad}px ${spacing.cardPadSm}px`,
        }
        // A row is a `<button>` only when it is tappable, and it contains no
        // interactive descendant either way — a control inside a control is
        // markup the browser reparses, which is how the list card's retry
        // button escaped its card.
        return tappable ? (
          <button
            key={day.forecast_date}
            type="button"
            onClick={() => onSelectDay(day.forecast_date)}
            style={{ ...bareButton, ...rowStyle }}
          >
            {body}
          </button>
        ) : (
          <div key={day.forecast_date} style={rowStyle}>
            {body}
          </div>
        )
      })}
      {/*
        The ruler the seven tracks share, labelled where they are ruled.

        **The three-part note this replaces was the problem the reader named.**
        "68° · shared scale · 102°" put the ends of the week under the rows and
        left everything between them to be guessed at, so a bar three fifths of
        the way along said nothing a number could be read off. These labels sit
        at the same percentages as the gridlines inside every track above.

        Inset by the two columns the tracks are inset by, or every label would
        be a weekday's width adrift — near enough to look deliberate.
      */}
      {domain === null || ticks.length === 0 ? null : (
        <div
          style={{
            position: 'relative',
            height: '12px',
            marginLeft: `${DOW_W + spacing.chipGapMd + spacing.cardPadSm}px`,
            marginRight: `${VALUE_W + spacing.chipGapMd + spacing.cardPadSm}px`,
          }}
        >
          {ticks.map((tick, i) => {
            const pct = tickScale(domain, tick)
            return (
              <span
                key={tick}
                style={{
                  ...type.labelSm,
                  color: colors.txt5,
                  position: 'absolute',
                  left: `${pct}%`,
                  // The outermost labels are pulled inside the track instead of
                  // centred on it, so neither hangs over a neighbouring column.
                  transform:
                    i === 0 && pct < 5
                      ? 'none'
                      : i === ticks.length - 1 && pct > 95
                        ? 'translateX(-100%)'
                        : 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                }}
              >
                {valueAxis.write(tick)}
              </span>
            )
          })}
        </div>
      )}

      {/*
        What the band behind each bar is. Said once, under the list: it means
        the same thing on every row and on every chart in the app, and a reader
        who learns it here has learnt the hourly charts too.
      */}
      {metric === 'score' ? null : (
        <span style={{ ...type.labelSm, color: colors.txt5 }}>
          {'Band: where 8 in 10 forecast runs land — it widens further out'}
        </span>
      )}

      {/*
        Why some rows do not open. Said once, under the list, rather than as a
        per-row marker: the reason is the same for all of them and a repeated
        badge would compete with the bars.
        The copy is a string expression rather than JSX text so it can keep the
        straight apostrophe every other message in this app uses (`Couldn't
        load…`) without tripping react/no-unescaped-entities. `&rsquo;` put two
        different apostrophes on the same screen.
      */}
      {onSelectDay === undefined ||
      drawableDates === undefined ||
      days.every((d) => drawableDates.has(d.forecast_date)) ? null : (
        <span style={type.bodySm}>
          {"Days without an hour-by-hour forecast can't be opened."}
        </span>
      )}
    </section>
  )
}
