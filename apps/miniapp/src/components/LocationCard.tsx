import type { ReactNode } from 'react'
import { spacing } from '@weatherteam6/design/tokens'
import { summarizeConditions, type Location } from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { card, chip, row, stack } from '../theme/styles.js'
import { useAlerts, useConditions, useForecast } from '../hooks/useWeather.js'
import { findToday, severeAlertEvent } from '../lib/forecast.js'
import { AlertPill } from './Alerts.js'
import { MapPinIcon } from './Icons.js'
import { InlineError, Skeleton } from './States.js'
import { WeatherLine } from './Weather.js'

/**
 * One card per saved location (§3), in this order: name, weather, alert pill,
 * score chip. Weather is the largest non-name element; the score chip is small,
 * labeled, and last.
 *
 * **The conditions call is skipped entirely for a non-climbing location.** A
 * saved location may be a city, and `computeLiveForecast` does not branch on
 * `is_climbing_location` — it would return a rock-drying score for Chicago if
 * asked, so the client does not ask. That also drops two of the three upstream
 * fetches, so general locations load noticeably faster (§3).
 */

/**
 * Wraps a control that lives inside the card's own tap target, so activating it
 * does not also open the location. Click only — the card's key handler already
 * ignores events that did not originate on the card itself.
 */
function CardControl({ children }: { children: ReactNode }) {
  return <span onClick={(e) => e.stopPropagation()}>{children}</span>
}

export function LocationCard({
  location,
  onOpen,
}: {
  location: Location
  onOpen: (id: string) => void
}) {
  const forecast = useForecast(location.id)
  const alerts = useAlerts(location.id)
  const conditions = useConditions(location.id, location.is_climbing_location)

  const today = findToday(forecast.data)

  /**
   * Suppression keys on the alert state, so the summary must not be computed
   * until the alerts query has settled. Rendering it early shows a bare score
   * chip for a location under an active Severe+ warning — briefly, but that is
   * exactly the state §7 rule 4 exists to prevent. On an alerts *error* the
   * query has settled with no data, and component-based suppression still runs.
   */
  const summary =
    conditions.data == null || alerts.isPending
      ? null
      : summarizeConditions({
          score: conditions.data.score,
          confidence: conditions.data.confidence,
          components: {
            drying: conditions.data.component_drying_time,
            rain: conditions.data.component_upcoming_rain,
            wind: conditions.data.component_wind,
            temp: conditions.data.component_temp,
            humidity: conditions.data.component_humidity,
          },
          severeAlertEvent: severeAlertEvent(alerts.data),
        })

  return (
    // A div, not a button. The card is the tap target (§3: tapping the card,
    // not the pill, opens detail) but it also contains a retry button when a
    // section fails, and a <button> inside a <button> is invalid markup that
    // browsers reparse — the inner control ends up outside the card.
    <div
      role="button"
      tabIndex={0}
      style={{ ...card, ...stack(spacing.cellPad), cursor: 'pointer' }}
      onClick={() => onOpen(location.id)}
      onKeyDown={(e) => {
        // Only when the card itself has focus. Without this check, Enter or
        // Space on the retry button inside would open the location instead of
        // retrying — the keydown bubbles, and preventDefault here would cancel
        // the inner button's own activation.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(location.id)
        }
      }}
    >
      <span style={{ ...type.cardTitle, ...row(spacing.tight) }}>
        <MapPinIcon />
        {location.name}
      </span>

      {forecast.isPending ? (
        <Skeleton height={34} />
      ) : forecast.isError ? (
        <CardControl>
          <InlineError message="Couldn't load weather." onRetry={() => void forecast.refetch()} />
        </CardControl>
      ) : today === null ? (
        <span style={type.bodyMd}>No reading for today yet.</span>
      ) : (
        <WeatherLine day={today} />
      )}

      {/* An alert that failed to load must not read as "no alerts" — alerts
          outrank everything, so their absence is stated (§7 rule 5). */}
      {alerts.isError ? (
        <span style={type.sourceBadge}>Alerts unavailable</span>
      ) : alerts.data === undefined ? null : (
        <AlertPill alerts={alerts.data} />
      )}

      {/* The chip is never the largest element and never bare. When suppression
          is in force the qualifier rides with it — a score is not presented as
          a summary of a day with a zeroed component (§7 rule 4). */}
      {summary?.chip == null ? null : (
        <div style={{ ...row(spacing.chipGap), alignSelf: 'flex-end', flexWrap: 'wrap' }}>
          {summary.qualifier === null ? null : (
            <span style={type.sourceBadge}>{summary.qualifier}</span>
          )}
          <span style={{ ...chip, ...type.labelSm }}>{summary.chip}</span>
        </div>
      )}
    </div>
  )
}
