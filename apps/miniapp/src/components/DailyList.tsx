import { IconCloud, IconCloudRain, IconSun, IconSunLow } from '@tabler/icons-react'
import { colors, spacing } from '@weatherteam6/design/tokens'
import {
  EM_DASH,
  formatPrecipIn,
  formatTempF,
  readingsShort,
  type ForecastSnapshot,
  type HourlySample,
  type HourlySeries,
  type ReadingsDay,
} from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { bareButton, card, row, stack } from '../theme/styles.js'
import { formatWeekday } from '../lib/forecast.js'
import { linearScale, niceTicks, unionExtent, type Extent } from './charts/geometry.js'
import { chartColors, scoreColor, tempColor } from './charts/chartStyle.js'
import { identityAxis, rainAxis, tempAxis, type ValueAxis } from './charts/valueAxis.js'
import { daySpread } from './charts/hourlySeries.js'
import { dayCondition, type DayCondition } from './charts/dayCondition.js'
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
export function rowSpan(
  day: ForecastSnapshot,
  metric: DailyMetric,
  /**
   * The day's v2 score, from the readings on the hourly response.
   *
   * **Not `day.score`, which is the five-component one.** Both are 0-100 and
   * they disagree by around thirty points on a hot day, so a row drawn from one
   * beside a headline derived from the other is the kind of difference nobody
   * can debug from a screenshot. `sharedDomain` never reaches this branch — it
   * answers a fixed 0-100 for the score metric before calling here — which is
   * why it may pass `null`.
   */
  score: number | null = null,
): { from: number; to: number } | null {
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
  // `null` is "no bar", never a zero one: zero is a real score and it means the
  // wall is wet or running with condensation. A day the model could not read
  // and a day it read as hopeless are different pictures.
  if (score === null) return null
  return { from: 0, to: score }
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

/**
 * **The band and the bar are the same height, and that is the fix.** They were
 * 14px and 6px, which drew them as two unrelated objects — a thin bar with a
 * separate grey slab behind it, which the reader called sloppy and was. One
 * height makes the band read as the bar's own tail: the forecast, solid, and
 * the room around it in the same shape.
 */
const BAR_TRACK_H = 10
/** The weekday, the condition icon, and the figure either side of the bar. */
const DOW_W = 30
const ICON_W = 18
const SIDE_W = 44

/** Both end figures wear the same box, so seven rows line their bars up. */
const SIDE = {
  ...type.bodyMd,
  minWidth: `${SIDE_W}px`,
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden' as const,
  textOverflow: 'ellipsis' as const,
}

/**
 * The day's sky, as one small glyph.
 *
 * **A fifth icon, and the design system says four.** `miniapp-design-v1.md`
 * §8 names a 1:1 `ICONS` map of `map-pin`, `droplet`, `temperature` and
 * `wind`, and that rule is why the alert banner uses a coloured bar rather than
 * `alert-triangle`. This is the owner's explicit call on 2026-09-15, and it is
 * drawn from the same `@tabler/icons-react` the map is built on rather than
 * from a second library.
 *
 * **`null` draws a blank of the same width, not a sun.** An icon is a claim
 * about the sky; a day the forecast run does not reach has no sky to claim, and
 * dropping the element instead would shunt every bar on that row sideways.
 */
function ConditionIcon({ condition }: { condition: DayCondition | null }) {
  const box = { width: `${ICON_W}px`, height: `${ICON_W}px`, flex: '0 0 auto' as const }
  if (condition === null) return <span style={box} aria-hidden="true" />

  const size = ICON_W - 2
  const common = { size, stroke: 1.6, 'aria-hidden': true as const }
  return (
    <span style={{ ...box, color: condition === 'rain' ? colors.rain : colors.txt4 }}>
      {condition === 'rain' ? (
        <IconCloudRain {...common} />
      ) : condition === 'cloud' ? (
        <IconCloud {...common} />
      ) : condition === 'partly' ? (
        <IconSunLow {...common} />
      ) : (
        <IconSun {...common} />
      )}
    </span>
  )
}

/**
 * The two figures a row carries, one at each end of its bar.
 *
 * **Both ends, because a bar between two numbers can be read and a bar beside
 * one cannot.** This follows the reference app the owner pointed at: the low at
 * the bar's start, the high at its end, so the mark spans the distance the two
 * figures name instead of floating next to a pair of them.
 *
 * Each metric's pair is the two things a reader actually wants off that row:
 *
 * - **temperature** — the day's low, then its high.
 * - **rain** — the chance at its likeliest hour, then how much is forecast.
 *   Different questions, and the bar answers the second one; a row reading
 *   "0.01 in" beside a 60% chance is a drizzle that is fairly likely, which
 *   neither figure says alone.
 * - **score** — the number, then **the two readings it was derived from**. It
 *   used to be the number and `stateLabel`'s word for it, which was the same
 *   fact twice; now the end of the row says what the rock and the friction
 *   actually are, which the number cannot.
 */
export function rowFigures(
  day: ForecastSnapshot,
  metric: DailyMetric,
  hours: readonly HourlySample[],
  /**
   * The day's readings, from the hourly response. `null` for a day the model
   * said nothing about, and for every day of a non-climbing location.
   */
  readings: ReadingsDay | null = null,
): { start: string | null; end: string | null } {
  if (metric === 'temperature') {
    return { start: formatTempF(day.temp_c_min), end: formatTempF(day.temp_c_max) }
  }
  if (metric === 'rain') {
    const chance = dayRainChance(hours, day.forecast_date)
    return {
      // No wet count is not a zero chance — `precip_chance_pct` is null for an
      // hour no member reached, and "0%" there is a confidence nobody computed.
      start: chance === null ? null : `${chance}%`,
      end: formatPrecipIn(day.precip_mm_p50),
    }
  }
  // Not `formatX(null)`: the shared formatters' em dash is for a *measurement*
  // that is missing, and a score is not a measurement. Same glyph, and it has
  // to be the same glyph, but it is reached by its own branch so a future
  // "withheld" wording lands here and not in a unit formatter.
  const best = readings?.best ?? null
  if (best === null || best.score === null) return { start: EM_DASH, end: null }
  return {
    start: `${best.score}`,
    end: readingsShort(best.rock, best.friction),
  }
}

/**
 * The day's chance of rain at its likeliest hour, 0-100, or `null`.
 *
 * **The peak, and it is labelled as a share of the runs rather than as a daily
 * probability.** `precip_chance_pct` is `members_wet / member_count` for one
 * hour; the chance of rain *at some point* in a day is a larger number that
 * nothing in the response computes, because different members can be wet in
 * different hours. Taking the maximum is the closest honest figure and it is
 * never an overstatement.
 */
export function dayRainChance(
  hours: readonly HourlySample[],
  localDate: string,
): number | null {
  const chances = hours
    .filter((h) => h.local_date === localDate)
    .map((h) => h.precip_chance_pct)
    .filter((v): v is number => v !== null)
  return chances.length === 0 ? null : Math.round(Math.max(...chances))
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

  const segment = {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    borderRadius: `${BAR_TRACK_H / 2}px`,
  }

  return (
    <div style={{ position: 'relative', flex: 1, height: `${BAR_TRACK_H}px` }}>
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
        The spread, under the bar and the same shape as it, so the two read as
        one mark rather than as a bar sitting on a slab.
      */}
      {band === null ? null : (
        <div
          style={{
            ...segment,
            left: `${band.left}%`,
            width: `${band.width}%`,
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
            ...segment,
            left: `${bar.left}%`,
            width: `${bar.width}%`,
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

function barFill(day: ForecastSnapshot, metric: DailyMetric, score: number | null): string {
  if (metric === 'temperature') {
    return day.temp_c_max === null ? colors.line2 : tempColor(day.temp_c_max)
  }
  if (metric === 'rain') return colors.rain
  // Score is the one metric the status colours are *for* — this bar is the
  // conditions ladder, and its rungs come from `SCORE_BANDS`.
  //
  // **The words beside it no longer come from those rungs**, so the old
  // guarantee ("a bar can never go amber on a day the words call Mostly dry")
  // has been replaced rather than kept: the words are the readings, and the
  // colour is the number derived from them. They cannot contradict each other
  // because one is computed from the other.
  if (score === null) return colors.line2
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
  /**
   * The v2 readings, by local date.
   *
   * **Empty is the honest answer while the hourly query is in flight**, and it
   * renders as an em dash per row rather than as a zero score — the same
   * distinction the whole model rests on. The rows themselves come from
   * `/forecast`, which resolves first, so this is a real state and not a
   * theoretical one.
   */
  const readingsByDate = new Map<string, ReadingsDay>(
    (hourly?.readings?.days ?? []).map((d) => [d.local_date, d]),
  )
  // The location's own clock, for the daylight window the condition icon reads.
  // Zero when there is no run: with no hours there is no icon to place either.
  const utcOffsetSeconds = hourly?.utc_offset_seconds ?? 0
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
        // **Joined on the date, never on position.** The forecast rows and the
        // readings' days are built by different paths and windowed separately;
        // lining them up by index holds until one side drops a day and then
        // misattributes every row after it while still looking plausible.
        const readingsDay = readingsByDate.get(day.forecast_date) ?? null
        const score = readingsDay?.best?.score ?? null
        const figures = rowFigures(day, metric, hours, readingsDay)
        const body = (
          <div style={{ ...row(spacing.chipGap), width: '100%' }}>
            {/*
              The weekday alone. Seven rows never repeat one, and the full date
              cost 86px of a 335px row — a third of the width — to say something
              the position already says. The open day's full date is in the
              Hourly pager, where there is room for it.
            */}
            <span style={{ ...type.calDay, minWidth: `${DOW_W}px` }}>
              {formatWeekday(day.forecast_date)}
            </span>

            <ConditionIcon condition={dayCondition(hours, day.forecast_date, utcOffsetSeconds)} />

            {/* The figure the bar starts at. */}
            <span style={{ ...SIDE, textAlign: 'right', color: colors.txt4 }}>
              {figures.start}
            </span>

            <RangeBar
              span={rowSpan(day, metric, score)}
              spread={rowSpread(day, metric, hours)}
              domain={domain}
              ticks={ticks}
              toDisplay={valueAxis.toDisplay}
              fill={barFill(day, metric, score)}
              bandColor={bandColor}
              {...(gradientFor(day, metric) === null
                ? {}
                : { gradient: gradientFor(day, metric) as string })}
            />

            {/* The figure it ends at. */}
            <span style={{ ...SIDE, textAlign: 'left', color: colors.txt1 }}>{figures.end}</span>
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
            marginLeft: `${DOW_W + ICON_W + SIDE_W + spacing.chipGap * 3 + spacing.cardPadSm}px`,
            marginRight: `${SIDE_W + spacing.chipGap + spacing.cardPadSm}px`,
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
