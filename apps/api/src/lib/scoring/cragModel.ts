/**
 * **Crag A and Wall A — the scoring model every screen reads.** Replaced v2's
 * Layer 3 on 2026-09-24 by owner decision. The research, the test days and the
 * seven corrected errors are in `.claude/docs/crag-a-reference/README.md`;
 * `model.ts` beside it is the reference this file was ported from, and a change
 * here that moves a result there needs an argument, not a commit message.
 *
 * ```
 * score = 100 × dryness × friction
 * ```
 *
 * - **Crag A** (`evaluateCragA`) is a crag's score and the only one a location
 *   carries: the drying clock runs on eight vertical walls, one per compass
 *   point, through `rockThermal`'s wall geometry, and the hour's dryness is
 *   their median.
 * - **Wall A** (`evaluateWallA`) scores one specific wall, with the overhang's
 *   rain shelter applied and its heat and cold read from air plus the direct
 *   sun on that wall (`sunWarmingC`). It is never a crag's score; it is
 *   published beside one as `HourlyReadings.walls` (#445).
 *
 * Friction is the heat/humidity/cold rule (`frictionFactorA`), not v2's sweat
 * balance: it reads air temperature, dew point and each wall's margin over the
 * dew point (`condensationA`). That margin takes the wall's sun, so an hour
 * whose shortwave is missing has no friction and no score.
 *
 * Built on top of `evaluateHourlyConditions`, which still supplies `T_mass`,
 * `T_surface` and the weather-sped drying rate. Its own score is discarded.
 *
 * Every factor withholds rather than degrades, as v2's did: an hour whose rain
 * was not measured is null, and so is every hour after it until a full drying
 * window has run (issue #34).
 */
import {
  CLIMB_HOURS_DEFAULT,
  REWETTING_PRECIP_MM,
  TEMP_RANGE_DEFAULT_F,
  type ClimbHours,
  WETTING_PRECIP_MM,
  fToC,
  rockGuide,
  type RockSunShade,
  type RockType,
  type ScoreLimit,
  type SunWall,
  sunOnWallAt,
} from '@weatherteam6/types'
import { MAX_HOURS, MIN_HOURS } from './dryingModel.js'
import {
  condensationFactor,
  dryingWindowHours,
  evaluateHourlyConditions,
  frictionLevel,
  type HourlyConditions,
  type RockLevel,
  type ScorePenalties,
  type WeatherHour,
} from './hourlyConditions.js'
import {
  SOLAR_ABSORPTANCE,
  isCondensing,
  laggedSurfaceC,
  surfaceCoefficient,
  wallBeamWm2,
  type WallOrientation,
} from './rockThermal.js'

/**
 * Friction starts falling above this air temperature, °C (60 °F) — unless the
 * reader set their own range (`TempRangeC`). Derived from the shared default so
 * the model and the preferences screen cannot disagree about it.
 */
export const HEAT_START_C = fToC(TEMP_RANGE_DEFAULT_F.high)
/** Friction starts falling above this dew point, °C (54 °F). */
export const DEW_START_C = (54 - 32) * (5 / 9)
/** Friction starts falling below this air temperature, °C (30 °F), unless the reader set their own. */
export const COLD_START_C = fToC(TEMP_RANGE_DEFAULT_F.low)

/**
 * **The reader's temperature range, °C** (`user_preferences`, scoring Phase 5):
 * where the cold and heat penalties start. Absent means Crag A's own.
 */
export type TempRangeC = { lowC: number; highC: number }
const DEFAULT_RANGE: TempRangeC = { lowC: COLD_START_C, highC: HEAT_START_C }
/** e-folding scale of the heat and cold penalties, °C. */
export const HEAT_SCALE_C = 12
/** e-folding scale of the humidity penalty, °C. */
export const DEW_SCALE_C = 10

/** A storm of this many inches (or more) needs the rock type's full drying window. */
export const FULL_SOAK_IN = 0.4
/** Rain in an hour that wets an open wall, mm (`packages/types`, so the Precip tab draws the same line). v2 only reset at 0.5. */
export const WET_MM = WETTING_PRECIP_MM
/**
 * The wetting threshold kept for a sheltered overhang, mm/h — its shelter
 * fraction was calibrated against this, so drizzle does not wet it.
 */
export const SHELTERED_WET_MM = 0.5
/**
 * Rain falling at this rate or more, mm/h, is rain you would see on the rock:
 * the hour scores as wet whatever the storm's size (owner, 2026-10-26). Below
 * it, rain sets the clock back by its size and no more. The same line as the
 * Precip tab's "real rain", so "raining now" means one thing everywhere.
 */
export const FALLING_RAIN_MM = REWETTING_PRECIP_MM
/** Rain at or below this air temperature lies as snow, °C. */
export const SNOW_TEMP_C = 0.5
/** Snow water at or above this, mm, caps dryness at `SNOW_DRYNESS_CAP`. */
export const SNOW_LYING_MM = 1
export const SNOW_DRYNESS_CAP = 0.25
/** Melt, mm/h per °C above freezing, plus per W/m² of shortwave. A guess nothing has checked. */
export const MELT_PER_C = 0.15
export const MELT_PER_WM2 = 0.0015

/**
 * **A rock that breaks when wet never dries faster than the clock on the wall**
 * (F17, 2026-10-21: the owner asked for a wait after rain; this is the form of
 * it that moved the test day, measured in `crag-a-reference/README.md`). Its `MAX_HOURS` are the land-manager rules
 * ("wait 24–48 h"), which are elapsed hours, and the danger is water inside the
 * rock that sun and dry air on the surface do not reach. Red Rock read 76 two
 * days after half an inch in January sun; this reads 39, and five days after
 * still reads 100. With `drynessTrack`'s one-hour floor (2026-11-02) such rock
 * dries at exactly elapsed time: weather no longer slows it either.
 * `unknown` has no guide and counts as fragile, being the most cautious row.
 */
export function maxDryingRate(rockType: RockType): number {
  return breaksWhenWet(rockType) ? 1 : Infinity
}

/** `rockGuide`'s `whenWet: 'fragile'`, and `unknown`, which has no guide. */
function breaksWhenWet(rockType: RockType): boolean {
  return (rockGuide(rockType)?.whenWet ?? 'fragile') === 'fragile'
}

/** A day is worth its best run of this many consecutive hours, each run valued at its worst hour. */
export const DAY_RUN_HOURS = 3
/**
 * The default local hours a day's run may fall in, inclusive. A reader's own
 * climbing hours replace them in the day score (`dayRepresentative`, #401);
 * the rewetting forecast keeps the default end.
 */
export const DAY_FIRST_HOUR = CLIMB_HOURS_DEFAULT.first
export const DAY_LAST_HOUR = CLIMB_HOURS_DEFAULT.last

const CRAG_ASPECTS = [0, 45, 90, 135, 180, 225, 270, 315] as const

/**
 * Fraction of rain reaching an overhanging wall. `cliffAngleDeg` is the stored
 * convention: 0 vertical, 90 slab, negative overhanging.
 */
export function shelterScale(cliffAngleDeg: number): number {
  const past = Math.max(0, -cliffAngleDeg)
  return past < 5 ? 1 : Math.max(0.1, 1 - past / 30)
}

/** Friction's four penalties, each 0-1. Their product is `frictionFactorA`. */
export type FrictionPenalties = Record<Exclude<ScoreLimit, 'wet_rock'>, number>

/**
 * **Condensation never takes more than half the score** (owner, 2026-11-02).
 * The floor is a guess, not a measurement: the rock temperature behind the
 * penalty is modelled (#436), and field checks at Red Wing and Sandstone on
 * 10/31–11/1 found dry rock through every hour it zeroed.
 */
export const CONDENSATION_FLOOR = 0.5

/**
 * **Water on the rock, 0-1, read wall by wall** (owner, 2026-11-02). Each
 * wall's margin is `T_mass` plus that wall's lagged solar gain
 * (`diagnostics.solar_gain_c`) less the dew point; the hour's factor is the
 * median wall's, floored at `CONDENSATION_FLOOR`. `T_mass` alone is a
 * days-long air average, and read as the rock it zeroed 15 sunlit hours that
 * weekend.
 *
 * The gain, not `T_surface − air` (#534): the lagged `T_surface` trails the
 * air, so that difference put a warming morning's rock below both its mass and
 * the air (Sandstone 42 where the sun alone gives 84, 2026-11-09 11 am) and
 * added warmth in the evening.
 *
 * `solarGainC` is one entry per wall. Null when any input is missing.
 */
export function condensationA(
  massTempC: number,
  dewPointC: number,
  solarGainC: readonly (number | null)[],
): number | null {
  const margin = condensationMarginA(massTempC, dewPointC, solarGainC)
  const f = condensationFactor(margin)
  return f === null ? null : Math.max(CONDENSATION_FLOOR, f)
}

/**
 * The median wall's margin over the dew point, °C — the one `condensationA`
 * scores and the response publishes. Median of margins, then the factor, so
 * the published figure is exactly what the score read even with an even wall
 * count. Null when any input is missing.
 */
export function condensationMarginA(
  massTempC: number,
  dewPointC: number,
  solarGainC: readonly (number | null)[],
): number | null {
  if (solarGainC.length === 0 || !Number.isFinite(massTempC) || !Number.isFinite(dewPointC)) return null
  if (solarGainC.some((x) => x === null || !Number.isFinite(x))) return null
  return median((solarGainC as number[]).map((x) => massTempC + x - dewPointC))
}

/**
 * Null when any input is missing — never a default.
 *
 * Heat and cold read air temperature plus `sunWarmingC`, the direct sun on the
 * wall. Crag A passes 0: it does not know which way any wall faces. Wall A
 * passes its own (`sunWarmingC`), and a null one withholds, because sun nobody
 * measured could be the heat that decides the hour.
 *
 * Condensation reads `solarGainC`, one wall's lagged solar gain each
 * (`condensationA`): Crag A's eight, Wall A's one. The default is a single
 * wall the sun does not warm.
 */
export function frictionPenaltiesA(
  massTempC: number | null,
  airTempC: number | null,
  dewPointC: number | null,
  range: TempRangeC = DEFAULT_RANGE,
  sunWarmingC: number | null = 0,
  solarGainC: readonly (number | null)[] = [0],
): FrictionPenalties | null {
  if (massTempC === null || airTempC === null || dewPointC === null || sunWarmingC === null) return null
  if (
    !Number.isFinite(massTempC) ||
    !Number.isFinite(airTempC) ||
    !Number.isFinite(dewPointC) ||
    !Number.isFinite(sunWarmingC)
  ) {
    return null
  }
  const condensation = condensationA(massTempC, dewPointC, solarGainC)
  if (condensation === null) return null
  const feltC = airTempC + sunWarmingC
  return {
    condensation,
    heat: Math.exp(-Math.max(0, feltC - range.highC) / HEAT_SCALE_C),
    humidity: Math.exp(-Math.max(0, dewPointC - DEW_START_C) / DEW_SCALE_C),
    cold: Math.exp(-Math.max(0, range.lowC - feltC) / HEAT_SCALE_C),
  }
}

/**
 * **Crag A's grip, 0-1**: condensation × heat × humidity × cold. Null when any
 * input is missing — never a default.
 */
export function frictionFactorA(
  massTempC: number | null,
  airTempC: number | null,
  dewPointC: number | null,
  range: TempRangeC = DEFAULT_RANGE,
): number | null {
  const p = frictionPenaltiesA(massTempC, airTempC, dewPointC, range)
  return p === null ? null : p.condensation * p.heat * p.humidity * p.cold
}

/** The order ties are broken in: the rock first, as the readings are. */
const LIMIT_ORDER: readonly ScoreLimit[] = ['wet_rock', 'condensation', 'heat', 'humidity', 'cold']

/**
 * **What is holding the score down, most limiting first** (issue #218).
 *
 * The score is `100 × Π multiplier`, so the smallest multiplier takes the
 * largest share of what was lost and the order is exact. A penalty is named
 * only when it would on its own take at least a point off a perfect score —
 * the score's own resolution, not a new threshold. Each is judged alone so
 * that two penalties both at zero are both named. When several small ones add
 * up to a lost point that none costs alone, the largest is named, so a score
 * below 100 is never "held back by nothing".
 */
export function heldBackBy(penalties: ScorePenalties | null): ScoreLimit[] | null {
  if (penalties === null) return null
  const ordered = [...LIMIT_ORDER].sort((a, b) => penalties[a] - penalties[b])
  const named = ordered.filter((k) => Math.round(100 * penalties[k]) < 100)
  if (named.length > 0) return named
  const product = LIMIT_ORDER.reduce((p, k) => p * penalties[k], 1)
  return Math.round(100 * product) < 100 ? ordered.slice(0, 1) : []
}

/**
 * **No exponent on either factor** (#536, owner 2026-11-10). Dryness is
 * already the squared drying ramp, so the score climbs slowly at first: a
 * quarter of the window dried scores 6, half 25, three quarters 56. v2's
 * `dryness^0.55` survived the switch to Crag A and made that ramp almost a
 * straight line (22, 47, 73). Friction lost its 0.45 for letting heat through.
 */
export function scoreA(dryness: number | null, friction: number | null): number | null {
  if (dryness === null || friction === null) return null
  if (!Number.isFinite(dryness) || !Number.isFinite(friction)) return null
  const d = Math.min(1, Math.max(0, dryness))
  const f = Math.min(1, Math.max(0, friction))
  return Math.round(100 * d * f)
}

const remainingRamp = (remaining: number, need: number): number =>
  need <= 0 ? 1 : Math.pow(Math.max(0, need - remaining) / need, 2)

/**
 * **The drying clock, 0-1 per hour.** Ported from the reference `dryTrack`.
 *
 * One figure is carried: `R`, the hours of drying the rock still needs. Rain of
 * `x` inches on dry rock needs `maxHours × min(1, √(x / FULL_SOAK_IN))`, and
 * dryness is `((maxHours − R) / maxHours)²`. Each dry hour takes off at least
 * one hour and at most `maxRate` hours (`maxDryingRate`) of weather-sped drying.
 *
 * **New rain adds to the water still in the rock, not to a storm total**
 * (2026-11-09). `R` is turned back into the rain that would need it, the hour's
 * rain is added, and `R` is sized again from the sum. Rain that never stops
 * adds up exactly as a storm total did. Rain after a dry spell adds to what is
 * left: until this change it was added to everything that had fallen in the
 * last 24 hours and the drying since was thrown away, so 0.3 mm eighteen hours
 * after a soak took dolomite from 74 to 0 for another full day, while the same
 * 0.3 mm twenty-five hours after cost 19 points. The other half of the old
 * rule let rain more than a day after a soak add nothing unless it was the
 * bigger storm; now it adds its share.
 *
 * **The one-hour floor is the drying ceiling** (owner, 2026-11-02): rock reads
 * dry within its `maxHours` of real time after the rain stops, however cool,
 * still or humid those hours were. Before it, Sandstone read Wet 17 at 11am on
 * 2026-10-31, three days after rain, while a friend stood at bone-dry rock;
 * the clock had credited a few hours of the seventy since.
 *
 * **Rain sets the clock back by its size** (owner, 2026-10-26). The ramp runs
 * over the rock's whole window, so a mist that needs two hours of a 24-hour
 * window dips the score to ~92 rather than 0, and only a full soak reaches 0.
 * Before, the ramp ran over the storm's own need, so every wetting hour read 0
 * and only the recovery scaled: Barn Bluff on 2026-10-25 scored 0 from noon on
 * about 0.03" forecast over a dry afternoon. The time to dry is unchanged. Rain
 * still falling at `FALLING_RAIN_MM` or more reads wet regardless.
 *
 * The series' first hour is treated as fully soaked, because the rain before it
 * is unknown (issue #176) — the direction to be wrong in.
 */
export function drynessTrack(
  hours: readonly WeatherHour[],
  evaluated: readonly HourlyConditions[],
  maxHours: number,
  wetThresholdMm: number,
  maxRate: number,
): (number | null)[] {
  const fullSoakMm = FULL_SOAK_IN * 25.4
  const needFor = (mm: number): number => maxHours * Math.min(1, Math.sqrt(mm / fullSoakMm))
  /** The rain that would need `remaining` hours: `needFor` run backwards. A full window is a full soak. */
  const rainFor = (remaining: number): number =>
    maxHours <= 0 ? 0 : fullSoakMm * Math.pow(Math.min(1, remaining / maxHours), 2)
  let remainingR = maxHours
  let snowMm = 0
  // After an hour whose rain is unknown, withhold until a full window would have dried.
  let unknownR = 0
  const out: (number | null)[] = []

  for (let i = 0; i < hours.length; i++) {
    const h = hours[i]!
    const p = h.precip_mm
    let wetMm: number | null = p === null || !Number.isFinite(p) ? null : p

    if (wetMm !== null && h.air_temp_c !== null && Number.isFinite(h.air_temp_c)) {
      const ta = h.air_temp_c
      if (ta <= SNOW_TEMP_C && wetMm >= WET_MM) {
        snowMm += wetMm
      } else if (snowMm > 0 && ta > SNOW_TEMP_C) {
        const melt = Math.min(snowMm, MELT_PER_C * ta + MELT_PER_WM2 * (h.shortwave_wm2 ?? 0))
        snowMm -= melt
        wetMm += melt
      }
    }

    if (wetMm === null) {
      unknownR = maxHours
    } else if (wetMm >= wetThresholdMm) {
      // Never less than before: `needFor` rises with rain, and float error must not dry the rock.
      remainingR = Math.max(remainingR, needFor(rainFor(remainingR) + wetMm))
    } else {
      const e1 = evaluated[i]?.diagnostics.effective_dry_hours ?? null
      const e0 = i > 0 ? (evaluated[i - 1]?.diagnostics.effective_dry_hours ?? null) : null
      // Every dry hour credits at least one (owner, 2026-11-02), so no weather keeps rock wet past its window.
      const inc = e1 !== null && e0 !== null ? Math.min(Math.max(e1 - e0, 1), maxRate) : 0
      unknownR = Math.max(0, unknownR - inc)
      remainingR = Math.max(0, remainingR - inc)
    }

    if (evaluated[i]?.diagnostics.effective_dry_hours == null || wetMm === null || unknownR > 0) {
      out.push(null)
      continue
    }
    let d = wetMm >= FALLING_RAIN_MM ? 0 : remainingRamp(remainingR, maxHours)
    // Snow still lying: not climbable, however dry the rock between patches.
    if (snowMm >= SNOW_LYING_MM) d = Math.min(d, SNOW_DRYNESS_CAP)
    out.push(d)
  }
  return out
}

/**
 * `wet` while more than `MAX_HOURS − MIN_HOURS` of drying remains, `dry` when
 * none remains. The ramp runs over the full window, so only rain
 * needing more than that reads `wet` once it stops; less reads
 * `drying` from its first dry hour. Rain still falling is the caller's to add
 * (`fallingOn`): `FALLING_RAIN_MM` already zeroes dryness, and rock that
 * breaks when wet reads `wet` under any rain (`finish`).
 */
export function rockLevelA(dryness: number | null, rockType: RockType): RockLevel | null {
  if (dryness === null || !Number.isFinite(dryness)) return null
  if (dryness >= 1) return 'dry'
  const wetBelow = Math.pow(MIN_HOURS[rockType] / MAX_HOURS[rockType], 2)
  return dryness < wetBelow ? 'wet' : 'drying'
}

/**
 * **Rain landing on rock that breaks when wet makes it `wet`, however light**
 * (review of #397). The scaled ramp reads six hours of 0.4 mm/h drizzle on
 * quartz arenite as dryness 0.27, above its `wet` line, so without this the
 * rock read Drying while it was still drizzling and those hours could join a
 * best window. The score keeps its dent; only the word and the window change.
 */
function fallingOn(rainMm: number | null, wetThresholdMm: number, rockType: RockType): boolean {
  return breaksWhenWet(rockType) && rainMm !== null && rainMm >= wetThresholdMm
}

function median(xs: readonly number[]): number {
  const a = [...xs].sort((p, q) => p - q)
  const x = 0.5 * (a.length - 1)
  const lo = Math.floor(x)
  return a[lo]! + (a[Math.min(lo + 1, a.length - 1)]! - a[lo]!) * (x - lo)
}

export type CragAOptions = {
  rockType: RockType
  /** The crag itself — where the eight walls are placed for the sun. */
  lat: number
  lon: number
  /** The reader's temperature range; absent is Crag A's own. */
  range?: TempRangeC
}

/**
 * An hour of Crag A: the crag's readings, plus the rock temperature on the
 * warmest and coolest of its eight compass walls. Barn Bluff, 2026-10-04: the
 * south face baked at a modelled 92 °F while a shaded face sat at 74 °F under
 * 68 °F air, and the score, which reads air temperature, cannot tell them apart.
 */
export type CragAHour = HourlyConditions & { rock_sun_shade: RockSunShade | null }

/** Null when any wall's temperature is missing — a pair from seven walls could miss the sunniest. */
function sunShade(walls: readonly (number | null)[]): RockSunShade | null {
  if (walls.some((t) => t === null || !Number.isFinite(t))) return null
  const ts = walls as number[]
  return { sun_c: Math.max(...ts), shade_c: Math.min(...ts) }
}

/**
 * **Crag A — the crag's score, and the only score a location carries.** The
 * drying clock runs on eight vertical walls, one per compass point, and each
 * hour's dryness is their median. A location's recorded aspect and angle are
 * deliberately not inputs: the crag score describes the crag as a whole, and a
 * specific wall is scored by `evaluateWallA` instead.
 *
 * Returns `HourlyConditions` widened by the sun/shade pair, so `bestWindow` and
 * the published projection read it unchanged.
 */
export function evaluateCragA(
  hours: readonly WeatherHour[],
  options: CragAOptions,
): CragAHour[] {
  const { rockType } = options
  // The rock temperature and margin come from the unscaled horizontal series;
  // only the drying clock runs on the eight walls.
  const flat = evaluateHourlyConditions(hours, { rockType, cliffAngleDeg: 0, wall: null })
  const maxHours = dryingWindowHours(rockType, 0).maxHours
  const walls = CRAG_ASPECTS.map((aspectDeg) => {
    const evaluated = evaluateHourlyConditions(hours, {
      rockType,
      cliffAngleDeg: 0,
      wall: { lat: options.lat, lon: options.lon, aspectDeg, cliffAngleDeg: 0 },
    })
    return { evaluated, dry: drynessTrack(hours, evaluated, maxHours, WET_MM, maxDryingRate(rockType)) }
  })
  return flat.map((h, i) => {
    const xs = walls.map((w) => w.dry[i] ?? null)
    const dry = xs.some((x) => x === null) ? null : median(xs as number[])
    // No one wall's clock, so no one wall's drying hours.
    const raining = fallingOn(hours[i]!.precip_mm, WET_MM, rockType)
    const gains = walls.map((w) => w.evaluated[i]?.diagnostics.solar_gain_c ?? null)
    return {
      ...finish(h, hours[i]!, dry, rockType, null, raining, gains, options.range),
      rock_sun_shade: sunShade(walls.map((w) => w.evaluated[i]?.t_surface_c ?? null)),
    }
  })
}

export type WallAOptions = {
  rockType: RockType
  /** The wall being scored: its aspect, angle (stored convention) and position. */
  wall: WallOrientation
  /**
   * The wall's lidar skyline (`SUN_WALLS`), which decides when terrain lets
   * direct sun reach it. Absent, only the way the wall faces decides, which
   * reads a shaded wall as sunlit: hotter, the direction to be wrong in.
   */
  skyline?: SunWall | null
  /** Trees keep direct sun off this wall (owner field report). No sun warming at all. */
  treeShaded?: boolean
  /** The reader's temperature range, as Crag A takes it; absent is Wall A's own. */
  range?: TempRangeC
}

/** Instants per hour at which the skyline is asked whether the sun is on the wall. */
export const SUN_SAMPLES_PER_HOUR = 4

/**
 * The share of the hour ending at `endMs` that the skyline lets the sun onto
 * the wall, 0-1, from `SUN_SAMPLES_PER_HOUR` instants. Geometry only: cloud is
 * the shortwave's business.
 */
export function sunShareOfHour(skyline: SunWall, endMs: number): number {
  return (
    Array.from({ length: SUN_SAMPLES_PER_HOUR }, (_, k) =>
      sunOnWallAt(skyline, endMs - ((k + 0.5) / SUN_SAMPLES_PER_HOUR) * 3_600_000),
    ).filter(Boolean).length / SUN_SAMPLES_PER_HOUR
  )
}

/**
 * **How much direct sun warms the wall above air temperature, °C, per hour.**
 * Wall A's heat and cold read air plus this (owner, 2026-10-30): on 2026-10-04
 * and 2026-10-19 Winter Wall at Red Wing was too hot to climb in 60s air while
 * the shaded side was jacket weather, and Crag A scored both 100.
 *
 * Only the sun's disc counts (`wallBeamWm2`), times the share of the hour the
 * skyline lets it through, through the same sol-air term and the same
 * `SURFACE_TAU_HOURS` lag as `T_surface`. Sky and ground light are left out on
 * purpose: they reach a shaded face too, and counting them read every shaded
 * Red Wing wall 7-10 °F above air on clear summer afternoons, which climbers
 * do not report. Cloud is already in the shortwave, so an overcast hour warms
 * little.
 *
 * Null when the sun was not measured (shortwave, air or wind missing), except
 * on a tree-shaded wall, which reads 0 whatever the sky did.
 */
export function sunWarmingC(
  hours: readonly WeatherHour[],
  wall: WallOrientation,
  skyline: SunWall | null = null,
  treeShaded = false,
): (number | null)[] {
  if (treeShaded) return hours.map(() => 0)
  const out: (number | null)[] = []
  let previous: number | null = null
  for (const h of hours) {
    const end = Date.parse(h.valid_at)
    let instant: number | null = null
    const ho = surfaceCoefficient(h.air_temp_c, h.wind_kmh)
    if (Number.isFinite(end) && ho !== null && ho > 0) {
      // Open-Meteo's shortwave is the mean of the hour before its stamp.
      const beam = wallBeamWm2(h.shortwave_wm2, new Date(end - 1_800_000), wall)
      if (beam !== null) {
        const reached = skyline === null ? 1 : sunShareOfHour(skyline, end)
        instant = (SOLAR_ABSORPTANCE * beam * reached) / ho
      }
    }
    previous = laggedSurfaceC(previous, instant)
    out.push(previous)
  }
  return out
}

/**
 * **Wall A — one specific wall's score, and never a crag's.** The same model as
 * Crag A on the one recorded wall, with the overhang's rain shelter applied.
 *
 * Its heat and cold read the sun on this wall (`sunWarmingC`); its drying
 * clock still credits sun the skyline or trees may block.
 *
 * `buildHourlyReadings` calls it for each lidar wall of a crag with confirmed
 * sun and shade (#445), published beside the crag's score as
 * `HourlyReadings.walls`. It must never be substituted for a location's crag
 * score.
 */
export function evaluateWallA(
  hours: readonly WeatherHour[],
  options: WallAOptions,
): HourlyConditions[] {
  const { rockType, wall } = options
  const scale = shelterScale(wall.cliffAngleDeg)
  const sheltered =
    scale === 1
      ? hours
      : hours.map((h) => ({
          ...h,
          precip_mm: h.precip_mm === null ? null : h.precip_mm * scale,
        }))
  const evaluated = evaluateHourlyConditions(sheltered, {
    rockType,
    cliffAngleDeg: wall.cliffAngleDeg,
    wall,
  })
  const maxHours = dryingWindowHours(rockType, Math.max(0, wall.cliffAngleDeg)).maxHours
  const dry = drynessTrack(sheltered, evaluated, maxHours, scale < 1 ? SHELTERED_WET_MM : WET_MM, maxDryingRate(rockType))
  const wetThreshold = scale < 1 ? SHELTERED_WET_MM : WET_MM
  const sun = sunWarmingC(hours, wall, options.skyline ?? null, options.treeShaded ?? false)
  return evaluated.map((h, i) =>
    finish(
      h,
      hours[i]!,
      dry[i] ?? null,
      rockType,
      h.diagnostics.effective_dry_hours,
      fallingOn(sheltered[i]!.precip_mm, wetThreshold, rockType),
      [h.diagnostics.solar_gain_c],
      options.range,
      sun[i] ?? null,
    ),
  )
}

function finish(
  base: HourlyConditions,
  weather: WeatherHour,
  dryness: number | null,
  rockType: RockType,
  effectiveDryHours: number | null,
  rainingOnFragile: boolean,
  /** Each wall's lagged solar gain, for condensation: Crag A's eight, Wall A's one. */
  wallSolarGainC: readonly (number | null)[],
  range?: TempRangeC,
  sunWarming: number | null = 0,
): HourlyConditions {
  const massTempC = base.diagnostics.t_mass_c
  const air = weather.air_temp_c
  const fp = frictionPenaltiesA(massTempC, air, weather.dewpoint_c, range, sunWarming, wallSolarGainC)
  const friction = fp === null ? null : fp.condensation * fp.heat * fp.humidity * fp.cold
  const score = scoreA(dryness, friction)
  const penalties: ScorePenalties | null =
    fp === null || dryness === null || score === null
      ? null
      : { wet_rock: Math.min(1, Math.max(0, dryness)), ...fp }
  const fLevel = frictionLevel(friction)
  // The margin the score read: the median wall's, sun included (2026-11-02), so
  // the Rock tab cannot say condensing while the score takes nothing off.
  const dew = weather.dewpoint_c
  const margin = fp === null || massTempC === null || dew === null ? null : condensationMarginA(massTempC, dew, wallSolarGainC)
  const condensing = isCondensing(margin)
  const level = rockLevelA(dryness, rockType)
  const rLevel = level !== null && rainingOnFragile ? 'wet' : level
  return {
    valid_at: base.valid_at,
    // Neither score depends on a wall orientation nobody recorded: Crag A reads
    // every direction by design, and Wall A is handed its wall.
    rock: rLevel === null ? null : { level: rLevel, qualified: true },
    // Grip reads no sunlight, so an unrecorded aspect cannot change it.
    friction:
      fLevel === null || condensing === null ? null : { level: fLevel, condensing, qualified: true },
    score,
    t_surface_c: base.t_surface_c,
    condensation_margin_c: margin,
    diagnostics: {
      t_mass_c: massTempC,
      skin_wettedness: null,
      wetness_factor: dryness,
      friction_factor: friction,
      effective_dry_hours: effectiveDryHours,
      // The median wall's gain, the one the margin read: Crag A's `base` is the
      // horizontal series, whose gain no wall sees.
      solar_gain_c:
        wallSolarGainC.length === 0 || wallSolarGainC.some((g) => g === null || !Number.isFinite(g))
          ? null
          : median(wallSolarGainC as number[]),
      penalties,
    },
  }
}

/** Whether an hour's stamp falls in the reader's climbing hours, local, inclusive: the hours a day is read from. */
export function inClimbHours(validAt: string, utcOffsetSeconds: number, climbHours: ClimbHours): boolean {
  const lh = new Date(Date.parse(validAt) + utcOffsetSeconds * 1000).getUTCHours()
  return lh >= climbHours.first && lh <= climbHours.last
}

/**
 * **The day's representative hour: the worst hour of the best
 * `DAY_RUN_HOURS`-hour run inside the reader's climbing hours, local.** The
 * default is `DAY_FIRST_HOUR`–`DAY_LAST_HOUR`. Its score is the day's score. A
 * run containing an unscored hour does not count. Null when no run qualifies.
 */
export function dayRepresentative<H extends HourlyConditions>(
  dayHours: readonly H[],
  utcOffsetSeconds: number,
  climbHours: ClimbHours = CLIMB_HOURS_DEFAULT,
): H | null {
  const inDay = dayHours.filter((h) => inClimbHours(h.valid_at, utcOffsetSeconds, climbHours))
  let best: H | null = null
  for (let a = 0; a + DAY_RUN_HOURS <= inDay.length; a++) {
    const run = inDay.slice(a, a + DAY_RUN_HOURS)
    // Consecutive in time, not just in the array: a gap in the series breaks the run.
    const t0 = Date.parse(run[0]!.valid_at)
    if (Date.parse(run[run.length - 1]!.valid_at) - t0 !== (DAY_RUN_HOURS - 1) * 3_600_000) continue
    if (run.some((h) => h.score === null)) continue
    let worst = run[0]!
    for (const h of run) if (h.score! < worst.score!) worst = h
    if (best === null || worst.score! > best.score!) best = worst
  }
  return best
}

