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

/**
 * `Falling 0.09 ft in 25 h`; null when no point sits near a day back
 * (`riverChangeFt`). **The hours are measured from the points**, not the span
 * asked for, so a reading posted late says so.
 */
export function changeLine(reading: Pick<RiverGaugeReading, 'points'>): string | null {
  const change = riverChangeFt(reading.points)
  const latest = reading.points.at(-1)
  if (change === null || latest === undefined) return null
  const hours = Math.round((Date.parse(latest.at) - Date.parse(change.from_at)) / 3_600_000)
  if (change.change_ft === 0) return `Steady in ${hours} h`
  return `${change.change_ft < 0 ? 'Falling' : 'Rising'} ${Math.abs(change.change_ft).toFixed(2)} ft in ${hours} h`
}

/** The River tab's status word (#589): what the line says, in two words. */
export function riverTabWord(state: RiverState): string {
  switch (state.kind) {
    case 'reachable':
      return 'Low enough'
    case 'high':
      return 'Too high'
    case 'stale':
      return 'No recent reading'
    case 'unavailable':
      return 'No reading'
  }
}

/** Worst first: the tab speaks for the gauge a reader would act on. */
const STATE_RANK: Record<RiverState['kind'], number> = { high: 0, unavailable: 1, stale: 2, reachable: 3 }

/** The state the River tab's word reads, when a crag has more than one gauge: the worst. Null for none. */
export function worstRiverState(states: readonly RiverState[]): RiverState | null {
  return [...states].sort((a, b) => STATE_RANK[a.kind] - STATE_RANK[b.kind])[0] ?? null
}

/**
 * The spot's line under the River tab's figure (#589 mockup): `Beach boulder
 * is reachable` or `Too high for the Beach boulder`, with the line beside it.
 * A stale or missing reading says no reading, never which side of the line.
 */
export function spotLine(reading: Pick<RiverGaugeReading, 'boulder' | 'reachable_at_or_below_ft'>, state: RiverState): { word: string; line: string } {
  const line = `your line is ${formatFt(reading.reachable_at_or_below_ft)}`
  switch (state.kind) {
    case 'reachable':
      return { word: `${reading.boulder} is reachable`, line }
    case 'high':
      return { word: `Too high for the ${reading.boulder}`, line }
    case 'stale':
    case 'unavailable':
      return { word: 'No recent reading', line }
  }
}

/** `Nov 11, 2:00 PM` on the crag's clock, for a reading too old to stand for now. */
export function readingWhen(at: string, utcOffsetSeconds: number | null): string | null {
  return formatAt(at, utcOffsetSeconds, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
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
