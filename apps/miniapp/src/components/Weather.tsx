import type { ReactNode } from 'react'
import { spacing } from '@weatherteam6/design/tokens'
import {
  formatHumidity,
  formatPrecipIn,
  formatTempF,
  formatWindMph,
  type ForecastSnapshot,
} from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { card, row, stack } from '../theme/styles.js'
import { formatForecastDate } from '../lib/forecast.js'
import { DropletIcon, TemperatureIcon, WindIcon } from './Icons.js'

/**
 * Weather leads on every screen (locked copy rule), so these are the largest
 * non-name elements wherever they appear.
 *
 * **`temp_c_max` and `wind_kmh_max` are daily maxima, not present conditions.**
 * There is no current-observation field in any response — Red Rock's 39.5 °C is
 * today's high, not the temperature right now. Every label here says so.
 * Presenting a daily max as a live reading is a factual error, not a wording
 * preference (§3).
 */

function Stat({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div style={stack(spacing.micro)}>
      <span style={{ ...type.label, ...row(spacing.tight) }}>
        {icon}
        {label}
      </span>
      <span style={type.cardTitle}>{value}</span>
    </div>
  )
}

/** The list card's weather line. */
export function WeatherLine({ day }: { day: ForecastSnapshot }) {
  return (
    <div style={{ ...row(spacing.sectionGap), flexWrap: 'wrap' }}>
      <Stat label="High" value={formatTempF(day.temp_c_max)} icon={<TemperatureIcon />} />
      <Stat label="Wind to" value={formatWindMph(day.wind_kmh_max)} icon={<WindIcon />} />
      <Stat label="Humidity" value={formatHumidity(day.humidity_pct)} icon={<DropletIcon />} />
    </div>
  )
}

/**
 * The detail screen's hero. `rainLine` carries the drying model's
 * hours-since-rain when there is one — omitted entirely for a non-climbing
 * location, which has no drying story to tell (§3).
 */
export function TodayHero({ day, rainLine }: { day: ForecastSnapshot; rainLine?: string }) {
  return (
    <section style={{ ...card, ...stack(spacing.cellPad) }}>
      <span style={type.label}>Today</span>
      <div style={{ ...row(spacing.sectionGap), flexWrap: 'wrap' }}>
        <div style={stack(spacing.micro)}>
          <span style={{ ...type.label, ...row(spacing.tight) }}>
            <TemperatureIcon />
            High
          </span>
          <span style={type.bigStat}>{formatTempF(day.temp_c_max)}</span>
        </div>
        <Stat label="Low" value={formatTempF(day.temp_c_min)} />
        <Stat label="Wind to" value={formatWindMph(day.wind_kmh_max)} icon={<WindIcon />} />
        <Stat label="Humidity" value={formatHumidity(day.humidity_pct)} icon={<DropletIcon />} />
      </div>
      {rainLine === undefined ? null : <span style={type.bodyMd}>{rainLine}</span>}
    </section>
  )
}

/**
 * The 7-day list. **Weather only — no per-day score chip.**
 *
 * Not a layout preference: `computeLiveForecast` scores all seven days but no
 * endpoint returns them. `/forecast/:id` carries no score or confidence field
 * at all, so a per-day chip would be an API change and its own task (§3).
 *
 * p10/p90 never appear in prose (locked copy rule), so the row shows the p50
 * figure alone.
 */
export function ForecastList({ days }: { days: readonly ForecastSnapshot[] }) {
  return (
    <section style={stack(spacing.listGapSm)}>
      <span style={type.label}>Next 7 days</span>
      {days.map((day) => (
        <div
          key={day.forecast_date}
          style={{
            ...card,
            ...row(spacing.chipGapMd),
            justifyContent: 'space-between',
            padding: `${spacing.cellPad}px ${spacing.cardPadSm}px`,
          }}
        >
          <span style={type.calDay}>{formatForecastDate(day.forecast_date)}</span>
          <div style={row(spacing.sectionGap)}>
            <span style={{ ...type.bodyMd, ...row(spacing.tight) }}>
              <DropletIcon />
              {formatPrecipIn(day.precip_mm_p50)}
            </span>
            <span style={type.bodyMd}>{formatWindMph(day.wind_kmh_max)}</span>
            <span style={type.calDay}>
              {formatTempF(day.temp_c_max)} / {formatTempF(day.temp_c_min)}
            </span>
          </div>
        </div>
      ))}
    </section>
  )
}
