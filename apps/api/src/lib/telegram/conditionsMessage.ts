import {
  escapeTelegramHtml,
  formatHoursSinceRain,
  formatHumidity,
  formatTempF,
  formatWindMph,
  isSevereAlert,
  scoreUnavailableLine,
  summarizeConditions,
} from '@weatherteam6/types'
import type { ConditionsScore, ForecastSnapshot } from '@weatherteam6/types'

/**
 * The `/conditions <name>` reply text, built to miniapp-design-v1.md §7.
 *
 * Pure, and in its own module with no database import, so the copy rules can be
 * tested directly — `conditionsReply.ts` pulls in `db`, which throws at import
 * time when `DATABASE_URL` is unset and takes any test importing it with it.
 *
 * What this replaced: a `statusLabel()` that mapped score straight to an
 * opinion. Production answered *"looks great — go climb"* for Red Rock at
 * 103 °F under an active Extreme Heat Warning it never mentioned (issue #21) —
 * a climbing opinion, the score as the headline, no weather, no sources.
 *
 * The ladder and the suppression rule are imported from `@weatherteam6/types`,
 * not reimplemented, so the bot and the Mini App cannot drift on what a score
 * is allowed to say.
 *
 * **Every interpolated value is escaped.** The message goes out with
 * `parse_mode: 'HTML'` and an unescaped `&` — routine in NWS headlines and in a
 * location named "Bear & Cub" — is a 400 the webhook swallows (issue #26).
 */

export type ActiveAlert = {
  event: string
  severity: string
  headline: string | null
}

export type ConditionsReplyInput = {
  locationName: string
  /** A city gets weather and alerts — never a rock-drying score (§7 rule 8). */
  isClimbingLocation: boolean
  /** `null` when the forecast feed has no row for today. */
  today: ForecastSnapshot | null
  todayScore: ConditionsScore | null
  /**
   * Set when the score was withheld because an input could not be measured
   * (issue #34) — as opposed to simply having no row for today. The two must
   * not read the same: one is "not yet", the other is "we couldn't check".
   */
  scoreUnavailable?: 'rainfall_unavailable' | null
  activeAlerts: readonly ActiveAlert[]
}

function weatherLine(day: ForecastSnapshot, rainLine: string | null): string {
  const parts = [
    `High ${formatTempF(day.temp_c_max)}`,
    `wind to ${formatWindMph(day.wind_kmh_max)}`,
    `humidity ${formatHumidity(day.humidity_pct)}`,
  ]
  if (rainLine !== null) parts.push(rainLine)
  return parts.join(' · ')
}

export function formatConditionsReply(input: ConditionsReplyInput): string {
  const {
    locationName,
    isClimbingLocation,
    today,
    todayScore,
    scoreUnavailable,
    activeAlerts,
  } = input

  const severeEvent = activeAlerts.find((a) => isSevereAlert(a.severity))?.event ?? null

  const hoursSinceRain = isClimbingLocation
    ? (todayScore?.score_breakdown?.drying.hours_since_rain ?? null)
    : null
  const rainLine = hoursSinceRain === null ? null : formatHoursSinceRain(hoursSinceRain)

  const lines: string[] = [`<b>${escapeTelegramHtml(locationName)}</b>`]

  // Weather leads (§7 rule 2). A feed that starts tomorrow has no row for today,
  // and saying so beats relabelling tomorrow's numbers as today's.
  lines.push(today === null ? 'No reading for today yet.' : weatherLine(today, rainLine))

  // Alerts outrank everything and are never omitted for space (§7 rule 5).
  if (activeAlerts.length > 0) {
    lines.push('')
    for (const alert of activeAlerts) {
      const detail = alert.headline ?? alert.event
      lines.push(`⚠️ ${escapeTelegramHtml(alert.event)} (NWS) — ${escapeTelegramHtml(detail)}`)
    }
  }

  if (isClimbingLocation) {
    const summary =
      todayScore === null
        ? null
        : summarizeConditions({
            score: todayScore.score,
            confidence: todayScore.confidence,
            components: {
              drying: todayScore.component_drying_time,
              rain: todayScore.component_upcoming_rain,
              wind: todayScore.component_wind,
              temp: todayScore.component_temp,
              humidity: todayScore.component_humidity,
            },
            severeAlertEvent: severeEvent,
          })

    lines.push('')
    if (scoreUnavailable) {
      // Withheld, not absent. Says what happened rather than implying a dry
      // spell — which is exactly what the sentinel used to be credited as.
      lines.push(scoreUnavailableLine(scoreUnavailable))
    } else if (summary === null) {
      lines.push('No conditions for today yet.')
    } else {
      // `label` is null exactly when suppression is in force. Substituting one
      // here is the failure the rule exists to prevent.
      lines.push([summary.label, summary.scoreLine].filter((s) => s !== null).join(' — '))
    }
  }

  // **No sources footer on this panel.** §7 rule 6 requires that any source
  // named be *computed* rather than hardcoded — it does not require that one be
  // shown, and this is a display decision on one surface. What it printed was
  // `Sources: Open-Meteo (gfs_seamless, ecmwf_ifs025, icon_seamless_eps,
  // gem_global) · Open-Meteo archive`: four raw API model keys and a repeated
  // vendor name, on the panel whose entire job is three readable lines.
  //
  // Nothing is being hidden. `forecastSourceLabel` and `rainfallSourceLabel`
  // are unchanged, the Mini App still renders them, and the two attributions
  // that carry meaning are still here — NWS is named inline on every alert
  // above, and the hourly panel names its model under `⚙ More`.
  return lines.join('\n')
}

/**
 * The not-found reply. The old copy said "Save it in the app first", pointing at
 * the archived mobile app; the Mini App's `/add` screen is the surface that
 * exists (§7 rule 7). The name is user input and is escaped.
 */
export function formatLocationNotFound(name: string): string {
  return `I don't have a saved location matching "${escapeTelegramHtml(name)}". Open the app from the menu button and add it.`
}
