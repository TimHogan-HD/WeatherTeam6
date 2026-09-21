/**
 * The wire shape of `GET /api/v1/hourly/:locationId`.
 *
 * Deliberately distinct from `HourlyPoint` in `apps/api/src/lib/weather/openMeteo.ts`,
 * which is the *parse* type for an upstream response. The two differ in ways that matter:
 * this one carries a server-derived `local_date`, drops `precip_prob_pct`, and joins the
 * pooled ensemble's percentiles onto the same instant. Naming them the same thing would
 * invite one to be passed where the other is meant.
 *
 * **Every weather field is nullable and that is load-bearing.** Open-Meteo pads every
 * model's arrays out to the longest horizon in the request, so an hour past a model's own
 * reach arrives with every value null rather than being absent. A renderer that treats a
 * null as 0 draws a temperature of 0 °C, a wind of 0 km/h and no rain — all of them
 * plausible readings, none of them measurements. See defect class 1 in
 * `.claude/rules/defect-patterns.md`.
 */

/** One hour, at a real UTC instant, with the chosen deterministic model and the ensemble joined. */
export type HourlySample = {
  /** UTC instant, ISO 8601. The join key between the two sources. */
  valid_at: string
  /**
   * The location's own calendar day this hour falls in (`YYYY-MM-DD`).
   *
   * **Server-derived, and a client must not recompute it.** `utc_offset_seconds` is the
   * location's, not the viewer's. Issue #33 is what happened the last time both sides
   * derived a date: they used the same wrong rule, agreed with each other, and nothing
   * could detect it — today's high became tomorrow's every afternoon in the Americas.
   */
  local_date: string

  // ── deterministic: the single model named in `HourlySeries.model` ───────────────
  temp_c: number | null
  dewpoint_c: number | null
  humidity_pct: number | null
  precip_mm: number | null
  wind_kmh: number | null
  wind_gust_kmh: number | null
  wind_dir_deg: number | null
  cloud_pct: number | null
  pressure_hpa: number | null

  // ── ensemble: pooled across every model's members ───────────────────────────────
  temp_c_p10: number | null
  temp_c_p50: number | null
  temp_c_p90: number | null
  wind_kmh_p10: number | null
  wind_kmh_p50: number | null
  wind_kmh_p90: number | null
  /**
   * The ensemble **mean** hourly accumulation — the only precipitation figure here that
   * can be added up. A step or day total sums this; summing `precip_mm_p50` would be the
   * median of nothing and reads three to twelve times high.
   */
  precip_mm_mean: number | null
  /**
   * The 10th and 90th percentiles of this **one hour's** accumulation across the members —
   * the spread behind `precip_mm_mean`, and the only honest way to draw "how much rain is
   * this, really".
   *
   * **Never add these up, and never print one as a day's or a step's rain.** A sum of
   * hourly p90s is the total of a storm that no single member forecast; measured against
   * the pooled members it reads three to twelve times high. `precip_mm_mean` is the only
   * precipitation figure on this type that can be summed (architecture rule, § A
   * precipitation percentile does not add up). These two are for a band or a whisker on
   * one hour's mark and nothing else.
   *
   * **The mean can sit outside them, and that is real rather than a bug.** When 9 in 10
   * members are dry and one forecasts a downpour, p10 and p90 are both 0 while the mean is
   * not — which is precisely the thing a reader wants to see, and precisely what a p50
   * alone would hide.
   */
  precip_mm_p10: number | null
  precip_mm_p90: number | null
  /**
   * Share of members at or above 0.1 mm this hour, 0-100, rounded to a whole percent.
   *
   * **Null means unknown, not 0%.** A row stored before `members_wet` existed has no wet
   * count, and so does an hour no member reached. A 0 there would be a confident "no
   * chance of rain" that nobody computed.
   *
   * Derived server-side so `members_wet / member_count` is divided in exactly one place
   * rather than by every client with its own rounding rule. This is deliberately **not**
   * Open-Meteo's `precipitation_probability`, which is a blended field no single model
   * owns — see `.claude/rules/architecture.md`.
   */
  precip_chance_pct: number | null
  /** How many ensemble members reached this hour. The spread's own sample size. */
  member_count: number | null
}

/**
 * One deterministic model's own hours, returned only under `?models=all`.
 *
 * Carries **only** the fields that vary by model. The ensemble columns are pooled across
 * every model and belong to none of them, so repeating them here — six times, always
 * null — would be pure payload and would invite a reader to think each model has its own
 * ensemble.
 */
export type HourlyModelSample = {
  /** UTC instant, ISO 8601. Aligned to the same axis as `HourlySeries.hours`. */
  valid_at: string
  temp_c: number | null
  dewpoint_c: number | null
  humidity_pct: number | null
  precip_mm: number | null
  wind_kmh: number | null
  wind_gust_kmh: number | null
  wind_dir_deg: number | null
  cloud_pct: number | null
  pressure_hpa: number | null
}

export type HourlyModel = {
  /** Open-Meteo's model id, e.g. `gfs_seamless`. */
  model: string
  /**
   * **Null means unknown, not "no".** A stored run written before the flag existed cannot
   * say whether `precipitation_probability` was this model's own. A renderer must then
   * withhold the model's name from that column rather than claim it.
   */
  probability_is_shared: boolean | null
  /**
   * How many hours in the window carry at least one non-null value from this model.
   *
   * **Measured, not assumed.** The models do not reach the same distance — an hour that
   * exists in the array is not an hour the model answered for. A switcher built on this
   * must show where each model stops instead of implying they are interchangeable.
   */
  hours_with_data: number
  hours: HourlyModelSample[]
}

/** One local calendar day in the window, and which sources actually reached it. */
export type HourlyDay = {
  /** `YYYY-MM-DD` in the location's local calendar. */
  local_date: string
  /** Whether the model named in `HourlySeries.model` said anything about this day. */
  has_deterministic: boolean
  /** Whether any ensemble member reached this day. */
  has_ensemble: boolean
}

export type HourlySeries = {
  location_id: string
  /** Seconds to add to a UTC instant to get the location's wall clock. */
  utc_offset_seconds: number
  /**
   * When the run was fetched from upstream — **not** a model initialisation time.
   * Null when no run carried one.
   *
   * **The older of the two runs behind this response.** The deterministic and ensemble
   * runs are cached and refetched independently, so they can be an hour apart; a surface
   * printing "fetched N min ago" is making a claim about what the reader is looking at,
   * and the staler half is what bounds it. It is deliberately *not* the run that produced
   * any particular column.
   */
  fetched_at: string | null

  /**
   * The deterministic model the columns in `hours` came from, chosen by measured coverage.
   *
   * `null` when no model answered at this point, in which case every deterministic column
   * in `hours` is null — never quietly filled from another model's numbers.
   */
  model: string | null
  /**
   * Requested models with nothing to show at this point. **Named, never dropped**: a model
   * that silently disappears makes the response look like it read everything it asked for.
   */
  unavailable_models: string[]
  /** Ordered by `valid_at`, ascending. */
  hours: HourlySample[]
  /** Ordered by date, ascending. What a Daily view may offer a drill-down for. */
  days: HourlyDay[]
  /**
   * The v2 scoring model's readings for this window, or a named reason there are
   * none. **Present on every response** — a client reads an absent field as a
   * gap, and `=== null` does not catch `undefined`.
   *
   * Derived from one model, which may not be the one `model` names above. See
   * `HourlyReadings.model`.
   *
   * **A client must still tolerate its absence.** The API and the Mini App
   * deploy separately, so every release that adds a field has a window where
   * the client is new and the response is not — and `undefined` passes every
   * `=== null` guard. Normalise at the fetch boundary, not at each use, exactly
   * as the rain whiskers had to be (`.claude/rules/architecture.md`). It is
   * required here because the *server* must always send it, and a type that let
   * it be omitted would let a route forget.
   */
  readings: HourlyReadings
  /**
   * Every deterministic model that answered — present **only** under `?models=all`,
   * absent otherwise. `hours` is populated either way, so a client that ignores the
   * parameter needs no branch.
   */
  models?: HourlyModel[]
}

/**
 * The v2 scoring model's two readings, as they reach a client.
 *
 * **What is deliberately not here: the 0-1 factors behind the readings.**
 * `HourlyConditions.diagnostics` in the API carries them and this type does
 * not, because the friction reading rests on one unvalidated step — see
 * `apps/api/src/lib/scoring/sweatBalance.ts` — and the owner's decision was to
 * publish **words and ordering, never a magnitude**. A "friction: 0.29" is a
 * precision nobody has earned. `.claude/rules/architecture.md` carries the rule
 * and a test enforces it at the boundary.
 */
export type RockLevel = 'wet' | 'drying' | 'dry';
export type FrictionLevel = 'poor' | 'fair' | 'good' | 'great';

/**
 * `qualified` is false for an hour whose answer could have been changed by a
 * wall orientation nobody has recorded. **Decided per hour, not per location**:
 * the same wall is qualified at 6am and unqualified at 1pm, so a dawn window can
 * be fully qualified on a crag nobody has ever edited.
 *
 * A surface must say so rather than present an unqualified reading as measured.
 */
export type RockReading = { level: RockLevel; qualified: boolean };
export type FrictionReading = {
  level: FrictionLevel;
  condensing: boolean;
  qualified: boolean;
};

export type HourlyReading = {
  /** UTC instant, ISO 8601. **Join on this, never on array position.** */
  valid_at: string;
  /** Null when the rock's state could not be read. There is no "unknown" level. */
  rock: RockReading | null;
  /** Null when a mechanism could not be measured. */
  friction: FrictionReading | null;
  /**
   * 0-100. **Null means an input could not be measured — never 0.** 0 is a real
   * score and it means the wall is wet or running with condensation.
   */
  score: number | null;
  /** Rock surface temperature, °C. A derived measurement, not a guess about grip. */
  t_surface_c: number | null;
  /** How far the wall's bulk sits above its dew point, °C. Below 0 it is condensing. */
  condensation_margin_c: number | null;
};

/** The best contiguous run of hours on a day that cleared the minimums. */
export type ConditionsWindow = {
  /** `valid_at` of the first hour in the run. */
  from: string;
  /** `valid_at` of the last hour. */
  to: string;
  hours: number;
  /** The lowest score in the run — what the window is worth, not its best hour. */
  min_score: number;
  /** False if any hour in the run carries an unqualified reading. */
  qualified: boolean;
};

export type ReadingsDay = {
  local_date: string;
  /** Null when no run of hours cleared the minimums. */
  window: ConditionsWindow | null;
  /**
   * The day's best scored hour, **server-chosen**. A client must not pick its
   * own: the rule for which hour represents a day is part of the model, and two
   * surfaces deriving it independently is how the bot and the Mini App drift
   * apart.
   */
  best: HourlyReading | null;
};

/**
 * Why no reading could be produced. **Null when readings are present.**
 *
 * Named rather than left as a literal, so a new member cannot be added without
 * every surface's copy failing to compile.
 */
export type ReadingsUnavailableReason =
  | 'model_unavailable'
  | 'insufficient_history'
  | 'not_a_climbing_location';

export type HourlyReadings = {
  /**
   * The single model every reading was derived from. **Never pooled** — issue
   * #155: `gem_seamless` reports shortwave ~3x too high past day 4, so
   * irradiance comes from one model and a mean across four would carry the
   * error at half weight.
   *
   * **It may differ from `HourlySeries.model`**, which is chosen by measured
   * coverage. When they differ, the weather columns and the readings came from
   * different models and a surface must not attribute one to the other.
   */
  model: string | null;
  unavailable_reason: ReadingsUnavailableReason | null;
  /** Ordered by `valid_at`. Joined to `HourlySeries.hours` by instant, not index. */
  hours: HourlyReading[];
  /** Ordered by date. One entry per local day in the window. */
  days: ReadingsDay[];
};

/**
 * Today's readings, as they ride along with `GET /conditions/:locationId`.
 *
 * **It exists so that one crag cannot carry two different numbers on two
 * screens.** The list card reads `/conditions`, the detail screen reads
 * `/hourly`, and the bot's panel is built server-side; before this, the card
 * showed the five-component score while the detail screen showed the v2 one,
 * for the same location on the same day. The two models disagree by thirty
 * points on a hot day, which is precisely the kind of plausible-looking
 * difference nobody can debug from a screenshot.
 *
 * Derived from the same `HourlyReadings` the hourly endpoint publishes, so the
 * two are the same run of the same model and cannot drift.
 */
export type ConditionsReadings = {
  /** The single model the readings came from. See `HourlyReadings.model`. */
  model: string | null
  unavailable_reason: ReadingsUnavailableReason | null
  /**
   * Seconds to add to a UTC instant to get **the location's** wall clock.
   *
   * It travels with the readings rather than being looked up beside them,
   * because the window's clock times are the one thing on this type that cannot
   * be rendered without it. A surface that fell back to 0 while some other
   * query settled would print a correct-looking `Good from 7am to 11am` against
   * the wrong hours — issue #33's exact shape.
   */
  utc_offset_seconds: number
  /**
   * The hour covering now, **server-chosen** by the shared `readingNow` rule.
   * Null when the run does not reach this moment — which is a gap, not a calm
   * hour.
   */
  now: HourlyReading | null
  /** Today's window and best hour. Null when the model said nothing about today. */
  today: ReadingsDay | null
}
