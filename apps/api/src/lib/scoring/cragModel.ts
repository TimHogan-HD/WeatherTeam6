/**
 * **Crag A and Wall A — the scoring model every screen reads.** Replaced v2's
 * Layer 3 on 2026-09-24 by owner decision. The research, the test days and the
 * seven corrected errors are in `.claude/docs/crag-a-reference/README.md`;
 * `model.ts` beside it is the reference this file was ported from, and a change
 * here that moves a result there needs an argument, not a commit message.
 *
 * ```
 * score = 100 × dryness^0.55 × friction
 * ```
 *
 * - **Crag A** (no recorded wall): the drying clock runs on eight vertical walls,
 *   one per compass point, through `rockThermal`'s wall geometry, and the hour's
 *   dryness is their median. Nobody has to record an aspect for this to answer.
 * - **Wall A** (a recorded wall): the same model on that one wall, with the
 *   overhang's rain shelter applied.
 *
 * Friction is the heat/humidity/cold rule (`frictionFactorA`), not v2's sweat
 * balance: it reads air temperature, dew point and the rock mass's margin over
 * the dew point, so it still answers when shortwave is missing.
 *
 * Built on top of `evaluateHourlyConditions`, which still supplies `T_mass`,
 * `T_surface` and the weather-sped drying rate. Its own score is discarded.
 *
 * Every factor withholds rather than degrades, as v2's did: an hour whose rain
 * was not measured is null, and so is every hour after it until a full drying
 * window has run (issue #34).
 */
import type { RockType } from '@weatherteam6/types'
import { MAX_HOURS, MIN_HOURS } from './dryingModel.js'
import {
  condensationFactor,
  dryingWindowHours,
  evaluateHourlyConditions,
  frictionLevel,
  type HourlyConditions,
  type RockLevel,
  type WeatherHour,
} from './hourlyConditions.js'
import { isCondensing, type WallOrientation } from './rockThermal.js'

/** Weight on dryness. Friction carries no exponent: v2's 0.45 is what let heat through. */
export const DRYNESS_EXPONENT = 0.55

/** Friction starts falling above this air temperature, °C (60 °F). */
export const HEAT_START_C = (60 - 32) * (5 / 9)
/** Friction starts falling above this dew point, °C (54 °F). */
export const DEW_START_C = (54 - 32) * (5 / 9)
/** Friction starts falling below this air temperature, °C (30 °F). */
export const COLD_START_C = (30 - 32) * (5 / 9)
/** e-folding scale of the heat and cold penalties, °C. */
export const HEAT_SCALE_C = 12
/** e-folding scale of the humidity penalty, °C. */
export const DEW_SCALE_C = 10

/** A storm of this many inches (or more) needs the rock type's full drying window. */
export const FULL_SOAK_IN = 0.4
/**
 * Rain in an hour that wets an open wall, mm. Open-Meteo reports 0 or ≥ 0.1;
 * 0.05 keeps a float-rounded 0.1 from slipping under. v2 only reset at 0.5.
 */
export const WET_MM = 0.05
/**
 * The wetting threshold kept for a sheltered overhang, mm/h — its shelter
 * fraction was calibrated against this, so drizzle does not wet it.
 */
export const SHELTERED_WET_MM = 0.5
/** Rain at or below this air temperature lies as snow, °C. */
export const SNOW_TEMP_C = 0.5
/** Snow water at or above this, mm, caps dryness at `SNOW_DRYNESS_CAP`. */
export const SNOW_LYING_MM = 1
export const SNOW_DRYNESS_CAP = 0.25
/** Melt, mm/h per °C above freezing, plus per W/m² of shortwave. A guess nothing has checked. */
export const MELT_PER_C = 0.15
export const MELT_PER_WM2 = 0.0015
/** Rain within this many hours of the last wet hour belongs to the same storm. */
export const STORM_GAP_H = 24

/** A day is worth its best run of this many consecutive hours, each run valued at its worst hour. */
export const DAY_RUN_HOURS = 3
/** Local hours a day's run may fall in, inclusive. */
export const DAY_FIRST_HOUR = 8
export const DAY_LAST_HOUR = 18

const CRAG_ASPECTS = [0, 45, 90, 135, 180, 225, 270, 315] as const

/**
 * Fraction of rain reaching an overhanging wall. `cliffAngleDeg` is the stored
 * convention: 0 vertical, 90 slab, negative overhanging.
 */
export function shelterScale(cliffAngleDeg: number): number {
  const past = Math.max(0, -cliffAngleDeg)
  return past < 5 ? 1 : Math.max(0.1, 1 - past / 30)
}

/**
 * **Crag A's grip, 0-1**: condensation × heat × humidity × cold. Null when any
 * input is missing — never a default.
 */
export function frictionFactorA(
  massTempC: number | null,
  airTempC: number | null,
  dewPointC: number | null,
): number | null {
  if (massTempC === null || airTempC === null || dewPointC === null) return null
  if (!Number.isFinite(massTempC) || !Number.isFinite(airTempC) || !Number.isFinite(dewPointC)) {
    return null
  }
  const cond = condensationFactor(massTempC - dewPointC)
  if (cond === null) return null
  const heat = Math.exp(-Math.max(0, airTempC - HEAT_START_C) / HEAT_SCALE_C)
  const humidity = Math.exp(-Math.max(0, dewPointC - DEW_START_C) / DEW_SCALE_C)
  const cold = Math.exp(-Math.max(0, COLD_START_C - airTempC) / HEAT_SCALE_C)
  return cond * heat * humidity * cold
}

export function scoreA(dryness: number | null, friction: number | null): number | null {
  if (dryness === null || friction === null) return null
  if (!Number.isFinite(dryness) || !Number.isFinite(friction)) return null
  const d = Math.min(1, Math.max(0, dryness))
  const f = Math.min(1, Math.max(0, friction))
  return Math.round(100 * Math.pow(d, DRYNESS_EXPONENT) * f)
}

const remainingRamp = (remaining: number, need: number): number =>
  need <= 0 ? 1 : Math.pow(Math.max(0, need - remaining) / need, 2)

/**
 * **The drying clock, 0-1 per hour.** Ported from the reference `dryTrack`.
 *
 * Two stores: the surface, reset by any wetting, and the soak, topped up by a
 * storm and never lowered by a smaller later one. Each needs
 * `maxHours × min(1, √(storm_in / FULL_SOAK_IN))` of weather-sped drying, and
 * dryness is the worse of `((N − R) / N)²` over the two.
 *
 * The series' first hour is treated as fully soaked, because the rain before it
 * is unknown (issue #176) — the direction to be wrong in.
 */
export function drynessTrack(
  hours: readonly WeatherHour[],
  evaluated: readonly HourlyConditions[],
  maxHours: number,
  wetThresholdMm: number,
): (number | null)[] {
  const needFor = (mm: number): number => maxHours * Math.min(1, Math.sqrt(mm / 25.4 / FULL_SOAK_IN))
  let deepR = maxHours
  let deepN = maxHours
  let surfR = maxHours
  let surfN = maxHours
  let storm = 0
  let lastWet = -Infinity
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
      storm = i - lastWet < STORM_GAP_H ? storm + wetMm : wetMm
      lastWet = i
      const need = needFor(storm)
      surfR = need
      surfN = need
      if (need >= deepR) {
        deepR = need
        deepN = need
      }
    } else {
      const e1 = evaluated[i]?.diagnostics.effective_dry_hours ?? null
      const e0 = i > 0 ? (evaluated[i - 1]?.diagnostics.effective_dry_hours ?? null) : null
      const inc = e1 !== null && e0 !== null && e1 >= e0 ? e1 - e0 : 0
      surfR = Math.max(0, surfR - inc)
      unknownR = Math.max(0, unknownR - inc)
      deepR = Math.max(0, deepR - inc)
    }

    if (evaluated[i]?.diagnostics.effective_dry_hours == null || wetMm === null || unknownR > 0) {
      out.push(null)
      continue
    }
    let d = Math.min(remainingRamp(surfR, surfN), remainingRamp(deepR, deepN))
    // Snow still lying: not climbable, however dry the rock between patches.
    if (snowMm >= SNOW_LYING_MM) d = Math.min(d, SNOW_DRYNESS_CAP)
    out.push(d)
  }
  return out
}

/**
 * `wet` until the rock has done the rock type's `MIN_HOURS` share of its
 * window, `dry` when both stores are empty. Same boundaries as v2's
 * `rockLevel`, expressed on the dryness ramp so a small storm scales them down.
 */
export function rockLevelA(dryness: number | null, rockType: RockType): RockLevel | null {
  if (dryness === null || !Number.isFinite(dryness)) return null
  if (dryness >= 1) return 'dry'
  const wetBelow = Math.pow(MIN_HOURS[rockType] / MAX_HOURS[rockType], 2)
  return dryness < wetBelow ? 'wet' : 'drying'
}

function median(xs: readonly number[]): number {
  const a = [...xs].sort((p, q) => p - q)
  const x = 0.5 * (a.length - 1)
  const lo = Math.floor(x)
  return a[lo]! + (a[Math.min(lo + 1, a.length - 1)]! - a[lo]!) * (x - lo)
}

export type CragModelOptions = {
  rockType: RockType
  lat: number
  lon: number
  /** The recorded wall, or null. Present → Wall A; absent → Crag A. */
  wall: WallOrientation | null
}

/**
 * Every hour of the series, scored. Returns `HourlyConditions` so the readings
 * builder, `bestWindow` and the published projection are unchanged.
 */
export function evaluateCragModel(
  hours: readonly WeatherHour[],
  options: CragModelOptions,
): HourlyConditions[] {
  const { rockType, wall } = options

  if (wall !== null) {
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
    const dry = drynessTrack(sheltered, evaluated, maxHours, scale < 1 ? SHELTERED_WET_MM : WET_MM)
    return evaluated.map((h, i) => finish(h, hours[i]!, dry[i] ?? null, rockType, true))
  }

  // Crag A: the rock temperature and margin come from the unscaled horizontal
  // series, as they did under v2; only the drying clock runs on the eight walls.
  const flat = evaluateHourlyConditions(hours, { rockType, cliffAngleDeg: 0, wall: null })
  const maxHours = dryingWindowHours(rockType, 0).maxHours
  const tracks = CRAG_ASPECTS.map((aspectDeg) => {
    const evaluated = evaluateHourlyConditions(hours, {
      rockType,
      cliffAngleDeg: 0,
      wall: { lat: options.lat, lon: options.lon, aspectDeg, cliffAngleDeg: 0 },
    })
    return drynessTrack(hours, evaluated, maxHours, WET_MM)
  })
  return flat.map((h, i) => {
    const xs = tracks.map((t) => t[i] ?? null)
    const dry = xs.some((x) => x === null) ? null : median(xs as number[])
    // The median of eight walls is not any one wall, so the rock reading keeps
    // the unrecorded-aspect caveat.
    return finish(h, hours[i]!, dry, rockType, false)
  })
}

function finish(
  base: HourlyConditions,
  weather: WeatherHour,
  dryness: number | null,
  rockType: RockType,
  rockQualified: boolean,
): HourlyConditions {
  const massTempC = base.diagnostics.t_mass_c
  const friction = frictionFactorA(massTempC, weather.air_temp_c, weather.dewpoint_c)
  const fLevel = frictionLevel(friction)
  const condensing = isCondensing(base.condensation_margin_c)
  const rLevel = rockLevelA(dryness, rockType)
  return {
    valid_at: base.valid_at,
    rock: rLevel === null ? null : { level: rLevel, qualified: rockQualified },
    // Grip reads no sunlight, so an unrecorded aspect cannot change it.
    friction:
      fLevel === null || condensing === null ? null : { level: fLevel, condensing, qualified: true },
    score: scoreA(dryness, friction),
    t_surface_c: base.t_surface_c,
    condensation_margin_c: base.condensation_margin_c,
    diagnostics: {
      t_mass_c: massTempC,
      skin_wettedness: null,
      wetness_factor: dryness,
      friction_factor: friction,
      effective_dry_hours: rockQualified ? base.diagnostics.effective_dry_hours : null,
    },
  }
}

/**
 * **The day's representative hour: the worst hour of the best
 * `DAY_RUN_HOURS`-hour run between `DAY_FIRST_HOUR` and `DAY_LAST_HOUR` local.**
 * Its score is the day's score. A run containing an unscored hour does not
 * count. Null when no run qualifies.
 */
export function dayRepresentative(
  dayHours: readonly HourlyConditions[],
  utcOffsetSeconds: number,
): HourlyConditions | null {
  const inDay = dayHours.filter((h) => {
    const lh = new Date(Date.parse(h.valid_at) + utcOffsetSeconds * 1000).getUTCHours()
    return lh >= DAY_FIRST_HOUR && lh <= DAY_LAST_HOUR
  })
  let best: HourlyConditions | null = null
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

