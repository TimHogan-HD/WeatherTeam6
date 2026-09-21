/**
 * The copy model for the **v2 scoring model's two readings**, shared by the
 * Telegram bot and the Mini App exactly as `conditionsCopy.ts` shared the
 * five-component one. Phase 3 of
 * `docs/handoffs/weatherteam6-scoring-model-handoff-v1.md`.
 *
 * ## What changed, and why it is not a rewording
 *
 * The old ladder mapped **a number** to a word — `stateLabel(88)` said *"Dry,
 * settled"* — so the words could only ever be as right as the number. That is
 * how a 104 °F day came to read *"Dry, settled"*: heat could cost at most 12 of
 * 100 points, and no amount of care in the copy could see past the arithmetic.
 *
 * Here the words come **first** and the number is derived from them. The
 * headline is the two readings themselves, so there is no step at which a
 * good-looking phrase can be attached to a day the model thinks is greasy:
 * `Friction: Poor` renders as *"Poor friction"* whatever the score says. That
 * is the phase's acceptance criterion, and it is structural rather than
 * enforced by a rule someone has to remember.
 *
 * ## Three things this file must keep
 *
 * **1. No magnitude ever reaches a surface.** The friction reading rests on one
 * unvalidated step — skin wettedness to grip, which no study has measured (see
 * `apps/api/src/lib/scoring/sweatBalance.ts`). The owner's decision was to keep
 * it and quarantine it: **words and ordering reach a screen, numbers do not.**
 * Nothing here accepts a 0-1 factor, and `HourlyReading` does not carry one.
 *
 * **2. The copy says the friction reading is an estimate.** On the surface, in
 * the reader's own words — not in a document. `FRICTION_ESTIMATE_NOTE` is that
 * sentence and a surface showing a friction level must show it.
 *
 * **3. An unqualified reading is never presented as a measured one.** But it is
 * also not an asterisk on every line: measured live on 2026-09-21, **half of
 * every location's hours are unqualified**, because no location has an aspect
 * recorded and every sunlit hour therefore depends on one. A per-row mark would
 * be noise. `UNRECORDED_ASPECT_NOTE` is one sentence, said once per surface.
 */
import type {
  ConditionsWindow,
  FrictionLevel,
  FrictionReading,
  HourlyReading,
  ReadingsUnavailableReason,
  RockLevel,
  RockReading,
} from './hourly.js';

/** How far from `now` an hour may be and still be called the current conditions. */
export const CURRENT_HOUR_TOLERANCE_MS = 90 * 60_000;

/**
 * The hour covering `now`, or `null` when the series does not reach it.
 *
 * **Shared rather than reimplemented per surface.** The Mini App picks this
 * hour from `GET /hourly/:id` and the API picks it for `GET /conditions/:id`
 * and the bot; two implementations of "which hour is now" is how one screen
 * comes to show a reading an hour older than another for the same crag.
 */
export function readingNow(
  hours: readonly HourlyReading[],
  nowMs: number,
): HourlyReading | null {
  let best: HourlyReading | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const hour of hours) {
    const t = Date.parse(hour.valid_at);
    if (!Number.isFinite(t)) continue;
    const distance = Math.abs(t - nowMs);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = hour;
    }
  }
  return bestDistance <= CURRENT_HOUR_TOLERANCE_MS ? best : null;
}

/**
 * The rock's state, as one word.
 *
 * Three rungs, and they describe **the rock**, never whether to go. `Drying` is
 * a state and not a promise: the drying ramp is least accurate at its end —
 * the day after rain, when the wall looks dry — so the word deliberately stops
 * short of saying the wall is ready.
 */
export const ROCK_LABELS: Record<RockLevel, string> = {
  wet: 'Wet',
  drying: 'Drying',
  dry: 'Dry',
};

/** How it will feel to climb on, as one word. Four rungs, ordered. */
export const FRICTION_LABELS: Record<FrictionLevel, string> = {
  poor: 'Poor',
  fair: 'Fair',
  good: 'Good',
  great: 'Great',
};

/**
 * The two readings as the headline: *"Dry rock · Great friction"*.
 *
 * **Either half may be missing and neither is invented.** A `Reading` has no
 * "unknown" level — `null` means the model could not read it — and writing
 * *"Dry"* for a wall nobody could measure is defect class 1. A half that is
 * missing is simply not said, and when both are missing there is no headline
 * at all.
 */
export function readingsHeadline(
  rock: RockReading | null,
  friction: FrictionReading | null,
): string | null {
  const parts: string[] = [];
  if (rock !== null) parts.push(`${ROCK_LABELS[rock.level]} rock`);
  if (friction !== null) parts.push(`${FRICTION_LABELS[friction.level]} friction`);
  return parts.length === 0 ? null : parts.join(' · ');
}

/**
 * The two readings where there is room for two words and no more — the end of
 * a daily row, beside its bar: *"Dry · Great"*.
 *
 * **Only for a place that has already said what it is about.** Without the
 * "rock" and "friction" nouns the pair is ambiguous, so this is not a shorter
 * `readingsHeadline` to reach for generally; it is the daily list's score
 * column, where the metric toggle above it names the subject.
 *
 * A missing half is omitted rather than filled, exactly as in the headline.
 */
export function readingsShort(
  rock: RockReading | null,
  friction: FrictionReading | null,
): string | null {
  const parts: string[] = [];
  if (rock !== null) parts.push(ROCK_LABELS[rock.level]);
  if (friction !== null) parts.push(FRICTION_LABELS[friction.level]);
  return parts.length === 0 ? null : parts.join(' · ');
}

/**
 * An instant on the location's own wall clock, as `7am` / `12pm` / `11pm`.
 *
 * `utcOffsetSeconds` is **the location's**, never the viewer's — the same rule
 * as `HourlySample.local_date`, and for the same reason (#33). A non-finite
 * offset degrades to UTC rather than producing an `Invalid Date`, matching
 * `localDateString`.
 */
export function formatLocalHour(validAt: string, utcOffsetSeconds: number): string | null {
  const t = Date.parse(validAt);
  if (!Number.isFinite(t)) return null;
  const offset = Number.isFinite(utcOffsetSeconds) ? utcOffsetSeconds : 0;
  const local = new Date(t + offset * 1000);
  const h24 = local.getUTCHours();
  const suffix = h24 < 12 ? 'am' : 'pm';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}${suffix}`;
}

/**
 * How many hours a window has to span before it is "all day".
 *
 * A published day runs 00:00 to 23:00 local at an hourly step, so 24 marks is
 * every hour there is. **Today is the exception and it is the common case**:
 * the series starts at the current hour, so a window covering every remaining
 * hour of today is not all day and does not claim to be — it names its span.
 */
const FULL_DAY_HOURS = 24;

/**
 * The day's window, as a sentence: *"Good from 7am to 11am"*.
 *
 * The phrasing is the handoff's own. **"Good" is about the combined number
 * clearing the window minimum**, not about the friction rung that shares the
 * word — the headline beside it names the rung, and the two lines have
 * different subjects.
 *
 * `null` is a real answer and it is not an error: no contiguous run of hours
 * cleared the minimum. It says so plainly rather than falling back to the day's
 * best hour, which would present the least bad hour of a wet day as a window.
 */
export function windowLine(
  window: ConditionsWindow | null,
  utcOffsetSeconds: number,
): string {
  if (window === null) return 'No good hours';
  if (window.hours >= FULL_DAY_HOURS) return 'Good all day';

  const from = formatLocalHour(window.from, utcOffsetSeconds);
  const to = formatLocalHour(window.to, utcOffsetSeconds);
  // An unparseable instant is a gap, not an hour. Naming a span we cannot read
  // the ends of would print "Good from null to null"; saying how long it runs
  // is the part still backed by the data.
  if (from === null || to === null) return `Good for ${window.hours}h`;
  // A one-hour window has no span to name, and "from 7am to 7am" reads as a
  // rendering fault rather than as a single hour.
  if (from === to) return `Good at ${from}`;
  return `Good from ${from} to ${to}`;
}

/**
 * Why there are no readings at all. **Named rather than a literal**, so adding
 * a reason is a compile error here until it has copy of its own — the same
 * mechanism as `scoreUnavailableLine`.
 *
 * None of these may read as "conditions are bad". They are statements about
 * *us*, exactly as `scoreUnavailableLine`'s are.
 */
export function readingsUnavailableLine(reason: ReadingsUnavailableReason): string {
  switch (reason) {
    case 'model_unavailable':
      // The thermal model is one named model and is never substituted (#155).
      // "No forecast" would be wrong — the weather columns on the same response
      // may well have come back from a different model.
      return "Can't read the rock right now — the forecast model didn't answer for this spot.";
    case 'insufficient_history':
      // Not a failure and not permanent: `T_mass` needs about four days of
      // trailing temperature, which arrives with the next scheduled collection.
      return 'Not enough recent weather yet to read the rock here. Check back in an hour.';
    case 'not_a_climbing_location':
      // Saved as a place rather than a crag. Deliberately not phrased as an
      // error — nothing went wrong, and the reader chose this.
      return 'Saved as a place, not a crag — no rock reading.';
  }
}

/**
 * The sentence that says the friction reading is a guess, on the surface.
 *
 * **A Phase 3 acceptance criterion, not a nicety** (§ Open Questions 6). Every
 * step behind this reading is standard physics with published values except
 * one: what a sweating hand does to grip, which nobody has measured. The
 * decision was to keep that step and quarantine it, and this sentence is half
 * of the quarantine — the other half is that no magnitude is published at all.
 */
export const FRICTION_ESTIMATE_NOTE =
  'Friction is an estimate from temperature, humidity and wind — not a measurement.';

/**
 * The sentence for an hour whose answer depends on a wall orientation nobody
 * has recorded.
 *
 * **Deliberately not an upper bound.** Those hours use unscaled horizontal
 * irradiance, which reads a vertical wall hot under a high sun — but a
 * sun-facing wall under a low winter sun can exceed horizontal, so the copy
 * must not promise "at most this warm". It says the input is missing and that
 * the reading leans warm, which is what the data supports.
 */
export const UNRECORDED_ASPECT_NOTE =
  "Which way this crag faces isn't recorded, so readings in direct sun lean warm.";

/**
 * The sentence for a wall sitting below its dew point.
 *
 * It is the one mechanism in the friction reading that is uncontested physics,
 * and it is worth naming because it is the case a climber can act on — the wall
 * is wet with condensation, not with rain, and it will clear when the air does.
 */
export const CONDENSING_NOTE = 'The wall is below its dew point — condensation on the rock.';

export type ReadingsSummaryInput = {
  /** The hour being summarised — normally the hour covering now. */
  reading: HourlyReading | null;
  /** The day's best contiguous run, for the window line. */
  window: ConditionsWindow | null;
  /** The location's own offset, for the window's clock times. */
  utcOffsetSeconds: number;
  /**
   * The event name of an active Severe or Extreme alert, e.g.
   * `Extreme Heat Warning`. **`null` also means "the alerts query has not
   * settled"** as far as this function can tell, so a caller must not call it
   * until that query has resolved — defect class 7.
   */
  severeAlertEvent: string | null;
  /** Set when there are no readings at all; `reading` and `window` are then null. */
  unavailableReason: ReadingsUnavailableReason | null;
};

export type ReadingsSummary = {
  /** *"Dry rock · Great friction"*. `null` when neither reading could be read. */
  headline: string | null;
  /** *"Good from 7am to 11am"*. `null` when there are no readings at all. */
  window: string | null;
  /**
   * *"Score 86"* — **the last line and the smallest**, by the phase's design.
   *
   * `null` when the score was not computed, **and also when a Severe+ alert is
   * active**: see `qualifier`. A caller must not substitute the raw number.
   */
  scoreLine: string | null;
  /** The bare score, for a surface that draws rather than writes it. Same suppression as `scoreLine`. */
  score: number | null;
  /** *"see the Extreme Heat Warning above"*, or the condensation sentence. */
  qualifier: string | null;
  /**
   * The caveats this surface must print, in order. Never empty when a friction
   * level is on screen — the estimate note is required copy.
   */
  notes: string[];
  /** The sentence for "no readings at all". `null` when there are readings. */
  unavailableLine: string | null;
};

/**
 * Everything a surface says about one hour's readings, in one place.
 *
 * ## The suppression rule, and how it differs from the one it replaces
 *
 * `summarizeConditions` dropped the **word** under a Severe+ alert and kept the
 * **number**. This does the opposite, and the reversal is the whole point of
 * the model change:
 *
 * - The words are now derived from physics that sees heat. *"Poor friction"*
 *   beside an Extreme Heat Warning is not the contradiction *"Dry, settled"*
 *   was — it is the same fact the warning is about, and hiding it leaves the
 *   reader with less.
 * - The **number** is the convenience, and it is the thing that reads as
 *   actionable. Under an active Severe+ alert it is dropped entirely and the
 *   alert is named instead, which is how *"safety stays out of the number"*
 *   (§ Constraints) is carried on a surface.
 *
 * There is **no component-based suppression**, because there are no components.
 * A day with `Friction: Poor` cannot render a bare good-looking summary for the
 * structural reason that the headline *is* the friction reading — not because a
 * rule caught it.
 */
export function summarizeReadings(input: ReadingsSummaryInput): ReadingsSummary {
  const { reading, window, utcOffsetSeconds, severeAlertEvent, unavailableReason } = input;

  if (unavailableReason !== null) {
    return {
      headline: null,
      window: null,
      scoreLine: null,
      score: null,
      qualifier: null,
      notes: [],
      unavailableLine: readingsUnavailableLine(unavailableReason),
    };
  }

  const rock = reading?.rock ?? null;
  const friction = reading?.friction ?? null;
  const headline = readingsHeadline(rock, friction);

  // An alert outranks everything, exactly as it did before (§7 rule 5), and
  // only one qualifier is ever shown — two reads as a list of complaints.
  const qualifier =
    severeAlertEvent !== null
      ? `see the ${severeAlertEvent} above`
      : friction?.condensing === true
        ? CONDENSING_NOTE
        : null;

  // Suppressed under a Severe+ alert, and `null` is the only signal. A caller
  // that reaches past this for `reading.score` is defeating the rule.
  const score = severeAlertEvent !== null ? null : (reading?.score ?? null);

  const notes: string[] = [];
  // Required copy wherever a friction level appears, and nowhere else: a
  // location showing no friction reading has nothing to caveat.
  if (friction !== null) notes.push(FRICTION_ESTIMATE_NOTE);
  // One sentence for the whole surface rather than a mark per hour. `qualified`
  // is false for roughly half of every location's hours until Phase 4 writes an
  // aspect, so a per-row flag would be on more rows than off.
  if (rock?.qualified === false || friction?.qualified === false) {
    notes.push(UNRECORDED_ASPECT_NOTE);
  }

  return {
    headline,
    window: windowLine(window, utcOffsetSeconds),
    scoreLine: score === null ? null : `Score ${score}`,
    score,
    qualifier,
    notes,
    unavailableLine: null,
  };
}
