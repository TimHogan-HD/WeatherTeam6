import {
  formatHoursSinceRain,
  formatHumidity,
  formatTempF,
  formatWindMph,
  isSevereAlert,
  summarizeReadings,
} from '@weatherteam6/types'
import type {
  ConditionsReadings,
  ConditionsScore,
  ForecastSnapshot,
  ScoreUnavailableReason,
} from '@weatherteam6/types'

/**
 * The `/conditions <name>` reply text, built to miniapp-design-v1.md §7.
 *
 * Pure, and in its own module with no database import, so the copy rules can be
 * tested directly — `conditionsReply.ts` pulls in `db`, which throws at import
 * time when `DATABASE_URL` is unset and takes any test importing it with it.
 *
 * What this replaced, twice over:
 *
 * 1. A `statusLabel()` that mapped score straight to an opinion. Production
 *    answered *"looks great — go climb"* for Red Rock at 103 °F under an active
 *    Extreme Heat Warning it never mentioned (issue #21).
 * 2. The **five-component ladder** that replaced it, which was honest about
 *    suppression but still mapped a number to a word — and the number could not
 *    see heat, so the same 103 °F day read *"Dry, settled — Score 88"*.
 *
 * **The readings are now the headline and the number is derived from them**
 * (Phase 3 of `weatherteam6-scoring-model-handoff-v1.md`). The copy comes from
 * `summarizeReadings` in `@weatherteam6/types`, not from here, so the bot and
 * the Mini App cannot drift on what a reading is allowed to say.
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
  /**
   * The five-component score for today.
   *
   * **Only the rain record is read from it now.** The score itself no longer
   * reaches this reply — `readings` carries what a climber is told. It is still
   * here because `score_breakdown.drying.hours_since_rain` is the "no rain in
   * 46h" clause on the weather line, and that clock has no v2 equivalent yet.
   */
  todayScore: ConditionsScore | null
  /**
   * Set when the five-component score was withheld because an input could not
   * be measured (issue #34).
   *
   * **It no longer suppresses anything a reader sees**, because the score it
   * describes is no longer printed. It withholds the rain clause on the weather
   * line, which is the one thing that score still supplies: a failed rainfall
   * lookup and a genuinely dry month produce the same 720-hour sentinel, and
   * printing it would assert a measurement nobody took.
   */
  scoreUnavailable?: ScoreUnavailableReason | null
  /**
   * The v2 readings for today, **carrying their own clock**. Always present —
   * the gatherer cannot forget it, and `utc_offset_seconds` travels with them
   * so a window's times cannot be rendered against a different location's day.
   */
  readings: ConditionsReadings
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
    readings,
    activeAlerts,
  } = input

  const severeEvent = activeAlerts.find((a) => isSevereAlert(a.severity))?.event ?? null

  // Withheld rather than printed when the rainfall lookup failed: the sentinel
  // for "no rain found" is the same value for a dry month and for an outage.
  const hoursSinceRain =
    isClimbingLocation && !scoreUnavailable
      ? (todayScore?.score_breakdown?.drying.hours_since_rain ?? null)
      : null
  const rainLine = hoursSinceRain === null ? null : formatHoursSinceRain(hoursSinceRain)

  const lines: string[] = [locationName]

  // Weather leads (§7 rule 2). A feed that starts tomorrow has no row for today,
  // and saying so beats relabelling tomorrow's numbers as today's.
  lines.push(today === null ? 'No reading for today yet.' : weatherLine(today, rainLine))

  // Alerts outrank everything and are never omitted for space (§7 rule 5).
  if (activeAlerts.length > 0) {
    lines.push('')
    for (const alert of activeAlerts) {
      const detail = alert.headline ?? alert.event
      lines.push(`⚠️ ${alert.event} (NWS) — ${detail}`)
    }
  }

  if (isClimbingLocation) {
    const summary = summarizeReadings({
      reading: readings.now,
      window: readings.today?.window ?? null,
      // The location's own clock, off the readings themselves — never the
      // server's, and never a fallback while something else settles (#33).
      utcOffsetSeconds: readings.utc_offset_seconds,
      severeAlertEvent: severeEvent,
      unavailableReason: readings.unavailable_reason,
    })

    lines.push('')
    if (summary.unavailableLine !== null) {
      lines.push(summary.unavailableLine)
    } else {
      // The two readings lead. When the run does not reach this hour there is
      // no headline, and the window line below still answers the day — saying
      // nothing at all would read as a broken panel.
      if (summary.headline !== null) {
        lines.push(
          [summary.headline, summary.qualifier].filter((s) => s !== null).join(' — '),
        )
      }
      // The number is last and smallest, which on a text panel means last on
      // its line. `scoreLine` is null under a Severe+ alert and the qualifier
      // above has already named it — substituting the raw number here is what
      // suppression exists to prevent.
      lines.push([summary.window, summary.scoreLine].filter((s) => s !== null).join(' · '))
      // Required copy, not decoration: the friction reading has one unvalidated
      // step in it and the surface says so (§ Open Questions 6).
      for (const note of summary.notes) lines.push(note)
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
 * exists (§7 rule 7). The name is user input; the rich path needs no escaping
 * and the HTML fallback escapes it on the way out.
 */
export function formatLocationNotFound(name: string): string {
  return `I don't have a saved location matching "${name}". Open the app from the menu button and add it.`
}
