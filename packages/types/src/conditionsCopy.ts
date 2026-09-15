/**
 * The copy model from miniapp-design-v1.md §7, shared by the Telegram bot and
 * the Mini App so that one implementation serves both surfaces.
 *
 * It exists because the shipped bot reply mapped score to an opinion —
 * *"looks great — go climb"* at 103 °F under an active Extreme Heat Warning
 * (issue #21). Two locked copy rules forbid that: no climbing opinions, and the
 * score is a derived signal, never the headline.
 *
 * **This makes the surface honest. It does not fix the score.** Scoring is
 * additive with no veto — heat costs at most 12 of 100 points and saturates
 * above 35 °C — so a settled dry spell still lands in the 80s at any
 * temperature. That is tracked separately as §10.2.
 */
import { SCORE_COMPONENT_MAX, type ScoreComponentName } from './scoreComponents.js';
import { EM_DASH } from './units.js';

export type Confidence = 'low' | 'medium' | 'high';

/**
 * The score at which each state label takes over.
 *
 * Named rather than left as literals in `stateLabel` because a surface that
 * *colours* a score has to use the same rungs the words use. The Mini App's
 * daily list does exactly that, and a second set of thresholds living in a
 * component is how a bar goes amber on a day the text calls "Mostly dry" with
 * nothing able to detect the disagreement.
 */
export const SCORE_BANDS = {
  /** 'Dry, settled' at or above. */
  settled: 80,
  /** 'Mostly dry' at or above. */
  mostlyDry: 60,
  /** 'Mixed' at or above; below it, 'Wet or unsettled'. */
  mixed: 40,
} as const;

/**
 * The permitted state labels. They describe **rock and weather**, never
 * suitability — "Mixed" is a condition, "marginal, check the details" was
 * advice. Do not add a rung that reads as a recommendation.
 */
export function stateLabel(score: number | null): string {
  if (score === null) return 'Too far out to score';
  if (score >= SCORE_BANDS.settled) return 'Dry, settled';
  if (score >= SCORE_BANDS.mostlyDry) return 'Mostly dry';
  if (score >= SCORE_BANDS.mixed) return 'Mixed';
  return 'Wet or unsettled';
}

/** Component values as `ConditionsScore` carries them — each independently nullable. */
export type ScoreComponents = {
  drying: number | null;
  rain: number | null;
  wind: number | null;
  temp: number | null;
  humidity: number | null;
};

const COMPONENT_NAMES: Record<ScoreComponentName, string> = {
  drying: 'drying time',
  rain: 'upcoming rain',
  wind: 'wind',
  temp: 'temperature',
  humidity: 'humidity',
};

/**
 * Ordered by point value, descending, so the phrasing is deterministic when
 * several components are 0 — §7 rule 4 requires naming exactly one, never two.
 */
const BY_WEIGHT: ScoreComponentName[] = (
  Object.keys(SCORE_COMPONENT_MAX) as ScoreComponentName[]
).sort((a, b) => SCORE_COMPONENT_MAX[b] - SCORE_COMPONENT_MAX[a]);

/**
 * The heaviest component scoring exactly 0, or `null` if none does.
 *
 * A `null` component is unknown, not zero, and is skipped — reporting a missing
 * value as the limiting factor would name a cause that was never measured.
 */
export function limitingComponent(components: ScoreComponents): ScoreComponentName | null {
  for (const name of BY_WEIGHT) {
    if (components[name] === 0) return name;
  }
  return null;
}

/** NWS severities that outrank the score entirely (§7 rules 4 and 5). */
export function isSevereAlert(severity: string): boolean {
  const normalized = severity.trim().toLowerCase();
  return normalized === 'severe' || normalized === 'extreme';
}

export type ConditionsSummary = {
  /**
   * The state label, or `null` when suppression forbids showing one. A caller
   * must not substitute its own label when this is `null` — that is the whole
   * mechanism.
   */
  label: string | null;
  /** `Score 80 (high confidence)`, with the limiting factor appended when suppressed. `null` when unscored. */
  scoreLine: string | null;
  /** Compact form for a list card: `Score 80 · high`. `null` when unscored. */
  chip: string | null;
  /** `limited by temperature` / `see the Extreme Heat Warning above`, else `null`. */
  qualifier: string | null;
};

/**
 * §7 rule 4 — score suppression. When any component scores 0, or an active
 * alert of severity Severe or higher exists, the state label is not shown alone
 * and the limiting factor is named instead.
 *
 * Two details that must not be improvised:
 *
 * - **Suppression applies only when `score !== null`.** A day outside the
 *   scoring window has all five components at 0 and a null score. That is not a
 *   limited day, it is an unscored one, and it takes the ladder's
 *   *"Too far out to score"* with no suppression.
 * - **There is no degradation guard, and one must not be added.** Suppression
 *   runs unconditionally whenever a component is 0. An earlier design draft
 *   carved out an exception keyed on `component_temp === 0` with a temperature
 *   above 0 °C, believing that signature indicated a degraded upstream fetch.
 *   It does not — it is an exact description of a crag at 39.5 °C, so the
 *   exception would have suppressed the suppression on the one case this
 *   function exists for and shipped *"Dry, settled"* against a heat warning.
 */
export function summarizeConditions(input: {
  score: number | null;
  confidence: Confidence;
  components: ScoreComponents;
  /** The event name of an active Severe+ alert, e.g. `Extreme Heat Warning`. */
  severeAlertEvent: string | null;
}): ConditionsSummary {
  const { score, confidence, components, severeAlertEvent } = input;

  if (score === null) {
    return { label: stateLabel(null), scoreLine: null, chip: null, qualifier: null };
  }

  // An alert names the alert, not a component — it outranks everything (rule 5).
  const limiting = limitingComponent(components);
  const qualifier =
    severeAlertEvent !== null
      ? `see the ${severeAlertEvent} above`
      : limiting !== null
        ? `limited by ${COMPONENT_NAMES[limiting]}`
        : null;

  const scoreLine =
    `Score ${score} (${confidence} confidence)` + (qualifier === null ? '' : ` — ${qualifier}`);

  return {
    label: qualifier === null ? stateLabel(score) : null,
    scoreLine,
    chip: `Score ${score} · ${confidence}`,
    qualifier,
  };
}

/**
 * The sentinel `dryingModel` returns when the rainfall lookup found nothing —
 * which happens both for a genuinely dry month **and** for a swallowed ACIS or
 * Open-Meteo-archive error. Both produce exactly this value, flagged
 * `estimated_dry: true` with `confidence: 'high'`.
 */
export const DRY_SENTINEL_HOURS = 720;

/**
 * What both surfaces say when a day could not be scored because an input was
 * never measured (issue #34).
 *
 * Deliberately **not** a ladder rung and not a suppression qualifier: those
 * describe rock and weather, and this describes *us*. It also must not read as
 * "no rain" — the whole defect was that an outage looked like a dry spell.
 *
 * Distinct from `stateLabel(null)`'s "Too far out to score", which is a real
 * statement about the date. This is a statement about the data.
 */
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

/** Escapes text for Telegram's `parse_mode: 'HTML'`. `&` must be replaced first. */
export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
