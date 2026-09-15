import { spacing } from '@weatherteam6/design/tokens'
import {
  TEMP_BAND_C,
  formatPrecipIn,
  formatTempF,
  type HourlySeries,
} from '@weatherteam6/types'
import { type } from '../../theme/tokens.css.js'
import { card, stack } from '../../theme/styles.js'
import { formatForecastDate, formatWeekday } from '../../lib/forecast.js'
import { Segmented, type SegmentedOption } from '../Segmented.js'
import { HourlyChart } from './HourlyChart.js'
import {
  DAY_VIEW_H,
  RAIN_VIEW_H,
  chartColors,
  rainColor,
  tempColor,
  tempIdealBandFill,
} from './chartStyle.js'
import { dayIsDrawable, hoursOnDay, rainSeries, temperatureSeries, hasValues } from './hourlySeries.js'

/**
 * One day, hour by hour: temperature as a spread per hour, and rainfall as bars.
 *
 * **The day picker shows every day in the window, drawable or not.** A day the
 * ensemble never reached is disabled rather than removed — a seven-chip row
 * that silently becomes five tells the reader the forecast is shorter than it
 * is, which is the same false claim as naming a model that did not answer.
 */

const DAY_PANEL_ID = 'hourly-day-panel'

export type DayChartsProps = {
  series: HourlySeries
  /** The local date currently open. Always one the caller checked is drawable. */
  selectedDate: string
  onSelectDate: (localDate: string) => void
}

export function DayCharts({ series, selectedDate, onSelectDate }: DayChartsProps) {
  const options: SegmentedOption<string>[] = series.days.map((day) => ({
    value: day.local_date,
    // The weekday alone in a chip; the full date is in the heading below, where
    // there is room for it. Seven days never repeat a weekday.
    label: formatWeekday(day.local_date),
    ...(dayIsDrawable(day) ? {} : { disabled: true }),
  }))

  const hours = hoursOnDay(series.hours, selectedDate)
  const temperature = temperatureSeries(hours)
  const rain = rainSeries(hours)

  return (
    <section style={{ ...card, ...stack(spacing.sectionTop) }}>
      <Segmented
        as="tabs"
        label="Day"
        panelId={DAY_PANEL_ID}
        options={options}
        value={selectedDate}
        onChange={onSelectDate}
      />

      <div id={DAY_PANEL_ID} role="tabpanel" style={stack(spacing.sectionTop)}>
        <span style={type.navLabel}>{formatForecastDate(selectedDate)}</span>

        <div style={stack(spacing.tight)}>
          <span style={type.label}>Temperature</span>
          {hasValues(temperature) ? (
            <>
              <HourlyChart
                data={temperature}
                kind="range"
                axis="hour"
                utcOffsetSeconds={series.utc_offset_seconds}
                viewHeight={DAY_VIEW_H}
                color={chartColors.temperature}
                colorForValue={tempColor}
                referenceBand={{
                  from: TEMP_BAND_C.idealMin,
                  to: TEMP_BAND_C.idealMax,
                  fill: tempIdealBandFill,
                }}
                formatValue={formatTempF}
                title="Temperature by hour"
              />
              {/*
                The legend earns its place here in a way it does not on the
                seven-day strip: the mark is a box with a rule through it and
                nothing else on screen says which part is which. p10/p90 stay
                out of it — the locked copy rule allows them in a chart legend
                and this reads better without them.
              */}
              <span style={{ ...type.label, color: chartColors.valueLabel }}>
                Bar: where 8 in 10 land · Line: the middle · Shaded: ideal range
              </span>
            </>
          ) : (
            // Says what *this chart* could not draw, not that the day has no
            // forecast — the rain chart below reads different columns and may
            // well have one.
            <p style={type.bodyMd}>No hourly temperature for this day.</p>
          )}
        </div>

        <div style={stack(spacing.tight)}>
          <span style={type.label}>Rain</span>
          {hasValues(rain) ? (
            <HourlyChart
              data={rain}
              kind="bar"
              axis="hour"
              utcOffsetSeconds={series.utc_offset_seconds}
              viewHeight={RAIN_VIEW_H}
              color={chartColors.rain}
              colorForValue={rainColor}
              formatValue={formatPrecipIn}
              title="Rainfall by hour"
            />
          ) : (
            <p style={type.bodyMd}>No hourly rainfall for this day.</p>
          )}
        </div>
      </div>
    </section>
  )
}
