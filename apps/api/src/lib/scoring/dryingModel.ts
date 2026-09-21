import type { RockType } from '@weatherteam6/types'

/**
 * Re-exported because this module's own copy of the union was the original
 * source of the drift `ROCK_TYPES` now prevents, and several callers import
 * `RockType` from here. It is an alias now, not a second definition.
 */
export type { RockType }

export type DryingModelInput = {
  rockType: RockType
  cliffAngle: number
  rainfallEvents: { date: string; precip_mm: number }[]
  asOf: Date
}

export type DryingModelOutput = {
  hours_since_significant_rain: number
  last_rain_mm: number
  estimated_dry: boolean
  confidence: 'low' | 'medium' | 'high'
}

/**
 * **`basalt` is three values, because one number cannot describe the family.**
 * Porosity across basalt spans **0.1-1.0% for dense columnar rock and 30-50% for
 * a vesicular flow top** (`.claude/docs/rock-drying-research.md` §3) — the widest
 * spread of any family in the enum, and wider than the gap between granite and
 * sandstone. A single `basalt` row gave Devils Tower and a scoriaceous flow top
 * the same drying window and had to be wrong for one of them.
 *
 * `basalt` is kept, and it does **not** mean "average basalt". It means the kind
 * was never recorded — which is what every existing row holds, and what the
 * picker still offers someone who does not know. An unrecorded kind takes the
 * slower of the two, so it reads as caution rather than as a guess; that is the
 * same rule `unknown` follows, applied inside one family. It keeps 12/48
 * deliberately: every row in production today is `basalt`, and this change must
 * not silently move a single existing location's score.
 */
export const MIN_HOURS: Record<RockType, number> = {
  sandstone: 24,
  limestone: 6,
  granite: 2,
  basalt: 12,
  basalt_dense: 2,
  basalt_vesicular: 12,
  unknown: 24,
}

export const MAX_HOURS: Record<RockType, number> = {
  sandstone: 72,
  limestone: 24,
  granite: 12,
  basalt: 48,
  basalt_dense: 8,
  basalt_vesicular: 48,
  unknown: 48,
}

export type RainfallEvent = { date: string; precip_mm: number }

/**
 * **The rain a wall has seen by the end of `asOfDate`, and nothing after it.**
 *
 * Issue #108: `hoursSinceRain` was measured once from *now* and handed to every
 * day in the forecast, so a day seven out was scored as though the rock had been
 * drying for exactly as long as it has this minute. Drying is 40 of the 100
 * points, so every future day was capped at 60 and `limitingComponent` reported
 * *"limited by drying time"* on days the model itself called dry.
 *
 * Advancing the clock is not `hoursSinceRain + daysOut * 24`, because **rain in
 * the forecast resets it**. This assembles the event list each day is entitled to
 * see, and `dryingModel` then measures from the latest of them as it always has.
 * The shape is the one a shipped competitor describes: *"this principle applies
 * to both past precipitation and projected precipitation leading up to a forecast
 * in the future"* — Climbit FAQ, `climbing-terminology-research.md` §21.7.
 *
 * **Measurement and forecast are never mixed for the same date.** Up to and
 * including `todayDate` the history is the authority; past it, the forecast is.
 * Both sources carry today — the archive holds the rain that has already fallen,
 * the ensemble holds a whole-day total that is partly still to come — and taking
 * both would either double-count the day or resolve a tie by array order.
 *
 * A consequence worth stating, because it is what made this safe to ship: for
 * `asOfDate === todayDate` the forecast slice is empty and the historical slice
 * is the whole list, so **today’s drying input is byte-identical to what it was
 * before this function existed.** Only future days move.
 *
 * Historical events are filtered by `asOfDate` as well, which today is a no-op:
 * `fetchEnsemble` asks for no past days, so no caller passes an `asOfDate` earlier
 * than the archive’s last entry. It is here so the function means what its name
 * says for any date, rather than only for the dates one caller happens to use.
 */
export function rainfallEventsThrough(
  historical: RainfallEvent[],
  forecast: RainfallEvent[],
  todayDate: string,
  asOfDate: string,
): RainfallEvent[] {
  return [
    ...historical.filter((e) => e.date <= asOfDate),
    ...forecast.filter((e) => e.date > todayDate && e.date <= asOfDate),
  ]
}

const SIGNIFICANT_RAIN_MM = 2
const NO_RECENT_RAIN_HOURS = 720 // 30 days — well past any rock type's maxDry

export function dryingModel(input: DryingModelInput): DryingModelOutput {
  const significant = input.rainfallEvents.filter((e) => e.precip_mm > SIGNIFICANT_RAIN_MM)

  if (significant.length === 0) {
    return {
      hours_since_significant_rain: NO_RECENT_RAIN_HOURS,
      last_rain_mm: 0,
      estimated_dry: true,
      confidence: 'high',
    }
  }

  // Most recent significant event by date string (ISO YYYY-MM-DD sorts correctly)
  let mostRecent = significant[0]!
  for (const e of significant) {
    if (e.date > mostRecent.date) mostRecent = e
  }

  // Measured from the END of the rain day. An event dated today therefore ends
  // in the future relative to `asOf`, which made the raw figure negative — about
  // -14h at midday. Clamped, because every consumer treats this as an elapsed
  // duration: `conditionsScore` already floors the drying component at
  // `hoursSinceRain <= 0`, so the clamp changes no score, and the display cap in
  // `formatHoursSinceRain` no longer has to render "no rain in -14h".
  const eventEnd = new Date(mostRecent.date + 'T23:59:59Z').getTime()
  const hoursSince = Math.max(0, (input.asOf.getTime() - eventEnd) / 3_600_000)

  // Cliff angle modifier: 0° vertical = base, 90° slab = 30% longer drying.
  // Steeper walls (lower angle) drain water faster, so get the base factor.
  const angleFactor = 1.0 + (input.cliffAngle / 90) * 0.3

  const maxDry = MAX_HOURS[input.rockType] * angleFactor
  const minDry = MIN_HOURS[input.rockType] * angleFactor

  const estimated_dry = hoursSince >= maxDry

  let confidence: 'low' | 'medium' | 'high'
  if (hoursSince >= maxDry) confidence = 'high'
  else if (hoursSince >= minDry) confidence = 'medium'
  else confidence = 'low'

  return {
    hours_since_significant_rain: hoursSince,
    last_rain_mm: mostRecent.precip_mm,
    estimated_dry,
    confidence,
  }
}
