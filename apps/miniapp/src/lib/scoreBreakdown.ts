import {
  SCORE_LIMIT_LABELS,
  SCORE_MODEL_FACTS,
  cToFDelta,
  formatLocalHour,
  formatTempF,
  heldBackReason,
  type HourlyReading,
  type HourlySample,
  type RangeF,
  type ScoreLimit,
} from '@weatherteam6/types'
import { shortDay } from './overview.js'

/**
 * The Overview's Score breakdown, one row per cause (owner, 2026-10-29): what
 * it is, today's figure, the rule it broke, what that means for a climber, and
 * when it eases.
 *
 * **Rules, never sizes.** Every threshold comes from `SCORE_MODEL_FACTS` or the
 * reader's range; how many points a cause costs stays in the model's
 * diagnostics (the magnitude fence, `scoring.md`).
 *
 * **"Eases" reads the model's own verdict forward**: the first hour ahead whose
 * `held_back_by` no longer names the cause. A gap in the readings ends the
 * search, because the cause may have eased inside it; a run that never eases
 * before the readings end says nothing rather than "not today".
 */
export type BreakdownRow = {
  limit: ScoreLimit
  /** `Humidity`. */
  label: string
  /** Today's figure behind it, `dew point 57°F`. Null when it is not the score's own input, and always for condensation (#436). */
  figure: string | null
  /** The rule, `Points come off once the dew point is above 54°F.` */
  rule: string
  /** One line of plain meaning. */
  meaning: string
  /** `Eases ≈ 8pm, when the dew point drops to 53°F`. Null when the forecast does not reach the hour it eases. */
  eases: string | null
}

export type BreakdownInput = {
  /** The causes, most limiting first, as the hour covering now names them. */
  limits: readonly ScoreLimit[]
  /** The hour covering now. */
  now: HourlyReading
  /** `/hourly`'s readings, ordered by `valid_at`, and its weather hours. */
  readings: readonly HourlyReading[]
  hours: readonly HourlySample[]
  /**
   * Whether the weather columns are the score's own model's (`HourlySeries.model ===
   * readings.model`). When they differ, the dew point and air figures are another
   * model's and are not printed beside the score's rule (`readings.md`).
   */
  sameModel: boolean
  rangeF: RangeF
  utcOffsetSeconds: number
  todayDate: string | null
}

const MEANING: Record<ScoreLimit, string> = {
  wet_rock: 'Wet holds are slick, and some rock is weaker until it dries.',
  condensation:
    'Rock this close to its dew point can pick up a film of moisture you can’t see. The rock’s temperature is modelled, not measured.',
  heat: 'Warm air makes hands sweat, and grip goes with it.',
  humidity: 'Air this wet keeps hands sweaty and stops chalk drying them.',
  cold: 'Cold numbs fingers and stiffens shoe rubber.',
}

function rule(limit: ScoreLimit, range: RangeF): string {
  switch (limit) {
    case 'wet_rock':
      return 'Points come off until the rock reads Dry.'
    case 'condensation':
      return `Points come off when the rock is within ${cToFDelta(SCORE_MODEL_FACTS.condensationClearMarginC).toFixed(1)}°F of its dew point.`
    case 'heat':
      return range === null ? 'Points come off once the air is above your range.' : `Points come off once the air is above your ${range.high}°F high.`
    case 'humidity':
      return `Points come off once the dew point is above ${SCORE_MODEL_FACTS.dewStartF}°F.`
    case 'cold':
      return range === null ? 'Points come off once the air is below your range.' : `Points come off once the air is below your ${range.low}°F low.`
  }
}

/** The weather figure a cause reads, at one hour. Null where it has none, or it is not the score's input. */
function figureAt(limit: ScoreLimit, sample: HourlySample | undefined, sameModel: boolean): { now: string; then: string } | null {
  if (!sameModel || sample === undefined) return null
  if (limit === 'humidity') {
    return sample.dewpoint_c === null ? null : { now: `dew point ${formatTempF(sample.dewpoint_c)}`, then: `the dew point drops to ${formatTempF(sample.dewpoint_c)}` }
  }
  if (limit === 'heat') {
    return sample.temp_c === null ? null : { now: `air ${formatTempF(sample.temp_c)}`, then: `the air drops to ${formatTempF(sample.temp_c)}` }
  }
  if (limit === 'cold') {
    return sample.temp_c === null ? null : { now: `air ${formatTempF(sample.temp_c)}`, then: `the air warms to ${formatTempF(sample.temp_c)}` }
  }
  return null
}

/** The first reading after `fromMs` that no longer names `limit`; null at a gap or the readings' end. */
export function easesAt(limit: ScoreLimit, readings: readonly HourlyReading[], fromMs: number): HourlyReading | null {
  for (const r of readings) {
    const t = Date.parse(r.valid_at)
    if (!Number.isFinite(t) || t <= fromMs) continue
    // Unscored, or an older API: the cause may have eased in this hour, so nothing after it can be named.
    if (r.held_back_by == null) return null
    if (!r.held_back_by.includes(limit)) return r
  }
  return null
}

export function breakdownRows(input: BreakdownInput): BreakdownRow[] {
  const byInstant = new Map(input.hours.map((h) => [h.valid_at, h]))
  const nowMs = Date.parse(input.now.valid_at)
  return input.limits.map((limit) => {
    const label = SCORE_LIMIT_LABELS[limit]
    const figureNow =
      limit === 'condensation'
        ? null
        : limit === 'wet_rock'
          ? `rock ${heldBackReason(limit, input.now.rock, input.rangeF)}`
          : (figureAt(limit, byInstant.get(input.now.valid_at), input.sameModel)?.now ?? null)

    let eases: string | null = null
    const at = Number.isFinite(nowMs) ? easesAt(limit, input.readings, nowMs) : null
    const sample = at === null ? undefined : byInstant.get(at.valid_at)
    const clock = at === null ? null : formatLocalHour(at.valid_at, input.utcOffsetSeconds)
    // The day comes from the server's own local date; without it the hour could be any day's.
    if (at !== null && clock !== null && sample !== undefined && input.todayDate !== null) {
      const day = shortDay(sample.local_date, input.todayDate)
      const then = figureAt(limit, sample, input.sameModel)?.then ?? null
      eases = `Eases ≈ ${day === 'Today' ? '' : `${day} `}${clock}${then === null ? '' : `, when ${then}`}`
    }

    return { limit, label, figure: figureNow, rule: rule(limit, input.rangeF), meaning: MEANING[limit], eases }
  })
}

/** `2 things cost points`, `1 thing costs points`. */
export function breakdownCount(n: number): string {
  return n === 1 ? '1 thing costs points' : `${n} things cost points`
}
