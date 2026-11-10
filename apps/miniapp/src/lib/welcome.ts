import {
  EM_DASH,
  SCORE_BANDS,
  SETUP_VERSION,
  TEMP_RANGE_LIMITS_F,
  cToF,
  fToC,
  formatPrecipIn,
  formatTempF,
  hourLabel,
  needsSetup,
  type Preferences,
  type SetupPreviewDay,
  type UpdatePreferencesInput,
} from '@weatherteam6/types'
import { settingsUpdate, stepHours, stepRange, type SettingsDraft } from './preferencesForm.js'

/**
 * **The welcome screen (#543), minus React.** Mockup:
 * `docs/handoffs/design-mockups/welcome-screen.html`. Pure, so every rule is
 * reachable from a test.
 */

/**
 * Whether to show the welcome screen on open. **An absent field is an older API,
 * not "never seen it"** (API and client deploy separately): reading it as null
 * would put every reader on a screen whose save that API refuses with a 400.
 */
export function shouldShowWelcome(p: Preferences | undefined): boolean {
  if (p === undefined || p.setup_version === undefined) return false
  return needsSetup(p)
}

/** Save and start: what changed, as Profile sends it, and the version, which marks the screen done. */
export function welcomeSave(saved: Preferences, draft: SettingsDraft): UpdatePreferencesInput {
  return { ...(settingsUpdate(saved, draft) ?? {}), setup_version: SETUP_VERSION }
}

/** Skip counts as done (owner, 2026-11-10): the version alone, every setting left as it is. */
export const WELCOME_SKIP: UpdatePreferencesInput = { setup_version: SETUP_VERSION }

/** The query `GET /setup/preview` reads the draft from. */
export function previewParams(draft: SettingsDraft): Record<string, number> {
  return { first: draft.firstHour, last: draft.lastHour, low_c: fToC(draft.lowF), high_c: fToC(draft.highF) }
}

/*
 * The sliders set an end to a value rather than step it, through the same
 * clamps as Profile's steppers, so neither control can reach a setting the API
 * would refuse: inside the limits, and never closer to the other end than the
 * minimum gap or a three-hour run.
 */
export const setLowF = (d: SettingsDraft, f: number): SettingsDraft => stepRange(d, 'low', f - d.lowF)
export const setHighF = (d: SettingsDraft, f: number): SettingsDraft => stepRange(d, 'high', f - d.highF)

export function setHour(d: SettingsDraft, end: 'first' | 'last', hour: number): SettingsDraft {
  const hours = { first: d.firstHour, last: d.lastHour }
  const next = stepHours(hours, end, hour - hours[end])
  return { ...d, firstHour: next.first, lastHour: next.last }
}

/**
 * The temperature slider's track, °F: the lowest a low end may go to the
 * highest a high end may go. The mockup drew -10 to 100; the API's limits are
 * not taste, so the track is theirs.
 */
export const TEMP_TRACK_F = { min: TEMP_RANGE_LIMITS_F.lowMin, max: TEMP_RANGE_LIMITS_F.highMax } as const

/** The colour bands as chips, from `SCORE_BANDS`, so the legend and every badge agree about 58. */
export const SCORE_LEGEND = [
  { figure: String(SCORE_BANDS.mostlyDry), note: 'and up', tone: 'good' },
  { figure: String(SCORE_BANDS.mixed), note: `to ${SCORE_BANDS.mostlyDry - 1}`, tone: 'fair' },
  { figure: '0', note: `to ${SCORE_BANDS.mixed - 1}`, tone: 'poor' },
  { figure: EM_DASH, note: 'no data', tone: 'none' },
] as const

/** `Thu`, from a `YYYY-MM-DD` local date. The date has no zone; read it as one. */
export function weekday(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
}

const figure = (score: number | null): string => (score === null ? EM_DASH : String(score))

/** ▲ 25 or ▼ 10 against the default, or nothing when either is unread or they agree. */
export function versusDefault(day: SetupPreviewDay): { arrow: string; up: boolean } | null {
  if (day.score === null || day.default_score === null || day.score === day.default_score) return null
  const diff = day.score - day.default_score
  return { arrow: `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}`, up: diff > 0 }
}

/** The selected day's headline: its default score, and yours when it differs. */
export function dayLine(day: SetupPreviewDay): string {
  const name = weekday(day.date)
  if (day.score === day.default_score) {
    return `${name} scores ${figure(day.score)} on the defaults. Move the sliders to see it change.`
  }
  return `${name}: ${figure(day.default_score)} on the defaults, ${figure(day.score)} with yours.`
}

/**
 * Why the selected day scores what it does, read from the hours themselves: the
 * rain, and the air inside the reader's climbing hours against their range. An
 * hour without a temperature is left out, never read as 32 °F; with none at all
 * the temperature sentence is dropped rather than guessed.
 */
export function dayReason(day: SetupPreviewDay, draft: SettingsDraft): string {
  const out: string[] = []
  const wet = day.hours.filter((h) => h.precip_mm !== null && h.precip_mm > 0)
  if (wet.length > 0) {
    const total = wet.reduce((s, h) => s + (h.precip_mm ?? 0), 0)
    const lastWet = wet[wet.length - 1]!.hour
    out.push(`${formatPrecipIn(total)} of rain until ${hourLabel(lastWet)}, then the rock dries.`)
  }
  const temps = day.hours
    .filter((h) => h.hour >= draft.firstHour && h.hour <= draft.lastHour)
    .map((h) => h.air_temp_c)
    .filter((c): c is number => c !== null && Number.isFinite(c))
  if (temps.length > 0) {
    const lo = Math.min(...temps)
    const hi = Math.max(...temps)
    const loF = Math.round(cToF(lo))
    const hiF = Math.round(cToF(hi))
    const top = `${draft.highF}°F`
    const bottom = `${draft.lowF}°F`
    if (loF > draft.highF) out.push(`Your hours never drop below ${formatTempF(lo)}, above your ${top}.`)
    else if (hiF > draft.highF) out.push(`It reaches ${formatTempF(hi)} in your hours, above your ${top}.`)
    if (hiF < draft.lowF) out.push(`Your hours never get above ${formatTempF(hi)}, below your ${bottom}.`)
    else if (loF < draft.lowF) out.push(`It drops to ${formatTempF(lo)} in your hours, below your ${bottom}.`)
    if (loF >= draft.lowF && hiF <= draft.highF) {
      const span = loF === hiF ? `at ${formatTempF(lo)}` : `between ${formatTempF(lo)} and ${formatTempF(hi)}`
      out.push(`Your hours stay ${span}, inside your range.`)
    }
  }
  return out.join(' ')
}

/** Whether an hour of the strip is inside the reader's climbing hours, so lit. */
export const inHours = (hour: number, draft: SettingsDraft): boolean => hour >= draft.firstHour && hour <= draft.lastHour
