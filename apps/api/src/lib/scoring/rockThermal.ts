/**
 * **Layer 1 of the v2 scoring model — the derived physical quantities, as pure
 * functions.** `docs/handoffs/weatherteam6-scoring-model-handoff-v1.md` § The
 * Model, Phase 1.
 *
 * No database, no network, no Express, no clock. Everything here takes numbers
 * and returns numbers, so every case below is reachable from the test suite —
 * which matters more here than usual, because none of it is calibrated.
 *
 * **Nothing reads this module yet.** Phase 2 wires it to the deterministic +
 * ensemble join that `GET /hourly/:locationId` already performs, and only then
 * does any score move. Until that lands, this file changes no user-visible
 * number.
 *
 * ## The honesty bound, which governs every constant in here
 *
 * The handoff's words, and they are the standard this file is written to: *"None
 * of this is calibrated. We can order days correctly — muggy 80 °F reads worse
 * than dry 80 °F, a wall below its dew point reads Poor — without claiming a
 * friction coefficient. Get the ordering right and say nothing about
 * magnitude."*
 *
 * Two of the correlations below are read at first hand and cited. The rest are
 * judgement calls and each one says so where it is defined. A sol-air
 * temperature computed to a tenth of a degree, laid on top of a rock-type drying
 * window that `scoring-findings.md` §4 calls folklore, is not a precise answer
 * and must never be rendered as one.
 *
 * ## Every output is nullable, and a null is never a zero
 *
 * `defect-patterns.md` §1 is the defect class this repo ships most often, and
 * this module is the place it would be least visible: `T_surface` quietly
 * degrading to air temperature when shortwave is missing would look like a
 * measurement on every screen. So an input that could not be measured withholds
 * the derived quantity. There is no `?? 0` anywhere in this file, and
 * `shortwave_wm2 === 0` — midnight — is carefully not the same thing as
 * `shortwave_wm2 === null`.
 *
 * ## Which model's irradiance — DECIDED, Phase 1
 *
 * **`gfs_seamless`.** Irradiance is read from one deterministic model and never
 * pooled: `gem_seamless` reports shortwave ~3× too high past day 4 (issue #155),
 * and a mean across four models carries that error at half weight. GFS is
 * global, agrees with ECMWF and ICON throughout, and has the longest shortwave
 * horizon measured (384 h at both probe points, `.claude/docs/model-matrix.md`)
 * — where NBM's runs out at 42 h and HRRR is CONUS-only.
 *
 * That decision is a Phase 2 wiring question and there is deliberately **no
 * constant for it here**, because a constant nothing reads is its own defect
 * (`defect-patterns.md` §10). The half of #155 that *can* be enforced by a pure
 * function is enforced: see `MAX_PLAUSIBLE_SHORTWAVE_WM2`.
 */

/**
 * **Solar absorptance of rock, and it is one number on purpose** — Open Question
 * 4 in the handoff, deferred to this phase to be answered on a measurement
 * rather than in the abstract.
 *
 * `0.65` sits near the middle of the plausible span for climbing rock and
 * nothing measured it for any particular crag. The span itself is measured:
 * light granite has an albedo near 0.6 and dark rock surfaces near 0.04, and
 * *"rocks with low albedos will warm both faster and to higher temperatures than
 * rocks with high albedos"* (Hall et al., ESPL — via
 * `.claude/docs/rock-drying-research.md` §3, read at first hand there).
 * Absorptance is `1 − albedo`, so that is roughly 0.4 pale to 0.9 dark.
 *
 * **Do not vary it by `rock_type`.** `npm run compare:thermal --workspace=apps/api`
 * prints what the pale-to-dark spread does to `T_surface`, and the answer is the
 * argument for keeping one constant: the spread is tens of degrees in bright sun
 * and near zero everywhere else — which is to say it only moves the hours that
 * `ASPECT_QUALIFY_MARGIN_C` already flags as unanswerable without geometry we do
 * not have. A per-type table would be a fourth set of invented constants buying
 * precision on hours we are already declining to be precise about, and it would
 * be inert anyway: rock type is unset on every user-added location today.
 */
export const SOLAR_ABSORPTANCE = 0.65

/**
 * The pale-to-dark absorptance span, for the sensitivity report only — nothing
 * in the model varies `α`. Derived from the albedo figures cited on
 * `SOLAR_ABSORPTANCE`: pale ≈ 1 − 0.6, dark ≈ 1 − 0.1.
 */
export const ABSORPTANCE_SPREAD = { pale: 0.4, dark: 0.9 } as const

/**
 * **Above this, a shortwave reading is a gap rather than a measurement** — the
 * enforceable half of issue #155.
 *
 * `gem_seamless` returned 2847 W/m² at San Juan where GFS said 946 at the same
 * hour, measured 2026-09-21. Downward shortwave at the surface tops out near
 * 1100 W/m² and can reach ~1400 under cloud-edge enhancement at altitude;
 * nothing physical exceeds that. A value over the ceiling withholds
 * `T_surface` for the hour instead of reading the wall 130 °C hot.
 *
 * A negative value is rejected for the same reason. **Zero is not** — 0 W/m² is
 * midnight and it is a reading.
 */
export const MAX_PLAUSIBLE_SHORTWAVE_WM2 = 1400

/**
 * **How much solar gain an hour may carry and still count as answerable without
 * knowing the wall's aspect**, in °C of `T_surface`. See § Unknown aspect in the
 * handoff, decided 2026-09-21.
 *
 * Nothing writes `aspect` for a user-added location, so this is every location
 * in production until Phase 4. The decision was to qualify **per hour**: an hour
 * is qualified when the sun could not have changed the answer. With the geometry
 * factor unknown, `I_wall` could be anything from 0 (the wall is in its own
 * shade) to at or above the horizontal value, so the width of the uncertainty
 * band on `T_surface` *is* the solar gain term. Below the margin, every possible
 * aspect gives the same answer to within the margin.
 *
 * `1.0` is a judgement call, in the same register as `RAMP_EXPONENT`. What it
 * buys is the property the decision was made for: night, heavy cloud and a low
 * sun all produce a small gain and come out **qualified** — so a dawn window is
 * fully qualified on a location nobody has ever edited, which is the answer that
 * did not need the flag.
 *
 * Note it is a margin on the *gain*, not on the irradiance, so a windy hour is
 * qualified further into daylight than a still one. That is not a fudge: wind
 * pins the surface to air temperature, and a wall the wind has pinned genuinely
 * does not care which way it faces.
 */
export const ASPECT_QUALIFY_MARGIN_C = 1.0

/**
 * **Longwave sky cooling for a fully horizontal surface under a clear sky, °C.**
 *
 * ASHRAE's sol-air correction `ε·ΔR/h_o`: *"the correction term for vertical
 * surfaces is 0 °C and for horizontal surfaces is −3.9 °C"*, the effect running
 * *"from about zero for vertical wall surfaces to 4 °C (7 °F) for horizontal or
 * inclined roof surfaces facing the sky"* (ASHRAE Fundamentals, via
 * en.wikipedia.org/wiki/Sol-air_temperature — verified 2026-09-21).
 *
 * This is convenient and correct for climbing: a vertical wall barely sees the
 * sky, so the term is ~0 on exactly the surfaces this app is about. It matters
 * for slabs.
 *
 * ASHRAE publishes this already divided by its own `h_o`, so it is in °C and is
 * subtracted as-is. Our `h_o` runs higher than theirs (see `surfaceCoefficient`),
 * which means the term is slightly overstated here — at most a few tenths of a
 * degree, and only on surfaces tilted toward the sky.
 */
export const SKY_COOLING_HORIZONTAL_C = 3.9

/**
 * **Longwave emissivity of rock.** Unusually for this file, it is nearly a
 * measurement: *"Measured emissivities are tightly clustered — granite 0.92,
 * sandstone 0.925, limestone 0.95, with rocks generally 0.89–0.99 — so
 * emissivity is nearly a constant across climbing rock"*
 * (`.claude/docs/rock-drying-research.md` §3).
 *
 * That clustering is also why this is **not** a per-rock-type field and albedo
 * would be, if either were: the research's own conclusion is *"albedo is the
 * variable that actually differs"*. `SOLAR_ABSORPTANCE` is where that argument
 * is had, and § 1 of `compare:thermal` is the answer.
 */
export const ROCK_EMISSIVITY = 0.93

/** Stefan–Boltzmann, W/m²K⁴. */
const STEFAN_BOLTZMANN = 5.670374419e-8

/**
 * **Time constant of the rock-mass temperature, hours.** A judgement call, and
 * the weakest number in this file.
 *
 * The only thing behind it is the observation the whole quantity exists for:
 *
 * > *"If it is 10 °C and 90% humidity and **was 0 °C for the previous few
 * > days**, then most/all places will be **streaming wet**. If it is 10 °C and
 * > 90% humidity but **was 25 °C for the previous few days** then everywhere not
 * > seeping will be **bone dry**."* — `scoring-findings.md` §3.1
 *
 * *"The previous few days"* is the entire basis. 48 h attenuates a diurnal swing
 * to about 8% of its amplitude — `1/√(1 + (2πτ/P)²)` at `P = 24 h` — so ±10 °C
 * day-to-night becomes ±0.8 °C on `T_mass`, which is the behaviour wanted: flat
 * across a day, responsive across a week.
 *
 * **There is a real tension here and it is unresolved.** The conduction
 * arithmetic disagrees: granite's diurnal damping depth is ~0.18 m and the phase
 * lag at that depth is under four hours, so the outer few centimetres of a wall
 * have a time constant of hours, not days. Which depth governs whether a surface
 * condenses on a cliff has not been measured by anything this project has found.
 * 48 h follows the climbers' description rather than the conduction figure,
 * because the climbers are describing the outcome we are trying to predict.
 * `tauHours` is a parameter so Phase 2 can sweep it against real days.
 */
export const MASS_TAU_HOURS = 48

/**
 * **The most a favourable hour may be worth in drying, as a multiple of a
 * reference hour.** A judgement call bounding how far physics is allowed to move
 * a folklore constant.
 *
 * Uncapped, a blazing dry windy hour runs the clock at ~6×, which would dry
 * sandstone in twelve hours. The rock-type windows have no measured basis
 * (`scoring-findings.md` §4) and multiplying one by six is precision this model
 * has not earned. There is deliberately **no floor**: a freezing saturated hour
 * genuinely contributes nothing, which is the §14 "a crag can get wetter on a
 * dry day" direction and the one this model should be willing to say.
 */
export const DRYING_RATE_MAX = 3

/**
 * The conditions a drying multiplier of exactly 1.0 describes: a mild, moderately
 * dry, lightly breezy hour.
 *
 * It exists so that `MAX_HOURS` keeps meaning what it means today. The rock-type
 * windows are convention calibrated against ordinary days, so an evaporation
 * model laid on top of them has to leave an ordinary day unchanged or it
 * silently moves every window it was supposed to modulate.
 *
 * The three values are chosen, not measured. What is load-bearing is only that
 * they describe an unremarkable drying day.
 */
export const REFERENCE_DRYING_CONDITIONS = {
  surfaceTempC: 15,
  relativeHumidityPct: 60,
  windKmh: 10,
} as const

/** Wind speed in m/s from km/h. */
function msFromKmh(kmh: number): number {
  return kmh / 3.6
}

/**
 * **FAO-56's 10 m → 2 m wind conversion**, `u2 = u10 · 4.87 / ln(67.8 z − 5.42)`
 * at `z = 10`, which is `× 0.7479`.
 *
 * Applied only to the Penman wind function in `evaporativeCapacity`, because
 * that function is published in terms of `u2` and this is the conversion
 * published alongside it. It is deliberately **not** applied to
 * `convectiveCoefficient`, whose correlation is in the free-stream velocity over
 * the plate. Both are "use the correlation as published"; they just have
 * different published reference heights.
 */
const U10_TO_U2 = 4.87 / Math.log(67.8 * 10 - 5.42)

/**
 * **Convective heat transfer coefficient at the wall, W/m²K.** Half of the
 * sol-air denominator — see `surfaceCoefficient`, which is what `T_surface`
 * actually divides by.
 *
 * `h_c = 5.7 + 3.8·v`, v in m/s — Jürges' 1924 wind-tunnel measurements on a
 * smooth vertical plate, as reported by McAdams (1954) and still the most common
 * exterior correlation in building energy simulation. **Verified at first hand
 * 2026-09-21** (the handoff asked for it): *"An analysis of Jurges' experimental
 * results yielded a correlation for smooth surfaces: h_w = 3.8V∞ + 5.7 W/m²·K⁻¹,
 * valid for V∞ ≤ 5 m/s."*
 *
 * **The linear branch is used at every wind speed, and that is a deliberate
 * departure from the published pair.** Above 5 m/s the correlation is
 * `7.2·v^0.78`, and the two do not meet: 24.7 against 25.3 W/m²K at the join.
 * A 2% step in `h_c` is a **step**, and that is the objection: at 900 W/m² and
 * 25 °C it moves `T_surface` by 0.35 °C at exactly 18 km/h of wind and by
 * nothing at 17.9 or 18.1, which is the shape issue #148 was filed for and which
 * `.claude/rules/architecture.md` forbids outright. Neither branch is exact —
 * both are curve fits to one 1924 wind tunnel — so the choice is between two
 * approximations, and the continuous one wins. The linear form runs within 1% of
 * the turbulent branch at 10 m/s and ~10% at 20 m/s, and since `h_c` is a
 * denominator a high `h_c` reads the rock *cooler*.
 * `rockThermal.test.ts` walks the wind axis in tenths and asserts no step.
 *
 * **Two things this is not.** It is a building-surface figure, not a rock one —
 * rock is rougher than a copper plate and a real cliff is not a flat plate at
 * all. And the wind fed to it is the 10 m forecast wind with no reduction to
 * wall height, which overestimates the air actually moving across the rock.
 * Both push `h_c` up and the solar gain down.
 */
export function convectiveCoefficient(windKmh: number | null): number | null {
  if (windKmh === null || !Number.isFinite(windKmh) || windKmh < 0) return null
  return 5.7 + 3.8 * msFromKmh(windKmh)
}

/**
 * **Linearised longwave radiative coefficient, W/m²K** — `h_r = 4 ε σ T³`, the
 * standard first-order expansion of `σ(T_s⁴ − T_sky⁴)` about air temperature.
 *
 * About 5.6 W/m²K at 20 °C, which is the same size as the convective
 * coefficient in still air and the reason it cannot be left out.
 *
 * Linearised **about air temperature**, not surface temperature, which keeps
 * `surfaceTemperature` explicit rather than iterative. The cost is that a wall
 * far above air temperature radiates more than this says, so `h_o` is
 * understated exactly where the wall is hottest and the model stays on the hot
 * side there. That is the direction that costs the friction reading rather than
 * inflating it (issue #34), and it is the same direction as the unscaled
 * horizontal irradiance.
 */
export function radiativeCoefficient(airTempC: number | null): number | null {
  if (airTempC === null || !Number.isFinite(airTempC)) return null
  const kelvin = airTempC + 273.15
  if (kelvin <= 0) return null
  return 4 * ROCK_EMISSIVITY * STEFAN_BOLTZMANN * kelvin ** 3
}

/**
 * **The sol-air denominator `h_o`, W/m²K: convection plus longwave radiation.**
 *
 * ASHRAE's `h_o` is explicitly the *"coefficient of heat transfer by long-wave
 * radiation and convection at the outer surface"*, so `T_surface` divides by
 * this and not by `convectiveCoefficient` alone. Leaving radiation out was worth
 * catching: the first run of `compare:thermal` put **127 °C** on a wall at
 * 900 W/m² in dead calm, because in still air the two coefficients are the same
 * size and half the cooling was simply missing. With it the same hour reads
 * 77 °C, which is where measured rock surfaces in still desert air actually sit.
 *
 * **It runs high against ASHRAE's own tabulated value and that is known.** This
 * gives 24.2 W/m²K at 3.4 m/s where ASHRAE's summer design figure is 17 — the
 * standard criticism of Jürges/McAdams, whose wind-tunnel free-stream velocity
 * is not the air speed at a real surface. A high `h_o` reads the rock *cooler*.
 * So the two documented biases in this model run opposite ways: unscaled
 * horizontal irradiance reads it hot, this reads it cool, and neither is
 * calibrated. Do not quote a net direction — there is no measurement behind one.
 */
export function surfaceCoefficient(
  airTempC: number | null,
  windKmh: number | null,
): number | null {
  const hc = convectiveCoefficient(windKmh)
  const hr = radiativeCoefficient(airTempC)
  if (hc === null || hr === null) return null
  return hc + hr
}

/**
 * Longwave cooling to the sky, °C, to be **subtracted** from air temperature.
 *
 * ASHRAE publishes two endpoints — 0 for a vertical surface and
 * `SKY_COOLING_HORIZONTAL_C` for a horizontal one — and this interpolates
 * linearly between them on the stored cliff angle. The interpolation is ours;
 * ASHRAE does not publish the middle.
 *
 * `cliffAngleDeg` is the column's own convention, the same one `dryingModel`
 * uses: **0 is a vertical wall and 90 is a flat slab.** (Phase 4 is where the
 * user-facing meaning of `cliff_angle` gets fixed; the stored convention is not
 * changing under this file.) Note that nothing writes it for a user-added
 * location, so in production it is the default 45 almost everywhere — worth
 * remembering before reading anything into the term.
 *
 * Cloud scales it to zero: the 3.9 °C is a clear-sky figure, and under overcast
 * the sky radiates at close to air temperature. Linear in cloud fraction is an
 * approximation with nothing behind it beyond the two endpoints being right.
 */
export function skyCoolingC(cliffAngleDeg: number | null, cloudPct: number | null): number | null {
  if (cliffAngleDeg === null || !Number.isFinite(cliffAngleDeg)) return null
  if (cloudPct === null || !Number.isFinite(cloudPct)) return null
  const tilt = Math.min(Math.max(cliffAngleDeg, 0), 90) / 90
  const clearFraction = 1 - Math.min(Math.max(cloudPct, 0), 100) / 100
  return SKY_COOLING_HORIZONTAL_C * tilt * clearFraction
}

// ---------------------------------------------------------------------------
// Wall geometry — Phase 4b. What makes `I_wall` real once a wall is recorded.
// ---------------------------------------------------------------------------

/**
 * **A recorded wall: where it is, which way it faces, and how steep it is.**
 * Only ever built when *both* `aspect` and `cliff_angle` were recorded — the
 * 45° default is not a recorded angle, and a geometry factor computed from it
 * would claim a precision nobody supplied. Without one of these the model keeps
 * the unscaled horizontal irradiance and the per-hour `qualified` rule.
 */
export type WallOrientation = {
  lat: number
  lon: number
  /** Direction the face points, degrees clockwise from north. */
  aspectDeg: number
  /** Stored convention: 0 = vertical, 90 = flat slab, negative overhanging. */
  cliffAngleDeg: number
}

/** Solar constant, W/m² (Kopp & Lean 2011, 1360.8 ± 0.5). */
const SOLAR_CONSTANT_WM2 = 1361

/**
 * Below this solar elevation the beam/diffuse split is not attempted and the
 * hour's irradiance is treated as all diffuse. Near the horizon `cos θz → 0`,
 * so the clearness index and the beam-to-normal ratio both divide by almost
 * nothing, and an hourly mean whose sun rose half-way through the hour would
 * otherwise put a searing beam on an east wall at dawn. 5° is the usual cut in
 * solar-resource work; it is a numerical guard, not a physical claim.
 */
const MIN_BEAM_ELEVATION_DEG = 5

/**
 * **Ground reflectance for the reflected term.** 0.2 is the conventional
 * default for mixed terrain (Duffie & Beckman, *Solar Engineering of Thermal
 * Processes*); a talus field of pale granite reflects more and a forest floor
 * less. It only matters on steep walls, which see half the ground, and
 * nothing here measured it for any crag.
 */
export const GROUND_ALBEDO = 0.2

const DEG = Math.PI / 180

/**
 * **Where the sun is, from coordinates and a UTC instant.** NOAA's general
 * solar position equations (Spencer's Fourier series for declination and the
 * equation of time), good to well under a degree — far inside everything else
 * this file is uncertain about.
 *
 * Azimuth is degrees clockwise from north, the same convention as `aspect`.
 * `elevationDeg` is negative at night.
 */
export function solarPosition(at: Date, lat: number, lon: number): {
  elevationDeg: number
  azimuthDeg: number
} | null {
  const t = at.getTime()
  if (!Number.isFinite(t) || !Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const yearStart = Date.UTC(at.getUTCFullYear(), 0, 1)
  const dayOfYear = Math.floor((t - yearStart) / 86_400_000) + 1
  const utcHours = at.getUTCHours() + at.getUTCMinutes() / 60 + at.getUTCSeconds() / 3600
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (utcHours - 12) / 24)

  const eqTimeMin =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g))
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g)

  const trueSolarMin = utcHours * 60 + eqTimeMin + 4 * lon
  const hourAngle = (trueSolarMin / 4 - 180) * DEG
  const phi = lat * DEG

  const cosZenith = Math.min(
    1,
    Math.max(-1, Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(hourAngle)),
  )
  const elevationDeg = 90 - Math.acos(cosZenith) / DEG

  // Measured from south, positive westward, then turned to clockwise-from-north.
  const fromSouth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi),
  )
  const azimuthDeg = (((fromSouth / DEG + 180) % 360) + 360) % 360

  return { elevationDeg, azimuthDeg }
}

/**
 * **Erbs, Klein & Duffie (1982) diffuse fraction** from the hourly clearness
 * index `k_t` — the share of global horizontal irradiance that arrives from the
 * whole sky rather than from the sun's disc. The standard correlation for
 * splitting a GHI-only series; it is fitted to US station data and is an
 * approximation everywhere, which is still far better than the alternative of
 * treating every watt as beam or every watt as diffuse.
 */
export function erbsDiffuseFraction(kt: number): number {
  const k = Math.min(Math.max(kt, 0), 1)
  if (k <= 0.22) return 1 - 0.09 * k
  if (k <= 0.8) return 0.9511 - 0.1604 * k + 4.388 * k ** 2 - 16.638 * k ** 3 + 12.336 * k ** 4
  return 0.165
}

/**
 * **Irradiance on the wall, W/m², from irradiance on the horizontal.** This is
 * `I_wall` once a wall is recorded:
 *
 * ```
 * I_wall = I_beam·cos θ / cos θz  +  I_diff·(1 + cos β)/2  +  GHI·ρ·(1 − cos β)/2
 * ```
 *
 * GHI is split into beam and diffuse by `erbsDiffuseFraction`, then the
 * isotropic-sky transposition (Liu & Jordan, as in Duffie & Beckman §2.15) puts
 * each part on a surface of tilt `β` from horizontal facing `aspectDeg`. `θ` is
 * the sun's angle of incidence on that surface; a face the sun is behind gets
 * no beam at all, only sky and ground.
 *
 * `β = 90 − cliff_angle`, so a vertical wall is 90, a slab less, and **an
 * overhang more than 90** — facing partly downward, it sees less sky and more
 * ground, which the same two view factors already express.
 *
 * **What it does not know: terrain.** A canyon wall, a ridge to the east or a
 * forest in front of the crag all shade it, and none of that is in a weather
 * model. Mountain Project and Climbit both concede the same gap
 * (`climbing-terminology-research.md` §21.6). Ignoring it reads a shaded wall as
 * sunlit — hotter, worse friction — which is the direction to be wrong in
 * (issue #34), and the copy's "modelled" caveat is what covers it.
 *
 * `at` is the instant the sun's position is taken at. Open-Meteo's
 * `shortwave_radiation` is the mean over the **preceding** hour, so a caller
 * passes the middle of that hour, not its stamp.
 *
 * Null for a non-finite or out-of-range input — never 0, which is night.
 */
export function wallIrradianceWm2(
  ghiWm2: number | null,
  at: Date,
  wall: WallOrientation,
): number | null {
  if (ghiWm2 === null || !Number.isFinite(ghiWm2)) return null
  if (ghiWm2 < 0 || ghiWm2 > MAX_PLAUSIBLE_SHORTWAVE_WM2) return null
  if (!Number.isFinite(wall.aspectDeg) || !Number.isFinite(wall.cliffAngleDeg)) return null
  if (ghiWm2 === 0) return 0

  const sun = solarPosition(at, wall.lat, wall.lon)
  if (sun === null) return null

  const clampedCliff = Math.min(Math.max(wall.cliffAngleDeg, -90), 90)
  const beta = (90 - clampedCliff) * DEG
  const skyView = (1 + Math.cos(beta)) / 2
  const groundView = (1 - Math.cos(beta)) / 2
  const reflected = ghiWm2 * GROUND_ALBEDO * groundView

  // Sun near or below the horizon while the hourly mean is non-zero: the hour
  // straddled sunrise or sunset. All of it is treated as sky light.
  if (sun.elevationDeg < MIN_BEAM_ELEVATION_DEG) {
    return ghiWm2 * skyView + reflected
  }

  const cosZenith = Math.sin(sun.elevationDeg * DEG)
  const yearStart = Date.UTC(at.getUTCFullYear(), 0, 1)
  const dayOfYear = Math.floor((at.getTime() - yearStart) / 86_400_000) + 1
  const extraterrestrialNormal =
    SOLAR_CONSTANT_WM2 * (1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365))
  const kt = ghiWm2 / (extraterrestrialNormal * cosZenith)

  const diffuse = ghiWm2 * erbsDiffuseFraction(kt)
  const beamHorizontal = ghiWm2 - diffuse

  const zenith = (90 - sun.elevationDeg) * DEG
  const cosIncidence =
    Math.cos(zenith) * Math.cos(beta) +
    Math.sin(zenith) * Math.sin(beta) * Math.cos((sun.azimuthDeg - wall.aspectDeg) * DEG)
  const beamOnWall = cosIncidence > 0 ? (beamHorizontal * cosIncidence) / cosZenith : 0

  return beamOnWall + diffuse * skyView + reflected
}

export type SurfaceTemperatureInput = {
  airTempC: number | null
  /**
   * Downward shortwave on a **horizontal** surface, W/m². Not the wall's
   * irradiance — see `qualified` on the result.
   */
  shortwaveWm2: number | null
  windKmh: number | null
  cloudPct: number | null
  /** Stored convention: 0 = vertical wall, 90 = flat slab. */
  cliffAngleDeg: number | null
  /**
   * **The recorded wall and the instant to take the sun at**, or absent/null
   * when the wall was not recorded. Present, it replaces the unscaled
   * horizontal irradiance with `wallIrradianceWm2` and every computed hour is
   * qualified — the geometry the flag was waiting for is now known. `at` is
   * the middle of the hour the shortwave mean covers, not its stamp.
   */
  wall?: { orientation: WallOrientation; at: Date } | null
  /** Defaults to `SOLAR_ABSORPTANCE`. Varied only by the sensitivity report. */
  absorptance?: number
  /**
   * The `user_preferences.include_sun` escape hatch. `false` drops the solar
   * term entirely, which also means `T_surface` is computable past the model's
   * shortwave horizon.
   */
  includeSun?: boolean
}

export type SurfaceTemperature = {
  /** `null` whenever an input was missing. **Never defaulted to air temperature.** */
  t_surface_c: number | null
  /** The `α·I/h_o` term on its own, so a caller can see what the sun did. */
  solar_gain_c: number | null
  /** The subtracted longwave term, positive. */
  sky_cooling_c: number | null
  /**
   * **False when the answer could have been changed by an aspect we do not
   * have** — `defect-patterns.md` §3, attribution not backed by the data. A
   * surface must say so rather than present the reading as measured. With a
   * recorded wall every computed hour is qualified: terrain shading is still
   * unknown, but it can only make the wall cooler than this reads.
   *
   * Decided per hour, not per location: the same wall is qualified at 6am and
   * unqualified at 1pm. A withheld reading is never qualified — there is nothing
   * to qualify — so `t_surface_c === null` always carries `false`.
   */
  qualified: boolean
}

const WITHHELD: SurfaceTemperature = {
  t_surface_c: null,
  solar_gain_c: null,
  sky_cooling_c: null,
  qualified: false,
}

/**
 * **Rock surface temperature — the thing friction actually depends on, and it is
 * not air temperature.** Standard sol-air temperature:
 *
 * ```
 * T_surface = T_air + (α · I_wall) / h_o − skyCooling
 * ```
 *
 * `I_wall` is **horizontal irradiance, unscaled**, and that is a decision rather
 * than an oversight — § Unknown aspect in the handoff. A vertical wall under a
 * high midday sun receives well below the horizontal value, so this
 * over-estimates solar gain and reads the rock hotter than it is. That is the
 * direction to be wrong in: it costs the friction reading rather than inflating
 * it (issue #34). **It is not a universal upper bound** — a sun-facing wall
 * under a low winter sun can exceed horizontal — so do not describe it as one.
 * The hours where it matters are the ones `qualified` marks.
 *
 * **With a recorded wall, `I_wall` is `wallIrradianceWm2`** — aspect, tilt and
 * sun position (Phase 4b) — and the hour is qualified. Without one, the
 * unscaled horizontal value and the margin rule above still apply.
 */
export function surfaceTemperature(input: SurfaceTemperatureInput): SurfaceTemperature {
  const { airTempC, shortwaveWm2, windKmh, cloudPct, cliffAngleDeg } = input
  const absorptance = input.absorptance ?? SOLAR_ABSORPTANCE
  const includeSun = input.includeSun ?? true

  if (airTempC === null || !Number.isFinite(airTempC)) return WITHHELD

  const skyCooling = skyCoolingC(cliffAngleDeg, cloudPct)
  if (skyCooling === null) return WITHHELD

  // Sun off: the solar term is not missing, it is excluded. The hour is
  // qualified because aspect cannot change an answer that does not read the sun.
  if (!includeSun) {
    return {
      t_surface_c: airTempC - skyCooling,
      solar_gain_c: 0,
      sky_cooling_c: skyCooling,
      qualified: true,
    }
  }

  // 0 is midnight and survives; null is an hour past the model's shortwave
  // horizon and withholds; over the ceiling is issue #155 and also withholds.
  if (shortwaveWm2 === null || !Number.isFinite(shortwaveWm2)) return WITHHELD
  if (shortwaveWm2 < 0 || shortwaveWm2 > MAX_PLAUSIBLE_SHORTWAVE_WM2) return WITHHELD

  const ho = surfaceCoefficient(airTempC, windKmh)
  if (ho === null || ho <= 0) return WITHHELD

  const wall = input.wall ?? null
  if (wall !== null) {
    const iWall = wallIrradianceWm2(shortwaveWm2, wall.at, wall.orientation)
    if (iWall === null) return WITHHELD
    const solarGain = (absorptance * iWall) / ho
    return {
      t_surface_c: airTempC + solarGain - skyCooling,
      solar_gain_c: solarGain,
      sky_cooling_c: skyCooling,
      qualified: true,
    }
  }

  const solarGain = (absorptance * shortwaveWm2) / ho

  return {
    t_surface_c: airTempC + solarGain - skyCooling,
    solar_gain_c: solarGain,
    sky_cooling_c: skyCooling,
    qualified: solarGain <= ASPECT_QUALIFY_MARGIN_C,
  }
}

export type MassTemperatureOptions = {
  /** Defaults to `MASS_TAU_HOURS`. */
  tauHours?: number
  /** Hours each sample covers. Defaults to 1. */
  stepHours?: number
  /**
   * Shortest series that may produce an answer, in hours. Defaults to `2 × tau`.
   * See the seed-weight note on the function.
   */
  minSpanHours?: number
  /** Fraction of the span that must carry a real value. Defaults to 0.5. */
  minCoverage?: number
}

/**
 * **Rock mass temperature — an exponentially smoothed trailing air temperature
 * over days, not hours.**
 *
 * `T_surface` is fast and drives friction; `T_mass` is slow and drives
 * condensation. They are two different numbers and conflating them is the
 * humidity bug (#140). The reason this quantity exists at all is
 * `scoring-findings.md` §3.1: identical humidity, opposite outcomes,
 * discriminated by a variable the current scorer does not have.
 *
 * `series` is consecutive hourly air temperatures, **oldest first**, ending at
 * the hour being scored, with gaps as `null`. A gap does not stop the clock: the
 * weight of everything before it decays across the whole gap, and the next real
 * sample is then blended in at that decayed weight. **That is an assumption, not
 * a skip** — it behaves as though the temperature moved smoothly from the last
 * reading to the next one across the hole, which is the standard treatment of
 * irregular samples in an exponential average and is why a 24-hour hole in the
 * middle of a step change lands within 1e-13 of the same answer as no hole at
 * all. It is also why coverage is guarded below rather than left to the caller.
 *
 * **The two guards are why this returns null, and they are about the seed.** The
 * first real sample seeds the average outright, so a short series is mostly just
 * that one hour wearing a multi-day label. After `n` time constants the seed
 * carries `e^-n` of the weight: at the default `2τ` that is 14%, which is small
 * enough to report. Below it, and below 50% coverage of the span, the honest
 * answer is that the wall's history was not measured — **not** that it sat at
 * whatever the first hour said.
 *
 * `weather_run_hours` retains 2 days, so a caller wanting the default 96 h has
 * to re-fetch from the archive API the way rainfall history already does. That
 * is a Phase 2 problem and it is flagged in the handoff's § Known Risks.
 */
export function massTemperatureC(
  series: readonly (number | null)[],
  options: MassTemperatureOptions = {},
): number | null {
  const tau = options.tauHours ?? MASS_TAU_HOURS
  const step = options.stepHours ?? 1
  const minSpan = options.minSpanHours ?? 2 * tau
  const minCoverage = options.minCoverage ?? 0.5

  if (!Number.isFinite(tau) || tau <= 0) return null
  if (!Number.isFinite(step) || step <= 0) return null

  const spanHours = series.length * step
  if (spanHours < minSpan) return null

  let ewma: number | null = null
  let elapsedSinceLast = 0
  let measured = 0

  for (const value of series) {
    if (value === null || !Number.isFinite(value)) {
      elapsedSinceLast += step
      continue
    }
    measured += 1
    if (ewma === null) {
      ewma = value
    } else {
      const dt = elapsedSinceLast + step
      const k = 1 - Math.exp(-dt / tau)
      ewma = ewma + k * (value - ewma)
    }
    elapsedSinceLast = 0
  }

  if (ewma === null) return null
  if (measured * step < minCoverage * spanHours) return null
  return ewma
}

/**
 * **`T_mass − T_dew`. Below zero the wall is condensing and is wet regardless of
 * whether it has rained.**
 *
 * This replaces the fixed relative-humidity curve, which `scoring-findings.md`
 * §3.1 shows cannot be right in principle — a fixed RH curve is not mis-weighted
 * but incomplete, because the same humidity means opposite things depending on
 * what the rock has been sitting at. It is also CragReport's "grease factor".
 *
 * Note which temperature this takes. `T_mass`, not `T_surface`: the bulk of the
 * wall is what a night of condensation equilibrates against. `T_surface` below
 * the dew point is a separate and faster statement, and it shows up in
 * `evaporativeCapacity` as a deficit of zero.
 */
export function condensationMarginC(
  tMassC: number | null,
  dewPointC: number | null,
): number | null {
  if (tMassC === null || !Number.isFinite(tMassC)) return null
  if (dewPointC === null || !Number.isFinite(dewPointC)) return null
  return tMassC - dewPointC
}

/** `null` in, `null` out — an unmeasured margin is not "not condensing". */
export function isCondensing(marginC: number | null): boolean | null {
  if (marginC === null || !Number.isFinite(marginC)) return null
  return marginC < 0
}

/**
 * Saturation vapour pressure over water, kPa.
 *
 * FAO-56 equation 11 (the Tetens/Magnus form):
 * `e°(T) = 0.6108 · exp(17.27 T / (T + 237.3))`, T in °C. Standard, and it
 * reproduces the published table — 1.7053 kPa at 15 °C.
 */
export function saturationVapourPressureKpa(tempC: number | null): number | null {
  if (tempC === null || !Number.isFinite(tempC)) return null
  return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3))
}

export type EvaporativeCapacityInput = {
  surfaceTempC: number | null
  dewPointC: number | null
  windKmh: number | null
}

/**
 * **Evaporative capacity — how fast moisture leaves a surface, rock or skin.**
 * An index, not a rate: `kPa` of vapour-pressure deficit scaled by a wind
 * function, with no units anybody should quote.
 *
 * The same quantity does two jobs, which is the whole point of it. It sets how
 * fast the rock sheds water — it is the rate term behind `dryingRateMultiplier`
 * — and how fast a hand sheds sweat, which is one of the two mechanisms the
 * friction reading is built from. **Temperature and humidity both enter it and
 * neither is meaningful without the other**: 25 °C at 40% RH and 25 °C at 90% RH
 * are different climbing days, and two independent point buckets could not say
 * so. That is why the fix for the temperature and humidity components is not a
 * reweighting (handoff, § What friction is made of; `scoring-findings.md` §4
 * records that there is no measured basis for moving the 12 and the 8 anyway).
 *
 * The deficit is taken at **`T_surface`**, against actual vapour pressure from
 * the **dew point**. Dew point rather than RH because it is what the app already
 * fetches and never reads, and because rock research §2.8 is that the surface
 * equilibrates with the air almost instantly, so *"atmospheric moisture governs
 * greasiness — which is what dew point measures and relative humidity
 * obscures"*.
 *
 * The wind function is Penman's `f(u) = 0.26(1 + 0.54 u₂)`, normalised to 1 at
 * still air so the index is a pure multiple of the deficit. `u₂` is the 2 m wind
 * via FAO-56's conversion — see `U10_TO_U2`.
 *
 * **Floored at zero, and that floor is a statement.** A surface below the dew
 * point has a negative deficit: it is gaining water, not losing it. Zero is the
 * honest drying rate there, and it is what lets this model say a crag can get
 * wetter on a dry day.
 */
export function evaporativeCapacity(input: EvaporativeCapacityInput): number | null {
  const esSurface = saturationVapourPressureKpa(input.surfaceTempC)
  const eaAir = saturationVapourPressureKpa(input.dewPointC)
  if (esSurface === null || eaAir === null) return null
  if (input.windKmh === null || !Number.isFinite(input.windKmh) || input.windKmh < 0) return null

  const deficit = Math.max(0, esSurface - eaAir)
  const u2 = msFromKmh(input.windKmh) * U10_TO_U2
  return deficit * (1 + 0.54 * u2)
}

/**
 * The evaporative capacity of `REFERENCE_DRYING_CONDITIONS`, computed from the
 * same function rather than written down, so the two can never drift.
 *
 * ≈ 1.4474. `rockThermal.test.ts` asserts that against hand arithmetic, which is
 * what stops this being a tautology: the test does the Magnus and Penman sums
 * by hand rather than calling the code that produced the number.
 */
export const REFERENCE_EVAP_INDEX: number = (() => {
  const es = saturationVapourPressureKpa(REFERENCE_DRYING_CONDITIONS.surfaceTempC)
  if (es === null) throw new Error('reference saturation vapour pressure is not computable')
  const ea = es * (REFERENCE_DRYING_CONDITIONS.relativeHumidityPct / 100)
  const u2 = msFromKmh(REFERENCE_DRYING_CONDITIONS.windKmh) * U10_TO_U2
  return (es - ea) * (1 + 0.54 * u2)
})()

/**
 * **How fast this hour runs the drying clock, as a multiple of a reference
 * hour.** Layer 1d: the existing rock-type drying window, with the clock running
 * at a rate set by evaporation potential rather than flat elapsed time.
 *
 * The rock-type constants stay exactly as they are and keep meaning what they
 * mean — they are the absorptive capacity, and `REFERENCE_DRYING_CONDITIONS` is
 * chosen so an ordinary day still takes `MAX_HOURS` hours. **They remain
 * folklore** (`scoring-findings.md` §4) and putting physics on top of them must
 * not be presented as precision; `DRYING_RATE_MAX` is the bound on how far the
 * physics is allowed to move them.
 */
export function dryingRateMultiplier(input: EvaporativeCapacityInput): number | null {
  const capacity = evaporativeCapacity(input)
  if (capacity === null) return null
  return Math.min(capacity / REFERENCE_EVAP_INDEX, DRYING_RATE_MAX)
}

export type EffectiveDryingHours = {
  /**
   * Reference-equivalent hours of drying accumulated from the hours that were
   * measured. **A lower bound**, because an unmeasured hour contributes nothing.
   */
  effective_hours: number
  measured_hours: number
  /**
   * Hours in the window whose rate could not be computed. A caller that cares
   * about the difference between "did not dry" and "was not watched" reads this
   * — `effective_hours` alone cannot tell them apart.
   */
  unmeasured_hours: number
}

/**
 * Accumulate `dryingRateMultiplier` over a window into reference-equivalent
 * hours, which is the figure to compare against the rock type's `MAX_HOURS`.
 *
 * **An unmeasured hour contributes nothing and is counted separately**, rather
 * than being filled in at the reference rate. Filling it would be
 * `defect-patterns.md` §1 — a gap rendered as a plausible reading — and it would
 * fail in the inflating direction, which issue #34 forbids. Under-counting reads
 * the wall as wetter than it is, which is the direction to be wrong in; the
 * count is returned so Phase 2 can withhold instead if the hole is large.
 */
export function effectiveDryingHours(
  multipliers: readonly (number | null)[],
  stepHours = 1,
): EffectiveDryingHours {
  let effective = 0
  let measured = 0
  let unmeasured = 0

  for (const m of multipliers) {
    if (m === null || !Number.isFinite(m)) {
      unmeasured += stepHours
      continue
    }
    effective += m * stepHours
    measured += stepHours
  }

  return { effective_hours: effective, measured_hours: measured, unmeasured_hours: unmeasured }
}
