import { EM_DASH, type HourlySample } from '@weatherteam6/types'
import { HOUR_MS } from './hourlySeries.js'

/**
 * The rain charts read in blocks of hours (owner, 2026-10-30, mockup version 1
 * of the rain charts): one column of inches and one chance per block, so both
 * figures can be printed without crowding. Hourly's one day goes in threes, the
 * Precip tab's 48 hours in sixes, eight blocks either way.
 *
 * **Only the mean is added up.** `precip_mm_mean` is the one precipitation
 * figure that sums; a percentile never does, and neither does a chance, so a
 * block's chance is its likeliest hour, never a combined probability.
 */
export type RainBlock = {
  /** The instants (`valid_at`, epoch ms) the block reads, in order. */
  instants: number[]
  /** Where its rain starts: an hour is stamped at its end, so the first hour began one hour before its stamp. */
  fromMs: number
  /** Its last stamp, where its rain ends. */
  toMs: number
  /** The location's date of its first hour. */
  localDate: string
  /** The sum of each hour's ensemble mean, in mm; null when any hour's is unread. */
  totalMm: number | null
  /** The most likely hour's chance, in percent; null when any hour's is unread. */
  chancePct: number | null
}

/** Hours to a block: three for one day, six for anything longer. */
export function rainBlockHours(hours: readonly HourlySample[]): 3 | 6 {
  return hours.length > 24 ? 6 : 3
}

/**
 * The hours in consecutive blocks of `rainBlockHours`, from the first. **A gap
 * withholds the block's figure** rather than adding up the hours that were
 * read: the missing hour could be the wet one.
 */
export function rainBlocks(hours: readonly HourlySample[]): RainBlock[] {
  const size = rainBlockHours(hours)
  const readable = hours
    .map((h) => ({ h, t: Date.parse(h.valid_at) }))
    .filter(({ t }) => Number.isFinite(t))
  const blocks: RainBlock[] = []
  for (let i = 0; i < readable.length; i += size) {
    const run = readable.slice(i, i + size)
    const first = run[0]
    const last = run[run.length - 1]
    if (first === undefined || last === undefined) continue
    const means = run.map(({ h }) => h.precip_mm_mean ?? null)
    const chances = run.map(({ h }) => h.precip_chance_pct ?? null)
    blocks.push({
      instants: run.map(({ t }) => t),
      fromMs: first.t - HOUR_MS,
      toMs: last.t,
      localDate: first.h.local_date,
      totalMm: means.some((v) => v === null) ? null : means.reduce<number>((sum, v) => sum + (v ?? 0), 0),
      chancePct: chances.some((v) => v === null) ? null : Math.max(...chances.map((v) => v ?? 0)),
    })
  }
  return blocks
}

/** The block that reads this instant, or null. */
export function blockAt(blocks: readonly RainBlock[], ms: number | null): RainBlock | null {
  if (ms === null) return null
  return blocks.find((b) => b.instants.includes(ms)) ?? null
}

const MM_PER_IN = 25.4

/**
 * The top of the inch scale: the smallest step that holds the wettest block,
 * and never under `floorIn`, so a trace never draws a downpour's shape.
 */
export function rainTopIn(maxIn: number, floorIn: number): number {
  if (maxIn <= floorIn) return floorIn
  return [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.2, 1.6, 2, 3, 4].find((s) => s >= maxIn) ?? Math.ceil(maxIn)
}

/** The least the scale may span for blocks of this many hours: 0.2 in for threes, 0.4 in for sixes. */
export function rainFloorIn(blockHours: 3 | 6): number {
  return blockHours === 6 ? 0.4 : 0.2
}

export const mmToIn = (mm: number): number => mm / MM_PER_IN

/**
 * A block's total as a column label: `0`, `tr` under a hundredth, else `.12"`
 * or `1.2"`. Compact because eight sit across one chart.
 */
export function columnInches(mm: number | null): string {
  if (mm === null) return EM_DASH
  if (mm === 0) return '0'
  const inches = mmToIn(mm)
  if (inches < 0.01) return 'tr'
  return inches < 0.995 ? `${inches.toFixed(2).replace(/^0/, '')}"` : `${inches.toFixed(1)}"`
}

/** A scale figure in inches: `0`, `.2"`, `.05"`, `1"`, `1.2"`. */
export function scaleInches(inches: number): string {
  if (inches === 0) return '0'
  if (inches >= 1) return Number.isInteger(inches) ? `${inches}"` : `${inches.toFixed(1)}"`
  return `${inches.toFixed(2).replace(/^0/, '').replace(/0$/, '')}"`
}
