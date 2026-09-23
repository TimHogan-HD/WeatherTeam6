/**
 * The copy model from miniapp-design-v1.md §7, shared by the Telegram bot and
 * the Mini App so that one implementation serves both surfaces.
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
 * **What is still live and why.** `SCORE_BANDS` rungs the number and colours
 * it. `DRY_SENTINEL_HOURS`, `formatHoursSinceRain` and `formatLastRain` are the
 * rain record, which has no v2 equivalent. The source labels are per-response
 * attribution.
 *
 * **`ScoreUnavailableReason` and `scoreUnavailableLine` belong to the
 * five-component scorer**, which still runs and still sends that field; no
 * surface renders it today, because no surface renders that score. Phase 5
 * retires the scorer and takes them with it.
 */
import { EM_DASH } from './units.js';

export type Confidence = 'low' | 'medium' | 'high';

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


/**
 * The sentinel `dryingModel` returns when the rainfall lookup found nothing —
 * which happens both for a genuinely dry month **and** for a swallowed ACIS or
 * Open-Meteo-archive error. Both produce exactly this value, flagged
 * `estimated_dry: true` with `confidence: 'high'`.
 */
export const DRY_SENTINEL_HOURS = 720;

/**
 * Why a day has no score, when the reason is something other than the date being
 * outside the scoring window.
 *
 * **Named once here because it was written out as a literal union in seven
 * places**, and the eighth reading of it is how `score_error` came to be missing:
 * `liveForecast`'s generic catch set `scores = []` and no reason at all, so a
 * thrown scoring error arrived indistinguishable from "this date is too far out".
 * With a 7-day horizon the honest version of that state is never reached in live
 * compute, so in practice every occurrence was a swallowed error being rendered
 * as a legitimate empty result — defect class 2.
 *
 * Adding a member here is deliberately a compile error in `scoreUnavailableLine`
 * until it has copy of its own. A reason with no sentence is a reason no reader
 * ever sees.
 */
export type ScoreUnavailableReason = 'rainfall_unavailable' | 'score_error';

export function scoreUnavailableLine(reason: ScoreUnavailableReason): string {
  switch (reason) {
    case 'rainfall_unavailable':
      return "Can't score right now — no rainfall data.";
    case 'score_error':
      // Deliberately does not name rainfall. The rainfall lookup may have been
      // perfectly fine; something in the scoring itself threw, and saying which
      // input failed when we do not know is the attribution defect (class 3).
      return "Can't score right now — the calculation failed.";
  }
}

/**
 * §3's binding display cap. At or above the sentinel, no surface may render a
 * precise figure: a dry month and an upstream outage are indistinguishable in
 * the data, and printing *"no rain in 720h"* asserts a measurement that may
 * never have been taken.
 */
export function formatHoursSinceRain(hours: number | null): string {
  if (hours === null) return EM_DASH;

  // Round *before* testing the cap, not after. §3 is binding that no surface may
  // render "no rain in 720h"; testing the raw value let 719.5–719.99 past the
  // cap and then printed exactly that figure.
  const rounded = Math.round(hours);
  if (rounded >= DRY_SENTINEL_HOURS) return 'no rain in 30+ days';

  // Zero and negative are routine, not corruption. `dryingModel` measures from
  // the *end* of the rain day (23:59:59Z), so significant rain dated today is
  // still in the future relative to now and yields a negative figure — about
  // -14h at midday. Rendering that as "no rain in -14h" states the opposite of
  // what happened, on precisely the day the answer matters most.
  if (rounded <= 0) return 'rain today';

  return `no rain in ${rounded}h`;
}

/**
 * When it last rained, as a sentence rather than as a chart caption.
 *
 * **The same §3 cap as `formatHoursSinceRain`, and for the same reason.** A dry
 * month and a swallowed rainfall fetch are indistinguishable in the data, so at
 * or above the sentinel no surface may state a figure — "over 30 days ago" is
 * the most that can honestly be said. Kept beside its sibling so the cap cannot
 * be reimplemented without it.
 *
 * The phrasing is deliberately approximate. `dryingModel` measures from the
 * **end** of the rain day, so this is accurate to a day and not to an hour;
 * "about" says so, and "rain today" is what a zero or negative figure means
 * rather than a number pointing the wrong way.
 */
export function formatLastRain(hours: number | null): string | null {
  if (hours === null) return null;

  const rounded = Math.round(hours);
  if (rounded >= DRY_SENTINEL_HOURS) return 'over 30 days ago';
  if (rounded <= 0) return 'earlier today';
  if (rounded < 48) return `about ${rounded} hours ago`;

  const days = Math.round(rounded / 24);
  return `about ${days} days ago`;
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
  return `Open-Meteo (${models.join(', ')})`;
}

/**
 * Which rainfall source the drying model used. The column is nullable and the
 * branch is per-location, so this cannot be a constant either.
 */
export function rainfallSourceLabel(asosStation: string | null): string {
  return asosStation === null ? 'Open-Meteo archive' : `ACIS (${asosStation})`;
}
