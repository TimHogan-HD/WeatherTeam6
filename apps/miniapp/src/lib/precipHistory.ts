import type { RecentPrecip, RecentPrecipHour } from '@weatherteam6/types'

/**
 * What the Precip tab says about the days just past, from `/recent-precip`:
 * the window's total, when it last fell, the wettest hour, the events, and a
 * total per local day. Pure, so every rule here is reachable by a test.
 *
 * **Every figure is a model estimate.** Open-Meteo's past hours are its own
 * analysis, not a gauge, so nothing here is called "observed" and nothing
 * claims a confidence, a storm track or an uncertainty the response does not
 * carry — the Figma frame's "gauge conf.", "±" and "W→E" are left out for that
 * reason.
 */

/** Rain, snow, or both in the same event or day. */
export type PrecipKind = 'rain' | 'snow' | 'mix'

const HOUR_MS = 60 * 60 * 1000

/**
 * AMS rainfall-rate classes, in mm per hour: light below 2.5, heavy above 7.6.
 * Applied to an event's wettest hour, which is what a climber means by "it
 * poured".
 */
const LIGHT_BELOW_MM_H = 2.5
const HEAVY_ABOVE_MM_H = 7.6

/**
 * How many dry hours may sit inside one event. One: a single dry hour in a
 * storm is a lull, and splitting there lists one afternoon as two events.
 * Presentation only — nothing downstream reads an event.
 */
const MAX_LULL_HOURS = 1

/** `YYYY-MM-DDTHH:mm` local, as a sortable number. The `Z` is a device, not a claim about UTC. */
function localMs(validAtLocal: string): number {
  return Date.parse(`${validAtLocal}Z`)
}

function isWet(h: RecentPrecipHour): boolean {
  return h.precip_mm > 0
}

/**
 * One wet hour's kind, or `null` when the response cannot say. **Unknown is
 * never rain**: an older API sends no `rain_mm`/`snowfall_cm`, and a pill
 * reading RAIN over snow is the attribution defect this repo keeps shipping.
 */
function hourKind(h: RecentPrecipHour): PrecipKind | null {
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

/** Snow depth over a set of hours, or `null` when any hour's snow is unknown. */
function snowCm(hours: readonly RecentPrecipHour[]): number | null {
  let total = 0
  for (const h of hours) {
    const s = h.snowfall_cm ?? null
    if (s === null) return null
    total += s
  }
  return total
}

export type Intensity = 'Light' | 'Moderate' | 'Heavy'

export function intensityOf(peakMmPerHour: number): Intensity {
  if (peakMmPerHour < LIGHT_BELOW_MM_H) return 'Light'
  if (peakMmPerHour > HEAVY_ABOVE_MM_H) return 'Heavy'
  return 'Moderate'
}

export type PrecipEvent = {
  /** Local `YYYY-MM-DDTHH:mm`. The first wet hour's stamp less one hour — a stamp closes the hour it describes. */
  startLocal: string
  /** Local stamp of the last wet hour: the precipitation had ended by then. */
  endLocal: string
  totalMm: number
  peakMmPerHour: number
  wetHours: number
  kind: PrecipKind | null
  /** Snow depth in cm; `null` when unknown, `0` for a rain-only event. */
  snowCm: number | null
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
      return {
        startLocal: new Date(localMs(first.valid_at_local) - HOUR_MS).toISOString().slice(0, 16),
        endLocal: last.valid_at_local,
        totalMm: g.reduce((sum, h) => sum + h.precip_mm, 0),
        peakMmPerHour: Math.max(...g.map((h) => h.precip_mm)),
        wetHours: g.length,
        kind: combinedKind(g),
        snowCm: snowCm(g),
      }
    })
    .reverse()
}

export type PrecipDay = {
  localDate: string
  /** `null` when the response held no hours for this date — a gap, not a dry day. */
  totalMm: number | null
  kind: PrecipKind | null
}

/**
 * One entry per local date from the window's first hour to its last, **gaps
 * included**. A date the response skipped is `totalMm: null`, never `0`: a
 * dry-looking bar over a day nobody reported is defect class 1.
 */
export function precipDays(hours: readonly RecentPrecipHour[]): PrecipDay[] {
  const first = hours[0]
  const last = hours[hours.length - 1]
  if (first === undefined || last === undefined) return []

  const byDate = new Map<string, RecentPrecipHour[]>()
  for (const h of hours) {
    const date = h.valid_at_local.slice(0, 10)
    const list = byDate.get(date)
    if (list === undefined) byDate.set(date, [h])
    else list.push(h)
  }

  const days: PrecipDay[] = []
  const end = Date.parse(`${last.valid_at_local.slice(0, 10)}T00:00Z`)
  for (let t = Date.parse(`${first.valid_at_local.slice(0, 10)}T00:00Z`); t <= end; t += 24 * HOUR_MS) {
    const date = new Date(t).toISOString().slice(0, 10)
    const list = byDate.get(date)
    days.push(
      list === undefined
        ? { localDate: date, totalMm: null, kind: null }
        : { localDate: date, totalMm: list.reduce((s, h) => s + h.precip_mm, 0), kind: combinedKind(list) },
    )
  }
  return days
}

export type PrecipSummary = {
  totalMm: number
  wetHours: number
  /** The last wet hour, or `null` when nothing fell in the window. */
  lastWet: RecentPrecipHour | null
  /** Whole hours from the end of the last wet hour to now, on the location's clock. */
  hoursSinceLast: number | null
  wettest: RecentPrecipHour | null
  /** The newest hour in the window — what "ending" names. */
  endingLocal: string | null
}

export function precipSummary(recent: RecentPrecip, nowMs: number): PrecipSummary {
  const hours = recent.hours
  let lastWet: RecentPrecipHour | null = null
  let wettest: RecentPrecipHour | null = null
  let totalMm = 0
  let wetHours = 0
  for (const h of hours) {
    totalMm += h.precip_mm
    if (!isWet(h)) continue
    wetHours += 1
    lastWet = h
    if (wettest === null || h.precip_mm > wettest.precip_mm) wettest = h
  }

  // The stamps are the location's wall clock; so is this, shifted by the
  // response's own offset (issue #33) — never the viewer's timezone.
  const offset = Number.isFinite(recent.utc_offset_seconds) ? recent.utc_offset_seconds : 0
  const localNow = nowMs + offset * 1000
  const hoursSinceLast =
    lastWet === null ? null : Math.max(0, Math.floor((localNow - localMs(lastWet.valid_at_local)) / HOUR_MS))

  return {
    totalMm,
    wetHours,
    lastWet,
    hoursSinceLast,
    wettest,
    endingLocal: hours[hours.length - 1]?.valid_at_local ?? null,
  }
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

/** `Tue 19:00–21:00`, or `Sat 23:00–Sun 02:00` across midnight. */
export function eventSpan(event: PrecipEvent): string {
  const startDay = event.startLocal.slice(0, 10)
  const endDay = event.endLocal.slice(0, 10)
  const start = `${weekdayOf(startDay)} ${clockOf(event.startLocal)}`
  const end = startDay === endDay ? clockOf(event.endLocal) : `${weekdayOf(endDay)} ${clockOf(event.endLocal)}`
  return `${start}–${end}`
}
