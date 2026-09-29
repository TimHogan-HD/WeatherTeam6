import type { ReadingField } from './readingsCopy.js';

/**
 * Feedback — the owner's and testers' path back into the project.
 *
 * Two kinds, one table (`feedback`):
 *
 * - **`app`** — anything about the app itself: a bug, a confusing screen, a
 *   wish. Free text, optionally tied to a saved location.
 * - **`forecast`** — a ground-truth check at a crag: what the rock was actually
 *   like, and whether the app's reading agreed. This is the first data that can
 *   say whether any of the scoring predicts anything (issue #143), so it records
 *   **what the app said** beside **what the climber saw**, rather than a bare
 *   "matched: yes".
 *
 * Nothing here is a score and nothing here feeds one. A check is stored for
 * later comparison, not acted on.
 */

export const FEEDBACK_KINDS = ['app', 'forecast'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/**
 * What the rock was actually like. The same four words as the
 * `overall_status` Postgres enum, which the `feedback` table reuses.
 */
export const OBSERVED_CONDITIONS = ['dry', 'damp', 'wet', 'mixed'] as const;
export type ObservedConditions = (typeof OBSERVED_CONDITIONS)[number];

/** Whether the app's reading agreed with what the climber saw. */
export const FORECAST_VERDICTS = ['matched', 'partly', 'missed'] as const;
export type ForecastVerdict = (typeof FORECAST_VERDICTS)[number];

/** Longest free-text message accepted, in characters. */
export const FEEDBACK_MESSAGE_MAX = 4000;
/** Most reading fields a snapshot may carry — the screen shows at most four. */
export const FEEDBACK_READING_FIELDS_MAX = 8;
/** Longest label or value in a snapshot field. Real ones are a word or two. */
export const FEEDBACK_READING_TEXT_MAX = 60;
/** How far back a forecast check may be dated. Older than this is a memory. */
export const FEEDBACK_OBSERVED_MAX_AGE_DAYS = 60;

/**
 * What the app was showing, captured by the client when the check was entered.
 *
 * **Words, not magnitudes** — the same fence as every other surface
 * (`architecture.md` § magnitude fence): the fields are exactly the
 * `ReadingField`s the Conditions card rendered, so nothing reaches storage that
 * could not reach a screen. `valid_at` is the hour those readings describe,
 * which is how a later comparison knows whether the snapshot and the
 * observation are about the same time.
 */
export type FeedbackAppReadings = {
  /** UTC instant, ISO 8601 — the reading's own hour, not the submit time. */
  valid_at: string;
  /** The model the readings came from, as `ConditionsReadings.model` named it. */
  model: string | null;
  fields: ReadingField[];
};

export type CreateAppFeedbackInput = {
  kind: 'app';
  message: string;
  location_id?: string | null;
};

export type CreateForecastFeedbackInput = {
  kind: 'forecast';
  location_id: string;
  /** UTC instant, ISO 8601 — when the climber saw the rock. */
  observed_at: string;
  observed_conditions: ObservedConditions;
  verdict: ForecastVerdict;
  message?: string | null;
  /**
   * `null` when the app had no reading for that hour — including every check
   * dated away from now. **Absent is not "the app said nothing"**; the client
   * sends `null` explicitly when it had nothing to attach.
   */
  app_readings: FeedbackAppReadings | null;
};

export type CreateFeedbackInput = CreateAppFeedbackInput | CreateForecastFeedbackInput;

/** A stored feedback row, as `GET /feedback` returns it. */
export type Feedback = {
  id: string;
  kind: FeedbackKind;
  /** Null for app feedback about no place, and for a check whose location was since deleted. */
  location_id: string | null;
  /** The location's name when the row was written — survives the location's deletion. */
  location_name: string | null;
  message: string | null;
  observed_at: string | null;
  observed_conditions: ObservedConditions | null;
  verdict: ForecastVerdict | null;
  app_readings: FeedbackAppReadings | null;
  created_at: string;
};

export function isFeedbackKind(v: unknown): v is FeedbackKind {
  return typeof v === 'string' && (FEEDBACK_KINDS as readonly string[]).includes(v);
}

export function isObservedConditions(v: unknown): v is ObservedConditions {
  return typeof v === 'string' && (OBSERVED_CONDITIONS as readonly string[]).includes(v);
}

export function isForecastVerdict(v: unknown): v is ForecastVerdict {
  return typeof v === 'string' && (FORECAST_VERDICTS as readonly string[]).includes(v);
}

export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  app: 'App feedback',
  forecast: 'Forecast check',
};

export const OBSERVED_CONDITIONS_LABEL: Record<ObservedConditions, string> = {
  dry: 'Dry',
  damp: 'Damp',
  wet: 'Wet',
  mixed: 'Mixed',
};

export const FORECAST_VERDICT_LABEL: Record<ForecastVerdict, string> = {
  matched: 'Matched',
  partly: 'Partly',
  missed: 'Missed',
};

/**
 * How far the observation may sit from the reading's hour and still be
 * attached to it. An hour: `readings.now` is the hour covering now, so a check
 * entered at the crag lands inside it and one entered that evening does not.
 */
export const FEEDBACK_SNAPSHOT_TOLERANCE_MS = 60 * 60 * 1000;

/**
 * The snapshot to attach to a check observed at `observedAtMs`, or `null`.
 *
 * **A reading is attached only when it describes the hour being reported on.**
 * A check dated yesterday afternoon against a reading of this morning would
 * record a comparison nobody made — the app never said that about that hour —
 * and it would look exactly like a real one in the table (defect class 3).
 * Empty fields are also `null`: *"the app showed nothing"* is not a reading.
 */
export function feedbackSnapshotFor(
  reading: { valid_at: string; model: string | null; fields: ReadingField[] } | null,
  observedAtMs: number,
): FeedbackAppReadings | null {
  if (reading === null || reading.fields.length === 0) return null;
  const readingMs = Date.parse(reading.valid_at);
  if (!Number.isFinite(readingMs) || !Number.isFinite(observedAtMs)) return null;
  if (Math.abs(readingMs - observedAtMs) > FEEDBACK_SNAPSHOT_TOLERANCE_MS) return null;
  return {
    valid_at: reading.valid_at,
    model: reading.model,
    fields: reading.fields.map((f) => ({ label: f.label, value: f.value })),
  };
}
