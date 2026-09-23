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
 * was never recorded, and it is what the picker offers someone who does not
 * know. An unrecorded kind takes the slower of the two, so it reads as caution
 * rather than as a guess. (Split 2026-09-16, keeping 12/48 so no existing row
 * moved.)
 *
 * **The windows are `rock-drying-research.md` §7's table, taken whole — owner
 * decision 2026-09-23.** Hours for a moderate storm on a vertical wall, before
 * the angle modifier. The confidence marker on each row is §7's own: [M]
 * measured porosity behind the *ordering*, [C] community convention, [I]
 * inference. **No row is a measured drying time** — §8 records that none exists
 * for any climbing rock — so these order the rocks defensibly and put a number
 * on each that nobody has checked.
 *
 * **The not-recorded values take the slowest window in their family**, the rule
 * `basalt` already followed: `sandstone` is `sandstone_soft`'s 48/120,
 * `limestone` is `limestone_porous`'s 24/72, `basalt` is `basalt_vesicular`'s
 * 12/48. And **`unknown` is the most conservative row in the table** (§6.2):
 * it was 24/48, which declared an unlabelled crag dry a full day before the
 * same wall labelled sandstone.
 *
 * Seepage is not in these numbers and cannot be (§2.3, issue #138). A dense
 * limestone's 18 hours is its *surface*; a seeping one is wet for weeks.
 */
export const MIN_HOURS: Record<RockType, number> = {
  slate: 1, // [C] no pore space; fastest in community rankings
  granite: 1, // [M] fresh plutonic, 0.5-1.5% porosity
  anorthosite: 1, // [I] dense plutonic
  quartzite: 1, // [M] near-zero matrix porosity
  rhyolite: 2, // [I] fine-grained, low porosity
  basalt_dense: 2, // [M] 0.1-1.0% porosity
  gneiss_schist: 2, // [M/I] foliation drainage
  granite_weathered: 3, // [I] grus rind retains water
  tuff_welded: 4, // [C] near-granitic
  limestone_dense: 4, // [M/C] surface only; seepage separate
  dolomite: 6, // [M/I] pocket water
  carbonate_cherty: 6, // [I] two materials in one wall
  sandstone_quartz_arenite: 6, // [M] silica-cemented
  syenite_porous: 12, // [C] breaks the igneous rule
  basalt: 12, // not recorded → basalt_vesicular
  basalt_vesicular: 12, // [M] 30-50% porosity
  sandstone_ferruginous: 12, // [I] Corbin-type
  sandstone_arkose: 12, // [C] Fountain, Millstone Grit
  volcanic_breccia: 12, // [C] matrix-controlled
  limestone: 24, // not recorded → limestone_porous
  limestone_porous: 24, // [S/C] up to 12% absorption
  conglomerate: 24, // [I] matrix-controlled, invisible from the surface
  tuff_nonwelded: 36, // [M] 38-60% porosity
  sandstone_eolian: 36, // [M/C] calcite/clay cement
  sandstone: 48, // not recorded → sandstone_soft
  sandstone_soft: 48, // [C] Elbsandstein / Southern Sandstone class
  unknown: 48, // the most conservative row, §6.2
}

export const MAX_HOURS: Record<RockType, number> = {
  slate: 4,
  granite: 6,
  anorthosite: 6,
  quartzite: 6,
  rhyolite: 8,
  basalt_dense: 8,
  gneiss_schist: 12,
  granite_weathered: 12,
  tuff_welded: 16,
  limestone_dense: 18,
  dolomite: 24,
  carbonate_cherty: 24,
  sandstone_quartz_arenite: 24,
  syenite_porous: 48,
  basalt: 48,
  basalt_vesicular: 48,
  sandstone_ferruginous: 48,
  sandstone_arkose: 48,
  volcanic_breccia: 48,
  limestone: 72,
  limestone_porous: 72,
  conglomerate: 72,
  tuff_nonwelded: 96,
  sandstone_eolian: 96,
  sandstone: 120,
  sandstone_soft: 120,
  unknown: 120,
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
  // A negative angle is an overhang (Phase 4b) and takes the vertical base —
  // see `hourlyConditions.dryingAngleFactor`, which must agree with this line.
  const angleFactor = 1.0 + (Math.min(Math.max(input.cliffAngle, 0), 90) / 90) * 0.3

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
