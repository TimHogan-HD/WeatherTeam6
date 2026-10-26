import { SCORE_MODEL_FACTS } from './readingsCopy.js'

/**
 * What radar says is falling at a place now (#313, owner 2026-10-26): the list
 * card's pill and the Overview hero's. Words come from the standard rate bands;
 * the 0.02 in/hr line that zeroes the score decides "Drizzle" from "Raining".
 * No rate, or nothing falling, says nothing — a missing frame is never "dry".
 */

const MM_PER_IN = 25.4

/** A radar frame older than this is not "now": the API withholds it, and so does a screen left open. */
export const RAIN_NOW_MAX_AGE_MS = 15 * 60_000

/** Whether a frame is still "now". An unreadable time is not. */
export function rainNowIsCurrent(validAt: string, nowMs: number): boolean {
  const t = Date.parse(validAt)
  return Number.isFinite(t) && nowMs - t <= RAIN_NOW_MAX_AGE_MS
}

/** Upper edge of each intensity band, in inches an hour, inclusive. */
export const RAIN_RATE_BANDS_IN_PER_HOUR = { light: 0.1, moderate: 0.3 } as const

export type RainNowKind = 'Drizzle' | 'Light' | 'Moderate' | 'Heavy'

export function rainNowKind(rateMmH: number | null): RainNowKind | null {
  if (rateMmH === null || !Number.isFinite(rateMmH) || rateMmH <= 0) return null
  const inH = rateMmH / MM_PER_IN
  if (inH < SCORE_MODEL_FACTS.fallingRainInPerHour) return 'Drizzle'
  if (inH <= RAIN_RATE_BANDS_IN_PER_HOUR.light) return 'Light'
  if (inH <= RAIN_RATE_BANDS_IN_PER_HOUR.moderate) return 'Moderate'
  return 'Heavy'
}

/** `0.11 in/hr`; under a hundredth reads `under 0.01 in/hr`, never `0.00`. */
export function formatRainRate(rateMmH: number): string {
  const inH = rateMmH / MM_PER_IN
  return inH < 0.005 ? 'under 0.01 in/hr' : `${inH.toFixed(2)} in/hr`
}

/** The frame's time at the place: `4:18pm`. */
export function formatRadarTime(validAt: string, utcOffsetSeconds: number): string | null {
  const t = Date.parse(validAt)
  if (!Number.isFinite(t) || !Number.isFinite(utcOffsetSeconds)) return null
  const local = new Date(t + utcOffsetSeconds * 1000)
  const h24 = local.getUTCHours()
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(local.getUTCMinutes()).padStart(2, '0')}${h24 < 12 ? 'am' : 'pm'}`
}

export type RainNowInput = {
  rateMmH: number | null
  validAt: string
  /** The place's offset; null leaves the radar time off rather than guessing a zone. */
  utcOffsetSeconds: number | null
}

function radarPart(input: RainNowInput): string | null {
  const at = input.utcOffsetSeconds === null ? null : formatRadarTime(input.validAt, input.utcOffsetSeconds)
  return at === null ? null : `radar ${at}`
}

/** The list card's pill: `Raining · moderate · radar 4:18pm`, `Drizzle · radar 4:18pm`. */
export function rainNowCardText(input: RainNowInput): string | null {
  const kind = rainNowKind(input.rateMmH)
  if (kind === null) return null
  const head = kind === 'Drizzle' ? 'Drizzle' : `Raining · ${kind.toLowerCase()}`
  return [head, radarPart(input)].filter((s) => s !== null).join(' · ')
}

/** The hero's pill: `Raining now · moderate, 0.11 in/hr · radar 4:18pm`, `Drizzle now · under 0.01 in/hr · …`. */
export function rainNowHeroText(input: RainNowInput): string | null {
  const kind = rainNowKind(input.rateMmH)
  if (kind === null || input.rateMmH === null) return null
  const rate = formatRainRate(input.rateMmH)
  const head = kind === 'Drizzle' ? `Drizzle now · ${rate}` : `Raining now · ${kind.toLowerCase()}, ${rate}`
  return [head, radarPart(input)].filter((s) => s !== null).join(' · ')
}
