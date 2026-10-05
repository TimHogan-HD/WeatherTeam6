import { useRef, type CSSProperties, type ReactNode } from 'react'
import { colorsV2, radius, spacing, toneSurfacesV2 } from '@weatherteam6/design/tokens'
import {
  EM_DASH,
  formatPrecipIn,
  formatTempF,
  formatWindMph,
  modelSourceLabel,
  summarizeReadings,
  type HourlyReading,
  type HourlySeries,
  type ReadingsSummary,
} from '@weatherteam6/types'
import { typeV2 } from '../../theme/tokens.css.js'
import { bareButton, cardV2, row, stack, type ToneName } from '../../theme/styles.js'
import { formatForecastDate } from '../../lib/forecast.js'
import { formatLocalClock, formatTempRangeF } from '../../lib/format.js'
import { readingTone, scoreTone } from '../../lib/locationList.js'
import { dayChips, daysOutPhrase } from '../../lib/hourlyDay.js'
import { useNow } from '../../hooks/useNow.js'
import { SelectionIndicator, useSelectedRect } from '../SelectionIndicator.js'
import { HourlyChart } from './HourlyChart.js'
import { extent, type Extent } from './geometry.js'
import { identityAxis, rainAxisBare, tempAxisDeg, windAxisBare } from './valueAxis.js'
import {
  CHANCE_VIEW_H,
  DAY_VIEW_H,
  HUMIDITY_VIEW_H,
  OVERLAY_DASH,
  RAIN_VIEW_H,
  WIND_VIEW_H,
  TEMP_FLOOR_PAD_C,
  chartColorsV2,
} from './chartStyle.js'
import {
  type SeriesDatum,
  chanceSeries,
  dewPointSeries,
  hasValues,
  hoursOnDay,
  humiditySeries,
  rainSeries,
  temperatureSeries,
  valueExtent,
  windSeries,
  windSpreadSeries,
  gustSeries,
} from './hourlySeries.js'

/**
 * The Hourly tab, from the WT6 Figma "V2" page's `v2 Dark - Hourly` frame
 * (node `129:529`): a chip per day, the open day's conditions — the three
 * readings and the good hours — then one card of charts:
 * temperature with the dew point, rain, chance of rain, wind and humidity.
 *
 * **There is no seven-day chart here.** A continuous multi-day series belongs
 * on the Daily tab, which is the view about comparing days; this tab is one
 * day's hours and the charts get the screen.
 */

export type DayChartsProps = {
  series: HourlySeries
  /** The local date currently open. Always one the caller checked is drawable. */
  selectedDate: string
  onSelectDate: (localDate: string) => void
  /**
   * The readings for **the day on screen**, in the conditions card.
   *
   * **The readings themselves come from `series`, not from here.** They are on
   * the same response as the hours these charts draw, so there is no second
   * source to keep aligned; what this prop carries is the two facts only the
   * screen knows — whether a Severe+ alert is active, and whether that query
   * has settled — plus the flag that says this location is a crag at all.
   *
   * Optional as a group rather than as three loose props because the
   * suppression rules only make sense together.
   */
  score?: {
    severeAlertEvent: string | null
    alertsPending: boolean
    showScore: boolean
  }
}

const TONE_INK: Record<ToneName, string> = {
  good: colorsV2.goodInk,
  fair: colorsV2.fairInk,
  poor: colorsV2.poorInk,
}

/**
 * The vertical domain for temperature: **a labelled non-zero floor**, just
 * under the coldest of the band and the dew point, just over the warmest. A
 * temperature has no meaningful zero, and the dew point shares the scale, so
 * leaving it out would stroke it below the frame on a humid-free day.
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

/** The good-hours key: the plot's 7% tint is too faint to read at swatch size, so the key takes the frame's stronger one. */
const GOOD_HOURS_KEY = toneSurfacesV2.good.heroLine

/** 0.02 in, the least the rain chart's scale may span. */
const RAIN_MIN_TOP_MM = 0.508

/**
 * Rain rises from zero to **at least 0.02 in**. Scaled to its own peak, a
 * trace day stretches 0.001 in across the whole plot — a downpour's shape —
 * and every tick rounds to the same `0`, one of them drawn at the top.
 */
function rainDomain(data: readonly SeriesDatum[]): Extent | null {
  const span = valueExtent(data)
  if (span === null) return null
  return { min: 0, max: Math.max(RAIN_MIN_TOP_MM, span.max) }
}

const V2_AXES = { labelStyle: typeV2.axisTick, gridColor: chartColorsV2.grid }

export function DayCharts({ series, selectedDate, onSelectDate, score }: DayChartsProps) {
  // **Matched on the date, never on position.** The readings' days and the
  // hours' days are built by different paths in `buildHourlySeries` and
  // windowed separately; lining them up by index holds until one side drops a
  // day and then puts Saturday's reading on Friday while still looking right.
  const readingsDay = (series.readings?.days ?? []).find((d) => d.local_date === selectedDate) ?? null
  const showReadings = score !== undefined && score.showScore && series.readings !== undefined

  const summary: ReadingsSummary | null = showReadings
    ? summarizeReadings({
        reading: readingsDay?.best ?? null,
        window: readingsDay?.window ?? null,
        utcOffsetSeconds: series.utc_offset_seconds,
        severeAlertEvent: score.severeAlertEvent,
        alertsPending: score.alertsPending,
        unavailableReason: series.readings?.unavailable_reason ?? null,
      })
    : null

  // The good hours, shaded on the temperature chart — only while the card
  // above names them, so the shading never explains something off screen.
  const goodWindow = summary === null || summary.window === null ? null : (readingsDay?.window ?? null)
  const shade =
    goodWindow === null
      ? null
      : { from: Date.parse(goodWindow.from), to: Date.parse(goodWindow.to), color: chartColorsV2.goodHours }

  return (
    <>
      <DayChipRow series={series} selectedDate={selectedDate} onSelectDate={onSelectDate} />
      <ConditionsCard
        series={series}
        selectedDate={selectedDate}
        summary={summary}
        best={readingsDay?.best ?? null}
      />
      <ChartsCard series={series} selectedDate={selectedDate} shade={shade} />
    </>
  )
}

/**
 * The days as chips. **Pressed buttons, not a second tablist**: the header's
 * tabs are the screen's tablist, and this picks which day that tab shows. One
 * fill slides to the open day, as the header's underline does.
 */
function DayChipRow({
  series,
  selectedDate,
  onSelectDate,
}: {
  series: HourlySeries
  selectedDate: string
  onSelectDate: (localDate: string) => void
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const rect = useSelectedRect(rowRef, '[aria-pressed="true"]', selectedDate)
  const chips = dayChips(series.days)
  if (chips.length === 0) return null
  return (
    <div
      ref={rowRef}
      style={{ ...row(spacing.chipGap), alignItems: 'stretch', position: 'relative' }}
      role="group"
      aria-label="Day"
    >
      <SelectionIndicator
        rect={rect}
        style={{ top: 0, bottom: 0, borderRadius: `${radius.full}px`, backgroundColor: colorsV2.line }}
      />
      {chips.map((chip) => {
        const selected = chip.local_date === selectedDate
        return (
          <button
            key={chip.local_date}
            type="button"
            aria-pressed={selected}
            disabled={!chip.drawable}
            onClick={() => onSelectDate(chip.local_date)}
            style={{
              ...bareButton,
              ...typeV2.dayTab,
              position: 'relative',
              flex: '1 1 0',
              minWidth: 0,
              textAlign: 'center',
              padding: `${spacing.listGapSm}px 0`,
              borderStyle: 'solid',
              borderWidth: '1px',
              borderColor: colorsV2.line,
              borderRadius: `${radius.full}px`,
              backgroundColor: selected && rect === null ? colorsV2.line : 'transparent',
              color: selected ? colorsV2.txt1 : colorsV2.txtMuted,
              // A day the ensemble never reached keeps its place in the row, so
              // counting from Today still lands on the right chip.
              ...(chip.drawable ? {} : { opacity: 0.35, cursor: 'default' }),
            }}
          >
            {chip.label}
          </button>
        )
      })}
    </div>
  )
}

/** One reading as a tile: a small label over the word, or over the score's figure. */
function Tile({ label, value, color, figure }: { label: string; value: string; color: string; figure: boolean }) {
  return (
    <div
      style={{
        ...stack(spacing.tight),
        flex: '1 1 0',
        minWidth: 0,
        backgroundColor: colorsV2.surface,
        borderStyle: 'solid',
        borderWidth: '1px',
        borderColor: colorsV2.line,
        borderRadius: `${radius.rowV2}px`,
        padding: `${spacing.cellPad}px`,
      }}
    >
      <span style={typeV2.tileLabel}>{label}</span>
      <span style={{ ...(figure ? typeV2.tileFigure : typeV2.tileWord), color }}>{value}</span>
    </div>
  )
}

/**
 * The open day's name and distance, then — for a crag — its readings.
 *
 * **Every copy decision is `summarizeReadings`**, shared with every other
 * surface: the labels, the suppression of the number under a Severe+ alert and
 * while alerts load, the window's wording and the caveats. This lays it out.
 *
 * The readings are the day's **representative hour, which the server chose**
 * (`ReadingsDay.best`). The frame's caption reads "Best hour"; it is not the
 * best hour — it is the worst hour of the best three-hour run between 08:00 and
 * 18:00 — so the caption says only which hour the readings are from.
 */
function ConditionsCard({
  series,
  selectedDate,
  summary,
  best,
}: {
  series: HourlySeries
  selectedDate: string
  summary: ReadingsSummary | null
  best: HourlyReading | null
}) {
  const out = daysOutPhrase(series.days, selectedDate)
  const at = best === null ? null : formatLocalClock(Date.parse(best.valid_at), series.utc_offset_seconds)

  let body: ReactNode = null
  if (summary !== null) {
    if (summary.unavailableLine !== null) {
      // A statement about us, never one about the rock (issue #34).
      body = <p style={typeV2.body}>{summary.unavailableLine}</p>
    } else {
      const { score, scoreField } = summary
      const hasTiles = summary.readings.length > 0 || scoreField !== null
      const band = score === null ? null : toneSurfacesV2[scoreTone(score)]
      const caption = [at === null || !hasTiles ? null : `At ${at}`, ...summary.notes].filter(
        (s): s is string => s !== null,
      )

      body = (
        <>
          {hasTiles ? (
            <div style={{ ...row(spacing.listGap), alignItems: 'stretch' }}>
              {summary.readings.map((field) => {
                const tone = readingTone(field, best)
                return (
                  <Tile
                    key={field.label}
                    label={field.label}
                    value={field.value}
                    figure={false}
                    color={tone === null ? colorsV2.txt1 : TONE_INK[tone]}
                  />
                )
              })}
              {scoreField === null ? null : (
                <Tile label={scoreField.label} value={scoreField.value} figure color={colorsV2.txt1} />
              )}
            </div>
          ) : null}

          {/*
            The window wears the day score's rung, as the hero's band does —
            and the plain well when no score is on screen, so a tint is never
            a verdict nobody can read off.
          */}
          {summary.window === null ? null : (
            <div
              style={{
                ...row(spacing.cellPad),
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                backgroundColor: band === null ? colorsV2.raised : band.heroBand,
                borderRadius: `${radius.card}px`,
                padding: `${spacing.cellPad}px ${spacing.cardPadSm}px`,
              }}
            >
              <span style={typeV2.bandLabel}>{summary.window.label}</span>
              <span
                style={{
                  ...typeV2.bandValue,
                  color: score === null ? colorsV2.txt1 : TONE_INK[scoreTone(score)],
                }}
              >
                {summary.window.value}
              </span>
            </div>
          )}

          {summary.qualifier === null ? null : <p style={typeV2.body}>{summary.qualifier}</p>}
          {caption.length === 0 ? null : <p style={typeV2.note}>{caption.join(' · ')}</p>}
        </>
      )
    }
  }

  return (
    <section style={{ ...cardV2, ...stack(spacing.listGapLg) }}>
      <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={typeV2.cardTitle}>{formatForecastDate(selectedDate)}</h2>
        {out === null ? null : <span style={typeV2.aside}>{out}</span>}
      </div>
      {body}
    </section>
  )
}

/** The day's own range for a chart header, or null when there is nothing to state. */
function rangeOf(data: readonly SeriesDatum[]): { min: number; max: number } | null {
  return extent(data.map((d) => d.value))
}

function ChartsCard({
  series,
  selectedDate,
  shade,
}: {
  series: HourlySeries
  selectedDate: string
  shade: { from: number; to: number; color: string } | null
}) {
  const now = useNow()
  const hours = hoursOnDay(series.hours, selectedDate)
  const temperature = temperatureSeries(hours)
  const dewPoint = dewPointSeries(hours)
  const rain = rainSeries(hours)
  const chance = chanceSeries(hours)
  const wind = windSeries(hours)
  const windSpread = windSpreadSeries(hours)
  const gusts = gustSeries(hours)
  const humidity = humiditySeries(hours)

  const axis = { axis: 'hour' as const, utcOffsetSeconds: series.utc_offset_seconds, v2: V2_AXES, now }

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
  const tempRange = rangeOf(temperature)
  const chancePeak = rangeOf(chance)
  const gustPeak = rangeOf(gusts)
  const humidityRange = rangeOf(humidity)

  const hasDewPoint = hasValues(dewPoint)
  const tempDomain = temperatureDomain(hasDewPoint ? [...temperature, ...dewPoint] : temperature)
  const gustDomain = windDomain([...wind, ...windSpread, ...gusts])
  const rainScale = rainDomain(rain)

  // **Dew point and humidity are the deterministic model's**, not the
  // ensemble's the other lines draw. Named once, from the response, and only
  // when one of them is drawn (defect class 3).
  const deterministic = modelSourceLabel(series.model)
  const attribution =
    deterministic !== null && (hasDewPoint || hasValues(humidity))
      ? `Dew point and humidity from ${deterministic}; other lines from the ensemble forecast.`
      : null

  const blocks: ReactNode[] = [
    <ChartBlock
      key="temperature"
      label="Temperature"
      unit="°F"
      value={
        tempRange === null
          ? null
          : // One figure when both ends round to it: `59–59°F` reads as a typo.
            formatTempF(tempRange.min) === formatTempF(tempRange.max)
            ? formatTempF(tempRange.max)
            : formatTempRangeF(tempRange.min, tempRange.max)
      }
      empty="No hourly temperature for this day."
    >
      {hasValues(temperature) ? (
        <>
          <HourlyChart
            data={temperature}
            kind="line"
            {...axis}
            {...(tempDomain === null ? {} : { domain: tempDomain })}
            {...(hasDewPoint ? { overlay: { data: dewPoint, color: chartColorsV2.dewPoint, dash: OVERLAY_DASH } } : {})}
            {...(shade === null ? {} : { shade })}
            viewHeight={DAY_VIEW_H}
            color={chartColorsV2.air}
            bandColor={chartColorsV2.airBand}
            formatValue={formatTempF}
            valueAxis={tempAxisDeg}
            title="Temperature by hour"
          />
          <Legend>
            <Key label="Air" swatch={{ kind: 'line', color: chartColorsV2.air }} />
            {hasDewPoint ? (
              <Key label="Dew point" swatch={{ kind: 'line', color: chartColorsV2.dewPoint, dashed: true }} />
            ) : null}
            <Key label="Range" swatch={{ kind: 'band', color: chartColorsV2.airBand }} />
            {shade === null ? null : <Key label="Good hours" swatch={{ kind: 'band', color: GOOD_HOURS_KEY }} />}
          </Legend>
        </>
      ) : null}
    </ChartBlock>,

    <ChartBlock
      key="rain"
      label="Rain"
      unit="in / hr"
      value={rainTotal === null ? null : formatPrecipIn(rainTotal)}
      empty="No hourly rainfall for this day."
    >
      {hasValues(rain) ? (
        <>
          <HourlyChart
            data={rain}
            kind="line"
            {...axis}
            {...(rainScale === null ? {} : { domain: rainScale })}
            viewHeight={RAIN_VIEW_H}
            color={chartColorsV2.rain}
            bandColor={chartColorsV2.rainBand}
            formatValue={formatPrecipIn}
            valueAxis={rainAxisBare}
            title="Rainfall by hour"
          />
          {/*
            **The line is an average, and says so.** `precip_mm_mean` is a mean
            and the band is p10-p90, so on a day nine runs in ten stay dry the
            band lies flat on zero while the line lifts off it — the forecast,
            not a drawing error. The run count only when every hour agrees on it.
          */}
          <Legend>
            <Key
              label="Average"
              swatch={{ kind: 'line', color: chartColorsV2.rain }}
            />
            <Key label="Range" swatch={{ kind: 'band', color: chartColorsV2.rainBand }} />
          </Legend>
        </>
      ) : null}
    </ChartBlock>,

    <ChartBlock
      key="chance"
      label="Chance of rain"
      unit="Chance"
      value={chancePeak === null ? null : `peak ${Math.round(chancePeak.max)}%`}
      empty="No rain chance for this day."
    >
      {hasValues(chance) ? (
        <HourlyChart
          data={chance}
          kind="line"
          {...axis}
          viewHeight={CHANCE_VIEW_H}
          color={chartColorsV2.rain}
          // A whole-percent count of members, not a measurement in a unit.
          formatValue={(v) => (v === null ? EM_DASH : `${Math.round(v)}%`)}
          domain={{ min: 0, max: 100 }}
          valueAxis={identityAxis('%')}
          title="Chance of rain by hour"
        />
      ) : null}
    </ChartBlock>,

    <ChartBlock
      key="wind"
      label="Wind"
      unit="mph"
      value={gustPeak === null ? null : `gusts ${formatWindMph(gustPeak.max)}`}
      empty="No hourly wind for this day."
    >
      {hasValues(wind) ? (
        <>
          <HourlyChart
            data={wind}
            kind="line"
            {...axis}
            {...(gustDomain === null ? {} : { domain: gustDomain })}
            viewHeight={WIND_VIEW_H}
            color={chartColorsV2.wind}
            bandColor={chartColorsV2.windBand}
            bandData={windSpread}
            overlay={{ data: gusts, color: chartColorsV2.gust, dash: OVERLAY_DASH }}
            formatValue={formatWindMph}
            valueAxis={windAxisBare}
            title="Wind by hour"
          />
          <Legend>
            <Key label="Sustained" swatch={{ kind: 'line', color: chartColorsV2.wind }} />
            <Key label="Gusts" swatch={{ kind: 'line', color: chartColorsV2.gust, dashed: true }} />
            <Key label="Range" swatch={{ kind: 'band', color: chartColorsV2.windBand }} />
          </Legend>
        </>
      ) : null}
    </ChartBlock>,

    <ChartBlock
      key="humidity"
      label="Humidity"
      unit="%"
      value={
        humidityRange === null
          ? null
          : humidityRange.min === humidityRange.max
            ? `${Math.round(humidityRange.max)}%`
            : `${Math.round(humidityRange.min)}–${Math.round(humidityRange.max)}%`
      }
      empty="No hourly humidity for this day."
    >
      {hasValues(humidity) ? (
        <HourlyChart
          data={humidity}
          kind="line"
          {...axis}
          viewHeight={HUMIDITY_VIEW_H}
          color={chartColorsV2.humidity}
          formatValue={(v) => (v === null ? EM_DASH : `${Math.round(v)}%`)}
          // Relative humidity is 0-100 whatever the day did; measuring it would
          // stretch a steady 60-65% into a swing across the whole plot.
          domain={{ min: 0, max: 100 }}
          valueAxis={identityAxis('%')}
          title="Humidity by hour"
        />
      ) : null}
    </ChartBlock>,
  ]

  return (
    <section style={{ ...cardV2, ...stack(spacing.cellPad) }}>
      {blocks.map((block, i) => (
        <div key={i} style={stack(spacing.cellPad)}>
          {i === 0 ? null : <div aria-hidden style={{ height: '1px', backgroundColor: colorsV2.line }} />}
          {block}
        </div>
      ))}
      {attribution === null ? null : <p style={typeV2.note}>{attribution}</p>}
    </section>
  )
}


/**
 * A chart, its name and unit, the day's own figure for it, and what it says
 * when it cannot be drawn.
 *
 * **The empty state is per chart, never for the section.** These read different
 * columns of the same response — an hour can carry a temperature and no wet
 * count — so "no forecast for this day" would be a claim the section is not
 * entitled to make.
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
  children: ReactNode
}) {
  return (
    <div style={stack(spacing.listGap)}>
      <div style={{ ...row(spacing.listGapSm), alignItems: 'baseline', width: '100%' }}>
        <span style={typeV2.chartTitle}>{label}</span>
        <span style={typeV2.chartUnit}>{unit}</span>
        {/*
          The day's own figure, right-aligned. The axis labels state the
          **scale**; this states the **series**. Confusing the two is how a
          chart's floor gets read as the day's low.
        */}
        {value === null ? null : <span style={{ ...typeV2.chartValue, marginLeft: 'auto' }}>{value}</span>}
      </div>
      {children === null ? <p style={typeV2.body}>{empty}</p> : children}
    </div>
  )
}

function Legend({ children }: { children: ReactNode }) {
  return <div style={{ ...row(spacing.sectionTop), flexWrap: 'wrap', rowGap: `${spacing.tight}px` }}>{children}</div>
}

type Swatch = { kind: 'line'; color: string; dashed?: boolean } | { kind: 'band'; color: string }

/**
 * A legend key, drawn **the way the mark it names is drawn** — a line at the
 * line's colour (dashed where the line is), a ribbon at the ribbon's fill.
 */
function Key({ label, swatch }: { label: string; swatch: Swatch }) {
  const mark: CSSProperties =
    swatch.kind === 'band'
      ? { width: '12px', height: '8px', backgroundColor: swatch.color, borderRadius: '1px' }
      : swatch.dashed === true
        ? { width: '12px', height: 0, borderTop: `2px dashed ${swatch.color}` }
        : { width: '12px', height: '2px', backgroundColor: swatch.color, borderRadius: '1px' }
  return (
    <span style={{ ...row(spacing.listGapSm), ...typeV2.legend }}>
      <span aria-hidden style={{ ...mark, display: 'block', flex: '0 0 auto' }} />
      {label}
    </span>
  )
}
