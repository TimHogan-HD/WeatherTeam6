import {
  EM_DASH,
  ROCK_LABELS,
  SCORE_MODEL_FACTS,
  clock12,
  cToFDelta,
  readingNow,
  type HourlyReading,
  type HourlyReadings,
  type HourlySample,
} from '@weatherteam6/types'

/**
 * What the Precip and Rock tabs read from `/hourly`'s readings: the rock's
 * Dryness now, when it is next dry, and how far it sits above its dew point
 * over the next two days. Pure, so every rule is reachable by a test.
 *
 * **A gap stays a gap.** No readings, a reason there are none, or no hour near
 * now answers `null` — never `Dry`, never a margin of 0.
 */

const HOUR_MS = 3_600_000
/** How far the nearest reading may sit from now and still be called now. */
const NOW_TOLERANCE_MS = 90 * 60_000

function usable(readings: HourlyReadings | undefined): readonly HourlyReading[] | null {
  return readings === undefined || readings.unavailable_reason !== null ? null : readings.hours
}

/** The reading for the hour covering now, or `null`. */
export function readingAtNow(readings: HourlyReadings | undefined, nowMs: number): HourlyReading | null {
  const hours = usable(readings)
  if (hours === null) return null
  const hour = readingNow(hours, nowMs)
  return hour !== null && Math.abs(Date.parse(hour.valid_at) - nowMs) <= NOW_TOLERANCE_MS ? hour : null
}

/** `Dry`, `Drying` or `Wet` now; `null` when the rock could not be read. */
export function drynessNow(readings: HourlyReadings | undefined, nowMs: number): string | null {
  const rock = readingAtNow(readings, nowMs)?.rock ?? null
  return rock === null ? null : ROCK_LABELS[rock.level]
}

export type DryAgain =
  /** The rock is dry now. */
  | { kind: 'now' }
  /** The first hour ahead read as dry, epoch ms. */
  | { kind: 'at'; ms: number }
  /** Not dry in any hour the readings reach, which `throughMs` is the last of. */
  | { kind: 'not-in-forecast'; throughMs: number }

/**
 * When the rock is next dry, on the readings' own levels. `null` when now
 * could not be read. An unread hour ahead is skipped, never taken as dry.
 */
export function dryAgain(readings: HourlyReadings | undefined, nowMs: number): DryAgain | null {
  const now = readingAtNow(readings, nowMs)
  if (now === null || now.rock === null) return null
  if (now.rock.level === 'dry') return { kind: 'now' }
  const nowAt = Date.parse(now.valid_at)
  let last = nowAt
  for (const h of usable(readings) ?? []) {
    const t = Date.parse(h.valid_at)
    if (!Number.isFinite(t) || t <= nowAt) continue
    if (h.rock !== null) last = Math.max(last, t) // an unread hour is not a day the rock was read as wet
    if (h.rock?.level === 'dry') return { kind: 'at', ms: t }
  }
  return { kind: 'not-in-forecast', throughMs: last }
}

/** Crag A's condensation edge, °F of margin: below it condensation costs grip. */
export const CONDENSATION_EDGE_F = cToFDelta(SCORE_MODEL_FACTS.condensationClearMarginC)

export type MarginHour = {
  t: number
  /** The rock's margin over its dew point, °F; `null` where it could not be read. */
  marginF: number | null
}

/**
 * Hours of margin drawn: the hour covering now and 42 ahead (owner, 2026-11-02,
 * variant A: the six hours back made a "48 h" chart under a "next 42 hours" line).
 */
export const MARGIN_AHEAD_HOURS = 42

/**
 * The rock's margin over its dew point from the hour covering now to 42 ahead,
 * the Rock tab's condensation chart. Only the hours the readings carry: a
 * missing hour is absent, a null margin a gap.
 */
export function marginSeries(readings: HourlyReadings | undefined, nowMs: number): MarginHour[] {
  const hours = usable(readings)
  if (hours === null) return []
  const from = nowMs - HOUR_MS / 2
  const to = nowMs + MARGIN_AHEAD_HOURS * HOUR_MS + HOUR_MS / 2
  return hours
    .map((h) => ({
      t: Date.parse(h.valid_at),
      marginF: h.condensation_margin_c === null ? null : cToFDelta(h.condensation_margin_c),
    }))
    .filter((h) => Number.isFinite(h.t) && h.t >= from && h.t <= to)
}

/**
 * The chart's three zones: at or under the dew point (`dew`, where dew forms on
 * the rock), within the score's edge above it (`near`), and `clear` above that.
 */
export type MarginZone = 'dew' | 'near' | 'clear'

export function marginZone(marginF: number): MarginZone {
  return marginF <= 0 ? 'dew' : marginF < CONDENSATION_EDGE_F ? 'near' : 'clear'
}

/**
 * The air's temperature minus its dew point, °F, for one forecast hour (#436):
 * two forecast values, one model's pair (`temp_c` and `dewpoint_c` are the
 * deterministic run's columns, the pair the Today chart draws). `null` when
 * either is missing, never a spread of 0.
 *
 * It replaces the rock's modelled margin as the figure on screen: no sensor
 * reads rock, and the model's rock temperature misses ground-surface sensors
 * by about 9°F in daytime (`compare:rock-temp`), so a "+3°F" rock gap cannot
 * tell condensing rock from dry. The model's estimate stays, in words only.
 */
export function airDewSpreadF(hour: Pick<HourlySample, 'temp_c' | 'dewpoint_c'>): number | null {
  return hour.temp_c === null || hour.dewpoint_c === null ? null : cToFDelta(hour.temp_c - hour.dewpoint_c)
}

export type SpreadHour = {
  t: number
  /** Air minus dew point, °F; `null` where either was missing. */
  spreadF: number | null
}

/**
 * Air minus dew point from the hour covering now to `MARGIN_AHEAD_HOURS`
 * ahead, the Condensation card's chart. A missing hour is absent, a missing
 * value a gap, as in `marginSeries`.
 */
export function spreadSeries(hours: readonly HourlySample[], nowMs: number): SpreadHour[] {
  const from = nowMs - HOUR_MS / 2
  const to = nowMs + MARGIN_AHEAD_HOURS * HOUR_MS + HOUR_MS / 2
  return hours
    .map((h) => ({ t: Date.parse(h.valid_at), spreadF: airDewSpreadF(h) }))
    .filter((h) => Number.isFinite(h.t) && h.t >= from && h.t <= to)
}

/**
 * `12°F` or `at dew point`. Air never sits below its dew point; a model pair
 * that rounds there reads `at dew point`, never a negative spread.
 */
export function spreadWords(spreadF: number | null): string {
  if (spreadF === null) return EM_DASH
  const f = Math.round(spreadF)
  return f <= 0 ? 'at dew point' : `${f}°F`
}

/** The model's rock, in words, for the read chip and the shaded hours: an estimate, never a figure. */
export const ROCK_DEW_WORDS: Record<MarginZone, string> = {
  dew: 'dew likely',
  near: 'near dew',
  clear: 'clear',
}

export type DampRun = { fromMs: number; toMs: number; zone: Exclude<MarginZone, 'clear'> }

/**
 * The hours the model reads the rock close to or under its dew point, as
 * unbroken runs of one zone (epoch ms of each run's first and last hour), so
 * each hour is shaded as its own zone. Shaded on the chart as an estimate,
 * never as a figure. An unread or missing hour ends a run.
 */
export function dampRuns(series: readonly MarginHour[]): DampRun[] {
  const runs: DampRun[] = []
  let open: DampRun | null = null
  let prevT: number | null = null
  for (const h of series) {
    const zone = h.marginF === null ? null : marginZone(h.marginF)
    const contiguous = prevT !== null && h.t - prevT <= HOUR_MS * 1.5
    if (open !== null && (zone !== open.zone || !contiguous)) {
      runs.push(open)
      open = null
    }
    if (zone === 'near' || zone === 'dew') {
      if (open === null) open = { fromMs: h.t, toMs: h.t, zone }
      else open.toMs = h.t
    }
    prevT = h.t
  }
  if (open !== null) runs.push(open)
  return runs
}

export type DampSpell = {
  /** The spell's first and last hours, epoch ms. */
  fromMs: number
  toMs: number
  /** The first hour in the spell at or under the dew point, or `null` if none is. */
  dewFromMs: number | null
  /**
   * The hour that ends the spell read clear of the edge, epoch ms; `null` when
   * the spell ends at an unread or missing hour, or the end of the series, so
   * nothing says when it clears.
   */
  clearFromMs: number | null
  /** The spell runs to the last hour in the series, so it may go on past it. */
  open: boolean
  /** Hours under the edge after this spell, read later in the series. */
  laterHours: number
  /** The first hour after this spell at or under the dew point, or `null`: a later spell may reach dew when this one does not. */
  laterDewFromMs: number | null
}

/**
 * The first unbroken run of hours under the condensation edge in the series.
 * An unread hour ends a run: it is never taken as near dew or clear of it.
 * `null` when no read hour is under the edge.
 */
export function firstDampSpell(series: readonly MarginHour[]): DampSpell | null {
  const start = series.findIndex((h) => h.marginF !== null && h.marginF < CONDENSATION_EDGE_F)
  if (start < 0) return null
  let end = start
  while (end + 1 < series.length) {
    const next = series[end + 1]
    const prev = series[end]
    if (next === undefined || prev === undefined || next.t - prev.t > HOUR_MS * 1.5) break // a missing hour
    if (next.marginF === null || next.marginF >= CONDENSATION_EDGE_F) break
    end += 1
  }
  const spell = series.slice(start, end + 1)
  const after = series[end + 1]
  const endsClear =
    after !== undefined &&
    after.marginF !== null &&
    after.marginF >= CONDENSATION_EDGE_F &&
    after.t - (series[end]?.t ?? after.t) <= HOUR_MS * 1.5
  const isDew = (h: MarginHour) => h.marginF !== null && marginZone(h.marginF) === 'dew'
  const dew = spell.find(isDew)
  const laterDew = series.slice(end + 1).find(isDew)
  return {
    fromMs: series[start]?.t ?? 0,
    toMs: series[end]?.t ?? 0,
    dewFromMs: dew?.t ?? null,
    clearFromMs: endsClear ? after.t : null,
    open: end === series.length - 1,
    laterHours: series
      .slice(end + 1)
      .filter((h) => h.marginF !== null && h.marginF < CONDENSATION_EDGE_F).length,
    laterDewFromMs: laterDew?.t ?? null,
  }
}

/** `4 PM`, `4 PM tomorrow` or `4 PM Wed`, by the crag's local day against now's. */
export function whenLabel(t: number, nowMs: number, utcOffsetSeconds: number): string {
  const shift = utcOffsetSeconds * 1000
  const day = (ms: number) => Math.floor((ms + shift) / 86_400_000)
  const local = new Date(t + shift)
  const clock = clock12(local.getUTCHours(), 'upper')
  const ahead = day(t) - day(nowMs)
  if (ahead === 0) return clock
  if (ahead === 1) return `${clock} tomorrow`
  return `${clock} ${local.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}`
}

/**
 * The condensation card's headline: when the rock is near its dew point, and
 * when dew is likely on it. Times, not a count of hours; "likely" because the
 * rock temperature is modelled, and no figure for the rock's gap (#436).
 */
export function condensationHeadline(series: readonly MarginHour[], nowMs: number, utcOffsetSeconds: number): string {
  const read = series.filter((h) => h.marginF !== null)
  const first = read[0]
  if (first === undefined) return 'No rock readings for the hours ahead.'
  const spell = firstDampSpell(series)
  // Words only: the rock's gap is modelled, so its size is not printed (#436).
  if (spell === null) return `The rock stays clear of its dew point for the next ${read.length} hours.`
  const at = (t: number) => whenLabel(t, nowMs, utcOffsetSeconds)
  // The hour covering now, not merely the first hour drawn: that may be a later one when now's is missing.
  const isNow = (t: number) => Math.abs(t - nowMs) <= HOUR_MS / 2
  const from = isNow(spell.fromMs) ? 'from now' : `from ${at(spell.fromMs)}`
  // "Until" only when the next hour was read clear; an unread hour is not the end of anything.
  const to =
    spell.clearFromMs !== null
      ? `until ${at(spell.clearFromMs)}`
      : `through ${at(spell.toMs)}, ${spell.open ? 'the last hour read' : 'then a gap in the readings'}`
  const single = spell.clearFromMs === null && spell.fromMs === spell.toMs
  const near = single
    ? `Rock near its dew point ${isNow(spell.fromMs) ? 'now' : `at ${at(spell.fromMs)}`}, ${spell.open ? 'the last hour read' : 'then a gap in the readings'}.`
    : `Rock near its dew point ${from} ${to}.`
  const dew =
    spell.dewFromMs === null
      ? ''
      : isNow(spell.dewFromMs)
        ? ' Dew likely on the rock now.'
        : ` Dew likely on the rock from ${at(spell.dewFromMs)}.`
  // A later spell that reaches dew gets its time; only a later brush with the edge is "near it again".
  const later =
    spell.laterDewFromMs !== null
      ? ` Dew likely on the rock ${spell.dewFromMs === null ? '' : 'again '}from ${at(spell.laterDewFromMs)}.`
      : spell.laterHours > 0
        ? ' Near it again later.'
        : ''
  return near + dew + later
}
