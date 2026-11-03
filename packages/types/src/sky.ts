/**
 * **How sunny it is** — the sky block on `GET /hourly/:id`, and the copy every
 * surface shows it with.
 *
 * Three readings, from one model run (`SkySeries.model`):
 *
 * - **Minutes of bright sun per hour** (`SunHour.sun_min`): Open-Meteo's
 *   `sunshine_duration`, the WMO measure — direct sun of at least 120 W/m²,
 *   bright enough to cast a shadow. The Hourly Sun card draws it as bars; the
 *   Daily row says it as hours and windows; the day's icon is sorted from it.
 * - **How strong the sun is** (`shortwave_wm2`, said as `SunStrength` words):
 *   sunlight on flat ground. It appears only in the Sun card's readout, as a
 *   word with the figure beside it (owner, 2026-11-03: the earlier rule against
 *   W/m² on screen, 2026-10-16, was about a chart nobody could read).
 * - **Cloud cover** (`cloud_pct`), drawn faded behind the sun bars.
 *
 * **Null is a gap, never a dull hour.** 0 minutes is a measured hour without
 * sun; null is an hour the model did not answer, and a day with any such
 * daylight hour has no total, no windows and no icon. Reading a missing hour as
 * sunless would be the plausible-value defect (`defect-patterns.md` §1) in its
 * most tempting form, because "no sun" is what an empty chart looks like.
 *
 * **Limits, said where they are drawn:** every figure is for flat open ground.
 * Terrain shade and a wall's angle are not in it, and past day 3 an hour's sun
 * is a rough guess even when the day's total is useful.
 */

export type SkyCondition = 'sunny' | 'partly_cloudy' | 'cloudy'

/** One daylight hour, sun at least 10° up. Night and low-sun hours are not in this list. */
export type SkyHour = {
  /** UTC instant, ISO 8601 — the same stamp as `HourlySample.valid_at`. */
  valid_at: string
  /** The location's calendar day. Server-derived; a client must not recompute it. */
  local_date: string
  /** Null when the model's sunshine did not reach this hour. */
  sky: SkyCondition | null
}

/**
 * One hour of the Sun card — every hour of every day in the window, night
 * included, so the card can say "night" rather than leave a hole.
 */
export type SunHour = {
  /** UTC instant at the **end** of the hour these figures cover. */
  valid_at: string
  local_date: string
  /** The sun is above the horizon for some of this hour. */
  daylight: boolean
  /** Minutes of bright sun in the hour, 0–60. Null is no answer. */
  sun_min: number | null
  /** Mean sunlight on flat ground over the hour, W/m². 0 at night; null is no answer. */
  shortwave_wm2: number | null
  /** Share of the sky covered by cloud, 0–100, at the stamp. Null is no answer. */
  cloud_pct: number | null
}

/**
 * A day in a few words. `sunny_morning` and `sunny_afternoon` exist because
 * "partly cloudy" hides the one thing a climber plans around: which half of
 * the day the sun is out.
 */
export type SkyDaySummary =
  | 'sunny'
  | 'sunny_morning'
  | 'sunny_afternoon'
  | 'partly_cloudy'
  | 'cloudy'

/** A run of hours with at least half an hour of sun each, in local wall-clock hours, `end_hour` exclusive (0–24). */
export type SunWindow = { start_hour: number; end_hour: number }

export type SkyDay = {
  local_date: string
  /** Null when any of the day's daylight hours is a gap. */
  summary: SkyDaySummary | null
  /** Minutes of bright sun across the day. Null when any daylight hour is a gap. */
  sun_min: number | null
  /** The sunny stretches, in order. Null with `sun_min`. */
  sun_windows: SunWindow[] | null
  /**
   * The day's sun from each model that answered every daylight hour of it,
   * `SkySeries.model` among them. Fewer than two is no comparison, and the
   * Daily line then never says the forecasts differ.
   */
  sun_by_model: { model: string; sun_min: number }[]
}

export type SkySeries = {
  /**
   * The model whose sun was read — the scoring model's, so the sky on screen is
   * the one the drying clock ran on. Null when it did not answer.
   */
  model: string | null
  /** Daylight hours in the window, ascending — the sky word per hour. */
  hours: SkyHour[]
  /** Every hour in the window, ascending — the Sun card. */
  sun: SunHour[]
  /** One per date in the window, ascending. */
  days: SkyDay[]
}

export const SKY_HOUR_LABEL: Record<SkyCondition, string> = {
  sunny: 'Sunny',
  partly_cloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
}

export const SKY_DAY_LABEL: Record<SkyDaySummary, string> = {
  sunny: 'Sunny',
  sunny_morning: 'Sunny morning',
  sunny_afternoon: 'Sunny afternoon',
  partly_cloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
}

/** The icon a day wears: a half-sunny day is the sun-and-cloud glyph. */
export function skyDayIcon(summary: SkyDaySummary): SkyCondition {
  if (summary === 'sunny') return 'sunny'
  if (summary === 'cloudy') return 'cloudy'
  return 'partly_cloudy'
}

// --- Strength ---------------------------------------------------------------

export type SunStrength = 'strong' | 'moderate' | 'weak'

/**
 * Sunlight on flat ground at or above this is `strong` — a clear summer
 * midday gives 800–1000 W/m². `compare:sky`, 2026-11-03 (Sep–Oct): GFS's word
 * matched the pyranometer's in 77% of hours sun ≥ 10° up; GFS reads ~76 W/m²
 * high, so its `strong` was `moderate` on the ground more often than not in
 * autumn, when only 6% of measured hours reached 700.
 */
export const SUN_STRONG_MIN_WM2 = 700
/** Below this it is `weak`: a low winter sun, or bright overcast. */
export const SUN_WEAK_BELOW_WM2 = 300

/** The word for an hour's sunlight, or null for night (0), a gap, or a value that is not a measurement. */
export function sunStrength(wm2: number | null): SunStrength | null {
  if (wm2 === null || !Number.isFinite(wm2) || wm2 <= 0) return null
  if (wm2 >= SUN_STRONG_MIN_WM2) return 'strong'
  if (wm2 < SUN_WEAK_BELOW_WM2) return 'weak'
  return 'moderate'
}

// --- The Daily line ---------------------------------------------------------

/**
 * Models whose day totals differ by at least this many minutes make the line
 * say so. `compare:sky`, 2026-11-03 (six USCRN stations, Sep–Oct, short lead):
 * GFS's day total missed by 1.2 h when the models agreed to the hour, ~1.75 h
 * at a 1–2 h spread and ~2.0 h from 3 h. From 2 h the line said it on 39% of
 * days; from 3 h on 25%, with the same separation. A weak signal: it says the
 * models disagree, not that GFS is wrong.
 */
export const SUN_DIFFER_MIN = 180

/** At most this many windows are listed; more reads as "on and off". */
export const SUN_MAX_WINDOWS = 2

export type SunDayLine = {
  text: string
  /** Drawn in the sun colour: the day has at least an hour of sun by every reading the line gives. */
  sunny: boolean
  /** The line is a gap mark, not a reading. */
  gap: boolean
}

/** `8a`, `12p`, `12a` — the hour with its half of the day. */
function hourLabel(h: number): { n: string; ap: 'a' | 'p' } {
  const hh = ((h % 24) + 24) % 24
  const ap = hh < 12 ? 'a' : 'p'
  const n = hh % 12 === 0 ? 12 : hh % 12
  return { n: String(n), ap }
}

/** `8a–4p`, or `8–11a` when both ends share a half of the day. */
export function sunWindowLabel(w: SunWindow): string {
  const a = hourLabel(w.start_hour)
  const b = hourLabel(w.end_hour)
  return a.ap === b.ap ? `${a.n}–${b.n}${b.ap}` : `${a.n}${a.ap}–${b.n}${b.ap}`
}

const hoursOf = (min: number): number => Math.round(min / 60)

/**
 * The Daily row's second line: `Sun 8a–4p · 8 h`, `Sun 8–9a, 2–4p · 3 h`,
 * `Sun 5 h, on and off`, `Sun under 1 h`, `No sun`, `Sun 0–3 h · forecasts differ`, or the gap
 * mark `Sun —` when the day was not fully answered.
 */
export function sunDayLine(day: Pick<SkyDay, 'sun_min' | 'sun_windows' | 'sun_by_model'>): SunDayLine {
  if (day.sun_min === null || day.sun_windows === null) return { text: 'Sun —', sunny: false, gap: true }

  const totals = day.sun_by_model.map((m) => m.sun_min)
  if (totals.length >= 2) {
    const lo = Math.min(...totals)
    const hi = Math.max(...totals)
    if (hi - lo >= SUN_DIFFER_MIN) {
      return { text: `Sun ${hoursOf(lo)}–${hoursOf(hi)} h · forecasts differ`, sunny: hoursOf(lo) >= 1, gap: false }
    }
  }

  // "No sun" only when the forecast has none: up to 29 minutes rounds to 0 h but is still sun.
  if (day.sun_min < 1) return { text: 'No sun', sunny: false, gap: false }
  const h = hoursOf(day.sun_min)
  if (h === 0) return { text: 'Sun under 1 h', sunny: false, gap: false }
  const ws = day.sun_windows
  if (ws.length >= 1 && ws.length <= SUN_MAX_WINDOWS) {
    return { text: `Sun ${ws.map(sunWindowLabel).join(', ')} · ${h} h`, sunny: true, gap: false }
  }
  return { text: `Sun ${h} h, on and off`, sunny: true, gap: false }
}
