import {
  TEMP_RANGE_DEFAULT_F,
  TEMP_RANGE_LIMITS_F,
  cToF,
  fToC,
  type DetailTabKey,
  type Preferences,
  type UpdatePreferencesInput,
} from '@weatherteam6/types'

/**
 * The Profile screen's settings, in the units the reader sets them in: whole
 * °F for the range. Pure, so every rule is reachable from a test.
 */
export type SettingsDraft = { lowF: number; highF: number; tab: DetailTabKey }

/** One tap of − or +, °F. */
export const TEMP_STEP_F = 5

export function draftFromPreferences(p: Preferences): SettingsDraft {
  return {
    lowF: p.temp_low_c === null ? TEMP_RANGE_DEFAULT_F.low : Math.round(cToF(p.temp_low_c)),
    highF: p.temp_high_c === null ? TEMP_RANGE_DEFAULT_F.high : Math.round(cToF(p.temp_high_c)),
    tab: p.default_tab ?? 'overview',
  }
}

/**
 * Move one end by `deltaF`, held inside its limits and never closer to the
 * other end than the minimum gap. The control cannot reach a range the API
 * would refuse.
 */
export function stepRange(draft: SettingsDraft, end: 'low' | 'high', deltaF: number): SettingsDraft {
  const { lowMin, lowMax, highMin, highMax, minGap } = TEMP_RANGE_LIMITS_F
  if (end === 'low') {
    const lowF = Math.min(Math.max(draft.lowF + deltaF, lowMin), lowMax, draft.highF - minGap)
    return { ...draft, lowF }
  }
  const highF = Math.max(Math.min(draft.highF + deltaF, highMax), highMin, draft.lowF + minGap)
  return { ...draft, highF }
}

/** Whether a step in that direction would move anything — the − / + control is off when not. */
export function canStep(draft: SettingsDraft, end: 'low' | 'high', deltaF: number): boolean {
  const next = stepRange(draft, end, deltaF)
  return end === 'low' ? next.lowF !== draft.lowF : next.highF !== draft.highF
}

/**
 * **Only what changed is sent, and a value equal to the default is sent as
 * null** — "use the default" rather than a copy of today's default, so the
 * reader follows it if Crag A's own range is ever moved. Null means nothing
 * changed.
 */
export function settingsUpdate(p: Preferences, draft: SettingsDraft): UpdatePreferencesInput | null {
  const before = draftFromPreferences(p)
  const out: UpdatePreferencesInput = {}
  if (draft.lowF !== before.lowF) {
    out.temp_low_c = draft.lowF === TEMP_RANGE_DEFAULT_F.low ? null : fToC(draft.lowF)
  }
  if (draft.highF !== before.highF) {
    out.temp_high_c = draft.highF === TEMP_RANGE_DEFAULT_F.high ? null : fToC(draft.highF)
  }
  if (draft.tab !== before.tab) out.default_tab = draft.tab === 'overview' ? null : draft.tab
  return Object.keys(out).length === 0 ? null : out
}

/** Whether the draft is the app's defaults throughout — "Reset" is off when it is. */
export function isDefault(draft: SettingsDraft): boolean {
  return draft.lowF === TEMP_RANGE_DEFAULT_F.low && draft.highF === TEMP_RANGE_DEFAULT_F.high && draft.tab === 'overview'
}

export const DEFAULT_DRAFT: SettingsDraft = {
  lowF: TEMP_RANGE_DEFAULT_F.low,
  highF: TEMP_RANGE_DEFAULT_F.high,
  tab: 'overview',
}
