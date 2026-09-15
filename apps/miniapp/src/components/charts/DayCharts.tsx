import { colors, spacing } from '@weatherteam6/design/tokens'
import {
  formatPrecipIn,
  formatTempF,
  formatWindMph,
  type HourlyDay,
  type HourlySeries,
} from '@weatherteam6/types'
import { type } from '../../theme/tokens.css.js'
import { bareButton, card, row, stack } from '../../theme/styles.js'
import { formatForecastDate } from '../../lib/forecast.js'
import { HourlyChart } from './HourlyChart.js'
import {
  CHANCE_VIEW_H,
  DAY_VIEW_H,
  RAIN_VIEW_H,
  WIND_VIEW_H,
  IDEAL_TEMP_C,
  LINE_W,
  RANGE_FILL_OPACITY,
  chanceColor,
  chartColors,
  rainColor,
  tempColor,
  windColor,
} from './chartStyle.js'
import {
  chanceSeries,
  dayIsDrawable,
  hasValues,
  hoursOnDay,
  rainSeries,
  temperatureSeries,
  windSeries,
} from './hourlySeries.js'

/**
 * One day, hour by hour: temperature, rain, chance of rain, and wind.
 *
 * **There is no seven-day chart here.** A continuous multi-day series belongs
 * on the Daily tab, which is the view about comparing days; this tab is one
 * day's hours and the charts get the screen.
 */

const DAY_PANEL_ID = 'hourly-day-panel'

/** How far out the open day is, in the words the reader uses. */
function daysOutLabel(days: readonly HourlyDay[], selectedDate: string): string | null {
  const index = days.findIndex((d) => d.local_date === selectedDate)
  if (index < 0) return null
  // The window's first day is the location's today — the server built it that
  // way — so the offset is the index, not a difference against the viewer's
  // clock, which would be a day out for anyone in another timezone (issue #33).
  if (index === 0) return 'today'
  if (index === 1) return 'tomorrow'
  return `${index} days out`
}

/**
 * Steps to the next drawable day in a direction, or `null` at the end.
 *
 * **Skips days the ensemble never reached rather than stopping at them.** A
 * pager that lands on an empty day looks broken; one that refuses to move looks
 * stuck. The chips this replaced showed every day and disabled some, which
 * needed seven tap targets to say what two arrows say.
 */
export function stepDay(
  days: readonly HourlyDay[],
  selectedDate: string,
  direction: 1 | -1,
): string | null {
  const from = days.findIndex((d) => d.local_date === selectedDate)

  // **A day that is no longer in the window must not strand the reader.** The
  // window rolls forward as runs are collected, so a date held in route state
  // can drop out of `days[]` — and a pager with both arrows dead is a screen
  // with no way off it. Stepping from outside the window walks in from the
  // matching end instead. The chip picker this replaced could not reach that
  // state, so the pager has to handle it deliberately.
  const start = from < 0 ? (direction === 1 ? -1 : days.length) : from

  for (let i = start + direction; i >= 0 && i < days.length; i += direction) {
    const day = days[i]
    if (day !== undefined && dayIsDrawable(day)) return day.local_date
  }
  return null
}

function PagerButton({
  label,
  glyph,
  target,
  onSelect,
}: {
  label: string
  glyph: string
  target: string | null
  onSelect: (localDate: string) => void
}) {
  const disabled = target === null
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        if (target !== null) onSelect(target)
      }}
      style={{
        ...bareButton,
        ...card,
        width: '28px',
        height: '28px',
        textAlign: 'center',
        color: colors.txt3,
        ...(disabled ? { opacity: 0.35, cursor: 'default' } : {}),
      }}
    >
      {glyph}
    </button>
  )
}

export type DayChartsProps = {
  series: HourlySeries
  /** The local date currently open. Always one the caller checked is drawable. */
  selectedDate: string
  onSelectDate: (localDate: string) => void
}

export function DayCharts({ series, selectedDate, onSelectDate }: DayChartsProps) {
  const hours = hoursOnDay(series.hours, selectedDate)
  const temperature = temperatureSeries(hours)
  const rain = rainSeries(hours)
  const chance = chanceSeries(hours)
  const wind = windSeries(hours)
  const out = daysOutLabel(series.days, selectedDate)

  const axis = { axis: 'hour' as const, utcOffsetSeconds: series.utc_offset_seconds }

  return (
    <section style={{ ...card, ...stack(spacing.sectionTop) }}>
      <div style={row(spacing.chipGapMd)}>
        <PagerButton
          label="Previous day"
          glyph="‹"
          target={stepDay(series.days, selectedDate, -1)}
          onSelect={onSelectDate}
        />
        <span style={type.navTitle} id={`${DAY_PANEL_ID}-label`}>
          {formatForecastDate(selectedDate)}
        </span>
        <PagerButton
          label="Next day"
          glyph="›"
          target={stepDay(series.days, selectedDate, 1)}
          onSelect={onSelectDate}
        />
        {/*
          How far out, in words. A date alone makes the reader count, and the
          confidence story this app is built on is about distance from now.
        */}
        {out === null ? null : (
          <span style={{ ...type.bodySm, marginLeft: 'auto' }}>{out}</span>
        )}
      </div>

      <div
        id={DAY_PANEL_ID}
        role="tabpanel"
        aria-labelledby={`${DAY_PANEL_ID}-label`}
        style={stack(spacing.sectionTop)}
      >
        <ChartBlock label="Temperature" unit="°F" empty="No hourly temperature for this day.">
          {hasValues(temperature) ? (
            <>
              <HourlyChart
                data={temperature}
                kind="range"
                {...axis}
                viewHeight={DAY_VIEW_H}
                color={chartColors.temperature}
                colorForValue={tempColor}
                formatValue={formatTempF}
                title="Temperature by hour"
              />
              {/*
                Two keys, because the mark carries two things and neither is
                guessable: a colour that means a temperature, and a length that
                means disagreement. p10/p90 stay out of it — the locked copy
                rule allows them in a chart legend and it reads better without.
              */}
              <div style={{ ...row(spacing.sectionGap), flexWrap: 'wrap' }}>
                <LegendKey label="Cool → hot" swatch="ramp" sample={tempColor(IDEAL_TEMP_C)} />
                <LegendKey
                  label="Bar: where 8 in 10 land"
                  swatch="spread"
                  sample={tempColor(IDEAL_TEMP_C)}
                />
                <LegendKey
                  label="Line: the middle"
                  swatch="median"
                  sample={tempColor(IDEAL_TEMP_C)}
                />
              </div>
            </>
          ) : null}
        </ChartBlock>

        <ChartBlock label="Rain" unit="in / hr" empty="No hourly rainfall for this day.">
          {hasValues(rain) ? (
            <HourlyChart
              data={rain}
              kind="bar"
              {...axis}
              viewHeight={RAIN_VIEW_H}
              color={chartColors.rain}
              colorForValue={rainColor}
              formatValue={formatPrecipIn}
              title="Rainfall by hour"
            />
          ) : null}
        </ChartBlock>

        <ChartBlock
          label="Chance of rain"
          unit="% of members"
          empty="No chance of rain for this day — the forecast runs carry no wet count."
        >
          {hasValues(chance) ? (
            <HourlyChart
              data={chance}
              kind="bar"
              {...axis}
              viewHeight={CHANCE_VIEW_H}
              color={chartColors.rain}
              colorForValue={chanceColor}
              // A whole-percent count of members, not a measurement in a unit.
              formatValue={(v) => (v === null ? '—' : `${Math.round(v)}%`)}
              domain={{ min: 0, max: 100 }}
              title="Chance of rain by hour"
            />
          ) : null}
        </ChartBlock>

        <ChartBlock label="Wind" unit="mph" empty="No hourly wind for this day.">
          {hasValues(wind) ? (
            <>
              <HourlyChart
                data={wind}
                kind="range"
                {...axis}
                viewHeight={WIND_VIEW_H}
                color={chartColors.wind}
                colorForValue={windColor}
                formatValue={formatWindMph}
                title="Wind by hour"
              />
              <div style={{ ...row(spacing.sectionGap), flexWrap: 'wrap' }}>
                <LegendKey label="Line: sustained" swatch="median" sample={windColor(20)} />
                <LegendKey label="Bar: up to gusts" swatch="spread" sample={windColor(20)} />
              </div>
            </>
          ) : null}
        </ChartBlock>
      </div>
    </section>
  )
}

/**
 * A chart, its heading, and what it says when it cannot be drawn.
 *
 * **The empty state is per chart, never for the section.** These read different
 * columns of the same response — an hour can carry a temperature and no wet
 * count — so "no forecast for this day" would be a claim the section is not
 * entitled to make. A reader cannot miss a chart they were never shown one of.
 */
function ChartBlock({
  label,
  unit,
  empty,
  children,
}: {
  label: string
  unit: string
  empty: string
  children: React.ReactNode
}) {
  return (
    <div style={stack(spacing.tight)}>
      <div style={row(spacing.chipGap)}>
        <span style={type.label}>{label}</span>
        <span style={{ ...type.labelSm, color: colors.txt5 }}>{unit}</span>
      </div>
      {children === null ? <p style={type.bodyMd}>{empty}</p> : children}
    </div>
  )
}

/**
 * A legend key, drawn **the way the mark it names is actually drawn.**
 *
 * An earlier version used `chartColors.rangeEdge` and `chartColors.wind` for
 * these, and no mark on either chart uses either colour — `RangeMarks` fills
 * everything with `colorForValue(median)` at `RANGE_FILL_OPACITY` and rules the
 * median across it at full strength. A key pointing at a colour that never
 * appears in the chart is worse than no key: it invites the reader to look for
 * something that is not there.
 */
function LegendKey({
  label,
  swatch,
  sample,
}: {
  label: string
  swatch: 'ramp' | 'spread' | 'median'
  /** The colour the real mark would be at a representative value. */
  sample: string
}) {
  const bar =
    swatch === 'ramp'
      ? {
          width: '14px',
          height: '4px',
          // The ramp's own ends, so the key *is* the scale rather than a
          // decorative gradient that happens to resemble it.
          background: `linear-gradient(90deg, ${tempColor(-10)}, ${tempColor(IDEAL_TEMP_C)}, ${tempColor(38)})`,
        }
      : swatch === 'spread'
        ? // The body of a range mark: the fill, at the opacity it is drawn with.
          { width: '8px', height: '12px', background: sample, opacity: RANGE_FILL_OPACITY }
        : // The median rule: the same hue, full strength, the height it is drawn at.
          { width: '12px', height: `${LINE_W}px`, background: sample }

  return (
    <span style={{ ...row(spacing.chipGap), ...type.labelSm }}>
      <span style={{ ...bar, borderRadius: '2px', display: 'block' }} />
      {label}
    </span>
  )
}
