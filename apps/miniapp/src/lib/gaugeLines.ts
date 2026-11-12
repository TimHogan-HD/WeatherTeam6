import {
  formatPrecipIn,
  hourLabel,
  kmToMi,
  type RainGaugeReadings,
  type TripDayGauge,
  type TripDayVolunteerGauge,
} from '@weatherteam6/types'
import { dateLabel } from './trips.js'

/**
 * Rain gauge lines, one wording for every surface that prints them: an ended
 * trip's look back and the Precip tab (#479). One spot's measurement, an
 * airport day versus a volunteer's 24-hour reading, and a short airport day
 * as "not every hour reported", never a drier total.
 */

/** Said once wherever a gauge line is shown. */
export const GAUGE_SOURCE =
  'A rain gauge line is one spot’s measurement, which a passing shower can miss. An airport gauge is summed over the day; a volunteer’s is read once a day and covers the 24 hours shown.'

/**
 * A day's gauge reading as one line, or null when there is none. A day with an
 * hour unreported says so rather than printing a total that may have missed
 * the hour it rained in.
 */
export function gaugeLine(gauge: TripDayGauge | null | undefined): string | null {
  if (gauge == null) return null
  const where = `Rain gauge at ${gauge.station}, ${miles(gauge.distance_km)} mi away`
  return gauge.rain_mm === null ? `${where}: not every hour reported` : `${where}: ${formatPrecipIn(gauge.rain_mm)}`
}

/**
 * A volunteer gauge's report as one line, or null when none reported. It is
 * one reading over the 24 hours before it, not the calendar day, so the
 * window is printed as it is: `7 am 29 Oct – 7 am 30 Oct`.
 */
export function volunteerGaugeLine(gauge: TripDayVolunteerGauge | null | undefined): string | null {
  if (gauge == null) return null
  const at = hourLabel(gauge.obs_hour)
  const window = `${at} ${dateLabel(dateBefore(gauge.report_date))} – ${at} ${dateLabel(gauge.report_date)}`
  return `Volunteer gauge at ${gauge.name}, ${miles(gauge.distance_km)} mi away: ${formatPrecipIn(gauge.rain_mm)}, ${window}`
}

/** Whole miles, never `0 mi`: a gauge under half a mile away is `1 mi`. */
export function miles(km: number): number {
  return Math.max(1, Math.round(kmToMi(km)))
}

function dateBefore(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
}

/** Whether a place has any gauge to read: the Precip tab draws no gauge card otherwise. */
export function hasGauges(r: RainGaugeReadings): boolean {
  return r.airport !== null || r.volunteer.stations > 0
}

/**
 * What the gauges could not say, once for the card: a read that failed. A day
 * with no line under it then reads as "did not answer", never as dry.
 */
export function gaugeGaps(r: RainGaugeReadings): string[] {
  const gaps: string[] = []
  if (r.airport !== null && !r.airport.answered) gaps.push(`The airport gauge at ${r.airport.station} did not answer.`)
  if (r.volunteer.failed > 0) {
    gaps.push(
      r.volunteer.failed === r.volunteer.stations
        ? 'The volunteer gauges did not answer.'
        : `${r.volunteer.failed} of ${r.volunteer.stations} volunteer gauges did not answer.`,
    )
  }
  return gaps
}

/**
 * What an empty day says for one gauge. "No report" only when that gauge's
 * reads all answered; otherwise a failed read could be the day's, so it says
 * the reading is missing rather than that nothing was reported (defect class 2).
 */
export function missingLabel(r: RainGaugeReadings, kind: GaugeKind): string {
  const failed = kind === 'airport' ? r.airport !== null && !r.airport.answered : r.volunteer.failed > 0
  return failed ? 'no reading' : 'no report'
}

export type GaugeKind = 'airport' | 'volunteer'

/** Below this on both sides of a comparison there is too little rain to say anything: 0.10 in. */
export const COMPARE_MIN_MM = 2.54
/** Totals this close read as matched: 0.05 in, or a quarter of the larger, whichever is more. */
export const MATCH_MM = 1.27
export const MATCH_SHARE = 0.25

/** What one gauge says of the models: they ran wetter or drier, matched, or there was too little rain to tell. */
export type SideRead = 'wetter' | 'drier' | 'matched' | 'little'

/** One gauge against the models, summed over the days both have a whole figure for. */
export type GaugeSide = { kind: GaugeKind; gaugeMm: number; modelsMm: number; days: number; read: SideRead }

/**
 * The models' rain set beside each gauge's, over that gauge's own days only:
 * a day counts when the gauge has a whole figure (an airport day with every
 * hour, a volunteer's report) and the models have the whole day
 * (`modelsMm` returns null otherwise). Two gauges never share a models total,
 * since they report on different days. A day either side is missing is left
 * out, never read as dry (defect class 1). Empty when no gauge has such a day.
 */
export function compareGauges(r: RainGaugeReadings, modelsMm: (localDate: string) => number | null): GaugeSide[] {
  const side = (kind: GaugeKind, gaugeOf: (d: RainGaugeReadings['days'][number]) => number | null): GaugeSide | null => {
    let gaugeMm = 0
    let models = 0
    let days = 0
    for (const d of r.days) {
      const g = gaugeOf(d)
      const m = modelsMm(d.local_date)
      if (g === null || m === null) continue
      gaugeMm += g
      models += m
      days += 1
    }
    return days === 0 ? null : { kind, gaugeMm, modelsMm: models, days, read: readSide(gaugeMm, models) }
  }
  return [
    side('airport', (d) => d.gauge?.rain_mm ?? null),
    side('volunteer', (d) => d.volunteer_gauge?.rain_mm ?? null),
  ].filter((s): s is GaugeSide => s !== null)
}

function readSide(gaugeMm: number, modelsMm: number): SideRead {
  const larger = Math.max(gaugeMm, modelsMm)
  if (larger < COMPARE_MIN_MM) return 'little'
  const diff = gaugeMm - modelsMm
  if (Math.abs(diff) <= Math.max(MATCH_MM, MATCH_SHARE * larger)) return 'matched'
  return diff < 0 ? 'wetter' : 'drier'
}

/**
 * The card's answer, one line: what to take from the gauges. A gauge with
 * too little rain to tell says nothing beside one that can; two that read
 * the models opposite ways say so rather than averaging into a match.
 */
export function verdictHeadline(sides: readonly GaugeSide[]): string | null {
  if (sides.length === 0) return null
  const told = sides.filter((s) => s.read !== 'little')
  const first = told[0]
  if (first === undefined) return 'Too little rain to compare'
  const gauge = (s: GaugeSide) => `the ${s.kind} gauge`
  const ran = (read: SideRead) => (read === 'matched' ? 'matched' : `ran ${read} than`)
  if (told.every((s) => s.read === first.read)) {
    return `The models ${ran(first.read)} ${told.length === 1 ? gauge(first) : 'the gauges'}`
  }
  const matched = told.find((s) => s.read === 'matched')
  const off = told.find((s) => s.read !== 'matched')
  if (matched === undefined || off === undefined) return 'The gauges disagree with each other'
  return `The models ${ran(off.read)} ${gauge(off)} and matched ${gauge(matched)}`
}

/** Each gauge's sum beside the models' over its days: `Airport caught 0.31 in where the models had 0.42 in, over the 4 days it reported in full.` */
export function sideLine(s: GaugeSide): string {
  const days = `${s.days} ${s.days === 1 ? 'day' : 'days'}`
  const over = s.kind === 'airport' ? `over the ${days} it reported in full` : `over the ${days} it reported`
  return `${s.kind === 'airport' ? 'Airport' : 'Volunteer'} caught ${formatPrecipIn(s.gaugeMm)} where the models had ${formatPrecipIn(s.modelsMm)}, ${over}.`
}

/**
 * The models' rain per local date, from the hours the grid above draws: a
 * day's total only when all 24 of its hours are there. A part day (the
 * window's first, or one with a missing hour) is `partial`, never a total
 * that could be set beside a gauge's whole day. A spring-forward day has 23
 * hours and so reads partial: withheld, never inflated.
 */
export type ModelDay = { kind: 'value'; mm: number } | { kind: 'partial' }
export function modelDays(hours: readonly { valid_at_local: string; precip_mm: number }[]): Map<string, ModelDay> {
  const sums = new Map<string, { mm: number; hours: number }>()
  for (const h of hours) {
    const date = h.valid_at_local.slice(0, 10)
    const s = sums.get(date) ?? { mm: 0, hours: 0 }
    sums.set(date, { mm: s.mm + h.precip_mm, hours: s.hours + 1 })
  }
  return new Map([...sums].map(([date, s]) => [date, s.hours >= 24 ? { kind: 'value', mm: s.mm } : { kind: 'partial' }]))
}
