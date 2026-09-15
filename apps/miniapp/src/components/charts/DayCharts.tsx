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
  if (from < 0) return null
  for (let i = from + direction; i >= 0 && i < days.length; i += direction) {
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
                <LegendKey label="Cool → hot" swatch="ramp" />
                <LegendKey label="Where 8 in 10 land" swatch="spread" />
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
              colorForValue={(v) => rainColor(v / 100)}
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
                <LegendKey label="Sustained" swatch="wind" />
                <LegendKey label="To gusts" swatch="spread" />
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

function LegendKey({ label, swatch }: { label: string; swatch: 'ramp' | 'spread' | 'wind' }) {
  const bar =
    swatch === 'spread'
      ? { width: '2px', height: '11px', background: chartColors.rangeEdge }
      : {
          width: '12px',
          height: '3px',
          background:
            swatch === 'wind'
              ? chartColors.wind
              : // The ramp's own ends, so the key is the scale rather than a
                // decorative gradient that happens to look similar.
                `linear-gradient(90deg, ${tempColor(-10)}, ${tempColor(16)}, ${tempColor(38)})`,
        }
  return (
    <span style={{ ...row(spacing.chipGap), ...type.labelSm }}>
      <span style={{ ...bar, borderRadius: '2px', display: 'block' }} />
      {label}
    </span>
  )
}
