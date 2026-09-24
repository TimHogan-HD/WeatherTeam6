/**
 * The copy model for the **v2 scoring model's two readings**, shared by the
 * API, the client and `check:conditions` exactly as `conditionsCopy.ts` shares
 * the five-component one. Phase 3 of
 * `docs/handoffs/weatherteam6-scoring-model-handoff-v1.md`.
 *
 * ## What changed, and why it is not a rewording
 *
 * The old ladder mapped **a number** to a word — `stateLabel(88)` said *"Dry,
 * settled"* — so the words could only ever be as right as the number. That is
 * how a 104 °F day came to read *"Dry, settled"*: heat could cost at most 12 of
 * 100 points, and no amount of care in the copy could see past the arithmetic.
 *
 * Here the words come **first** and the number is derived from them. There is
 * no step at which a good-looking phrase can be attached to a day the model
 * thinks is greasy: `Friction: Poor` renders as *"Poor"* under the word
 * *Friction* whatever the score says. That is the phase's acceptance criterion,
 * and it is structural rather than enforced by a rule someone has to remember.
 *
 * ## Readings are labelled, not narrated — owner decision 2026-09-21
 *
 * The first version of this file wrote the readings as plain English: *"Dry
 * rock · Great friction"*, over two caveat sentences. The owner's verdict was
 * that it was **too wordy and read as fact** — a fluent sentence claims a
 * confidence an estimate has not earned, and the more of them there are the
 * more it sounds like a report rather than a gauge.
 *
 * So every reading is now a **label and a value**, the way an instrument is
 * read: `Dryness — Dry`, `Friction — Great`, `Score — 100`. Three consequences
 * worth keeping:
 *
 * - **A surface composes fields; it does not write sentences.** `ReadingField`
 *   is the unit, and `readingFields` is the only place the labels are chosen,
 *   so the bot and the Mini App cannot name the same reading differently.
 * - **The score is one of the readings, not the verdict.** It sits third in the
 *   same row rather than in a headline, which is what "the number becomes
 *   secondary" means once the readings above it are the subject.
 * - **The caveats are fragments, not sentences.** They are still required copy
 *   (below) and they are still on the surface — they are just no longer prose a
 *   reader has to wade through. The mechanism behind them is in the
 *   measurements disclosure — `measurements()`, at the end of this file.
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
 * copy and a surface showing a friction level must show it.
 *
 * **3. An unqualified reading is never presented as a measured one.** But it is
 * also not an asterisk on every line: measured live on 2026-09-21, **half of
 * every location's hours are unqualified**, because no location has an aspect
 * recorded and every sunlit hour therefore depends on one.
 * `UNRECORDED_ASPECT_NOTE` is said once per surface.
 */
import type {
  ConditionsWindow,
  FrictionLevel,
  FrictionReading,
  HourlyReading,
  HourlySample,
  ReadingsUnavailableReason,
  RockLevel,
  RockReading,
} from './hourly.js';
import {
  EM_DASH,
  cToFDelta,
  formatHumidity,
  formatPrecipIn,
  formatTempF,
  formatWindMph,
} from './units.js';

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
 * One reading, as a gauge is read: what it measures, and what it says.
 *
 * **The label is part of the copy model, not of the surface.** A field whose
 * label a component chose would let the bot call this *Rock* while the Mini App
 * calls it *Dryness*, which is the same drift `summarizeConditions` existed to
 * prevent for the sentence it replaced.
 */
export type ReadingField = {
  /** What is being read — `Dryness`, `Friction`, `Score`, `Good hours`. */
  label: string;
  /** What it reads — `Dry`, `Great`, `100`, `7am–11am`. Never a magnitude. */
  value: string;
};

/** The rock reading's name. A property, like *Humidity* — not the subject, *Rock*. */
export const DRYNESS_LABEL = 'Dryness';
/** The friction reading's name. `FRICTION_ESTIMATE_NOTE` is what says it is a guess. */
export const FRICTION_LABEL = 'Friction';
/** The derived number's name. Third and last, by the phase's design. */
export const SCORE_LABEL = 'Score';
/** The day's window. Not a reading of *now*, which is why it is not in `readingFields`. */
export const WINDOW_LABEL = 'Good hours';

/**
 * The two readings, as labelled fields.
 *
 * **Either half may be missing and neither is invented.** A `Reading` has no
 * "unknown" level — `null` means the model could not read it — and writing
 * *"Dry"* for a wall nobody could measure is defect class 1. A half that is
 * missing is simply absent from the row, and when both are missing the row is
 * empty rather than showing two dashes that read as measurements of nothing.
 *
 * **The score is deliberately not here.** It is suppressed under a Severe+
 * alert and these two are not, so building them together would put that rule
 * somewhere it could be forgotten; `summarizeReadings` owns it.
 */
export function readingFields(
  rock: RockReading | null,
  friction: FrictionReading | null,
): ReadingField[] {
  const fields: ReadingField[] = [];
  if (rock !== null) fields.push({ label: DRYNESS_LABEL, value: ROCK_LABELS[rock.level] });
  if (friction !== null) {
    fields.push({ label: FRICTION_LABEL, value: FRICTION_LABELS[friction.level] });
  }
  return fields;
}

/**
 * A field on a **text** surface, where there is no layout to do the labelling:
 * `Dryness: Dry`.
 *
 * The Mini App sets the label above the value and needs no punctuation; the bot
 * has one column and does. Shared so that the two cannot come to punctuate the
 * same reading differently — the labels themselves are already shared, and this
 * is the rest of the same argument.
 */
export function fieldLine(field: ReadingField): string {
  return `${field.label}: ${field.value}`;
}

/**
 * The two readings where there is room for two words and no more — the end of
 * a daily row, beside its bar: *"Dry · Great"*.
 *
 * **Only for a place that has already said what it is about.** Without the
 * labels the pair is ambiguous, so this is not a shorter `readingFields` to
 * reach for generally; it is the daily list's score column, where the metric
 * toggle above it names the subject.
 *
 * A missing half is omitted rather than filled, exactly as in the fields.
 */
export function readingsShort(
  rock: RockReading | null,
  friction: FrictionReading | null,
): string | null {
  const parts = readingFields(rock, friction).map((f) => f.value);
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
 * The day's window, as the **value** of a `Good hours` field: `7am–11am`.
 *
 * It used to be the sentence *"Good from 7am to 11am"*, and the sentence is
 * what the owner's 2026-09-21 verdict was about. The span is the fact; "good"
 * is the label above it. **That word is about the combined number clearing the
 * window minimum**, not about the friction rung that shares it — the friction
 * field beside it names that rung, and the two have different subjects.
 *
 * `null` is a real answer and it is not an error: no contiguous run of hours
 * cleared the minimum. It reads `None` rather than falling back to the day's
 * best hour, which would present the least bad hour of a wet day as a window.
 */
export function windowValue(
  window: ConditionsWindow | null,
  utcOffsetSeconds: number,
): string {
  if (window === null) return 'None';
  if (window.hours >= FULL_DAY_HOURS) return 'All day';

  const from = formatLocalHour(window.from, utcOffsetSeconds);
  const to = formatLocalHour(window.to, utcOffsetSeconds);
  // An unparseable instant is a gap, not an hour. Naming a span we cannot read
  // the ends of would print "null–null"; saying how long it runs is the part
  // still backed by the data.
  if (from === null || to === null) return `${window.hours}h`;
  // A one-hour window has no span to name, and "7am–7am" reads as a rendering
  // fault rather than as a single hour.
  if (from === to) return from;
  return `${from}–${to}`;
}

/**
 * Why there are no readings at all. **Named rather than a literal**, so adding
 * a reason is a compile error here until it has copy of its own — the same
 * mechanism as `scoreUnavailableLine`.
 *
 * These stay sentences. They are the one case where there is nothing to label,
 * and none of them may read as "conditions are bad" — they are statements about
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
 * The copy that says the friction reading is a guess, on the surface.
 *
 * **A Phase 3 acceptance criterion, not a nicety** (§ Open Questions 6). Every
 * step behind this reading is standard physics with published values except
 * one: what a sweating hand does to grip, which nobody has measured. The
 * decision was to keep that step and quarantine it, and this is half of the
 * quarantine — the other half is that no magnitude is published at all.
 *
 * **It is a fragment and that is deliberate.** It used to read *"Friction is an
 * estimate from temperature, humidity and wind — not a measurement."* Which
 * inputs it comes from belongs with the inputs, in the measurements disclosure;
 * what the surface owes the reader here is that the number is not measured.
 */
export const FRICTION_ESTIMATE_NOTE = 'Friction is estimated, not measured';

/**
 * The copy for an hour whose answer depends on a wall orientation nobody has
 * recorded. Under Crag A the rock reading is then the median of eight walls
 * (`apps/api/src/lib/scoring/cragModel.ts`), so it describes no one wall.
 *
 * **Deliberately not an upper bound.** Those hours use unscaled horizontal
 * irradiance, which reads a vertical wall hot under a high sun — but a
 * sun-facing wall under a low winter sun can exceed horizontal, so the copy
 * must not promise "at most this warm". It says the input is missing and that
 * the reading leans warm, which is what the data supports.
 */
export const UNRECORDED_ASPECT_NOTE = 'Aspect unrecorded — reads the crag as a whole';

/**
 * The qualifier for a wall sitting below its dew point.
 *
 * It is the one mechanism in the friction reading that is uncontested physics,
 * and it is worth naming because it is the case a climber can act on — the wall
 * is wet with condensation, not with rain, and it will clear when the air does.
 */
export const CONDENSING_NOTE = 'Below dew point — condensation on the rock';

export type ReadingsSummaryInput = {
  /** The hour being summarised — normally the hour covering now. */
  reading: HourlyReading | null;
  /** The day's best contiguous run, for the window field. */
  window: ConditionsWindow | null;
  /** The location's own offset, for the window's clock times. */
  utcOffsetSeconds: number;
  /**
   * The event name of an active Severe or Extreme alert, e.g.
   * `Extreme Heat Warning`. **`null` also means "no alert"**, so a caller whose
   * alerts query has not settled passes `alertsPending` as well rather than
   * letting an unsettled query read as an all-clear.
   */
  severeAlertEvent: string | null;
  /**
   * Whether the alerts query is still in flight. **The number waits for it** —
   * drawing a score before suppression can be decided shows an unsuppressed
   * number under a warning that has not arrived yet (defect class 7).
   *
   * Optional because a caller holding a settled list of alerts — the bot — has
   * nothing to wait for.
   */
  alertsPending?: boolean;
  /** Set when there are no readings at all; `reading` and `window` are then null. */
  unavailableReason: ReadingsUnavailableReason | null;
};

export type ReadingsSummary = {
  /**
   * `Dryness` and `Friction`, in that order. Empty when neither could be read;
   * a surface renders nothing rather than a row of dashes.
   */
  readings: ReadingField[];
  /**
   * The score as a field, for a surface that writes it — **third, after the
   * readings, never above them**.
   *
   * `null` when the score was not computed, when a Severe+ alert is active, and
   * while the alerts query is in flight. A caller must not substitute the raw
   * number.
   */
  scoreField: ReadingField | null;
  /** The bare score, for a surface that draws rather than writes it. Same suppression. */
  score: number | null;
  /** `Good hours` and its span. `null` when there are no readings at all. */
  window: ReadingField | null;
  /** *"see the Extreme Heat Warning above"*, or the condensation qualifier. */
  qualifier: string | null;
  /**
   * The caveats this surface must print, in order — fragments, meant to be
   * joined and set small. Never empty when a friction level is on screen: the
   * estimate note is required copy.
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
 * - The words are now derived from physics that sees heat. *"Friction — Poor"*
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
 * structural reason that the row on screen *is* the friction reading — not
 * because a rule caught it.
 */
export function summarizeReadings(input: ReadingsSummaryInput): ReadingsSummary {
  const {
    reading,
    window,
    utcOffsetSeconds,
    severeAlertEvent,
    alertsPending = false,
    unavailableReason,
  } = input;

  if (unavailableReason !== null) {
    return {
      readings: [],
      scoreField: null,
      score: null,
      window: null,
      qualifier: null,
      notes: [],
      unavailableLine: readingsUnavailableLine(unavailableReason),
    };
  }

  const rock = reading?.rock ?? null;
  const friction = reading?.friction ?? null;

  // An alert outranks everything, exactly as it did before (§7 rule 5), and
  // only one qualifier is ever shown — two reads as a list of complaints.
  const qualifier =
    severeAlertEvent !== null
      ? `see the ${severeAlertEvent} above`
      : friction?.condensing === true
        ? CONDENSING_NOTE
        : null;

  // Suppressed under a Severe+ alert and while the alerts query is in flight,
  // and `null` is the only signal. A caller that reaches past this for
  // `reading.score` is defeating the rule.
  const score =
    severeAlertEvent !== null || alertsPending ? null : (reading?.score ?? null);

  const notes: string[] = [];
  // Required copy wherever a friction level appears, and nowhere else: a
  // location showing no friction reading has nothing to caveat.
  if (friction !== null) notes.push(FRICTION_ESTIMATE_NOTE);
  // One note for the whole surface rather than a mark per hour. `qualified` is
  // false for roughly half of every location's hours until Phase 4 writes an
  // aspect, so a per-row flag would be on more rows than off.
  if (rock?.qualified === false || friction?.qualified === false) {
    notes.push(UNRECORDED_ASPECT_NOTE);
  }

  return {
    readings: readingFields(rock, friction),
    scoreField: score === null ? null : { label: SCORE_LABEL, value: String(score) },
    score,
    window: { label: WINDOW_LABEL, value: windowValue(window, utcOffsetSeconds) },
    qualifier,
    notes,
    unavailableLine: null,
  };
}

/* ───────────────────────────────────────────────────────────────────────────
 * The measurements disclosure
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * **What the gauges above were read off, behind a control the reader opens.**
 *
 * Two jobs, and the second is the one that made it worth building:
 *
 * - **It makes a reading checkable.** `Friction: Great` is an estimate with no
 *   working shown; `Temperature 72°F · Humidity 41% · Dew point 47°F` is the
 *   weather a climber can check against their own skin and their own morning.
 *   A reader who disagrees with the gauge can now see *why* it says what it
 *   says, which is the only correction loop this app has until the feedback
 *   button (#143).
 * - **It is where the caveats' mechanism lives.** `FRICTION_ESTIMATE_NOTE` and
 *   `UNRECORDED_ASPECT_NOTE` are fragments by the owner's 2026-09-21 decision —
 *   the gauges are terse and a paragraph under them reads as a report. The
 *   explanation did not stop being owed to the reader; it moved here, where
 *   opening the panel is the reader asking for it.
 *
 * ## The rule this panel exists to obey
 *
 * **A figure is named with the model that produced it, and the two halves are
 * not necessarily the same model.** The air columns come from
 * `HourlySeries.model`, chosen by measured coverage; the rock figures come from
 * `HourlyReadings.model`, which is always `THERMAL_MODEL` because irradiance is
 * never pooled (issue #155). They agree at most points and must not be assumed
 * to — attributing one model's numbers to another is `defect-patterns.md` §3,
 * and this is the one surface that prints both at once. `sharedSource` is how a
 * panel says it once when they do agree without ever claiming they must.
 *
 * ## What may not appear here
 *
 * **No 0-1 factor, ever.** The friction reading's last step is a guess nobody
 * has measured, and the quarantine is that words and ordering reach a screen
 * while magnitudes do not (`sweatBalance.ts`). Everything below is either a
 * weather field from a forecast model or a derived quantity with a named bias —
 * `t_surface_c` and `condensation_margin_c` are explicitly renderable for that
 * reason, and `HourlyConditions.diagnostics` is explicitly not.
 */

/** The control that opens the disclosure. */
export const MEASUREMENTS_LABEL = 'Measurements';

/** The air around the crag — a forecast model's own weather columns. */
export const AIR_GROUP_LABEL = 'Air';
/** The wall — derived quantities, and the group note says they are derived. */
export const ROCK_GROUP_LABEL = 'Rock';

export const TEMPERATURE_LABEL = 'Temperature';
export const HUMIDITY_LABEL = 'Humidity';
export const DEW_POINT_LABEL = 'Dew point';
export const WIND_LABEL = 'Wind';
/**
 * **"Past hour", not "this hour", and the wording is the storage convention.**
 * Precipitation is stamped at the end of the hour it fell in, so the sample
 * covering now describes the hour *before* its timestamp — the same rule that
 * decides which slot a rain bar is drawn in. "Rain now" would move every
 * shower an hour later in the reader's head.
 */
export const RAIN_PAST_HOUR_LABEL = 'Rain, past hour';
export const ROCK_TEMPERATURE_LABEL = 'Rock temperature';
export const DEW_POINT_MARGIN_LABEL = 'Dew point margin';

/**
 * The mechanism behind `FRICTION_ESTIMATE_NOTE`.
 *
 * It names the inputs — which is what the fragment used to say and no longer
 * does — and then says plainly where the estimate stops being physics. That
 * last sentence is the quarantine in the reader's own words: everything up to
 * skin wettedness is standard physics with published values, and the step from
 * there to grip is a judgement no study supports.
 */
export const FRICTION_MECHANISM =
  'Friction is estimated from air temperature, dew point and whether the rock sits above its dew point. How much heat, humidity and cold cost in grip has never been measured, so those penalties are judgements rather than findings.';

/**
 * The mechanism behind `UNRECORDED_ASPECT_NOTE`.
 *
 * **Deliberately not an upper bound**, for the same reason the fragment is not:
 * those hours use unscaled horizontal irradiance, which reads a vertical wall
 * hot under a high sun — but a sun-facing wall under a low winter sun can
 * exceed horizontal. "Usually reads warm" is what the data supports; "at most
 * this warm" is not.
 */
export const UNRECORDED_ASPECT_MECHANISM =
  'No wall orientation is recorded for this location, so drying is read as the middle of eight walls facing every direction, and rock temperature against flat ground. One particular wall can dry sooner or later than that.';

/**
 * What the rock group is.
 *
 * **Required wherever a rock temperature is printed.** It is the most
 * instrument-looking figure on the panel and nothing measures it: no thermometer
 * is on any wall, and the number is a sol-air temperature computed from the
 * forecast. Printing `126°F` beside `Temperature 84°F` without this line invites
 * a reader to treat the first as an observation.
 */
export const ROCK_TEMPERATURE_MECHANISM =
  'Rock temperature is modelled from sun, air temperature and wind — nothing measures the wall itself.';

/**
 * One model, named the way the sources footer names a set of them.
 *
 * `null` in, `null` out: a response that did not say which model answered is
 * left unattributed rather than given a plausible name.
 */
export function modelSourceLabel(model: string | null): string | null {
  return model === null ? null : `Open-Meteo (${model})`;
}

/**
 * How far the wall sits from its dew point, in the direction that decides
 * whether it is condensing.
 *
 * **The conversion is `cToFDelta`, not `cToF`.** This is an interval, and
 * `formatTempF` would add the scale's 32 — putting a comfortable `36°F above`
 * on a wall two degrees from wet.
 *
 * A margin that rounds to zero reads `at the dew point` rather than `0°F below`,
 * which looks like a rendering fault. Within half a degree of the line, which
 * way it falls is below the resolution of a modelled figure — and the gauge
 * above already carries `CONDENSING_NOTE` when the model says it is condensing.
 */
export function dewPointMarginValue(marginC: number | null): string | null {
  if (marginC === null) return null;
  const f = Math.round(cToFDelta(marginC));
  if (f === 0) return 'at the dew point';
  return f > 0 ? `${f}°F above` : `${Math.abs(f)}°F below`;
}

/** The weather fields the disclosure reads. A `HourlySample` satisfies it. */
export type MeasuredHour = Pick<
  HourlySample,
  'temp_c' | 'dewpoint_c' | 'humidity_pct' | 'wind_kmh' | 'wind_gust_kmh' | 'precip_mm'
>;

/** One set of figures and the one source that produced all of them. */
export type MeasurementGroup = {
  /** What this group measures — `Air`, `Rock`. */
  label: string;
  /** Display-ready attribution, or `null` when the response did not name one. */
  source: string | null;
  fields: ReadingField[];
};

export type MeasurementsInput = {
  /** The weather run's hour covering now. `null` when the run does not reach it. */
  hour: MeasuredHour | null;
  /** `HourlySeries.model` — the model `hour`'s columns came from. */
  weatherModel: string | null;
  /** The v2 reading for the same moment, for the derived quantities. */
  reading: HourlyReading | null;
  /** `ConditionsReadings.model` — **not necessarily** `weatherModel`. */
  readingModel: string | null;
};

export type Measurements = {
  /** Ordered: air first, because it is what the reader can check against. */
  groups: MeasurementGroup[];
  /**
   * The one source behind every group, when they share one — so a panel prints
   * it once instead of repeating a model name against each half.
   *
   * **`null` whenever they differ or one is unnamed**, and then each group
   * carries its own. That is the whole of the attribution rule: agreement is
   * derived from the response, never assumed.
   */
  sharedSource: string | null;
  /** The mechanism behind each caveat the gauges above are carrying. Sentences. */
  notes: string[];
};

/** Wind, with the gust only when there is one worth naming. */
function windValue(hour: MeasuredHour): string {
  const base = formatWindMph(hour.wind_kmh);
  const { wind_gust_kmh: gust, wind_kmh: wind } = hour;
  // A gust at or below the sustained wind is not a gust, and printing
  // `9 mph, gusts 9 mph` reads as a fault rather than as calm air.
  if (gust === null || wind === null || gust <= wind) return base;
  return `${base}, gusts ${formatWindMph(gust)}`;
}

type Entry = { label: string; value: string; present: boolean };

/**
 * A group, or `null` when **nothing in it was measured**.
 *
 * The two halves of that rule are deliberate and they disagree with each other
 * on purpose. A group with *something* in it keeps its em dashes: these are
 * measurements, and a gap between two real figures is information — it says the
 * model answered for this hour and had nothing for that field. A group with
 * *nothing* in it is a row of dashes measuring nothing, which reads as a broken
 * panel; it is omitted, exactly as the readings row is when neither reading
 * could be taken.
 */
function measuredGroup(
  label: string,
  source: string | null,
  entries: readonly Entry[],
): MeasurementGroup | null {
  if (!entries.some((e) => e.present)) return null;
  return { label, source, fields: entries.map((e) => ({ label: e.label, value: e.value })) };
}

/**
 * Everything the disclosure shows, assembled in one place so the panel is a
 * renderer rather than a second copy of these rules.
 *
 * Pure, and outside the component, because the Mini App's tests run in `node`
 * with no DOM: the branch that omits an unmeasured group, the one that decides
 * whether the two models can be named once, and the sign of the dew-point
 * margin are all reachable here and none of them would be through a click.
 */
export function measurements(input: MeasurementsInput): Measurements {
  const { hour, weatherModel, reading, readingModel } = input;

  const groups: MeasurementGroup[] = [];

  if (hour !== null) {
    const air = measuredGroup(AIR_GROUP_LABEL, modelSourceLabel(weatherModel), [
      {
        label: TEMPERATURE_LABEL,
        value: formatTempF(hour.temp_c),
        present: hour.temp_c !== null,
      },
      {
        label: HUMIDITY_LABEL,
        value: formatHumidity(hour.humidity_pct),
        present: hour.humidity_pct !== null,
      },
      {
        label: DEW_POINT_LABEL,
        value: formatTempF(hour.dewpoint_c),
        present: hour.dewpoint_c !== null,
      },
      { label: WIND_LABEL, value: windValue(hour), present: hour.wind_kmh !== null },
      {
        label: RAIN_PAST_HOUR_LABEL,
        value: formatPrecipIn(hour.precip_mm),
        present: hour.precip_mm !== null,
      },
    ]);
    if (air !== null) groups.push(air);
  }

  if (reading !== null) {
    const margin = dewPointMarginValue(reading.condensation_margin_c);
    const rock = measuredGroup(ROCK_GROUP_LABEL, modelSourceLabel(readingModel), [
      {
        label: ROCK_TEMPERATURE_LABEL,
        value: formatTempF(reading.t_surface_c),
        present: reading.t_surface_c !== null,
      },
      {
        label: DEW_POINT_MARGIN_LABEL,
        value: margin ?? EM_DASH,
        present: margin !== null,
      },
    ]);
    if (rock !== null) groups.push(rock);
  }

  const first = groups[0]?.source ?? null;
  const sharedSource =
    first !== null && groups.every((g) => g.source === first) ? first : null;

  // One sentence per caveat the gauges are actually carrying — the same
  // conditions `summarizeReadings` uses for the fragments, so the panel cannot
  // explain a caveat that is not on screen or leave one unexplained.
  const notes: string[] = [];
  if (reading?.friction != null) notes.push(FRICTION_MECHANISM);
  if (reading?.rock?.qualified === false || reading?.friction?.qualified === false) {
    notes.push(UNRECORDED_ASPECT_MECHANISM);
  }
  if (reading?.t_surface_c != null) notes.push(ROCK_TEMPERATURE_MECHANISM);

  return { groups, sharedSource, notes };
}
