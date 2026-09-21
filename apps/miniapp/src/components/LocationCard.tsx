import type { ReactNode } from 'react'
import { spacing } from '@weatherteam6/design/tokens'
import { summarizeReadings, type Location } from '@weatherteam6/types'
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
   * The two readings, in one line, from **the same endpoint the detail screen
   * reads**. That is what stops a crag showing one number on this list and a
   * different one on its own screen — the two models disagree by around thirty
   * points on a hot day, which is exactly the sort of difference nobody can
   * debug from a screenshot.
   *
   * Not computed until the alerts query has settled: suppression drops the
   * *number* under an active Severe+ warning, and `severeAlertEvent` answers
   * null for a query in flight exactly as it does for "no alert". On an alerts
   * *error* the query has settled with no data, and nothing is suppressed.
   *
   * `readings === undefined` is an API older than this client, not a model with
   * nothing to say — the card shows no chip rather than an invented reason.
   */
  const readings = conditions.data?.readings
  const summary =
    readings === undefined || alerts.isPending
      ? null
      : summarizeReadings({
          reading: readings.now,
          window: readings.today?.window ?? null,
          utcOffsetSeconds: readings.utc_offset_seconds,
          severeAlertEvent: severeAlertEvent(alerts.data),
          unavailableReason: readings.unavailable_reason,
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

      {/* The readings, then the number — never the number alone, and never
          larger than the weather above it. A card has room for the two words
          and not for the window line or the caveats; those are on the detail
          screen this card opens.

          **The headline is what makes the chip safe here.** A bare "58" beside
          a name is the thing the old model could not stop being reassuring
          about; "Dry rock · Poor friction" beside it cannot be.

          **Nothing at all when there is nothing to put in it**, rather than an
          empty row. A named unavailable reason is a whole sentence about *us*,
          and a card is not where it belongs — the detail screen this card opens
          says it, with room to. */}
      {summary === null || (summary.headline === null && summary.score === null) ? null : (
        <div style={{ ...row(spacing.chipGap), alignSelf: 'flex-end', flexWrap: 'wrap' }}>
          {summary.headline === null ? null : (
            <span style={type.sourceBadge}>{summary.headline}</span>
          )}
          {summary.score === null ? null : (
            <span style={{ ...chip, ...type.labelSm }}>{summary.score}</span>
          )}
        </div>
      )}
    </div>
  )
}
