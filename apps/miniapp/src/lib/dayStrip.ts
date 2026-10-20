import { summarizeReadings, type HourlyReading, type HourlySample } from '@weatherteam6/types'
import type { DayReadings } from './overview.js'

/**
 * One cell of a Daily row's hour strip: the hour's score for a crag, its
 * chance of rain for a city. A `null` is unread, drawn as an empty cell, never
 * as a low one.
 */
export type StripHour = { hour: number; score: number | null; chancePct: number | null }

/**
 * A day's hours in local clock order, for the strip under its Daily row.
 *
 * Each score goes through `summarizeReadings` exactly as the hero's does, so a
 * Severe+ alert or an alerts query in flight empties the strip as it drops
 * the day's number. Readings join the hours on `valid_at`, never on position.
 * `hour` is the local clock hour, from the hourly run's own offset.
 */
export function dayStrip(
  hours: readonly HourlySample[],
  hourReadings: readonly HourlyReading[],
  localDate: string,
  utcOffsetSeconds: number,
  readings: DayReadings | null,
): StripHour[] {
  const byInstant = new Map(hourReadings.map((r) => [r.valid_at, r]))
  const out: StripHour[] = []
  for (const h of hours) {
    if (h.local_date !== localDate) continue
    const ms = Date.parse(h.valid_at)
    if (!Number.isFinite(ms)) continue
    const score =
      readings === null
        ? null
        : summarizeReadings({
            reading: byInstant.get(h.valid_at) ?? null,
            window: null,
            utcOffsetSeconds: readings.utcOffsetSeconds,
            severeAlertEvent: readings.severeAlertEvent,
            alertsPending: readings.alertsPending,
            unavailableReason: null,
          }).score
    out.push({ hour: new Date(ms + utcOffsetSeconds * 1000).getUTCHours(), score, chancePct: h.precip_chance_pct })
  }
  return out.sort((a, b) => a.hour - b.hour)
}
