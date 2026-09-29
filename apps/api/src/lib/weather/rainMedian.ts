/**
 * **The rain the drying clock reads: the hourly median of the four global
 * models**, not the thermal model's own precipitation (issue #209).
 *
 * `npm run compare:dryness` measured the choice against 20 ASOS rain gauges
 * over 90 days, each candidate driving the real Crag A clock against the clock
 * driven by the gauge. `gfs_seamless` alone, whose first 48 hours in the US
 * are HRRR's, called the rock dry during 60% of the daytime hours a gauge said
 * it was still wet or drying on quartzite and 44% on sandstone. The median of
 * these four missed 26% and 19%, and was the only candidate within 0.06 of
 * the best on every rock type tried. The price is more hours reading "drying"
 * that a gauge calls dry — the direction this model already chooses to be
 * wrong in.
 *
 * **Global only.** HRRR and NBM stop at the US border, so a median including
 * them would be a different statistic at Kalymnos than at Red Rock.
 *
 * Irradiance is still never pooled (issue #155). This pools precipitation
 * alone, and the readings name the models it came from.
 */
import {
  GLOBAL_DETERMINISTIC_MODELS,
  type DeterministicResult,
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
 * The per-hour median of `RAIN_MODELS` in one deterministic response, or null
 * when fewer than `MIN_RAIN_MODELS` of them answered at all.
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
    const values = series
      .map((s) => s.byLocal.get(t))
      .filter((v): v is number => v !== null && v !== undefined)
    byLocal.set(t, values.length >= MIN_RAIN_MODELS ? median(values) : null)
  }
  return { models: series.map((s) => s.name), byLocal }
}
