import { useState, type CSSProperties, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { colors, colorsV2 } from '@weatherteam6/design/tokens'
import {
  DRYNESS_LABEL,
  EM_DASH,
  rockTypeLabel,
  summarizeReadings,
  type Location,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { useAlerts, useConditions, useForecast } from '../hooks/useWeather.js'
import { findToday, severeAlertEvent, sortBySeverity } from '../lib/forecast.js'
import { prefetchDetail } from '../lib/prefetchDetail.js'
import { formatTempRangeF } from '../lib/format.js'
import { cardSummary } from '../lib/locationList.js'
import { scoreRampColor } from './charts/chartStyle.js'
import { InlineError, Skeleton } from './States.js'
import { FadeIn } from './FadeIn.js'
import { RollingFigure, usePreviousFigure } from './RollingFigure.js'
import type { RememberedCard } from '../lib/rememberedCards.js'

/**
 * One crag as a row of the Conditions list, in the hybrid look
 * (`docs/handoffs/design-mockups/weatherteam6-hybrid.html`, `listScreen`): the
 * name, Dryness and the rock, today's good hours and score, and the hour's
 * score large on the right with "now" under it.
 *
 * **The conditions call is skipped entirely for a non-climbing location.** A
 * saved location may be a city, and `computeLiveForecast` does not branch on
 * `is_climbing_location` — it would return a rock-drying score for Chicago if
 * asked, so the client does not ask. A city's row carries today's low and high.
 *
 * No sky glyph, which the mockup draws: `/conditions` carries no sky, and the
 * list does not fetch every crag's hourly run to find one.
 */

/**
 * Wraps a control that lives inside the row's own tap target, so activating it
 * does not also open the location. Click only — the row's key handler already
 * ignores events that did not originate on the row itself.
 */
function RowControl({ children }: { children: ReactNode }) {
  return <span onClick={(e) => e.stopPropagation()}>{children}</span>
}

const small: CSSProperties = { ...typeV2.rowSmall, display: 'block' }

export function LocationCard({
  location,
  remembered,
  onOpen,
  first,
}: {
  location: Location
  /** What this row showed last time on this device, drawn until all three live answers are in. */
  remembered: RememberedCard | undefined
  onOpen: (id: string) => void
  /** The first row has no rule above it. */
  first: boolean
}) {
  const queryClient = useQueryClient()
  const forecast = useForecast(location.id)
  const alerts = useAlerts(location.id)
  const conditions = useConditions(location.id, location.is_climbing_location)

  // A non-crag's conditions query is disabled and stays pending forever.
  const settled =
    !forecast.isPending && !alerts.isPending && !(location.is_climbing_location && conditions.isPending)
  // Whole or not at all — see `RememberedCard`.
  const shown = remembered !== undefined && !settled ? remembered : null
  const forecastData = shown === null ? forecast.data : shown.forecast
  const alertsData = shown === null ? alerts.data : shown.alerts
  const conditionsData = shown === null ? conditions.data : shown.conditions
  const alertsPending = shown === null && alerts.isPending

  const [settledAtMount] = useState(settled)
  const appear = (node: ReactNode) => (settledAtMount || shown !== null ? node : <FadeIn>{node}</FadeIn>)

  /**
   * From **the same endpoint the detail screen reads**, through the same
   * summary the list sorts by — so a crag cannot show one number here, another
   * on its own screen, and rank by a third.
   */
  const summary = cardSummary(conditionsData, alertsData, alertsPending)
  const readings = conditionsData?.readings
  const dayScore =
    readings === undefined
      ? null
      : summarizeReadings({
          reading: readings.today?.best ?? null,
          window: null,
          utcOffsetSeconds: readings.utc_offset_seconds,
          severeAlertEvent: severeAlertEvent(alertsData),
          alertsPending,
          unavailableReason: readings.unavailable_reason,
        }).score
  const dryness = summary?.readings.find((f) => f.label === DRYNESS_LABEL)?.value ?? null
  const rock = location.rock_type == null || location.rock_type === 'unknown' ? null : rockTypeLabel(location.rock_type)
  const alert = alertsData === undefined ? undefined : sortBySeverity(alertsData)[0]
  const today = findToday(forecastData)

  let second: ReactNode = null
  let third: ReactNode = null
  if (location.is_climbing_location) {
    const parts = [dryness === null ? null : `${DRYNESS_LABEL}: ${dryness}`, rock].filter((s): s is string => s !== null)
    second = parts.length === 0 ? null : <small style={small}>{parts.join(' · ')}</small>
    if (shown === null && conditions.isError) {
      third = (
        <RowControl>
          <InlineError message="Couldn't load conditions." onRetry={() => void conditions.refetch()} />
        </RowControl>
      )
    } else if (summary?.unavailableLine != null) {
      third = <small style={small}>{summary.unavailableLine}</small>
    } else if (summary?.window != null) {
      third = (
        <small style={small}>
          {`${summary.window.label}: ${summary.window.value}`}
          {dayScore === null ? '' : ` · Today: ${dayScore}`}
        </small>
      )
    }
  } else if (shown === null && forecast.isError) {
    third = (
      <RowControl>
        <InlineError message="Couldn't load weather." onRetry={() => void forecast.refetch()} />
      </RowControl>
    )
  } else if (today !== null) {
    second = <small style={small}>{`Today: ${formatTempRangeF(today.temp_c_min, today.temp_c_max)}`}</small>
  }

  // Alerts outrank everything, so the alert line takes the place of the day's line.
  const alertLine =
    shown === null && alerts.isError ? (
      <small style={{ ...small, color: colorsV2.txtMuted }}>Alerts unavailable</small>
    ) : alert === undefined ? null : (
      <small style={{ ...small, color: colors.fair }}>{alert.event}</small>
    )

  const loading = shown === null && (forecast.isPending || (location.is_climbing_location && conditions.isPending))

  return (
    // A div, not a button: it can contain a retry button, and a <button>
    // inside a <button> is invalid markup that browsers reparse.
    <div
      role="button"
      tabIndex={0}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto 10px',
        gap: '12px',
        alignItems: 'center',
        padding: '14px 0',
        minHeight: '64px',
        cursor: 'pointer',
        borderTop: first ? 'none' : `1px solid ${colorsV2.line}`,
      }}
      // Opens at once; the crag's hourly fetch starts on touch-down.
      onPointerDown={() => prefetchDetail(queryClient, location)}
      onClick={() => onOpen(location.id)}
      onKeyDown={(e) => {
        // Only when the row itself has focus, so Enter on the retry button retries.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(location.id)
        }
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Wraps rather than truncating: the tail often tells two places apart. */}
        <span style={{ ...typeV2.listName, overflowWrap: 'anywhere' }}>{location.name}</span>
        {loading ? (
          <Skeleton height={30} />
        ) : (
          appear(
            <>
              {second}
              {alertLine ?? third}
            </>,
          )
        )}
      </span>
      {location.is_climbing_location ? (
        <RowScore
          score={loading ? undefined : (summary?.score ?? null)}
          withheld={alertsPending || severeAlertEvent(alertsData) !== null}
        />
      ) : (
        <span />
      )}
      <span aria-hidden="true" style={{ ...typeV2.listName, color: colorsV2.txtMuted }}>
        ›
      </span>
    </div>
  )
}

/**
 * The hour's score, with "now" under it. `summary.score` is already `null`
 * under a Severe+ alert and while alerts load, so there is no raw number here
 * to reach past; a withheld score is a dash over "withheld".
 */
function RowScore({ score, withheld }: { score: number | null | undefined; withheld: boolean }) {
  const value = score == null ? EM_DASH : String(score)
  const was = usePreviousFigure(value)
  if (score === undefined) return <span style={{ width: '64px' }} />
  return (
    <span
      style={{
        ...typeV2.listScore,
        width: '64px',
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        color: score === null ? colorsV2.txtMuted : scoreRampColor(score),
      }}
    >
      <RollingFigure value={value} from={was} />
      <small style={{ ...typeV2.daySmall, display: 'block', fontWeight: 500 }}>{score !== null ? 'now' : withheld ? 'withheld' : 'no score'}</small>
    </span>
  )
}
