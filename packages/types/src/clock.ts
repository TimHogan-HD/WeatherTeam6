/**
 * The 12-hour clock, written once. Surfaces print it in four styles, chosen by
 * how the label is read: an axis tick is scanned (`3p`), a sentence reads
 * words (`3pm`, `3 pm`), a chart's read-out names the hour (`3 PM`).
 */

/** How the half of the day is marked: `3p`, `3pm`, `3 pm`, `3 PM`. */
export type ClockStyle = 'tick' | 'compact' | 'spaced' | 'upper'

const MERIDIEM: Record<ClockStyle, readonly [am: string, pm: string]> = {
  tick: ['a', 'p'],
  compact: ['am', 'pm'],
  spaced: [' am', ' pm'],
  upper: [' AM', ' PM'],
}

/** Hour 0–23 on the 12-hour dial: 0 and 12 are `12`, 15 is `3`. */
export function hour12(hour: number): number {
  return hour % 12 === 0 ? 12 : hour % 12
}

/** `am` or `pm` for hour 0–23, in the given style. */
export function meridiem(hour: number, style: ClockStyle): string {
  const [am, pm] = MERIDIEM[style]
  return hour < 12 ? am : pm
}

/** Hour 0–23 as a 12-hour label: `clock12(15, 'compact')` is `3pm`. */
export function clock12(hour: number, style: ClockStyle): string {
  return `${hour12(hour)}${meridiem(hour, style)}`
}
