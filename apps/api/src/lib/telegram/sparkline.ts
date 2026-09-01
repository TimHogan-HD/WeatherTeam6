/**
 * The Unicode-block agreement bar.
 *
 * **Pure**, and deliberately not an image, an API feature or a dependency:
 * meteoblue encodes model agreement as bar density and eight block characters
 * carry the same information inside a `<pre>` block that every Telegram client
 * already renders.
 *
 * The one thing it must never do is draw a bar for a value it does not have.
 * A missing hour is a different fact from a zero one — a flat row of `▁` across
 * a model's horizon would read as "no chance of rain" for hours nobody forecast.
 */

/** Eight levels, lowest first. Indexed as characters so no lookup can be `undefined`. */
const BLOCKS = '▁▂▃▄▅▆▇█'
const LEVELS = BLOCKS.length

/** What a missing value draws. Visibly not a bar, and the legend names it. */
export const SPARK_GAP = '·'

/**
 * One character per value, scaled against `max`.
 *
 * Zero and "no data" are different characters on purpose. Anything above `max`
 * clamps to the tallest block rather than wrapping around, and a `max` of zero
 * or less draws every present value at the lowest block — there is no scale to
 * spread them over, and inventing one would exaggerate noise into a shape.
 */
export function sparkline(values: readonly (number | null)[], max: number): string {
  return values
    .map((value) => {
      if (value === null || !Number.isFinite(value)) return SPARK_GAP
      if (value <= 0 || max <= 0) return BLOCKS.charAt(0)
      const level = Math.ceil((value / max) * LEVELS)
      return BLOCKS.charAt(Math.min(LEVELS, Math.max(1, level)) - 1)
    })
    .join('')
}
