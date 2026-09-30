import {
  REWETTING_PRECIP_MM,
  type HourlyReadings,
  type RecentPrecip,
  type RecentPrecipHour,
  type RockReading,
} from '@weatherteam6/types'

/**
 * The rock's state by local hour stamp, from `/hourly`'s readings: the history
 * before the window (`rock_history`) and the window's own hours. **`null` when
 * there is nothing to draw** — no readings yet, an older API without the
 * history, or a location the model does not read (a city, a gap) — so a
 * surface shows no rock at all rather than a row of "no reading".
 *
 * Keyed on the same `YYYY-MM-DDTHH:mm` local stamps the precipitation hours
 * carry: both come off Open-Meteo's hour axis, and the readings' UTC instants
 * are shifted by `/hourly`'s own offset (issue #33), never the viewer's.
 */
export function rockByStamp(
  readings: HourlyReadings | undefined,
  utcOffsetSeconds: number,
): ReadonlyMap<string, RockReading | null> | null {
  if (readings === undefined || readings.unavailable_reason !== null || readings.rock_history === undefined) {
    return null
  }
  const offset = Number.isFinite(utcOffsetSeconds) ? utcOffsetSeconds : 0
  const stamp = (iso: string) => new Date(Date.parse(iso) + offset * 1000).toISOString().slice(0, 16)
  const out = new Map<string, RockReading | null>()
  for (const h of readings.rock_history) out.set(stamp(h.valid_at), h.rock)
  for (const h of readings.hours) out.set(stamp(h.valid_at), h.rock)
  return out
}

/**
 * What the Precip tab says about the days just past, from `/recent-precip`:
 * when the last real rain ended, the window's total and wet hours, and every
 * hour laid out as a day-by-hour grid. Pure, so every rule here is reachable
 * by a test.
 *
 * **Every figure is a model estimate.** The past hours are the models' own
 * analysis, not a gauge, so nothing here is called "observed" and nothing
 * claims a confidence, a storm track or an uncertainty the response does not
 * carry.
 */

/** Rain, snow, or both in the same event or day. */
export type PrecipKind = 'rain' | 'snow' | 'mix'

const HOUR_MS = 60 * 60 * 1000

/**
 * How many dry hours may sit inside one event. One: a single dry hour in a
 * storm is a lull, and splitting there lists one afternoon as two events.
 */
const MAX_LULL_HOURS = 1

/** `YYYY-MM-DDTHH:mm` local, as a sortable number. The `Z` is a device, not a claim about UTC. */
function localMs(validAtLocal: string): number {
  return Date.parse(`${validAtLocal}Z`)
}

function isWet(h: RecentPrecipHour): boolean {
  return h.precip_mm > 0
}

/** Rain that restarts the drying clock — the same line `hourlyConditions` draws. */
export function isRealRain(h: RecentPrecipHour): boolean {
  return h.precip_mm >= REWETTING_PRECIP_MM
}

/**
 * One wet hour's kind, or `null` when the response cannot say. **Unknown is
 * never rain**: an older API sends no `rain_mm`/`snowfall_cm`, and calling snow
 * rain is the attribution defect this repo keeps shipping.
 */
export function hourKind(h: RecentPrecipHour): PrecipKind | null {
  const rain = h.rain_mm ?? null
  const snow = h.snowfall_cm ?? null
  if (rain === null || snow === null) return null
  if (snow > 0) return rain > 0 ? 'mix' : 'snow'
  return 'rain'
}

/** The kind of a set of wet hours: one unknown hour makes the whole set unknown. */
function combinedKind(hours: readonly RecentPrecipHour[]): PrecipKind | null {
  const kinds = new Set<PrecipKind>()
  for (const h of hours) {
    if (!isWet(h)) continue
    const k = hourKind(h)
    if (k === null) return null
    kinds.add(k)
  }
  if (kinds.size === 0) return null
  if (kinds.size === 1) return [...kinds][0] ?? null
  return 'mix'
}

export type PrecipEvent = {
  /** Local `YYYY-MM-DDTHH:mm`. The first wet hour's stamp less one hour — a stamp closes the hour it describes. */
  startLocal: string
  /** Local stamp of the last wet hour: the precipitation had ended by then. */
  endLocal: string
  totalMm: number
  /** Hours from start to end, lulls included. */
  spanHours: number
  kind: PrecipKind | null
}

/** Wet hours grouped into events, **newest first**. */
export function precipEvents(hours: readonly RecentPrecipHour[]): PrecipEvent[] {
  const groups: RecentPrecipHour[][] = []
  let current: RecentPrecipHour[] = []
  let lastWetMs: number | null = null

  for (const h of hours) {
    if (!isWet(h)) continue
    const at = localMs(h.valid_at_local)
    if (lastWetMs !== null && at - lastWetMs > (MAX_LULL_HOURS + 1) * HOUR_MS) {
      groups.push(current)
      current = []
    }
    current.push(h)
    lastWetMs = at
  }
  if (current.length > 0) groups.push(current)

  return groups
    .map((g) => {
      const first = g[0] as RecentPrecipHour
      const last = g[g.length - 1] as RecentPrecipHour
      const start = localMs(first.valid_at_local) - HOUR_MS
      return {
        startLocal: new Date(start).toISOString().slice(0, 16),
        endLocal: last.valid_at_local,
        totalMm: g.reduce((sum, h) => sum + h.precip_mm, 0),
        spanHours: Math.round((localMs(last.valid_at_local) - start) / HOUR_MS),
        kind: combinedKind(g),
      }
    })
    .reverse()
}

export type PrecipDay = {
  localDate: string
  /** `null` when the response held no hours for this date — a gap, not a dry day. */
  totalMm: number | null
}

/**
 * One entry per local date from the window's first hour to its last, **gaps
 * included**. A date the response skipped is `totalMm: null`, never `0`: a
 * dry-looking total over a day nobody reported is defect class 1.
 */
export function precipDays(hours: readonly RecentPrecipHour[]): PrecipDay[] {
  const first = hours[0]
  const last = hours[hours.length - 1]
  if (first === undefined || last === undefined) return []

  const byDate = new Map<string, number>()
  for (const h of hours) {
    const date = h.valid_at_local.slice(0, 10)
    byDate.set(date, (byDate.get(date) ?? 0) + h.precip_mm)
  }

  const days: PrecipDay[] = []
  const end = Date.parse(`${last.valid_at_local.slice(0, 10)}T00:00Z`)
  for (let t = Date.parse(`${first.valid_at_local.slice(0, 10)}T00:00Z`); t <= end; t += 24 * HOUR_MS) {
    const date = new Date(t).toISOString().slice(0, 10)
    days.push({ localDate: date, totalMm: byDate.get(date) ?? null })
  }
  return days
}

/**
 * One cell of the day-by-hour grid. `ahead` is an hour after the window's
 * newest stamp — today's hours still to come; `missing` is an hour inside the
 * window the response did not carry. Neither is a dry hour.
 */
export type HourCell =
  | { state: 'value'; hour: RecentPrecipHour }
  | { state: 'missing' }
  | { state: 'ahead' }

/** 24 cells per day in `days`, stamped `00:00`–`23:00` on that date. */
export function hourGrid(days: readonly PrecipDay[], hours: readonly RecentPrecipHour[]): HourCell[][] {
  const byStamp = new Map(hours.map((h) => [h.valid_at_local, h]))
  const newest = hours[hours.length - 1]?.valid_at_local ?? ''
  return days.map((d) =>
    Array.from({ length: 24 }, (_, i): HourCell => {
      const stamp = `${d.localDate}T${String(i).padStart(2, '0')}:00`
      const hour = byStamp.get(stamp)
      if (hour !== undefined) return { state: 'value', hour }
      return stamp > newest ? { state: 'ahead' } : { state: 'missing' }
    }),
  )
}

export type PrecipSummary = {
  totalMm: number
  wetHours: number
  /** The last hour at or above `REWETTING_PRECIP_MM`, or `null` when none fell in the window. */
  lastReal: RecentPrecipHour | null
  /** Whole hours from the end of that hour to now, on the location's clock. */
  hoursSinceReal: number | null
  /** The event the last real hour belongs to. */
  lastRealEvent: PrecipEvent | null
  /** Wet hours after the last real one — showers too light to restart the drying clock. */
  lighterSince: readonly RecentPrecipHour[]
  /** The newest hour in the window — what "to" names. */
  endingLocal: string | null
}

export function precipSummary(recent: RecentPrecip, nowMs: number): PrecipSummary {
  const hours = recent.hours
  let totalMm = 0
  let wetHours = 0
  let lastRealIndex = -1
  hours.forEach((h, i) => {
    totalMm += h.precip_mm
    if (isWet(h)) wetHours += 1
    if (isRealRain(h)) lastRealIndex = i
  })
  const lastReal = hours[lastRealIndex] ?? null

  // The stamps are the location's wall clock; so is this, shifted by the
  // response's own offset (issue #33) — never the viewer's timezone.
  const offset = Number.isFinite(recent.utc_offset_seconds) ? recent.utc_offset_seconds : 0
  const localNow = nowMs + offset * 1000
  const hoursSinceReal =
    lastReal === null ? null : Math.max(0, Math.floor((localNow - localMs(lastReal.valid_at_local)) / HOUR_MS))
  const lastRealEvent =
    lastReal === null
      ? null
      : (precipEvents(hours).find(
          (e) => e.startLocal < lastReal.valid_at_local && lastReal.valid_at_local <= e.endLocal,
        ) ?? null)

  return {
    totalMm,
    wetHours,
    lastReal,
    hoursSinceReal,
    lastRealEvent,
    lighterSince: hours.slice(lastRealIndex + 1).filter(isWet),
    endingLocal: hours[hours.length - 1]?.valid_at_local ?? null,
  }
}

export type RunningPoint = {
  validAtLocal: string
  /** Where this hour **ends**, in hours from the first day's local midnight. */
  at: number
  /** Everything that had fallen by the end of this hour. */
  totalMm: number
  /** The previous hour is missing from the response: the line must not be drawn solid across it. */
  gapBefore: boolean
}

/**
 * The window's running total, one point per hour. `spanHours` is the whole
 * days the grid draws, so the two cards line up day for day. A missing hour
 * adds nothing — and is flagged, because a flat line across it would claim a
 * dry hour nobody estimated.
 */
export function runningTotal(
  days: readonly PrecipDay[],
  hours: readonly RecentPrecipHour[],
): { points: RunningPoint[]; spanHours: number } {
  const first = days[0]
  if (first === undefined) return { points: [], spanHours: 0 }
  const startMs = Date.parse(`${first.localDate}T00:00Z`)
  let total = 0
  let prevAt: number | null = null
  const points = hours.map((h) => {
    total += h.precip_mm
    const at = (localMs(h.valid_at_local) - startMs) / HOUR_MS
    const gapBefore = prevAt !== null && at - prevAt > 1
    prevAt = at
    return { validAtLocal: h.valid_at_local, at, totalMm: total, gapBefore }
  })
  return { points, spanHours: days.length * 24 }
}

/** `12h`, or `2d 4h` from two days. */
export function formatSince(hours: number): string {
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/** `21:00`. */
export function clockOf(validAtLocal: string): string {
  return validAtLocal.slice(11, 16)
}

/** `Tue`, read from the date itself — never the viewer's timezone. */
export function weekdayOf(localDate: string): string {
  const t = Date.parse(`${localDate.slice(0, 10)}T00:00Z`)
  if (!Number.isFinite(t)) return localDate
  return new Date(t).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
}

/** `Today` on the location's own date, else `Tue`. */
export function dayLabel(localDate: string, today: string): string {
  return localDate.slice(0, 10) === today ? 'Today' : weekdayOf(localDate)
}
