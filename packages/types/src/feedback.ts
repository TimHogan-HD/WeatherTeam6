import type { CompassPoint } from './compass.js';
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

/**
 * How much sun the rock the climber was on got while they were there. The
 * score has no shade input (Crag A scores eight compass walls and takes the
 * median), so this is what a later comparison needs to tell "the model was
 * wrong" from "the model was right about a wall nobody climbed".
 */
export const SUN_EXPOSURES = ['full_sun', 'mostly_sun', 'mixed', 'mostly_shade', 'full_shade'] as const;
export type SunExposure = (typeof SUN_EXPOSURES)[number];

/**
 * What kept the sun off a wall that was not in full sun, as the climber saw
 * it — any that apply. The point is the cause, not the amount: trees (#398),
 * the way the wall faces (#293), cloud on the day, an overhang above the
 * routes, or other terrain. Each needs a different input to model, so a later
 * comparison has to know which it was.
 */
export const SHADE_CAUSES = ['trees', 'clouds', 'overhang', 'facing', 'terrain'] as const;
export type ShadeCause = (typeof SHADE_CAUSES)[number];

/**
 * The wall's steepness in climbers' words. Words, not degrees: a climber at
 * the base can say "overhanging" but not "20°", and `locations.cliff_angle`
 * runs backwards from climbers' usage (`climbing-terminology-research.md`).
 */
export const WALL_ANGLES = ['slab', 'vertical', 'overhang', 'roof'] as const;
export type WallAngle = (typeof WALL_ANGLES)[number];

/**
 * The directions the form offers for which way a wall faces: eight, because
 * a climber standing at the base can tell NE from E but not ENE from E. The
 * server accepts any of the 16 `COMPASS_POINTS`, the same spelling
 * `locations.aspect` uses.
 */
export const WALL_FACING_CHOICES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const satisfies readonly CompassPoint[];

/** Longest free-text message accepted, in characters. */
export const FEEDBACK_MESSAGE_MAX = 4000;
/** Most reading fields a snapshot may carry — the screen shows at most four. */
export const FEEDBACK_READING_FIELDS_MAX = 8;
/** Longest label or value in a snapshot field. Real ones are a word or two. */
export const FEEDBACK_READING_TEXT_MAX = 60;
/** How far back a forecast check may be dated. Older than this is a memory. */
export const FEEDBACK_OBSERVED_MAX_AGE_DAYS = 60;
/** Longest area or wall name accepted. OpenBeta's longest Minnesota area name is 52. */
export const FEEDBACK_PLACE_TEXT_MAX = 80;
/** Longest routes line accepted — a few route names, comma-separated. */
export const FEEDBACK_ROUTES_TEXT_MAX = 200;
/** Most guidebook routes one stop may pick. A session on one wall is a handful of routes. */
export const FEEDBACK_ROUTE_PICKS_MAX = 20;
/** Most stops one check may list. A long day moves walls a handful of times, not dozens. */
export const FEEDBACK_STOPS_MAX = 8;
/** The longest a check's climbing span may run — one day at the crag, not a trip. */
export const FEEDBACK_SPAN_MAX_HOURS = 16;
/** A check may be entered a few minutes "ahead" by a phone whose clock runs fast. */
export const FEEDBACK_CLOCK_SKEW_MS = 5 * 60 * 1000;

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

/** A guidebook route a stop names: OpenBeta's climb id and its name as picked. */
export type ForecastRoutePick = { id: string; name: string };

/**
 * One place the climber spent time during a check: an area, a wall, the routes,
 * when, and how much sun the rock got there. A day that moves walls is several
 * stops, and each is its own sun observation at its own hours — the data a
 * per-wall sun model needs (#293, #415).
 *
 * Only `started_at` is required; everything else `null` is "not said", never
 * "none".
 */
export type ForecastStop = {
  /** OpenBeta's id for the guidebook area picked, or null when typed or not said. */
  area_id: string | null;
  /** The area's name as the climber saw it — kept beside the id so it survives a new snapshot. */
  area_name: string | null;
  /**
   * OpenBeta's id for the wall picked inside the area — one of its
   * `GuidebookWall.sub_walls`. Null when typed, not said, or when the area has
   * no sub-walls and so is itself the wall (every Red Wing area).
   */
  wall_id: string | null;
  /** The wall's name: the picked one's, or typed. Requires `area_id` when `wall_id` is set. */
  wall: string | null;
  /**
   * Guidebook routes picked, each on the picked wall (or anywhere in the area
   * when no wall is picked). Empty when none were picked; names kept beside
   * the ids for the same reason as `area_name`.
   */
  route_picks: ForecastRoutePick[];
  /** Free text: routes climbed that the list did not have, or every route when the area was typed. */
  routes: string | null;
  /** UTC instant, ISO 8601. */
  started_at: string;
  /** UTC instant, ISO 8601, after `started_at`; null when not said. */
  ended_at: string | null;
  /**
   * What the rock was like on this wall. The check's own `observed_conditions`
   * is the whole crag's: every stop's word when they agree, `mixed` when they
   * do not. Optional for the deploy reason `sub_walls` is: absent on a row
   * stored before the field reads as null.
   */
  rock?: ObservedConditions | null;
  sun_exposure: SunExposure | null;
  /**
   * What kept the sun off, any that apply. Empty when not said, and always
   * empty with no `sun_exposure` or full sun. Absent reads as `[]`.
   */
  shade_causes?: ShadeCause[];
  /** Which way the wall faces, as the climber judged it. Absent reads as null. */
  facing?: CompassPoint | null;
  /** How steep the wall is. Absent reads as null. */
  angle?: WallAngle | null;
};

export type CreateForecastFeedbackInput = {
  kind: 'forecast';
  location_id: string;
  /**
   * UTC instant, ISO 8601 — when the climber saw the rock. With stops, the
   * earliest stop's start: every stop must begin inside
   * `FEEDBACK_SPAN_MAX_HOURS` of it.
   */
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
  /** Where and when, in the order climbed. Absent or `[]` when not said. */
  stops?: ForecastStop[];
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
  /** `[]` for app feedback and for a check that named no stop. */
  stops: ForecastStop[];
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

export function isSunExposure(v: unknown): v is SunExposure {
  return typeof v === 'string' && (SUN_EXPOSURES as readonly string[]).includes(v);
}

export const SUN_EXPOSURE_LABEL: Record<SunExposure, string> = {
  full_sun: 'Full sun',
  mostly_sun: 'Mostly sun',
  mixed: 'Half and half',
  mostly_shade: 'Mostly shade',
  full_shade: 'Full shade',
};

/** The sun buttons' words: short enough for one row of five; the field label says "sun". */
export const SUN_EXPOSURE_SHORT_LABEL: Record<SunExposure, string> = {
  full_sun: 'Full',
  mostly_sun: 'Most',
  mixed: 'Half',
  mostly_shade: 'Little',
  full_shade: 'None',
};

export function isShadeCause(v: unknown): v is ShadeCause {
  return typeof v === 'string' && (SHADE_CAUSES as readonly string[]).includes(v);
}

export const SHADE_CAUSE_LABEL: Record<ShadeCause, string> = {
  trees: 'Trees',
  clouds: 'Clouds',
  overhang: 'Overhang',
  facing: 'Faces away',
  terrain: 'Hill or rock nearby',
};

export function isWallAngle(v: unknown): v is WallAngle {
  return typeof v === 'string' && (WALL_ANGLES as readonly string[]).includes(v);
}

export const WALL_ANGLE_LABEL: Record<WallAngle, string> = {
  slab: 'Slab',
  vertical: 'Vertical',
  overhang: 'Overhang',
  roof: 'Roof',
};

/**
 * The whole crag's rock from each wall's: their word when every wall that
 * said one agrees, `mixed` when they differ, `null` when none said.
 */
export function cragRockOf(rocks: readonly (ObservedConditions | null)[]): ObservedConditions | null {
  const said = [...new Set(rocks.filter((r): r is ObservedConditions => r !== null))];
  if (said.length === 0) return null;
  return said.length === 1 ? (said[0] as ObservedConditions) : 'mixed';
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
 * The snapshot to attach to a check observed at `observedAtMs` — or climbed
 * from `observedAtMs` until `untilMs` — or `null`.
 *
 * **A reading is attached only when it describes an hour being reported on.**
 * A check dated yesterday afternoon against a reading of this morning would
 * record a comparison nobody made — the app never said that about that hour —
 * and it would look exactly like a real one in the table (defect class 3).
 * With a span, any hour inside it counts, so a check entered at the end of a
 * session still carries the reading of its last hour; `valid_at` says which.
 * Empty fields are also `null`: *"the app showed nothing"* is not a reading.
 */
export function feedbackSnapshotFor(
  reading: { valid_at: string; model: string | null; fields: ReadingField[] } | null,
  observedAtMs: number,
  untilMs: number | null = null,
): FeedbackAppReadings | null {
  if (reading === null || reading.fields.length === 0) return null;
  const readingMs = Date.parse(reading.valid_at);
  if (!Number.isFinite(readingMs) || !Number.isFinite(observedAtMs)) return null;
  const endMs = untilMs !== null && Number.isFinite(untilMs) && untilMs > observedAtMs ? untilMs : observedAtMs;
  if (readingMs < observedAtMs - FEEDBACK_SNAPSHOT_TOLERANCE_MS) return null;
  if (readingMs > endMs + FEEDBACK_SNAPSHOT_TOLERANCE_MS) return null;
  return {
    valid_at: reading.valid_at,
    model: reading.model,
    fields: reading.fields.map((f) => ({ label: f.label, value: f.value })),
  };
}

/**
 * One row of `GET /feedback/all`: the owner's view of every account's open
 * feedback, with who sent it. `username` is null for an account that has none
 * (the seeded user).
 */
export type FeedbackFromAnyone = Feedback & { username: string | null };
