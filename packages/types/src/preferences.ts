/**
 * **A reader's own settings** — scoring Phase 5 (owner decision 2026-10-01):
 * the temperature range friction is judged against, and the tab a crag opens
 * on. One row per account; every field null means "the app's default".
 */

/** The crag screen's tabs, in order. The client's `DetailTab` is this union. */
export const DETAIL_TABS = ['overview', 'daily', 'hourly', 'precip', 'rock', 'crag'] as const
export type DetailTabKey = (typeof DETAIL_TABS)[number]

export function isDetailTab(v: unknown): v is DetailTabKey {
  return typeof v === 'string' && (DETAIL_TABS as readonly string[]).includes(v)
}

/**
 * **Crag A's own range, °F: friction starts falling below 30 and above 60**
 * (`cragModel.ts` derives `COLD_START_C` and `HEAT_START_C` from this, so the
 * default and the model cannot disagree). Both are judgement calls (#143).
 */
export const TEMP_RANGE_DEFAULT_F = { low: 30, high: 60 } as const

/**
 * How far a reader may move each end, °F, and the narrowest range allowed.
 * Judgement calls: wide enough for a winter boulderer and a desert sport
 * climber, narrow enough that "Friction: Great" still means something.
 */
export const TEMP_RANGE_LIMITS_F = { lowMin: 0, lowMax: 50, highMin: 40, highMax: 85, minGap: 10 } as const

export const fToC = (f: number): number => ((f - 32) * 5) / 9

export type Preferences = {
  /** Air temperature, °C, below which friction starts to fall. Null: the default (30 °F). */
  temp_low_c: number | null
  /** Air temperature, °C, above which friction starts to fall. Null: the default (60 °F). */
  temp_high_c: number | null
  /** The tab a crag opens on. Null: Overview. */
  default_tab: DetailTabKey | null
}

/** No row yet reads exactly like a row of nulls. */
export const DEFAULT_PREFERENCES: Preferences = { temp_low_c: null, temp_high_c: null, default_tab: null }

/**
 * The body of `PUT /api/v1/preferences`. An absent field is left alone and
 * **null resets it to the default**; an unknown key is a 400.
 */
export type UpdatePreferencesInput = Partial<Preferences>

/** The range the score uses, °C — the reader's, or the default for any end they left unset. */
export function effectiveTempRangeC(p: Pick<Preferences, 'temp_low_c' | 'temp_high_c'>): {
  lowC: number
  highC: number
} {
  return {
    lowC: p.temp_low_c ?? fToC(TEMP_RANGE_DEFAULT_F.low),
    highC: p.temp_high_c ?? fToC(TEMP_RANGE_DEFAULT_F.high),
  }
}
