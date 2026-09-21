/**
 * **The hand's side of the friction reading — how much of the skin stays dry.**
 * Layer 1e of the v2 scoring model, the half that is about a person rather than
 * a wall. `docs/handoffs/weatherteam6-scoring-model-handoff-v1.md`, § What
 * friction is made of.
 *
 * Pure functions. No database, no network, no clock, no Express.
 *
 * ## Why this is a separate module from `rockThermal.ts`
 *
 * `rockThermal`'s `evaporativeCapacity` takes the vapour-pressure deficit **at
 * the rock surface**, which is right for the rock: that is the surface the water
 * is leaving. A hand is not at the rock's temperature. On a sunlit wall the two
 * are tens of degrees apart — 66 °C rock against 35 °C skin in the harness's
 * 104 °F scenario — and `es(66 °C)` is five times `es(35 °C)`, so using the
 * rock's deficit for the hand would read a baking wall as the *best* possible
 * drying conditions for skin. That is backwards, and it is the reason the
 * handoff's "the same quantity does two jobs" needed splitting into two
 * functions that share a mechanism rather than a number.
 *
 * ## The framing, and what is and is not standard about it
 *
 * The quantity is **skin wettedness** — the fraction of the skin that has to be
 * wet for the body to stay in heat balance, `w = E_required / E_max`. It is the
 * textbook comfort variable (Gagge's two-node model, carried in ASHRAE
 * Fundamentals' thermal-comfort chapter), and it is used here because its
 * *shape* is exactly the thing the friction reading needs and nothing else in
 * this project produces: it stays near zero while the body can dump heat dry,
 * and then climbs steeply as air temperature approaches skin temperature,
 * because the dry channel has closed and everything has to go through sweat.
 *
 * **What is standard:** the definition of `w`, the Lewis relation
 * (`LEWIS_RATIO_K_PER_KPA`), and the linearised radiative coefficient for a
 * person. These are textbook relations, cited here by name and **not read at
 * first hand in the session that wrote this file** — `rock-drying-research.md`
 * §10 is what happens when a figure travels further than the paper it came
 * from, so they are flagged rather than dressed up.
 *
 * **What is a judgement call:** `METABOLIC_HEAT_W_M2`, and it is the constant
 * that decides how fast the reading falls with heat. It is named, documented and
 * printed by `compare:scoring` for exactly that reason.
 *
 * **What is deliberately left out:** direct sun on the *climber*. ASHRAE's
 * SolarCal would add it, at the cost of two more invented constants (a body
 * absorptance and a projected-area fraction). Leaving it out under-states the
 * heat load on a sunny day, which reads the day *better* than it is — the
 * optimistic direction, and the one issue #34 warns about. It is recorded here
 * as a known bias rather than silently corrected for, and it runs opposite to
 * the unscaled-horizontal-irradiance bias in `rockThermal`, which reads the wall
 * hot. **Do not quote a net direction** — Phase 1 reached the same conclusion
 * about its own pair and there is no measurement behind either.
 *
 * ## Every output is nullable and a null is never a zero
 *
 * Same rule as `rockThermal.ts`, same reason (`defect-patterns.md` §1). A
 * wettedness of 0 is a cold day on which nobody is sweating. A wettedness of
 * `null` is an hour we could not read. They are not the same number and nothing
 * here conflates them.
 */
import { saturationVapourPressureKpa } from './rockThermal.js'

/**
 * Skin temperature, °C.
 *
 * ~35 °C is the conventional warm-condition value in the two-node comfort
 * literature; skin runs cooler than this in the cold, and holding it fixed is a
 * simplification that matters least in the range the friction reading is about.
 * Fixing it is also what keeps the hand's vapour-pressure deficit bounded, which
 * is the whole reason a hot day cannot buy unlimited drying capacity for skin
 * the way it can for rock.
 */
export const SKIN_TEMP_C = 35

/**
 * Net metabolic heat production while climbing, W/m² of body surface.
 *
 * **This is the judgement call in this file, and it is the dial that sets how
 * fast friction falls with heat.** 1 met = 58.2 W/m², and climbing is strenuous
 * — a value in the 350–500 W/m² range is the defensible span, of which 400 is
 * the middle. Nothing in this repo measures it and no citation is offered for
 * the specific number.
 *
 * Raising it makes every day read slightly worse and hot days read much worse,
 * because it is the numerator of the wettedness ratio. `compare:scoring` prints
 * the sensitivity so the number can be argued about with a table rather than an
 * opinion.
 */
export const METABOLIC_HEAT_W_M2 = 400

/**
 * Lewis relation, K/kPa — the ratio between the evaporative and convective heat
 * transfer coefficients at the skin, `h_e = LR · h_c`.
 *
 * 16.5 K/kPa is the standard value for typical indoor and outdoor conditions.
 * Textbook (ASHRAE Fundamentals, thermal comfort); **not read at first hand.**
 */
export const LEWIS_RATIO_K_PER_KPA = 16.5

/**
 * Linearised radiative heat transfer coefficient for a person, W/m²K.
 *
 * ~4.7 is the standard tabulated figure and it already carries the effective
 * radiating area factor — a person does not radiate from their whole surface,
 * because parts of them face each other. It is lower than
 * `rockThermal.radiativeCoefficient` for that reason, and the two are not
 * interchangeable. Textbook; **not read at first hand.**
 */
export const BODY_RADIATIVE_COEFF_W_M2K = 4.7

/**
 * Free-convection floor for the body's convective coefficient, W/m²K.
 *
 * The forced-convection correlation below goes to zero in dead calm, which is
 * wrong: a warm body drives its own plume. ~3.1 is the conventional still-air
 * figure for a standing person.
 */
export const BODY_STILL_AIR_H_C_W_M2K = 3.1

const KMH_TO_MS = 1 / 3.6

/**
 * Convective heat transfer coefficient at the body, W/m²K, from `8.3 · v^0.6`
 * with the still-air floor above.
 *
 * **A different correlation from the wall's.** `rockThermal`'s
 * `convectiveCoefficient` is McAdams' flat plate; this is the body correlation
 * from the same comfort literature the rest of this file comes from. They agree
 * within about 10% at ordinary wind speeds, which is a coincidence rather than a
 * reason to share one — a hand is not a flat plate and neither of them was
 * measured on a climber.
 *
 * Wind is the 10 m value Open-Meteo reports. It is used unconverted, which
 * over-states the air movement at the wall and therefore over-states how fast
 * the skin can dry — the optimistic direction again. `rockThermal` converts to
 * 2 m for its Penman term; the body correlation's own wind reference is the air
 * speed *at the person*, which no forecast supplies for a climber on a wall.
 * Neither treatment is right and the difference is inside the noise of the rest
 * of this file.
 */
export function bodyConvectiveCoefficient(windKmh: number | null): number | null {
  if (windKmh === null || !Number.isFinite(windKmh) || windKmh < 0) return null
  const v = windKmh * KMH_TO_MS
  return Math.max(BODY_STILL_AIR_H_C_W_M2K, 8.3 * Math.pow(v, 0.6))
}

/**
 * Operative temperature, °C — the single temperature an environment "feels
 * like" to a body exchanging heat by convection with the air and by radiation
 * with its surroundings. The convection- and radiation-weighted mean of the two.
 *
 * This is how the hot wall reaches the climber. A 66 °C sunlit face raises the
 * operative temperature well above air temperature even in a breeze, which is
 * the mechanism by which sun costs friction in this model — not a sun term
 * bolted onto a temperature band.
 *
 * `radiantTempC` is the wall's surface temperature when it is known. Passing air
 * temperature instead is the correct treatment of an unknown radiant
 * environment, not a default: it says the surroundings are at air temperature,
 * which is what "no sun" means.
 */
export function operativeTemperatureC(
  airTempC: number | null,
  radiantTempC: number | null,
  convectiveCoeff: number,
  radiativeCoeff: number,
): number | null {
  if (airTempC === null || !Number.isFinite(airTempC)) return null
  if (radiantTempC === null || !Number.isFinite(radiantTempC)) return null
  const total = convectiveCoeff + radiativeCoeff
  if (!Number.isFinite(total) || total <= 0) return null
  return (convectiveCoeff * airTempC + radiativeCoeff * radiantTempC) / total
}

/**
 * The wettedness reported when the air is at or above skin dew point and no
 * evaporation is possible at all.
 *
 * Any value past ~10 maps to the same floor under `sweatFrictionFactor`, so the
 * exact number is cosmetic; it exists so the field is always a finite number and
 * the ordering above it is at least not reversed.
 */
export const UNCOMPENSABLE_WETTEDNESS = 20

export type SkinWettednessInput = {
  airTempC: number | null
  /**
   * The temperature of what the climber is radiating against — the wall's
   * `T_surface` where it could be derived. **Null withholds the whole
   * reading**; it does not fall back to air temperature, because on a sunlit
   * wall that is the difference between a hard day and an impossible one and a
   * fallback would look like a measurement.
   */
  radiantTempC: number | null
  dewPointC: number | null
  windKmh: number | null
  /** Defaults to `METABOLIC_HEAT_W_M2`. Varied only by the sensitivity report. */
  metabolicW?: number
}

export type SkinWettedness = {
  /**
   * `E_required / E_max` — the fraction of the skin that has to be wet to hold
   * heat balance. **Not clamped at 1.** Above 1 the environment is
   * uncompensable: the body cannot shed the heat however wet it gets, and the
   * excess is real information about how much worse one hot hour is than
   * another. Clamping would flatten the top of the range and lose the ordering,
   * which is the one thing the handoff's honesty bound says this model must
   * keep.
   */
  wettedness: number
  /** Evaporative heat loss the body needs, W/m². Floored at 0 — see below. */
  required_w_m2: number
  /** The most the environment can take, W/m². */
  max_w_m2: number
  operative_temp_c: number
}

/**
 * **Skin wettedness for a climbing hour.**
 *
 * ```
 * E_required = M − h_o · (T_skin − T_operative)     floored at 0
 * E_max      = LR · h_c · (es(T_skin) − e_a)
 * w          = E_required / E_max
 * ```
 *
 * The dry-loss term is what makes the curve steep in the right place. While the
 * air is well below skin temperature the body sheds most of its heat without
 * sweating and `E_required` is small; as the operative temperature climbs
 * through 35 °C the term goes through zero and then **negative**, at which point
 * the environment is heating the climber and every watt of it has to leave as
 * sweat. Nothing in the code special-cases that crossing — it is one
 * subtraction, and the continuity of the whole model across it is asserted in
 * the tests.
 *
 * **The floor on `E_required` is a statement, not a guard.** A cold day needs no
 * evaporation at all; a negative requirement would be the body needing to *gain*
 * water, which is not a thing skin does. Zero there is what makes a cold hour
 * read as perfectly dry-handed, and it is why this model has no cold penalty at
 * all — see `hourlyConditions.ts`, which records that as a deliberate and
 * reviewable gap rather than an oversight.
 *
 * `e_a` comes from the **dew point**, which is the whole reason `dewpoint_c` was
 * fetched and stored: it is the moisture content of the air, and relative
 * humidity is not (`scoring-findings.md` §3.1). `es(T_skin)` is fixed, so the
 * deficit — and therefore the most a hand can ever shed — is bounded above by
 * the skin's own saturation pressure. That bound is why a hot day cannot buy
 * its way out of this the way the rock can.
 */
export function skinWettedness(input: SkinWettednessInput): SkinWettedness | null {
  const metabolic = input.metabolicW ?? METABOLIC_HEAT_W_M2
  if (!Number.isFinite(metabolic) || metabolic <= 0) return null

  const hc = bodyConvectiveCoefficient(input.windKmh)
  if (hc === null) return null
  const ho = hc + BODY_RADIATIVE_COEFF_W_M2K

  const operative = operativeTemperatureC(
    input.airTempC,
    input.radiantTempC,
    hc,
    BODY_RADIATIVE_COEFF_W_M2K,
  )
  if (operative === null) return null

  const esSkin = saturationVapourPressureKpa(SKIN_TEMP_C)
  const ea = saturationVapourPressureKpa(input.dewPointC)
  if (esSkin === null || ea === null) return null

  const dryLoss = ho * (SKIN_TEMP_C - operative)
  const required = Math.max(0, metabolic - dryLoss)
  const max = LEWIS_RATIO_K_PER_KPA * hc * (esSkin - ea)

  /**
   * `E_max <= 0` is a dew point at or above skin temperature — the air is wetter
   * than the hand can ever be, so nothing evaporates. The wettedness is then
   * infinite in the algebra and the honest reading is "the hand cannot dry at
   * all", which the friction map below turns into its floor. It is reported as a
   * finite very-large number rather than `Infinity` so a renderer cannot print
   * one.
   */
  if (max <= 0) {
    return {
      wettedness: required > 0 ? UNCOMPENSABLE_WETTEDNESS : 0,
      required_w_m2: required,
      max_w_m2: max,
      operative_temp_c: operative,
    }
  }

  return {
    wettedness: required / max,
    required_w_m2: required,
    max_w_m2: max,
    operative_temp_c: operative,
  }
}


/**
 * **Skin wettedness → the hand's share of the friction reading, 0-1.**
 *
 * ```
 * factor = exp(−w)
 * ```
 *
 * Read it as *how much of the hand stays dry*. To first order `exp(−w) ≈ 1 − w`
 * for the small wettedness most climbing days sit at, so on an ordinary day this
 * **is** the dry fraction of the skin, which is as direct a statement about
 * friction as this model makes anywhere.
 *
 * The exponential rather than a clipped `1 − w` is a deliberate choice between
 * two defensible maps, and it is on the list of things the Phase 2 stop puts to
 * the owner:
 *
 * - `1 − w` is the literal dry fraction and reaches **exactly zero** at `w = 1`,
 *   the point where heat stress becomes uncompensable. Everything hotter than
 *   that scores the same as a wall under a waterfall, and the ordering above
 *   `w = 1` is lost.
 * - `exp(−w)` agrees with it on ordinary days, keeps falling past `w = 1`, and
 *   never manufactures an exact zero out of a ratio whose numerator is an
 *   invented metabolic rate. It is the more forgiving of the two on hot days —
 *   the optimistic direction — which is the argument against it.
 *
 * `compare:scoring` prints both. Nothing here is calibrated and neither map is
 * measured; the choice is which kind of wrong to prefer.
 */
export function sweatFrictionFactor(wettedness: number | null): number | null {
  if (wettedness === null || !Number.isFinite(wettedness) || wettedness < 0) return null
  return Math.exp(-wettedness)
}

/**
 * The alternative map — the literal dry fraction of skin, floored at zero.
 *
 * Exported so `compare:scoring` can print it beside the default without keeping
 * a second copy of the arithmetic in a script, which is how the two would drift.
 * **Nothing in the scoring path calls this.**
 */
export function dryFractionFrictionFactor(wettedness: number | null): number | null {
  if (wettedness === null || !Number.isFinite(wettedness) || wettedness < 0) return null
  return Math.max(0, 1 - wettedness)
}

