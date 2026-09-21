import type { DeterministicResult } from '../weather/openMeteo.js'

/**
 * Fold two deterministic responses for the same point into the one shape
 * `storeDeterministicRun` takes.
 *
 * **Pure, and in its own file for the reason `hourlySeries.ts` is separate from
 * `fetchHourlySeries.ts`:** `collectRuns.ts` imports `db/index.js`, which throws
 * at import time without `DATABASE_URL`, so anything living there is unloadable
 * under vitest. The property below is worth a test.
 *
 * ## Why there are two responses at all
 *
 * `collect-runs` asks for `THERMAL_MODEL` with trailing history and the other
 * five models without it, because only the thermal model's past hours are ever
 * read and requesting them for all six was measured at +71% on the largest
 * table in the database. See `FORECAST_ONLY_MODELS`.
 *
 * ## The property that is easy to break and hard to see
 *
 * **One stored batch shares one `fetched_at`, and that is what identifies it.**
 * `latestBatchAt` selects a batch by that timestamp rather than by "newest per
 * model", precisely so a model collected an hour ago cannot be printed under
 * the same header as one collected now. `storeDeterministicRun` writes the
 * single `fetched_at` on the result to every model row, so merging to one value
 * is not tidiness — two values here would split one collection into two batches
 * and `latestBatchAt` would then return half of it.
 */
export function mergeDeterministic(
  thermal: DeterministicResult | null,
  others: DeterministicResult | null,
): DeterministicResult | null {
  if (thermal === null) return others
  if (others === null) return thermal

  // Offset and elevation come from whichever response actually carried models.
  // Keyed on `models.length`, not on the value being truthy: 0 is a real offset
  // — Iceland, Ghana, Britain in winter — and a falsy check here would be the
  // same defect `buildHourlySeries` documents at its own offset selection.
  const withModels = thermal.models.length > 0 ? thermal : others

  return {
    models: [...thermal.models, ...others.models],
    unavailable_models: [...thermal.unavailable_models, ...others.unavailable_models],
    utc_offset_seconds: withModels.utc_offset_seconds,
    model_elevation_m: thermal.model_elevation_m ?? others.model_elevation_m,
    // The older of the two, for the same reason `HourlySeries.fetched_at` is:
    // a freshness claim is bounded by the staler half of what it describes.
    fetched_at:
      thermal.fetched_at.getTime() <= others.fetched_at.getTime()
        ? thermal.fetched_at
        : others.fetched_at,
  }
}
