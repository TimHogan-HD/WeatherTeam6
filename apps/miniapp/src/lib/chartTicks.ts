/**
 * A chart's labelled gridlines, in the units on its labels (°F, mph).
 *
 * The span is widened out to whole steps, so **the top gridline sits at or
 * above every value drawn** and the bottom one at or below. Before this, the
 * ticks stopped at the last whole step inside the data, and a gust or a
 * high could run past the top label (owner, 2026-10-20). Steps are 1, 2 or 5
 * times a power of ten, and never under 1: the labels are whole numbers.
 * The top keeps a fiftieth of the span clear above the highest value, room
 * for the line's stroke and a smoothed peak's overshoot, without spending a
 * whole step on headroom.
 */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  hi += (hi - lo) / 50
  const raw = Math.max(1, (hi - lo) / count)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  let v = Math.floor(lo / step) * step
  const ticks = [v]
  // At least two, so a flat day still has a span to draw on.
  while (v < hi || ticks.length < 2) {
    v += step
    ticks.push(v)
  }
  return ticks
}

/**
 * The top of the rain chart's chance axis: the smallest of 10, 20, 50 and 100%
 * at or above the day's highest chance, so a 2% hour is a column you can see
 * against a labelled 10% line rather than a hairline on a 0–100% axis (owner,
 * 2026-10-20). `null` (no chance read) keeps 100.
 */
export function chanceAxisTop(maxChancePct: number | null): number {
  if (maxChancePct === null) return 100
  return [10, 20, 50, 100].find((t) => maxChancePct <= t) ?? 100
}
