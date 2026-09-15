import type { ReactNode } from 'react'
import { spacing } from '@weatherteam6/design/tokens'
import { formatPrecipIn, formatTempF, type HourlySeries } from '@weatherteam6/types'
import { type } from '../../theme/tokens.css.js'
import { card, stack } from '../../theme/styles.js'
import { formatRunAge } from '../../lib/format.js'
import { useNow } from '../../hooks/useNow.js'
import { HourlyChart } from './HourlyChart.js'
import { RAIN_VIEW_H, TEMP_VIEW_H, chartColors, rainColor } from './chartStyle.js'
import { hasValues, rainSeries, temperatureSeries, uniformMemberCount } from './hourlySeries.js'

/**
 * The hourly charts on the detail screen: temperature with its ensemble band,
 * and hourly rainfall.
 *
 * **This is not the Hourly tab.** Tabs, the day drill-down and the model
 * switcher are Phase 3; this section exists so the primitives are on a real
 * screen, with real data, on a real phone, before anything is built on top of
 * them.
 */

/**
 * The legend, in plain language.
 *
 * The locked copy rule allows p10/p50/p90 in a chart legend and nowhere else.
 * It reads better without them, and the model-agreement precedent in the UI
 * handoff ("N of 31 members agree") is the phrasing this follows.
 *
 * The run count appears only when `uniformMemberCount` could vouch for it.
 */
export function bandLegend(memberCount: number | null): string {
  return memberCount === null
    ? 'Line: the middle forecast · Band: where 8 in 10 land'
    : `Line: the middle of ${memberCount} forecast runs · Band: where 8 in 10 land`
}

function ChartBlock({
  label,
  legend,
  children,
}: {
  label: string
  legend?: string
  children: ReactNode
}) {
  return (
    <div style={stack(spacing.tight)}>
      <span style={type.label}>{label}</span>
      {children}
      {legend === undefined ? null : (
        <span style={{ ...type.label, color: chartColors.valueLabel }}>{legend}</span>
      )}
    </div>
  )
}

/**
 * `now` is the ticking clock by default and an argument only so a test can
 * assert the run-age line without freezing the real one.
 */
export function HourlySection({ series, now }: { series: HourlySeries; now?: number }) {
  const ticking = useNow()
  const at = now ?? ticking
  const temperature = temperatureSeries(series.hours)
  const rain = rainSeries(series.hours)
  const runAge = formatRunAge(series.fetched_at, at)

  const hasTemperature = hasValues(temperature)
  const hasRain = hasValues(rain)

  // Nothing drawable. Said once, plainly — two empty frames would read as a
  // forecast of nothing rather than as an absence of one.
  if (!hasTemperature && !hasRain) {
    return (
      <section style={{ ...card, ...stack(spacing.tight) }}>
        <span style={type.label}>Hour by hour</span>
        <p style={type.bodyMd}>No hourly forecast for this location yet.</p>
      </section>
    )
  }

  return (
    <section style={{ ...card, ...stack(spacing.sectionTop) }}>
      <span style={type.label}>Hour by hour</span>

      {/*
        A chart that cannot be drawn says so rather than disappearing. Dropping
        the rain block silently would read as a forecast of no rain: the reader
        cannot miss a section they were never shown one of.
      */}
      <ChartBlock
        label="Temperature"
        // A legend for a band nobody drew explains nothing.
        {...(hasTemperature ? { legend: bandLegend(uniformMemberCount(series.hours)) } : {})}
      >
        {hasTemperature ? (
          <HourlyChart
            data={temperature}
            kind="line"
            viewHeight={TEMP_VIEW_H}
            color={chartColors.temperature}
            bandColor={chartColors.temperatureBand}
            formatValue={formatTempF}
            title="Hourly temperature"
          />
        ) : (
          <p style={type.bodyMd}>No hourly temperature in this forecast.</p>
        )}
      </ChartBlock>

      <ChartBlock label="Rain">
        {hasRain ? (
          <HourlyChart
            data={rain}
            kind="bar"
            viewHeight={RAIN_VIEW_H}
            color={chartColors.rain}
            colorForValue={rainColor}
            formatValue={formatPrecipIn}
            title="Hourly rainfall"
          />
        ) : (
          <p style={type.bodyMd}>No hourly rainfall in this forecast.</p>
        )}
      </ChartBlock>

      {runAge === null ? null : (
        <span style={{ ...type.label, color: chartColors.valueLabel }}>{runAge}</span>
      )}
    </section>
  )
}
