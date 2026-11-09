import { riverChangeFt, riverState, type RiverGaugeReading, type RiverState } from '@weatherteam6/types'

/**
 * Words for a river gauge reading (`RIVER_GAUGES`). A label and a value, never
 * a sentence; a missing or old reading says so, never a height.
 */

/** `4.88 ft`, or an em dash for a missing height. */
export function formatFt(ft: number | null): string {
  return ft === null || !Number.isFinite(ft) ? '—' : `${ft.toFixed(2)} ft`
}

/**
 * An instant on the crag's clock, from the forecast's UTC offset (most saved
 * rows have no `timezone`); the reader's own clock when the offset is not in
 * yet. Null if unreadable.
 */
function formatAt(at: string, utcOffsetSeconds: number | null, opts: Intl.DateTimeFormatOptions): string | null {
  const ms = Date.parse(at)
  if (!Number.isFinite(ms)) return null
  return utcOffsetSeconds === null
    ? new Intl.DateTimeFormat('en-US', opts).format(ms)
    : new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(ms + utcOffsetSeconds * 1000)
}

/** `1:00 PM` on the crag's clock. */
export function readingClock(at: string, utcOffsetSeconds: number | null): string | null {
  return formatAt(at, utcOffsetSeconds, { hour: 'numeric', minute: '2-digit' })
}

/** The spot's word for a state: what the line says, not what the river is doing. */
export function spotWord(state: RiverState): string {
  switch (state.kind) {
    case 'reachable':
      return 'At or under the line'
    case 'high':
      return 'Above the line'
    case 'stale':
      return 'No recent reading'
    case 'unavailable':
      return 'No reading'
  }
}

/** `Falling 0.09 ft` over the last day; null when the points do not cover one. */
export function changeLine(reading: Pick<RiverGaugeReading, 'points'>): string | null {
  const change = riverChangeFt(reading.points)
  if (change === null) return null
  if (change === 0) return 'Steady over 24 h'
  return `${change < 0 ? 'Falling' : 'Rising'} ${Math.abs(change).toFixed(2)} ft over 24 h`
}

/**
 * Whether the Overview shows this gauge (owner, 2026-11-09: only when the
 * river is above the line). **A missing or old reading shows too**, because
 * silence there would read as "low enough".
 */
export function overviewShows(state: RiverState): boolean {
  return state.kind !== 'reachable'
}

/** The Overview's one line for a gauge: label and value. */
export function overviewLine(
  reading: RiverGaugeReading,
  nowMs: number,
  utcOffsetSeconds: number | null = null,
): { label: string; value: string } {
  const state = riverState(reading, nowMs)
  const line = formatFt(reading.reachable_at_or_below_ft)
  const label = reading.spot
  switch (state.kind) {
    case 'high':
      return { label, value: `River ${formatFt(state.height_ft)}, above the ${line} line` }
    case 'reachable':
      // Never on the Overview (`overviewShows`); worded truthfully all the same.
      return { label, value: `River ${formatFt(state.height_ft)}, at or under the ${line} line` }
    case 'stale':
      return { label, value: `No river reading since ${readingDay(state.at, utcOffsetSeconds)}` }
    case 'unavailable':
      return { label, value: 'No river reading from USGS' }
  }
}

function readingDay(at: string, utcOffsetSeconds: number | null): string {
  return formatAt(at, utcOffsetSeconds, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) ?? 'an unknown time'
}
