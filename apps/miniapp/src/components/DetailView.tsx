import { spacing } from '@weatherteam6/design/tokens'
import { formatHoursSinceRain, scoreUnavailableLine } from '@weatherteam6/types'
import type { ConditionsScore, ForecastSnapshot, WeatherAlert } from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { stack } from '../theme/styles.js'
import { forecastSourceLabel, findToday, rainfallSourceLabel, severeAlertEvent } from '../lib/forecast.js'
import { AlertBanner } from './Alerts.js'
import { ScoreSection } from './ScoreSection.js'
import { SourcesFooter } from './SourcesFooter.js'
import { InlineError, Skeleton } from './States.js'
import { ForecastList, TodayHero } from './Weather.js'

/**
 * One scroll, no internal tabs (§3), in a fixed order: alert banner, today,
 * 7-day, score, sources.
 *
 * Shared by the saved detail screen and the add flow's preview step — the
 * preview is this screen in unsaved mode with its chrome swapped, which is why
 * `/add` is the only genuinely new screen in §12.
 *
 * Sections fail independently. A location whose alerts call failed still shows
 * its weather; the screen is never a whole-screen error takeover (§5).
 */

export type DetailViewProps = {
  /** Unsaved preview: no score section regardless of type — nothing has been classified yet. */
  unsaved?: boolean
  isClimbingLocation: boolean
  /** `null` on the preview path and on hand-entered coordinates. */
  asosStation: string | null

  forecast: {
    data: ForecastSnapshot[] | undefined
    isPending: boolean
    isError: boolean
    refetch: () => void
  }
  alerts?: {
    data: WeatherAlert[] | undefined
    /** Gates the score section: suppression cannot be decided before this settles. */
    isPending: boolean
    isError: boolean
  }
  conditions?: {
    /** A 200 with `data: null` is the documented "no row for today" answer, not an error (§5). */
    data: ConditionsScore | null | undefined
    isPending: boolean
    isError: boolean
    refetch: () => void
  }
}

export function DetailView({
  unsaved = false,
  isClimbingLocation,
  asosStation,
  forecast,
  alerts,
  conditions,
}: DetailViewProps) {
  const today = findToday(forecast.data)
  const alertEvent = severeAlertEvent(alerts?.data)
  const showScore = !unsaved && isClimbingLocation
  const activeAlertCount = alerts?.data?.length ?? 0

  // Hours since rain belongs to the hero, not the breakdown, and only to a
  // climbing location — a city has no drying story (§3). The shared formatter
  // caps it at "30+ days" so a swallowed rainfall fetch cannot render as a
  // precise measurement.
  const hoursSinceRain = showScore
    ? (conditions?.data?.score_breakdown?.drying.hours_since_rain ?? null)
    : null
  const rainLine = hoursSinceRain === null ? undefined : formatHoursSinceRain(hoursSinceRain)

  const sources = [
    forecastSourceLabel(forecast.data),
    showScore ? rainfallSourceLabel(asosStation) : null,
    // Only claim NWS when an alert is actually being shown.
    //
    // An empty result is not "NWS says no alerts": `/alerts/:id` reads the
    // `weather_alerts` table, which is populated by a cron that is not yet
    // registered, so an empty array can equally mean NWS has never been asked.
    // Naming it then asserts a check that may not have happened. The bot uses
    // the same rule — the two must not disagree about the same location.
    activeAlertCount > 0 ? 'NWS' : null,
  ].filter((s): s is string => s !== null)

  return (
    <div style={{ ...stack(spacing.sectionGap), marginTop: `${spacing.sectionTop}px` }}>
      {alerts?.isError === true ? (
        // Alerts outrank everything (§7 rule 5), so their absence must be
        // visible rather than looking like "no alerts".
        <InlineError message="Couldn't load alerts." />
      ) : alerts?.data === undefined ? null : (
        <AlertBanner alerts={alerts.data} />
      )}

      {forecast.isPending ? (
        <Skeleton height={110} />
      ) : forecast.isError ? (
        <InlineError message="Couldn't load the forecast." onRetry={forecast.refetch} />
      ) : (
        <>
          {today === null ? (
            <p style={type.bodyMd}>No reading for today yet.</p>
          ) : (
            <TodayHero day={today} rainLine={rainLine} />
          )}
          {forecast.data === undefined || forecast.data.length === 0 ? null : (
            <ForecastList days={forecast.data} />
          )}
        </>
      )}

      {showScore && conditions !== undefined ? (
        // The score waits on the alerts query as well as its own. Suppression
        // keys on whether a Severe+ alert is active, so rendering the summary
        // before alerts settle briefly shows an unsuppressed score for a
        // location under an active warning — the state §7 rule 4 exists to
        // prevent. An alerts error settles the query, and component-based
        // suppression still runs.
        conditions.isPending || alerts?.isPending === true ? (
          <Skeleton height={90} />
        ) : conditions.isError ? (
          <InlineError message="Couldn't load conditions." onRetry={conditions.refetch} />
        ) : conditions.data === null ? (
          // Distinct from the ladder's "Too far out to score", which describes a
          // date beyond the scoring window. This is today, and it has no row.
          <p style={type.bodyMd}>No conditions for today yet.</p>
        ) : conditions.data?.unavailable_reason ? (
          // Withheld, not missing (§#34). The rainfall lookup failed, and its
          // sentinel is worth 40 of 100 points — scoring anyway would credit a
          // dry spell nobody measured. Says what happened rather than implying
          // it has not rained.
          <p style={type.bodyMd}>
            {scoreUnavailableLine(conditions.data.unavailable_reason)}
          </p>
        ) : conditions.data === undefined ? null : (
          <ScoreSection score={conditions.data} severeAlertEvent={alertEvent} />
        )
      ) : null}

      <SourcesFooter sources={sources} />
    </div>
  )
}
