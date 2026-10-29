/**
 * **A reader's own settings** — scoring Phase 5 (owner decision 2026-10-01):
 * the temperature range friction is judged against, and the tab a crag opens
 * on. One row per account; every field null means "the app's default".
 */
import { clock12 } from './clock.js'

/** The crag screen's tabs, in order. The client's `DetailTab` is this union. */
export const DETAIL_TABS = ['overview', 'daily', 'hourly', 'precip', 'rock', 'crag'] as const
export type DetailTabKey = (typeof DETAIL_TABS)[number]

export function isDetailTab(v: unknown): v is DetailTabKey {
  return typeof v === 'string' && (DETAIL_TABS as readonly string[]).includes(v)
}

/**
 * **Crag A's own range, °F: friction starts falling below 30 and above 60**
 * (`cragModel.ts` derives `COLD_START_C` and `HEAT_START_C` from this, so the
 * default and the model cannot disagree). Both are judgement calls (#143).
 */
export const TEMP_RANGE_DEFAULT_F = { low: 30, high: 60 } as const

/**
 * How far a reader may move each end, °F, and the narrowest range allowed.
 * Judgement calls: wide enough for a winter boulderer and a desert sport
 * climber, narrow enough that "Friction: Great" still means something.
 */
export const TEMP_RANGE_LIMITS_F = { lowMin: 0, lowMax: 50, highMin: 40, highMax: 85, minGap: 10 } as const

export const fToC = (f: number): number => ((f - 32) * 5) / 9

export type Preferences = {
  /** Air temperature, °C, below which friction starts to fall. Null: the default (30 °F). */
  temp_low_c: number | null
  /** Air temperature, °C, above which friction starts to fall. Null: the default (60 °F). */
  temp_high_c: number | null
  /** The tab a crag opens on. Null: Overview. */
  default_tab: DetailTabKey | null
  /** First local hour (0-23) the reader climbs, included. Null: the default (8 am). */
  climb_first_hour: number | null
  /** Last local hour (0-23) the reader climbs, included. Null: the default (6 pm). */
  climb_last_hour: number | null
}

/** No row yet reads exactly like a row of nulls. */
export const DEFAULT_PREFERENCES: Preferences = {
  temp_low_c: null,
  temp_high_c: null,
  default_tab: null,
  climb_first_hour: null,
  climb_last_hour: null,
}

/**
 * The body of `PUT /api/v1/preferences`. An absent field is left alone and
 * **null resets it to the default**; an unknown key is a 400.
 */
export type UpdatePreferencesInput = Partial<Preferences>

/** The range the score uses, °C — the reader's, or the default for any end they left unset. */
export function effectiveTempRangeC(p: Pick<Preferences, 'temp_low_c' | 'temp_high_c'>): {
  lowC: number
  highC: number
} {
  return {
    lowC: p.temp_low_c ?? fToC(TEMP_RANGE_DEFAULT_F.low),
    highC: p.temp_high_c ?? fToC(TEMP_RANGE_DEFAULT_F.high),
  }
}

/**
 * **The local hours a day's score is read from** (#401), both included. A day
 * is worth the worst hour of its best three-hour run inside them, so a good
 * morning does not carry the day for someone who climbs in the afternoon. The
 * default is the window the score always used.
 */
export const CLIMB_HOURS_DEFAULT = { first: 8, last: 18 } as const

/** Three hours, first and last included: the narrowest window that holds one run. */
export const CLIMB_HOURS_MIN_SPAN = 3

export type ClimbHours = { first: number; last: number }

/** The window the score uses — the reader's, or the default for any end they left unset. */
export function effectiveClimbHours(p: Pick<Preferences, 'climb_first_hour' | 'climb_last_hour'>): ClimbHours {
  return {
    first: p.climb_first_hour ?? CLIMB_HOURS_DEFAULT.first,
    last: p.climb_last_hour ?? CLIMB_HOURS_DEFAULT.last,
  }
}

/** Whole local hours inside one day, wide enough to hold one three-hour run. */
export function isClimbHours(h: ClimbHours): boolean {
  return (
    Number.isInteger(h.first) &&
    Number.isInteger(h.last) &&
    h.first >= 0 &&
    h.last <= 23 &&
    h.last - h.first + 1 >= CLIMB_HOURS_MIN_SPAN
  )
}

/** `8 am`, `12 pm`, `6 pm`. */
export function hourLabel(hour: number): string {
  return clock12(hour, 'spaced')
}

/** `8 am – 6 pm`. */
export function climbHoursLabel(h: ClimbHours): string {
  return `${hourLabel(h.first)} – ${hourLabel(h.last)}`
}
