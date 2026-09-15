/**
 * Pure geometry for the hourly charts — no React, no DOM, no tokens.
 *
 * Everything that decides *where a mark lands* lives here so it can be tested
 * directly. A wrong coordinate is invisible on screen in the worst way: an
 * `M NaN,NaN` path renders nothing at all and throws nothing, so a chart that
 * silently stops drawing looks exactly like a location with no data.
 */

/** An inclusive index range into a series. */
export type Run = { start: number; end: number }

export type Extent = { min: number; max: number }

export type Point = { x: number; y: number }

export type Scale = (value: number) => number

/**
 * Runs of indices that are both present and adjacent.
 *
 * **Two different things break a series here and both are real gaps.** A null
 * value means the model did not reach that hour — Open-Meteo pads every model's
 * arrays out to the longest horizon in the request, so hours past a model's own
 * reach arrive full of nulls. A *missing row* means the hour carried no values
 * at all and was never stored (architecture rule), which leaves a hole in time
 * between two rows that are themselves fine.
 *
 * Joining across either draws a straight line through weather nobody forecast.
 */
export function contiguousRuns(
  count: number,
  isDefined: (index: number) => boolean,
  isAdjacent: (previous: number, index: number) => boolean,
): Run[] {
  const runs: Run[] = []
  let current: Run | null = null

  for (let i = 0; i < count; i += 1) {
    if (!isDefined(i)) {
      current = null
      continue
    }
    if (current !== null && isAdjacent(current.end, i)) {
      current.end = i
      continue
    }
    current = { start: i, end: i }
    runs.push(current)
  }

  return runs
}

/**
 * The smallest and largest finite value, or `null` when there is not one.
 *
 * **Non-finite values are skipped, not just nulls.** A single `NaN` in the
 * input would otherwise poison `min` and `max`, and every scale built from them
 * would return `NaN` for every point — one bad sample erasing the whole chart.
 */
export function extent(values: readonly (number | null)[]): Extent | null {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let seen = false

  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue
    seen = true
    if (value < min) min = value
    if (value > max) max = value
  }

  return seen ? { min, max } : null
}

/** The extent covering every input extent, ignoring the ones that are `null`. */
export function unionExtent(extents: readonly (Extent | null)[]): Extent | null {
  let out: Extent | null = null
  for (const e of extents) {
    if (e === null) continue
    out = out === null ? e : { min: Math.min(out.min, e.min), max: Math.max(out.max, e.max) }
  }
  return out
}

/**
 * Pads a domain so marks do not sit on the frame, and gives a flat series a
 * span of its own.
 *
 * A series whose values are all equal has `min === max`, which divides by zero
 * in `linearScale`. That is handled there as well; `minSpan` is what stops a
 * flat line being drawn along the very top of the box, where it reads as a
 * maximum rather than as "this value did not change".
 */
export function padExtent(e: Extent, fraction: number, minSpan: number): Extent {
  const span = e.max - e.min
  const pad = span === 0 ? minSpan / 2 : span * fraction
  return { min: e.min - pad, max: e.max + pad }
}

/**
 * Maps a domain onto a range. `rangeStart` may be greater than `rangeEnd` —
 * that is how a y-axis is inverted, since SVG's y grows downwards.
 *
 * A zero-width domain returns the middle of the range for every input rather
 * than `NaN`: a flat series must draw a flat line, not disappear.
 */
export function linearScale(domain: Extent, rangeStart: number, rangeEnd: number): Scale {
  const span = domain.max - domain.min
  if (span === 0) {
    const middle = (rangeStart + rangeEnd) / 2
    return () => middle
  }
  return (value) => rangeStart + ((value - domain.min) / span) * (rangeEnd - rangeStart)
}

/** Coordinates are rounded for the DOM's sake; 168 hours of full precision is noise. */
function round(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * An open path through the points, or `''` for fewer than two.
 *
 * **A one-point run draws nothing** — `M x,y` with no line command paints no
 * pixels, whatever the stroke. Callers render those as a dot instead; returning
 * `''` here is what makes that case visible to them rather than silently blank.
 */
export function linePath(points: readonly Point[]): string {
  if (points.length < 2) return ''
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)},${round(p.y)}`)
    .join(' ')
}

/**
 * A closed ribbon between two edges: along `upper`, back along `lower`.
 *
 * Both edges must be the same length and in the same x order — they come from
 * one run of indices, so they are.
 */
export function bandPath(upper: readonly Point[], lower: readonly Point[]): string {
  if (upper.length === 0 || upper.length !== lower.length) return ''
  const forward = upper.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)},${round(p.y)}`)
  const back = [...lower].reverse().map((p) => `L${round(p.x)},${round(p.y)}`)
  return `${forward.join(' ')} ${back.join(' ')} Z`
}

/**
 * Round values spanning a domain, for labelled gridlines.
 *
 * **Rounded, not evenly divided.** Slicing a domain into thirds gives ticks
 * like 51.7 / 59.3 / 66.9 — arithmetically even and useless to read a bar
 * against. A reader estimates a value by its distance from a round number, so
 * the step is snapped to 1, 2, 2.5 or 5 times a power of ten first.
 *
 * Returns only the ticks that actually fall inside the domain, so a narrow span
 * yields fewer than asked for rather than ticks drawn off the frame.
 */
export function niceTicks(domain: Extent, count: number): number[] {
  const span = domain.max - domain.min
  if (!Number.isFinite(span) || span <= 0 || count < 1) return []

  const rough = span / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalised = rough / magnitude
  // The conventional 1/2/5/10 breakpoints. A finer table (adding 2.5) makes the
  // *step* rounder but the labels worse — 2.5-degree gridlines are not numbers
  // anyone estimates against.
  const step = (normalised <= 1.5 ? 1 : normalised <= 3 ? 2 : normalised <= 7 ? 5 : 10) * magnitude

  const out: number[] = []
  // Start at the first step at or above the floor. `Math.ceil` on a value that
  // is already a multiple can land one step early through float error, so the
  // membership test below is what decides, not the starting point.
  for (let v = Math.ceil(domain.min / step) * step; v <= domain.max + step / 1e6; v += step) {
    // -0 prints as "-0" through a formatter; normalise it away.
    const value = v === 0 ? 0 : v
    if (value >= domain.min - step / 1e6) out.push(value)
  }
  return out
}
