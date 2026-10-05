/**
 * **The rain the drying clock reads: the hourly median of the four global
 * models**, not the thermal model's own precipitation (issue #209).
 *
 * `npm run compare:dryness` measured the choice against 17 ASOS rain gauges
 * over 90 days (re-run 2026-10-01, after three gauges stuck at zero were
 * dropped), each candidate driving the real Crag A clock against the clock
 * driven by the gauge. `gfs_seamless` alone, whose US hours are HRRR's, called
 * the rock dry during 56% of the daytime hours a gauge said it was still wet or
 * drying on quartzite and 41% on sandstone. The median of these four missed 25%
 * and 18%, and its worst gap to the best candidate on any rock type was the
 * smallest of all (0.046 Peirce). The price is more hours reading "drying" that
 * a gauge calls dry — the direction this model already chooses to be wrong in.
 *
 * **Global only.** HRRR and NBM stop at the US border, so a median including
 * them would be a different statistic at Kalymnos than at Red Rock. It would
 * also be worse: the median of all six missed 36% of wet quartzite hours and
 * 26-27% of wet sandstone and limestone hours, and scored per day (the app's
 * day score) it called more wet days dry than this one on every rock type.
 *
 * **Each model's rain is averaged over six hours first** (`RAIN_WINDOW`, issue
 * #324). A per-hour median keeps a shower only where the models agree on its
 * hour. Sandstone, 4 Oct 2026: three models forecast 4-10 mm the day before,
 * each in a different hour, and the median kept about 1 mm. The clock sizes the
 * drying window from the storm total, so it read Dry 100 on a wet day.
 * Averaging rather than summing keeps each storm's total. Scored per day (the
 * app's day score) against the same gauges at 0, 1 and 2 days' lead, it called
 * fewer wet days dry on every rock type at every lead. One day ahead, wet
 * quartzite days called dry went from 32% to 28%, sandstone from 20% to 16% and
 * limestone from 24% to 16%. The price is 1-4 points more dry days read as not
 * dry, and the combined score rose in 8 of 9 cells. A vote rule caught more wet
 * sandstone, at about 7 points more lost days.
 *
 * Irradiance is still never pooled (issue #155). This pools precipitation
 * alone, and the readings name the models it came from.
 */
import type { RecentPrecip, RecentPrecipHour } from '@weatherteam6/types'
import {
  GLOBAL_DETERMINISTIC_MODELS,
  type DeterministicResult,
  type RecentPrecipByModel,
} from './openMeteo.js'

export const RAIN_MODELS: readonly string[] = GLOBAL_DETERMINISTIC_MODELS

/**
 * Fewer models than this at an hour is a gap, not a median. With two, the
 * "median" is their mean and one wet model reads as half a shower everywhere.
 */
export const MIN_RAIN_MODELS = 3

export type RainMedian = {
  /** The `RAIN_MODELS` that answered at all, in `RAIN_MODELS` order. */
  models: string[]
  /** Keyed by `valid_at_local`. Null when fewer than `MIN_RAIN_MODELS` answered that hour. */
  byLocal: ReadonlyMap<string, number | null>
}

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/**
 * The hours each model's rain is averaged over before the median: three before
 * and two after, the window `compare:dryness` measured.
 */
export const RAIN_WINDOW = { before: 3, after: 2 } as const

/** `valid_at_local` moved by whole hours. Local stamps from one response share one offset. */
function shiftLocal(local: string, hours: number): string {
  return new Date(Date.parse(`${local}:00Z`) + hours * 3_600_000).toISOString().slice(0, 16)
}

/**
 * A model's mean rain over `RAIN_WINDOW` around `t`, or null when the model did
 * not answer at `t` itself, so a gap stays a gap rather than borrowing from its
 * neighbours. At the ends of a series the window holds only the hours there are.
 */
function windowMean(byLocal: ReadonlyMap<string, number | null>, t: string): number | null {
  if (byLocal.get(t) == null) return null
  let sum = 0
  let n = 0
  for (let o = -RAIN_WINDOW.before; o <= RAIN_WINDOW.after; o++) {
    const v = byLocal.get(shiftLocal(t, o))
    if (v == null) continue
    sum += v
    n++
  }
  return sum / n
}

/**
 * The per-hour median of `RAIN_MODELS`' six-hour means in one deterministic
 * response, or null when fewer than `MIN_RAIN_MODELS` of them answered at all.
 */
export function rainMedian(result: DeterministicResult): RainMedian | null {
  const series = RAIN_MODELS.flatMap((name) => {
    const model = result.models.find((m) => m.model === name)
    if (!model || !model.hours.some((h) => h.precip_mm !== null)) return []
    return [{ name, byLocal: new Map(model.hours.map((h) => [h.valid_at_local, h.precip_mm])) }]
  })
  if (series.length < MIN_RAIN_MODELS) return null

  const times = new Set(series.flatMap((s) => [...s.byLocal.keys()]))
  const byLocal = new Map<string, number | null>()
  for (const t of times) {
    byLocal.set(t, medianOf(series.map((s) => windowMean(s.byLocal, t))))
  }
  return { models: series.map((s) => s.name), byLocal }
}

/** The median of the values at least `MIN_RAIN_MODELS` models gave, else null. */
function medianOf(values: readonly (number | null | undefined)[]): number | null {
  const known = values.filter((v): v is number => v !== null && v !== undefined)
  return known.length >= MIN_RAIN_MODELS ? median(known) : null
}

/**
 * The Precip tab's record: **the same per-hour median the drying clock reads**,
 * so the rain a reader sees is the rain behind "Dryness". Before this the tab
 * drew Open-Meteo's `best_match` — HRRR in the US — which in the 2026-09-29
 * check against 14 ASOS gauges caught 43% of the gauges' wet hours and two
 * thirds of their total; this median caught 71%.
 *
 * An hour fewer than `MIN_RAIN_MODELS` models answered is left out: a gap,
 * never a dry hour. The liquid and snow parts are medians of their own, taken
 * only to say what kind of precipitation fell, so they need not add up to
 * `precip_mm`.
 */
export function recentPrecipMedian(fetched: RecentPrecipByModel): RecentPrecip {
  const answered = fetched.models.filter((m) => m.hours.length > 0)
  const byTime = new Map<string, RecentPrecipHour[]>()
  for (const m of answered) {
    for (const h of m.hours) {
      const list = byTime.get(h.valid_at_local)
      if (list === undefined) byTime.set(h.valid_at_local, [h])
      else list.push(h)
    }
  }

  const hours: RecentPrecipHour[] = []
  for (const [at, list] of [...byTime].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const precip = medianOf(list.map((h) => h.precip_mm))
    if (precip === null) continue
    hours.push({
      valid_at_local: at,
      precip_mm: precip,
      rain_mm: medianOf(list.map((h) => h.rain_mm)),
      snowfall_cm: medianOf(list.map((h) => h.snowfall_cm)),
    })
  }

  return {
    hours,
    utc_offset_seconds: fetched.utc_offset_seconds,
    from_date: fetched.from_date,
    models: hours.length > 0 ? answered.map((m) => m.model) : [],
  }
}
