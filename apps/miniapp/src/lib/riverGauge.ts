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

/** `Climbable at 4.95 ft or lower`: the line, said as what it means for the problem. */
export function climbableLine(lineFt: number): string {
  return `Climbable at ${formatFt(lineFt)} or lower`
}

/** The spot's word for a state: what the line says, not what the river is doing. */
export function spotWord(state: RiverState): string {
  switch (state.kind) {
    case 'reachable':
      return 'Low enough to climb'
    case 'high':
      return 'Too high to climb'
    case 'stale':
      return 'No recent reading'
    case 'unavailable':
      return 'No reading'
  }
}

/**
 * `Falling 0.09 ft over 25 h`; null when the points do not cover most of a
 * day. **The hours are measured from the points**, not the window asked for:
 * USGS's posting lag and any gap move the span between 18 and 26 h.
 */
export function changeLine(reading: Pick<RiverGaugeReading, 'points'>): string | null {
  const change = riverChangeFt(reading.points)
  const first = reading.points[0]
  const latest = reading.points.at(-1)
  if (change === null || first === undefined || latest === undefined) return null
  const hours = Math.round((Date.parse(latest.at) - Date.parse(first.at)) / 3_600_000)
  if (change === 0) return `Steady over ${hours} h`
  return `${change < 0 ? 'Falling' : 'Rising'} ${Math.abs(change).toFixed(2)} ft over ${hours} h`
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
  const label = reading.spot
  const climbable = climbableLine(reading.reachable_at_or_below_ft).toLowerCase()
  switch (state.kind) {
    case 'high':
      return { label, value: `Too high: river ${formatFt(state.height_ft)}, ${climbable}` }
    case 'reachable':
      // Never on the Overview (`overviewShows`); worded truthfully all the same.
      return { label, value: `Low enough: river ${formatFt(state.height_ft)}, ${climbable}` }
    case 'stale':
      return { label, value: `No river reading since ${readingDay(state.at, utcOffsetSeconds)}` }
    case 'unavailable':
      return { label, value: 'No river reading from USGS' }
  }
}

function readingDay(at: string, utcOffsetSeconds: number | null): string {
  return formatAt(at, utcOffsetSeconds, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) ?? 'an unknown time'
}
