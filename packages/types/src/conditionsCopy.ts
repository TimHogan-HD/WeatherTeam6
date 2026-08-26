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
 * The permitted state labels. They describe **rock and weather**, never
 * suitability — "Mixed" is a condition, "marginal, check the details" was
 * advice. Do not add a rung that reads as a recommendation.
 */
export function stateLabel(score: number | null): string {
  if (score === null) return 'Too far out to score';
  if (score >= 80) return 'Dry, settled';
  if (score >= 60) return 'Mostly dry';
  if (score >= 40) return 'Mixed';
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
 * §3's binding display cap. At or above the sentinel, no surface may render a
 * precise figure: a dry month and an upstream outage are indistinguishable in
 * the data, and printing *"no rain in 720h"* asserts a measurement that may
 * never have been taken.
 */
export function formatHoursSinceRain(hours: number | null): string {
  if (hours === null) return EM_DASH;
  if (hours >= DRY_SENTINEL_HOURS) return 'no rain in 30+ days';
  return `no rain in ${Math.round(hours)}h`;
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
