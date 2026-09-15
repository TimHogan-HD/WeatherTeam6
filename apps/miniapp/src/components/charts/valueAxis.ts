import { cToF, kmhToMph, mmToIn } from '@weatherteam6/types'

/**
 * How a chart's value axis is labelled.
 *
 * **Gridlines have to be round in the unit the reader sees**, and the series is
 * carried in canonical metric units. 10 °C and 15 °C are round; the reader sees
 * 50°F and 59°F, which are not numbers anyone estimates against. So the ticks
 * are chosen in *display* space and positioned there too.
 *
 * Positioning in display space needs no inverse conversion, because every unit
 * this app converts is affine — °C→°F, km/h→mph, mm→in. A linear scale over the
 * converted domain lands each tick in exactly the place the canonical scale
 * would. A non-affine unit would need more than this and does not exist here.
 *
 * `write` is deliberately not the shared `formatValue`: those formatters take a
 * canonical value and several have display rules an axis must not inherit —
 * `formatPrecipIn` writes "trace" below 0.01 in, which is a sentence about a
 * measurement, not a gridline.
 */
export type ValueAxis = {
  toDisplay: (canonical: number) => number
  write: (display: number) => string
}

/** Canonical units are already what the reader sees — chance of rain, a percent. */
export const identityAxis = (unit: string): ValueAxis => ({
  toDisplay: (v) => v,
  write: (v) => `${Math.round(v)}${unit}`,
})

export const tempAxis: ValueAxis = {
  toDisplay: cToF,
  write: (f) => `${Math.round(f)}°F`,
}

export const windAxis: ValueAxis = {
  toDisplay: kmhToMph,
  write: (mph) => `${Math.round(mph)} mph`,
}

/**
 * Rain, in inches.
 *
 * Two decimals, and **no "trace"**: an axis tick is a position on a scale, and
 * a word there cannot be read against a bar. A whole zero stays "0 in" so the
 * floor is unmistakable.
 */
export const rainAxis: ValueAxis = {
  toDisplay: mmToIn,
  write: (inches) => (inches === 0 ? '0 in' : `${inches.toFixed(2)} in`),
}
