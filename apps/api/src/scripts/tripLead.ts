/**
 * The arithmetic behind `compare:trip-lead`, pure so the tests can reach every
 * branch without a database.
 */

/** One `trip_day_records` row, as the harness reads it. */
export type LeadRecord = {
  location_id: string
  local_date: string
  recorded_at: Date
  lead_days: number
  score: number | null
  members_wet: number | null
  member_count: number | null
  members_rewet: number | null
  rewet_member_count: number | null
}

/** How a day turned out: the model's look back and, where there is one, the gauge. */
export type DayTruth = {
  location_id: string
  local_date: string
  outcome_score: number | null
  outcome_rain_mm: number | null
  /** Null for no gauge in reach, nothing stored, or a day with an hour unreported. */
  gauge_rain_mm: number | null
}

const dayKey = (location_id: string, local_date: string) => `${location_id}|${local_date}`

/**
 * Each (location, day, lead) once: the **latest** recording at that lead, the
 * one the forecast had settled on by the end of that day of lead. The recorder
 * fires many times a day, and counting each firing would weigh a day by how
 * often the cron ran rather than by the forecast.
 */
export function lastAtEachLead(records: readonly LeadRecord[]): Map<string, Map<number, LeadRecord>> {
  const out = new Map<string, Map<number, LeadRecord>>()
  for (const r of records) {
    const key = dayKey(r.location_id, r.local_date)
    const byLead = out.get(key) ?? new Map<number, LeadRecord>()
    const held = byLead.get(r.lead_days)
    if (held === undefined || r.recorded_at > held.recorded_at) byLead.set(r.lead_days, r)
    out.set(key, byLead)
  }
  return out
}

export type DriftRow = {
  lead: number
  /** Days with a score at this lead and on the day itself (lead 0). */
  n: number
  /** Mean |score at lead − score at lead 0|. */
  meanMove: number | null
  /** Share of those days whose score moved 20 points or more. */
  bigMoveShare: number | null
  /** Days with a score at this lead and a scored outcome. */
  nOutcome: number
  /** Mean |score at lead − the look back's score|. */
  meanError: number | null
}

/** A move this large changes a day from good to doubtful on the score's own bands. */
export const BIG_MOVE_POINTS = 20

const mean = (xs: readonly number[]): number | null => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length)

/**
 * How far a day's score moves between `lead` days out and the day itself, and
 * how far it sits from how the day turned out. Only days that have both ends
 * count, so each lead is compared on its own set of days: a lead with few days
 * says so through `n`.
 */
export function scoreDrift(
  byDay: ReadonlyMap<string, ReadonlyMap<number, LeadRecord>>,
  truths: readonly DayTruth[],
  leads: readonly number[],
): DriftRow[] {
  const truthByDay = new Map(truths.map((t) => [dayKey(t.location_id, t.local_date), t]))
  return leads.map((lead) => {
    const moves: number[] = []
    const errors: number[] = []
    for (const [key, byLead] of byDay) {
      const at = byLead.get(lead)?.score ?? null
      if (at === null) continue
      const onDay = byLead.get(0)?.score ?? null
      if (onDay !== null) moves.push(Math.abs(at - onDay))
      const outcome = truthByDay.get(key)?.outcome_score ?? null
      if (outcome !== null) errors.push(Math.abs(at - outcome))
    }
    return {
      lead,
      n: moves.length,
      meanMove: mean(moves),
      bigMoveShare: moves.length === 0 ? null : moves.filter((m) => m >= BIG_MOVE_POINTS).length / moves.length,
      nOutcome: errors.length,
      meanError: mean(errors),
    }
  })
}

export type ChanceRow = {
  lead: number
  truth: 'model' | 'gauge'
  /** Days where both chances and the truth are known: the two are scored on the same days. */
  n: number
  /** Days of those that were wet. */
  wet: number
  brierWet: number | null
  brierRewet: number | null
}

/**
 * Which rain chance separates the wet days better (`scoring-findings.md`
 * §6e): `members_wet / member_count`, the one the trip tiles show, or
 * `members_rewet / rewet_member_count`, the stricter one recorded beside it.
 * Brier score, 0 perfect, on **paired** days only: a day missing either chance
 * or the truth is dropped for both, so neither is scored on easier days.
 *
 * A day is wet when its truth's rain reached `wetMm`. A null truth is never
 * read as dry.
 */
export function rainChanceComparison(
  byDay: ReadonlyMap<string, ReadonlyMap<number, LeadRecord>>,
  truths: readonly DayTruth[],
  leads: readonly number[],
  wetMm: number,
): ChanceRow[] {
  const truthByDay = new Map(truths.map((t) => [dayKey(t.location_id, t.local_date), t]))
  const rows: ChanceRow[] = []
  for (const truth of ['model', 'gauge'] as const) {
    for (const lead of leads) {
      const wetErr: number[] = []
      const rewetErr: number[] = []
      let wet = 0
      for (const [key, byLead] of byDay) {
        const r = byLead.get(lead)
        const t = truthByDay.get(key)
        if (r === undefined || t === undefined) continue
        const rain = truth === 'model' ? t.outcome_rain_mm : t.gauge_rain_mm
        const pWet = share(r.members_wet, r.member_count)
        const pRewet = share(r.members_rewet, r.rewet_member_count)
        if (rain === null || pWet === null || pRewet === null) continue
        const was = rain >= wetMm ? 1 : 0
        wet += was
        wetErr.push((pWet - was) ** 2)
        rewetErr.push((pRewet - was) ** 2)
      }
      rows.push({ lead, truth, n: wetErr.length, wet, brierWet: mean(wetErr), brierRewet: mean(rewetErr) })
    }
  }
  return rows
}

function share(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole <= 0) return null
  return part / whole
}

/** A forecast check (`feedback`) on a day the recorder followed. */
export type CheckOnDay = {
  location_id: string
  local_date: string
  observed: 'dry' | 'damp' | 'wet' | 'mixed'
}

export type CheckRow = {
  observed: CheckOnDay['observed']
  /** Checks on that word, and the latest forecast score for the day (lead ≥ 1), bucketed. */
  n: number
  good: number
  fair: number
  poor: number
  unscored: number
}

/** The score bands this table buckets by, from the day tile's own colours. */
export const GOOD_SCORE = 80
export const POOR_SCORE = 50

/**
 * What climbers saw against what the forecast said the day before or earlier:
 * the latest scored recording at lead 1 or more. Lead 0 is left out because a
 * check is often entered after a look at the app that morning, and the point
 * is what someone planning would have read.
 */
export function checksAgainstForecast(
  byDay: ReadonlyMap<string, ReadonlyMap<number, LeadRecord>>,
  checks: readonly CheckOnDay[],
): CheckRow[] {
  const words = ['dry', 'damp', 'wet', 'mixed'] as const
  return words.map((observed) => {
    const row: CheckRow = { observed, n: 0, good: 0, fair: 0, poor: 0, unscored: 0 }
    for (const c of checks) {
      if (c.observed !== observed) continue
      row.n += 1
      const byLead = byDay.get(dayKey(c.location_id, c.local_date))
      const ahead = [...(byLead?.values() ?? [])]
        .filter((r) => r.lead_days >= 1 && r.score !== null)
        .sort((a, b) => a.lead_days - b.lead_days)[0]
      const score = ahead?.score ?? null
      if (score === null) row.unscored += 1
      else if (score >= GOOD_SCORE) row.good += 1
      else if (score >= POOR_SCORE) row.fair += 1
      else row.poor += 1
    }
    return row
  })
}
