import { colors, spacing, radius } from '@weatherteam6/design/tokens'
import {
  EM_DASH,
  SCORE_BANDS,
  formatPrecipIn,
  formatTempF,
  formatWindMph,
  type ForecastSnapshot,
} from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { bareButton, card, row, stack } from '../theme/styles.js'
import { formatForecastDate } from '../lib/forecast.js'
import { extent, linearScale, type Extent } from './charts/geometry.js'
import { tempColor } from './charts/chartStyle.js'
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
 * **Wind is a fourth option the design direction did not list.** It named
 * temperature, rain and climbing score. The row it replaces showed a wind
 * figure on every day, and a toggle without it would have quietly deleted the
 * only place six of the seven days' wind was readable — a regression dressed as
 * a redesign. It is a daily maximum from the same response, on the same shared
 * scale as the others.
 */
export type DailyMetric = 'temperature' | 'rain' | 'wind' | 'score'

const METRIC_OPTIONS: readonly { value: DailyMetric; label: string }[] = [
  { value: 'temperature', label: 'Temp' },
  { value: 'rain', label: 'Rain' },
  { value: 'wind', label: 'Wind' },
  { value: 'score', label: 'Climbing' },
]

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
  if (metric === 'wind') {
    if (day.wind_kmh_max === null) return null
    return { from: 0, to: day.wind_kmh_max }
  }
  // `score` is optional on the type and **absent entirely** for a non-climbing
  // location — the route omits the merge rather than sending nulls. `null` with
  // an `unavailable_reason` means withheld, and both are "no bar", never a zero
  // one: zero is a real score meaning conditions are as bad as they get.
  if (day.score === null || day.score === undefined) return null
  return { from: 0, to: day.score }
}

/** The metric's value, written in the unit a reader sees. */
function rowValue(day: ForecastSnapshot, metric: DailyMetric): string {
  if (metric === 'temperature') {
    return `${formatTempF(day.temp_c_max)} / ${formatTempF(day.temp_c_min)}`
  }
  if (metric === 'rain') return formatPrecipIn(day.precip_mm_p50)
  if (metric === 'wind') return formatWindMph(day.wind_kmh_max)
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
export function sharedDomain(days: readonly ForecastSnapshot[], metric: DailyMetric): Extent | null {
  if (metric === 'score') return { min: 0, max: 100 }

  const spans = days.map((d) => rowSpan(d, metric)).filter((s): s is { from: number; to: number } => s !== null)
  const measured = extent([...spans.map((s) => s.from), ...spans.map((s) => s.to)])
  if (measured === null) return null

  if (metric === 'rain' || metric === 'wind') {
    return { min: 0, max: measured.max > 0 ? measured.max : 1 }
  }
  // A week that never varies still needs a width, or every bar is a hairline at
  // the same place and the comparison the list exists for is impossible.
  return measured.max === measured.min
    ? { min: measured.min - 1, max: measured.max + 1 }
    : measured
}

/** Bars are drawn in percentages of the row's own width, so there is no viewBox here. */
const BAR_TRACK_H = 6

function RangeBar({
  span,
  domain,
  fill,
}: {
  span: { from: number; to: number } | null
  /**
   * `null` when **no** day in the week has this metric, in which case there is
   * no scale to draw against and every row is an empty track. The track still
   * renders: dropping it collapses the row layout, which reads as a glitch
   * rather than as a week with no wind reading in it.
   */
  domain: Extent | null
  fill: string
}) {
  // A day with no value keeps its track and draws no bar. The empty track is
  // the "absences are drawn, not omitted" rule: a row that simply lost its bar
  // is indistinguishable from a row whose value happened to be zero.
  const scale = domain === null ? null : linearScale(domain, 0, 100)
  const left = span === null || scale === null ? 0 : Math.min(scale(span.from), scale(span.to))
  const right = span === null || scale === null ? 0 : Math.max(scale(span.from), scale(span.to))

  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        height: `${BAR_TRACK_H}px`,
        borderRadius: `${radius.stepBar}px`,
        backgroundColor: colors.line,
      }}
    >
      {span === null || scale === null ? null : (
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${left}%`,
            // A single-point span (a flat day, or a zero-rain day) would be a
            // zero-width div, which paints nothing — the same vanishing mark as
            // a zero-height bar. One percent keeps it on screen.
            width: `${Math.max(1, right - left)}%`,
            borderRadius: `${radius.stepBar}px`,
            backgroundColor: fill,
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
function barFill(day: ForecastSnapshot, metric: DailyMetric): string {
  if (metric === 'temperature') {
    return day.temp_c_max === null ? colors.line2 : tempColor(day.temp_c_max)
  }
  if (metric === 'rain') return colors.rain
  if (metric === 'wind') return colors.txt3

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
  if (score >= SCORE_BANDS.mostlyDry) return colors.good
  if (score >= SCORE_BANDS.mixed) return colors.fair
  return colors.poor
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
}

export function DailyList({
  days,
  metric,
  onMetricChange,
  onSelectDay,
  drawableDates,
  showScoreMetric,
}: DailyListProps) {
  const options = showScoreMetric ? METRIC_OPTIONS : METRIC_OPTIONS.filter((o) => o.value !== 'score')
  const domain = sharedDomain(days, metric)

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
            <span style={{ ...type.calDay, minWidth: '86px' }}>
              {formatForecastDate(day.forecast_date)}
            </span>
            <RangeBar span={rowSpan(day, metric)} domain={domain} fill={barFill(day, metric)} />
            <span
              style={{
                ...type.bodyMd,
                color: colors.txt2,
                minWidth: '72px',
                textAlign: 'right',
                whiteSpace: 'nowrap',
              }}
            >
              {rowValue(day, metric)}
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

