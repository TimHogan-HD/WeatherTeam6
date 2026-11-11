import {
  formatPrecipIn,
  hourLabel,
  kmToMi,
  type RainGaugeReadings,
  type TripDayGauge,
  type TripDayVolunteerGauge,
} from '@weatherteam6/types'
import { dateLabel } from './trips.js'

/**
 * Rain gauge lines, one wording for every surface that prints them: an ended
 * trip's look back and the Precip tab (#479). One spot's measurement, an
 * airport day versus a volunteer's 24-hour reading, and a short airport day
 * as "not every hour reported", never a drier total.
 */

/** Said once wherever a gauge line is shown. */
export const GAUGE_SOURCE =
  'A rain gauge line is one spot’s measurement, which a passing shower can miss. An airport gauge is summed over the day; a volunteer’s is read once a day and covers the 24 hours shown.'

/**
 * A day's gauge reading as one line, or null when there is none. A day with an
 * hour unreported says so rather than printing a total that may have missed
 * the hour it rained in.
 */
export function gaugeLine(gauge: TripDayGauge | null | undefined): string | null {
  if (gauge == null) return null
  const where = `Rain gauge at ${gauge.station}, ${miles(gauge.distance_km)} mi away`
  return gauge.rain_mm === null ? `${where}: not every hour reported` : `${where}: ${formatPrecipIn(gauge.rain_mm)}`
}

/**
 * A volunteer gauge's report as one line, or null when none reported. It is
 * one reading over the 24 hours before it, not the calendar day, so the
 * window is printed as it is: `7 am 29 Oct – 7 am 30 Oct`.
 */
export function volunteerGaugeLine(gauge: TripDayVolunteerGauge | null | undefined): string | null {
  if (gauge == null) return null
  const at = hourLabel(gauge.obs_hour)
  const window = `${at} ${dateLabel(dateBefore(gauge.report_date))} – ${at} ${dateLabel(gauge.report_date)}`
  return `Volunteer gauge at ${gauge.name}, ${miles(gauge.distance_km)} mi away: ${formatPrecipIn(gauge.rain_mm)}, ${window}`
}

/** Whole miles, never `0 mi`: a gauge under half a mile away is `1 mi`. */
function miles(km: number): number {
  return Math.max(1, Math.round(kmToMi(km)))
}

function dateBefore(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
}

/** Whether a place has any gauge to read: the Precip tab draws no gauge card otherwise. */
export function hasGauges(r: RainGaugeReadings): boolean {
  return r.airport !== null || r.volunteer.stations > 0
}

/**
 * What the gauges could not say, once for the card: a read that failed. A day
 * with no line under it then reads as "did not answer", never as dry.
 */
export function gaugeGaps(r: RainGaugeReadings): string[] {
  const gaps: string[] = []
  if (r.airport !== null && !r.airport.answered) gaps.push(`The airport gauge at ${r.airport.station} did not answer.`)
  if (r.volunteer.failed > 0) {
    gaps.push(
      r.volunteer.failed === r.volunteer.stations
        ? 'The volunteer gauges did not answer.'
        : `${r.volunteer.failed} of ${r.volunteer.stations} volunteer gauges did not answer.`,
    )
  }
  return gaps
}

/**
 * What a day with no gauge line says. "No report" only when every gauge in
 * reach answered; otherwise a failed read could be the day's, so the line
 * says it is missing rather than that nothing was reported.
 */
export function noReadingLine(r: RainGaugeReadings): string {
  return gaugeGaps(r).length === 0 ? 'No gauge reported this day' : 'No gauge reading'
}
