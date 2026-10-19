import {
  DRYNESS_LABEL,
  summarizeReadings,
  type HourlyReading,
  type HourlySeries,
} from '@weatherteam6/types'
import { LIKELY_RAIN_PCT } from './overview.js'

/**
 * The Overview's score bars (hybrid look, owner 2026-10-19): one bar per hour
 * for the next `SCORE_BAR_HOURS`, the height and colour of the hour's score,
 * each day's best three-hour run underlined. Pure, so each rule is reachable
 * by a test.
 */

export const SCORE_BAR_HOURS = 36

const HOUR_MS = 3_600_000

export type BarHour = {
  ms: number
  local_date: string
  /**
   * Suppressed as every surface suppresses it (`summarizeReadings`): `null`
   * under a Severe+ alert, while alerts load, and for an hour the model did
   * not read. A null bar is a stub, never a short bar.
   */
  score: number | null
  /** The Dryness word. Kept under an alert: the alert withholds the number, not the readings. */
  dryness: string | null
  /** Share of ensemble members wet, 0-100. `null` is unknown, never 0%. */
  chancePct: number | null
  /** At or above `LIKELY_RAIN_PCT`: the hour carries a rain mark. */
  rainLikely: boolean
  /** The score exists and a Severe+ alert is what hides it. */
  withheldByAlert: boolean
}

/** A day's best run, from the server's `ReadingsDay.window`; its score is the run's worst hour. */
export type BestRun = { local_date: string; fromMs: number; toMs: number; score: number }

export type ScoreBarWindow = { hours: BarHour[]; best: BestRun[] }

type Alerts = { severeAlertEvent: string | null; alertsPending: boolean }

function summarize(series: HourlySeries, reading: HourlyReading | null, alerts: Alerts) {
  return summarizeReadings({
    reading,
    window: null,
    utcOffsetSeconds: series.utc_offset_seconds,
    severeAlertEvent: alerts.severeAlertEvent,
    alertsPending: alerts.alertsPending,
    unavailableReason: null,
  })
}

/**
 * The hours from the one now is in to `SCORE_BAR_HOURS` later, joined to their
 * readings **on `valid_at`**, never on position. `null` when the series has no
 * hour in that span.
 *
 * A best run is listed only when it starts inside the span and its score
 * survives suppression, so the underline never names a day the alert hides.
 */
export function scoreBarWindow(series: HourlySeries, nowMs: number, alerts: Alerts): ScoreBarWindow | null {
  const fromMs = nowMs - (nowMs % HOUR_MS)
  const toMs = fromMs + (SCORE_BAR_HOURS - 1) * HOUR_MS

  const byInstant = new Map<string, HourlyReading>()
  for (const r of series.readings?.hours ?? []) byInstant.set(r.valid_at, r)

  const hours: BarHour[] = []
  for (const h of series.hours) {
    const ms = Date.parse(h.valid_at)
    if (!Number.isFinite(ms) || ms < fromMs || ms > toMs) continue
    const reading = byInstant.get(h.valid_at) ?? null
    const summary = summarize(series, reading, alerts)
    hours.push({
      ms,
      local_date: h.local_date,
      score: summary.score,
      dryness: summary.readings.find((f) => f.label === DRYNESS_LABEL)?.value ?? null,
      chancePct: h.precip_chance_pct,
      rainLikely: h.precip_chance_pct !== null && h.precip_chance_pct >= LIKELY_RAIN_PCT,
      withheldByAlert: alerts.severeAlertEvent !== null && reading !== null && reading.score !== null,
    })
  }
  if (hours.length === 0) return null
  hours.sort((a, b) => a.ms - b.ms)

  const best: BestRun[] = []
  for (const day of series.readings?.days ?? []) {
    if (day.window === null) continue
    const from = Date.parse(day.window.from)
    const to = Date.parse(day.window.to)
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < fromMs || to > toMs) continue
    const score = summarize(series, day.best, alerts).score
    if (score === null) continue
    best.push({ local_date: day.local_date, fromMs: from, toMs: to, score })
  }
  return { hours, best }
}
