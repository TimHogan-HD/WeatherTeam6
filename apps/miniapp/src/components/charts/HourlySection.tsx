import type { ReactNode } from 'react'
import { spacing } from '@weatherteam6/design/tokens'
import { formatPrecipIn, formatTempF, type HourlySeries } from '@weatherteam6/types'
import { type } from '../../theme/tokens.css.js'
import { card, stack } from '../../theme/styles.js'
import { formatRunAge } from '../../lib/format.js'
import { useNow } from '../../hooks/useNow.js'
import { HourlyChart } from './HourlyChart.js'
import { RAIN_VIEW_H, TEMP_VIEW_H, chartColors } from './chartStyle.js'
import { hasValues, rainSeries, temperatureSeries, uniformMemberCount } from './hourlySeries.js'
import { rainAxis, tempAxis } from './valueAxis.js'

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

/**
 * The rain band's legend, and it says **average**, not middle.
 *
 * `precip_mm_mean` is a mean and the band is p10-p90, so unlike temperature the
 * line is not the centre of its own band: on a day nine runs in ten leave dry,
 * the band lies flat on zero while the bars do not. Calling that line "the
 * middle" would make the picture look like a bug in the chart rather than the
 * disagreement it is.
 */
export function rainBandLegend(memberCount: number | null): string {
  return memberCount === null
    ? 'Line: the average across runs · Band: where 8 in 10 land'
    : `Line: the average across ${memberCount} runs · Band: where 8 in 10 land`
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

  // There is deliberately no whole-section "no hourly forecast" state. These charts draw
  // the **ensemble**, and a response with no ensemble columns can still carry a full
  // deterministic hourly forecast with `series.model` named — saying no forecast exists
  // would be a claim about the response, not about what could be drawn. Each block says
  // what it could not draw instead.
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
            valueAxis={tempAxis}
            title="Hourly temperature"
          />
        ) : (
          <p style={type.bodyMd}>No hourly temperature from the forecast runs yet.</p>
        )}
      </ChartBlock>

      <ChartBlock
        label="Rain"
        {...(hasRain ? { legend: rainBandLegend(uniformMemberCount(series.hours)) } : {})}
      >
        {hasRain ? (
          <HourlyChart
            data={rain}
            kind="line"
            viewHeight={RAIN_VIEW_H}
            color={chartColors.rain}
            bandColor={chartColors.rainBand}
            formatValue={formatPrecipIn}
            valueAxis={rainAxis}
            title="Hourly rainfall"
          />
        ) : (
          <p style={type.bodyMd}>No hourly rainfall from the forecast runs yet.</p>
        )}
      </ChartBlock>

      {runAge === null ? null : (
        <span style={{ ...type.label, color: chartColors.valueLabel }}>{runAge}</span>
      )}
    </section>
  )
}
