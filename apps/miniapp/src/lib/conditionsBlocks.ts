import {
  formatLocalHour,
  summarizeReadings,
  type HourlyReading,
  type HourlySample,
} from '@weatherteam6/types'
import { LIKELY_RAIN_PCT } from './overview.js'

/**
 * The Conditions now card's look ahead: the next hours as three-hour blocks,
 * and when rain is likely inside them.
 *
 * It exists because one hour's score misled the owner (Sandstone, 2026-10-03):
 * 9am read 100 on a day the rain arrived at 1pm and the day scored 48. A run of
 * blocks shows which way the day is going without reading a chart.
 *
 * **A block's score is its worst hour**, the rule a day's score already uses
 * (`dayRepresentative`), so a block can never read better than an hour inside
 * it. A block with any hour unread or suppressed has no score: the worst of the
 * hours that were read could be better than the one that was not.
 */

export const BLOCK_HOURS = 3
export const BLOCK_COUNT = 3

const HOUR_MS = 3_600_000

export type ScoreBlock = {
  /** The block's first hour, UTC ISO. */
  from: string
  /** `9am–12pm`, on the location's clock. */
  label: string
  /** Its worst hour's score, suppressed as every surface suppresses it. `null` is a gap. */
  score: number | null
}

/**
 * `BLOCK_COUNT` blocks of `BLOCK_HOURS` hours from `startAt`, the hour the card
 * reads as now. Readings join **on the instant**, never on position.
 */
export function scoreBlocks(
  hours: readonly HourlyReading[],
  startAt: string,
  utcOffsetSeconds: number,
  alerts: { severeAlertEvent: string | null; alertsPending: boolean },
): ScoreBlock[] {
  const start = Date.parse(startAt)
  if (!Number.isFinite(start)) return []
  const byInstant = new Map<number, HourlyReading>()
  for (const h of hours) {
    const t = Date.parse(h.valid_at)
    if (Number.isFinite(t)) byInstant.set(t, h)
  }

  const out: ScoreBlock[] = []
  for (let b = 0; b < BLOCK_COUNT; b++) {
    const fromMs = start + b * BLOCK_HOURS * HOUR_MS
    const from = new Date(fromMs).toISOString()
    const to = new Date(fromMs + BLOCK_HOURS * HOUR_MS).toISOString()
    const a = formatLocalHour(from, utcOffsetSeconds)
    const z = formatLocalHour(to, utcOffsetSeconds)
    if (a === null || z === null) continue

    let worst: number | null = null
    for (let i = 0; i < BLOCK_HOURS; i++) {
      const reading = byInstant.get(fromMs + i * HOUR_MS) ?? null
      const score =
        reading === null
          ? null
          : summarizeReadings({
              reading,
              window: null,
              utcOffsetSeconds,
              severeAlertEvent: alerts.severeAlertEvent,
              alertsPending: alerts.alertsPending,
              unavailableReason: null,
            }).score
      if (score === null) {
        worst = null
        break
      }
      worst = worst === null ? score : Math.min(worst, score)
    }
    out.push({ from, label: `${a}–${z}`, score: worst })
  }
  return out
}

export type RainAhead = {
  /** When the first likely hour begins, UTC ISO — or now, if it already has. */
  from: string
  /** The highest hourly chance from then to the end of the blocks. */
  peakPct: number
  /** The rain has already begun. */
  now: boolean
}

/**
 * The first hour within the blocks when at least half the ensemble is wet, or
 * `null` when there is none — or when no hour said anything, which is unknown
 * rather than dry; the card then shows the day's good hours instead.
 *
 * **Rain is stamped at the end of its hour**, so an hour stamped 13:00 is rain
 * from noon: that start is what "from" names. The first hour stamped after now
 * is the one in progress, and a likely one is rain now.
 */
export function rainAhead(
  hours: readonly HourlySample[],
  startAt: string,
  nowMs: number,
): RainAhead | null {
  const start = Date.parse(startAt)
  if (!Number.isFinite(start)) return null
  const end = start + BLOCK_COUNT * BLOCK_HOURS * HOUR_MS
  const coming = hours
    .map((h) => ({ t: Date.parse(h.valid_at), pct: h.precip_chance_pct }))
    .filter((h): h is { t: number; pct: number } => Number.isFinite(h.t) && h.t > nowMs && h.t <= end && h.pct !== null)
    .sort((a, b) => a.t - b.t)

  const first = coming.find((h) => h.pct >= LIKELY_RAIN_PCT)
  if (first === undefined) return null
  const beginsMs = first.t - HOUR_MS
  return {
    from: new Date(beginsMs).toISOString(),
    peakPct: Math.max(...coming.filter((h) => h.t >= first.t).map((h) => h.pct)),
    now: beginsMs <= nowMs,
  }
}
