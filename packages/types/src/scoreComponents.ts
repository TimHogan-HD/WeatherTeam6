/**
 * The conditions score's shared constants: the five components' maximum point
 * values, and the temperature component's breakpoints.
 *
 * Its own module rather than a member of `index.ts` so that `conditionsCopy.ts`
 * can import it without a cycle through the barrel that re-exports them both.
 * Re-exported from `index.ts`, so every existing import path still resolves.
 */
export const SCORE_COMPONENT_MAX = {
  drying: 40,
  rain: 25,
  wind: 15,
  temp: 12,
  humidity: 8,
} as const;

export type ScoreComponentName = keyof typeof SCORE_COMPONENT_MAX;

/**
 * The temperature component's own breakpoints, in °C.
 *
 * Extracted from `conditionsScore.ts` so the Mini App's diverging temperature
 * ramp is centred on the band the scorer actually rewards, rather than on a
 * number picked to look right. A ramp whose neutral zone and the scorer's
 * full-points plateau drift apart would paint an hour neutral while the day it
 * belongs to was docked for being too warm — the chart contradicting the score
 * beside it, with nothing to detect the disagreement.
 *
 * **These are air temperatures, not rock temperatures.** Nothing in the repo
 * computes a rock surface temperature (it needs a thermal model this project
 * does not have), so `idealMin`/`idealMax` are not a claim about the rock.
 *
 * There is no per-location ideal: the scorer uses one band everywhere. If a
 * per-location one is ever added, both readers move together because there is
 * only one definition.
 */
export const TEMP_BAND_C = {
  /** Below this the temperature component scores 0. */
  min: 0,
  /** The bottom of the full-points plateau. */
  idealMin: 10,
  /** The top of the full-points plateau. */
  idealMax: 22,
  /** Above this the temperature component scores 0. */
  max: 35,
} as const;
