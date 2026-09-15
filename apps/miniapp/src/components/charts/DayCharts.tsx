import { colors, radius, spacing } from '@weatherteam6/design/tokens'
import {
  EM_DASH,
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
import { extent, type Extent } from './geometry.js'
import {
  CHANCE_VIEW_H,
  DAY_VIEW_H,
  RAIN_VIEW_H,
  WIND_VIEW_H,
  IDEAL_TEMP_C,
  TEMP_FLOOR_PAD_C,
  WHISKER_W,
  chanceColor,
  chartColors,
  rainColor,
  tempColor,
  windColor,
} from './chartStyle.js'
import {
  type SeriesDatum,
  chanceSeries,
  dayIsDrawable,
  hasValues,
  hoursOnDay,
  rainSeries,
  temperatureSeries,
  valueExtent,
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
        // **Not `...card`.** That token carries `padding: 14px`, which inside a
        // 28px box pushes the glyph out of it entirely — the arrows rendered as
        // empty rounded squares. The surface is taken piece by piece instead.
        backgroundColor: colors.card,
        borderStyle: 'solid',
        borderWidth: '1px',
        borderColor: colors.line,
        borderRadius: `${radius.chip}px`,
        width: '28px',
        height: '28px',
        lineHeight: '26px',
        textAlign: 'center',
        color: colors.txt2,
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


/**
 * The vertical domain for the temperature bars.
 *
 * **A labelled non-zero floor**, just under the coldest p10 and just over the
 * warmest p90, so the day's shape fills the plot. A temperature has no
 * meaningful zero — measured from 0 °F a September day is twenty-four
 * near-identical full-height bars, which is exactly why the axis prints this
 * floor rather than leaving it implied.
 */
function temperatureDomain(data: readonly SeriesDatum[]): Extent | null {
  const span = valueExtent(data)
  if (span === null) return null
  return { min: span.min - TEMP_FLOOR_PAD_C, max: span.max + TEMP_FLOOR_PAD_C }
}

/** Wind rises from a real zero — calm is a meaningful reading, unlike 0 °F. */
function windDomain(data: readonly SeriesDatum[]): Extent | null {
  const span = valueExtent(data)
  if (span === null) return null
  return { min: 0, max: span.max > 0 ? span.max : 1 }
}

/** The day's own range for a chart header, or null when there is nothing to state. */
function headerRange(
  data: readonly SeriesDatum[],
  write: (v: number) => string,
): string | null {
  const span = extent(data.map((d) => d.value))
  if (span === null) return null
  return span.min === span.max ? write(span.max) : `${write(span.min)} – ${write(span.max)}`
}

export function DayCharts({ series, selectedDate, onSelectDate }: DayChartsProps) {
  const hours = hoursOnDay(series.hours, selectedDate)
  const temperature = temperatureSeries(hours)
  const rain = rainSeries(hours)
  const chance = chanceSeries(hours)
  const wind = windSeries(hours)
  const out = daysOutLabel(series.days, selectedDate)

  const axis = { axis: 'hour' as const, utcOffsetSeconds: series.utc_offset_seconds }

  // The day's total rainfall, or `null` when nothing was measured.
  //
  // **`?? 0` on every hour would make an all-null day read "none"** — a
  // forecast of a dry day — directly beside the block's own "no hourly rainfall
  // for this day". Summing only the hours that have a value, and answering null
  // when there are none, keeps "dry" and "unknown" apart. `precip_mm_mean` is
  // also the only precipitation figure that may be summed at all: a sum of
  // hourly p50s is the median of nothing and reads three to twelve times high
  // (architecture rule), and `rainSeries` reads exactly that column.
  const rainHours = rain.filter((d) => d.value !== null)
  const rainTotal = rainHours.length === 0 ? null : rainHours.reduce((s, d) => s + (d.value ?? 0), 0)
  const chancePeak = extent(chance.map((d) => d.value))
  const gustPeak = extent(wind.map((d) => d.high))

  const tempDomain = temperatureDomain(temperature)
  const gustDomain = windDomain(wind)

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
        {out === null ? null : <span style={{ ...type.bodySm, marginLeft: 'auto' }}>{out}</span>}
      </div>

      <div
        id={DAY_PANEL_ID}
        role="tabpanel"
        aria-labelledby={`${DAY_PANEL_ID}-label`}
        style={stack(spacing.sectionTop)}
      >
        <ChartBlock
          label="Temperature"
          unit="°F"
          value={headerRange(temperature, (v) => formatTempF(v))}
          empty="No hourly temperature for this day."
        >
          {hasValues(temperature) ? (
            <>
              <HourlyChart
                data={temperature}
                kind="bar"
                placement="instant"
                whiskers
                {...axis}
                {...(tempDomain === null ? {} : { domain: tempDomain })}
                viewHeight={DAY_VIEW_H}
                color={chartColors.temperature}
                colorForValue={tempColor}
                formatValue={formatTempF}
                title="Temperature by hour"
              />
              <div style={{ ...row(spacing.sectionGap), flexWrap: 'wrap' }}>
                <LegendKey label="Cool → hot" swatch="ramp" />
                <LegendKey label="Model spread" swatch="whisker" />
              </div>
            </>
          ) : null}
        </ChartBlock>

        <ChartBlock
          label="Rain"
          unit="in / hr"
          value={rainTotal === null ? null : formatPrecipIn(rainTotal)}
          empty="No hourly rainfall for this day."
        >
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
          value={chancePeak === null ? null : `peak ${Math.round(chancePeak.max)}%`}
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
              formatValue={(v) => (v === null ? EM_DASH : `${Math.round(v)}%`)}
              domain={{ min: 0, max: 100 }}
              title="Chance of rain by hour"
            />
          ) : null}
        </ChartBlock>

        <ChartBlock
          label="Wind"
          unit="mph"
          value={gustPeak === null ? null : `gusts ${formatWindMph(gustPeak.max)}`}
          empty="No hourly wind for this day."
        >
          {hasValues(wind) ? (
            <>
              <HourlyChart
                data={wind}
                kind="bar"
                placement="instant"
                whiskers
                {...axis}
                {...(gustDomain === null ? {} : { domain: gustDomain })}
                viewHeight={WIND_VIEW_H}
                color={chartColors.wind}
                colorForValue={windColor}
                formatValue={formatWindMph}
                title="Wind by hour"
              />
              <div style={{ ...row(spacing.sectionGap), flexWrap: 'wrap' }}>
                <LegendKey label="Sustained" swatch="wind" />
                <LegendKey label="To gusts" swatch="whisker" />
              </div>
            </>
          ) : null}
        </ChartBlock>
      </div>
    </section>
  )
}

/**
 * A chart, its heading, the day's own figure for it, and what it says when it
 * cannot be drawn.
 *
 * **The empty state is per chart, never for the section.** These read different
 * columns of the same response — an hour can carry a temperature and no wet
 * count — so "no forecast for this day" would be a claim the section is not
 * entitled to make. A reader cannot miss a chart they were never shown one of.
 */
function ChartBlock({
  label,
  unit,
  value,
  empty,
  children,
}: {
  label: string
  unit: string
  /** The day's headline figure for this series. Omitted when there is none. */
  value: string | null
  empty: string
  children: React.ReactNode
}) {
  return (
    <div style={stack(spacing.tight)}>
      <div style={{ ...row(spacing.chipGap), width: '100%' }}>
        <span style={type.label}>{label}</span>
        <span style={{ ...type.labelSm, color: colors.txt5 }}>{unit}</span>
        {/*
          The day's own figure, right-aligned — the number a reader wants off a
          24-hour chart. The axis labels state the **scale**; this states the
          **series**. Confusing the two is how a chart's floor gets read as the
          day's low, which is the failure the old left-edge labels invited.
        */}
        {value === null ? null : (
          <span style={{ ...type.calDay, color: colors.txt1, marginLeft: 'auto' }}>{value}</span>
        )}
      </div>
      {children === null ? <p style={type.bodyMd}>{empty}</p> : children}
    </div>
  )
}

/**
 * A legend key, drawn **the way the mark it names is actually drawn.**
 *
 * An earlier version pointed at colours no mark used. The ramp key is the ramp
 * itself; the whisker key is a whisker at its real width and colour.
 */
function LegendKey({ label, swatch }: { label: string; swatch: 'ramp' | 'whisker' | 'wind' }) {
  const bar =
    swatch === 'whisker'
      ? { width: `${WHISKER_W}px`, height: '11px', background: chartColors.whisker }
      : {
          width: '14px',
          height: '4px',
          background:
            swatch === 'wind'
              ? // The wind ramp's own ends, which is what the bars are painted from.
                `linear-gradient(90deg, ${windColor(0)}, ${windColor(50)})`
              : `linear-gradient(90deg, ${tempColor(-10)}, ${tempColor(IDEAL_TEMP_C)}, ${tempColor(38)})`,
        }

  return (
    <span style={{ ...row(spacing.chipGap), ...type.labelSm }}>
      <span style={{ ...bar, borderRadius: '2px', display: 'block' }} />
      {label}
    </span>
  )
}
