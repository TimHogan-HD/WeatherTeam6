/**
 * The copy model from miniapp-design-v1.md §7, shared by every surface that
 * renders conditions, so one implementation serves all of them.
 *
 * It exists because the shipped bot reply mapped score to an opinion —
 * *"looks great — go climb"* at 103 °F under an active Extreme Heat Warning
 * (issue #21). Two locked copy rules forbid that: no climbing opinions, and the
 * score is a derived signal, never the headline.
 *
 * ## What left this file in Phase 3b, and why
 *
 * **`stateLabel`, `summarizeConditions` and `limitingComponent` are gone.**
 * They mapped the five-component number to a word and named the component that
 * had zeroed, and both halves stopped being answerable: the words now come from
 * the v2 model's two readings (`readingsCopy.ts`), and the model has two
 * factors rather than five components, so there is no "limited by temperature"
 * to name. They were not left in place as a fallback — a ladder that could put
 * *"Dry, settled"* on a 103 °F day is the exact contradiction the new model was
 * built to make impossible, and leaving it exported is an invitation.
 *
 * **What is still live.** `SCORE_BANDS` rungs Crag A's number and colours it,
 * `isSevereAlert` decides which alerts suppress it, and the source labels are
 * per-response attribution. The rain record (`formatHoursSinceRain`,
 * `formatLastRain`), `scoreUnavailableLine` and `rainfallSourceLabel` went with
 * the five-component scorer in scoring Phase 5b (2026-10-01).
 */

/**
 * The score at which each band takes over.
 *
 * Named rather than left as literals because two things read them: the Mini
 * App's daily bar colour, and `DEFAULT_WINDOW_MIN_SCORE` in the API, which uses
 * `mostlyDry` as the bar an hour has to clear to be in a day's window.
 *
 * The names are the words the retired ladder used. They are kept because the
 * *rungs* are unchanged and renaming them would make every reference to a band
 * in the archive unreadable — but nothing turns a score into those words any
 * more, and nothing should. See `readingsCopy.ts`.
 */
export const SCORE_BANDS = {
  settled: 80,
  mostlyDry: 60,
  mixed: 40,
} as const;

/**
 * NWS severities that outrank everything else on a surface (§7 rules 4 and 5).
 *
 * **Still live, and it is the one part of the old suppression model that
 * survived Phase 3b unchanged.** What it suppresses moved — it used to remove
 * the ladder word and keep the number, and now it removes the number and keeps
 * the readings — but which alerts count did not.
 */
export function isSevereAlert(severity: string): boolean {
  const normalized = severity.trim().toLowerCase();
  return normalized === 'severe' || normalized === 'extreme';
}

/** Model id prefixes and the short name a reader knows each model by. */
const MODEL_NAMES: readonly (readonly [prefix: string, name: string])[] = [
  ['gfs', 'GFS'],
  ['ecmwf', 'ECMWF'],
  ['icon', 'ICON'],
  ['gem', 'GEM'],
  ['ncep_hrrr', 'HRRR'],
  ['ncep_nbm', 'NBM'],
  ['nbm', 'NBM'],
];

/**
 * `GFS` for `gfs_seamless`. The id stays the attribution — this only shortens
 * how it is printed. An id not listed is printed as-is rather than guessed.
 */
export function modelName(id: string): string {
  return MODEL_NAMES.find(([prefix]) => id.startsWith(prefix))?.[1] ?? id;
}

/** `Open-Meteo · GFS, ECMWF` — a set of models named once, in the order given. */
export function openMeteoModels(ids: readonly string[]): string {
  return `Open-Meteo · ${[...new Set(ids.map(modelName))].join(', ')}`;
}

/**
 * The forecast sources actually used for a response, per §3's rule that nothing
 * in a sources footer may be hardcoded.
 *
 * `model_sources` says what ran: `['nbm']` when NBM answered, or the ensemble
 * member list when it fell back. Writing "Open-Meteo ensemble" as a constant is
 * correct only by accident today and becomes false the moment issue #22 is
 * fixed. Open-Meteo itself is named because it is the API that was called on
 * both branches, not because of which models it returned.
 *
 * Returns `null` when the response says nothing — a source is omitted rather
 * than guessed, because naming one that never ran is a false attribution.
 *
 * Shared by the bot and the Mini App: both must name the same sources for the
 * same location, and the branch is per-request, not per-surface.
 */
export function forecastSourceLabel(
  snapshots: readonly { model_sources: string[] | null }[] | undefined,
): string | null {
  const models = snapshots?.find(
    (s) => s.model_sources !== null && s.model_sources.length > 0,
  )?.model_sources;
  if (models === undefined || models === null || models.length === 0) return null;
  return openMeteoModels(models);
}

/**
 * Where `/recent-precip` came from: the forecast endpoint's own past hours
 * (`past_days`).
 */
export const RECENT_PRECIP_SOURCE_LABEL = 'Open-Meteo past hours';
