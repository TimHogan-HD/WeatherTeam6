# WeatherTeam6: Scoring Model v2 — Handoff

Version: v1
Date: 2026-09-16
Status: **Phases 0, 1 and 2 are built. STOPPED at the Phase 2 checkpoint, 2026-09-21,
awaiting the owner on the three decisions in § Open Questions 5.** Nothing is wired to a
surface and no production score has moved. Q2 and Q4 are decided; Q1 is measured and folded
into Q5; Q3 is still Phase 3's to ask. Read § Open Questions before starting a phase, and
run `npm run compare:scoring --workspace=apps/api` before arguing about a number — a
deferral is a decision about *when*, not permission to pick one quietly.

## Context

Issue #21 says extreme heat can only cost 12 of 100 points, so 104 °F reads as a good day.
Three attempts to fix it inside the current model — reweight temperature, cap the total, or
take the geometric mean — each failed for the same reason, and the reason is the model's
shape rather than its constants. This document specifies the replacement.

## Current State

**What exists.** `conditionsScore.ts` scores five components against a fixed point budget —
drying 40, upcoming rain 25, wind 15, temperature 12, humidity 8 — and adds them up.
`computeLiveForecast` runs it once per day over seven days of pooled ensemble daily
aggregates. The drying clock is per-day and correct as of #108; the drying ramp is concave as
of #137.

**What is broken.**

1. **Four good components outvote one fatal one.** A weighted sum has no veto, so 104 °F
   costs 12 points and the day lands at 88. That is issue #21, and it is structural.
2. **A 12% share cannot express "no".** Measured in the comparison harness: under a weighted
   geometric mean, a component at its floor costs `1 - floor^(w/Σw)`. At temperature's weight
   that bounds the cost at 30%, so 104 °F still scores 70. Raising the weight enough to fix it
   (39 of 100) makes a 37 mph gale score *better* than before, because the exponents are shares
   of one total — fixing temperature takes the share from wind and drying.
3. **The temperature component had a cliff at 95 °F** — issue #148, **fixed 2026-09-21**. It
   scored 6 of 12 at 95.0 °F and 0 at 95.2 °F, a 6-point step in the total from a fifth of a
   degree, and every mechanism that makes a zero matter amplified it: 22 points under the
   geometric mean, 33 under a veto. The upper ramp now runs 12→0 across 22–35 °C, so both
   edges reach 0 exactly at the band and the step is gone — at the cost of a harsher upper
   half (25 °C moved from 11 of 12 to 9). That is a patch on a component the model below
   replaces outright; it is here so the numbers in this document are read against what
   production now does, not against the step.
4. **Three inputs are fetched and thrown away.** `dewpoint_c` is stored and never read.
   Shortwave radiation is aggregated on every request and dropped. `aspectDegrees` is computed,
   passed into `ScoreInput`, and never read by any scorer — so sun direction scores zero points.
   `cliff_angle` defaults to 45 and nothing writes it for a user-added location.
5. **"Upcoming rain in the next 72 hours" is a trip-planning number living inside a per-day
   score.** Since #108 each day's own rain already reaches that day's drying clock, so the
   component double-counts rain that the day it belongs to will score for itself.

**What the field does instead.** Verified at first hand, 2026-09-16:

| Product | Shape |
| --- | --- |
| **CragReport** | Three derived quantities — rock surface temperature, a grease factor from dew-point depression, and wind at the wall — not weather variables with point budgets. `ideal_c` is a **request parameter**: what counts as too hot is the user's setting |
| **crag.day** | Publishes **dryness and friction separately, in words**, hourly, and never combines them |
| **Climbit** | Folds sun, humidity, wind and UV into a climbing "feels like" temperature; the score comes from that plus rain. Preferences menu |
| **Prime Condies** | Nothing but user thresholds — counts how many of the next 24 hours clear them |

Nobody in the field allocates a fixed point budget to temperature. Two of the four publish
two readings rather than one. Three of the four let the user set what "ideal" means.

**CragReport's scoring API was returning `SCORING_FAILURE` throughout this session, so no live
competitor number was captured.** Their architecture above comes from their own "how it works"
page, read at first hand.

## Objective

Replace the five-bucket weighted sum with a model that answers the two questions climbers
actually ask, separately, and derives a single rankable number from them:

1. **Is the rock dry?**
2. **Will it feel good to climb on?**

The result must make a deal-breaker rule unnecessary rather than add one, score hourly so a
day reports its window rather than an average, and take its thresholds from the user rather
than from constants nobody measured.

## Constraints / Non-Goals

- **The score stays 0–100** (owner decision, `scoring-findings.md` §5.1). The two word-readings
  are published *alongside* it, not instead of it.
- **Safety stays out of the number.** The community position is that only lightning and extreme
  wind are safety inputs, and the existing Severe+ alert suppression already carries them. Wind
  enters this model physically — it cools the rock and dries it — not as a danger component.
- **No terrain shading.** It needs a digital elevation model this project does not have.
  CragReport has one; we do not, and must not imply we do.
- **No rock-strength modelling.** No constant in the app is a strength figure and none is added.
- **Not validated against outcomes, and this document does not claim to fix that.** The feedback
  button (#143) remains the only path to knowing whether any of this predicts anything.
- **`apps/mobile` is archived.** No surface work reaches it.

## Pre-Implementation Checklist

- [ ] Verify Open-Meteo returns `shortwave_radiation` on the **deterministic** hourly endpoint
      for every model in `DETERMINISTIC_MODELS`, one model at a time, before adding the column.
      `probeModels.ts` is the existing harness for exactly this — Open-Meteo drops unsupported
      variables from a multi-model response silently.
- [ ] Confirm `dewpoint_2m` is present in every deterministic hourly response, not only the
      ensemble one.
- [ ] Re-measure the mutation baseline before rewriting the scorer, as #108 did. `liveForecast.ts`
      was the weakest file at 44%; it is being rewritten again here.
- [ ] Read `.claude/rules/defect-patterns.md` §1 before writing any formatter — every derived
      quantity in this document is nullable and several of them render as plausible numbers when
      they are actually missing.
- [ ] Check `npm run compare:scoring --workspace=apps/api` still asserts its baseline against the
      real scorer. It is the before/after instrument for this whole piece of work and it must be
      extended, not replaced.

## The Model

### Layer 1 — Derived physical quantities

Everything here is computed from data the app **already fetches**, except `shortwave_radiation`
on the deterministic feed, which is one request parameter and one column.

**1a. Rock surface temperature `T_surface`** — the thing friction actually depends on, and it
is not air temperature. Standard sol-air temperature:

```
T_surface = T_air + (α · I_wall) / h_c − skyCooling
```

| Term | Source | Note |
| --- | --- | --- |
| `α` | solar absorptance of rock | One default (~0.65), **a judgement call** — no per-crag measurement exists. Do not vary it by `rock_type` without a source |
| `I_wall` | horizontal shortwave × geometry factor from aspect, tilt and sun position | With no aspect recorded, see § Unknown aspect below — the qualification is **per hour**, not per location |
| `h_c` | `5.7 + 3.8·v` (v in m/s) | McAdams flat-plate correlation. **Verify at implementation** — it is a building-surface figure, not a rock one |
| `skyCooling` | ~3.9 °C horizontal, ~0 vertical, scaled by cloud cover | ASHRAE. A vertical wall barely sees the sky, which is convenient and correct |

**1b. Rock mass temperature `T_mass`** — an exponentially smoothed trailing temperature over
days, not hours. It exists because of the single most useful thing in the research:

> *"If it is 10 °C and 90% humidity and **was 0 °C for the previous few days**, then most/all
> places will be **streaming wet**. If it is 10 °C and 90% humidity but **was 25 °C for the
> previous few days** then everywhere not seeping will be **bone dry**."*

Identical humidity, opposite outcomes, discriminated by a variable the current scorer does not
have. `T_surface` is fast and drives friction; `T_mass` is slow and drives condensation. They
are two different numbers and conflating them is the current humidity bug (#140).

**1c. Condensation margin** = `T_mass − T_dew`. Below zero the wall is condensing and is wet
regardless of whether it has rained. This replaces the fixed relative-humidity curve, which
`scoring-findings.md` §3.1 shows cannot be right in principle. It is also CragReport's "grease
factor" and the answer to a question the research marked open twice.

**1d. Drying rate** — the existing rock-type drying window, but with the clock running at a
rate set by evaporation potential (sun, wind, vapour-pressure deficit) rather than flat elapsed
time. The rock-type constants stay as the absorptive capacity. **They remain folklore**
(`scoring-findings.md` §4) and putting physics on top of them must not be presented as
precision.

**1e. Evaporative capacity** — how fast moisture leaves a surface, rock or skin. It is the
vapour-pressure deficit at `T_surface`, raised by wind and lowered by humidity. The same
quantity does two jobs: it sets how fast the rock sheds water (it is the rate term in 1d) and
how fast a hand sheds sweat. **Temperature and humidity both enter it, and neither is
meaningful without the other** — 25 °C at 40% RH and 25 °C at 90% RH are different climbing
days, and a model with two independent point buckets for them cannot say so.

### What friction is made of

This section exists because the obvious citation for it is wrong, and someone will otherwise
go and find the same wrong one again.

**Climbers are right that heat and humidity dominate friction.** The research records four
independent community reports of it (`climbing-terminology-research.md` §4.10 Cathedral, §4.11
Frankenjura, §4.12 Tonsai, §5.1 chalk), and it treats the effect as real.

**What is wrong is one specific citation and one specific channel.**

- The widely repeated *"shoe rubber peaks at 32–41 °F"* is sourced to a Friction Labs article
  that **does not contain the claim** — opened and checked, §17.3.
- The only direct measurement of the **finger-pad-to-rock** coefficient found no correlation
  with temperature or humidity (Clarke et al. 2024, reporting Amca et al.). But it was run
  across **23.5–27 °C and 34–47% RH, with one participant** — §18.2’s own words: *"not
  detectable across a span nobody cares about"*. **It does not say the effect is absent.** It
  says a static rig held in a warm dry room did not see it.

**§18.2’s actual conclusion is where this design should start:** the effect is real and the
finger-rock contact is probably not where it lives. It is *"compatible if the mechanism is
**sweat rate**, **chalk behaviour**, or **water on the rock** — all upstream of the contact,
and none of them reproduced by a static friction rig."*

Two of those three are computable from data this app already fetches, and they are the two
the friction reading is built from:

| Mechanism | Quantity | Why it is defensible |
| --- | --- | --- |
| **Water on the rock** | Condensation margin, 1c | Uncontested physics. Rock research §2.8: the surface equilibrates with the air almost instantly, so **atmospheric moisture governs greasiness — which is what dew point measures and relative humidity obscures** |
| **Sweat on the hand** | Evaporative capacity, 1e | A hand sheds sweat at a rate set by temperature, humidity and wind together. This is the channel the community description fits, and the one a friction rig cannot reproduce |

**Chalk behaviour is the third and is deliberately not modelled.** Clarke et al. measured it
directly and found *"a generalisation of chalk increasing or decreasing friction cannot be
made… it is shown to be situational"*.

**What this changes about the old model.** `conditionsScore` spends 12 points on air
temperature and 8 on relative humidity, as two independent buckets, and never reads
`dewpoint_c` at all — it is fetched, stored, and grepping the scoring directory for it returns
one hit in a test fixture. Both mechanisms above are joint functions of temperature *and*
humidity, which is why separate buckets could not express either of them, and why the fix is
not a reweighting. §18.2 is right that **there is no measured basis for moving the 12 and the
8** — because the answer is not a different pair of numbers.

**Honesty bound.** None of this is calibrated. We can order days correctly — muggy 80 °F reads
worse than dry 80 °F, a wall below its dew point reads Poor — without claiming a friction
coefficient. Get the ordering right and say nothing about magnitude.

### Layer 2 — The two readings, published

| Reading | Levels | Derived from |
| --- | --- | --- |
| **Rock** | `Wet` → `Drying` → `Dry` | 1d, with thresholds the user can shift |
| **Friction** | `Poor` → `Fair` → `Good` → `Great` | Two mechanisms — water on the rock (1c) and how fast a hand can dry (1e) — with `T_surface` an input to both rather than a band to compare against. See § What friction is made of |

**A wall below its dew point cannot read better than `Poor`.** That is not a bolt-on cap — it is
what condensation means, and it falls out of the physics rather than being legislated on top.

Both readings are computed **per hour** and both are shown. They are the honest output; the
number below is a convenience.

### Layer 3 — One number, derived from the readings

```
score = 100 × wetness^w × friction^f            w + f = 1
```

Both factors are 0–1 continuous versions of the two readings above. Defaults `w = 0.55`,
`f = 0.45` — **a judgement call, recorded as one**, in the same register as `RAMP_EXPONENT`.

Deriving the number *from* the readings is what stops it contradicting them. There is no
component that can outvote another, because there are only two factors and they multiply.

**`upcoming_rain` is deleted, not reweighted.** With hourly scoring, rain falling at 6pm lowers
the 6pm hours and leaves the morning alone, which is the correct answer and one a 72-hour
lookahead cannot express.

**Measured 2026-09-21, and this replaces the illustrative table that stood here.** Produced
by `npm run compare:scoring --workspace=apps/api` § 2, from the real model: dry a week, 45%
RH, 8 km/h, sandstone at 45°, default weights and the `exp(-w)` sweat map.

| °F | 45 | 60 | 72 | 80 | 86 | 94 | 100 | 104 | 108 | 112 | 120 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **sun on the wall** | 99 | 93 | 87 | 83 | 79 | 72 | 65 | **58** | 49 | 37 | 1 |
| in shade | 100 | 98 | 93 | 89 | 85 | 78 | 72 | 65 | 57 | 45 | 3 |
| v1, for comparison | 97 | 100 | 100 | 96 | 93 | 89 | 88 | 88 | 88 | 88 | 88 |

The claim the old table stood in for holds: heat slides continuously from the top of the
range to nothing, no cap, no veto, no step. It slides **less steeply** than that table
guessed — 58 at 104 °F rather than 48, and the flat 88 v1 returns from 100 °F upward is
what it replaces. Whether 58 is low enough is § Open Questions 5, Decision C.

Note the shade row is not a smaller version of the sun row: **the sun carries about seven
points of the answer at 104 °F**, through the wall's surface temperature raising the
climber's radiant load, and that is the mechanism aspect would sharpen in Phase 4.

### Unknown aspect — DECIDED 2026-09-21

Nothing writes `aspect` for a user-added location, so this is **every location in production**
until Phase 4, not an edge case.

**The decision: qualify per hour, not per location.** An hour is `qualified: true` when the
sun could not have changed the answer, and `qualified: false` when it could.

The reasoning is that aspect only matters when there is direct sun to catch. At night, under
heavy cloud, and when the sun is near the horizon, a wall's orientation barely affects its
surface temperature — `T_surface` collapses toward `T_air` whatever direction it faces. Those
hours are **fully qualified with no aspect recorded at all.** Only bright-sun hours are
genuinely unanswerable without geometry.

This matters more than it sounds, because of Layer 4: the windows people actually use are
early morning and evening. **A dawn window is fully qualified on a location nobody has ever
edited.** Flagging the whole location would have stamped "unqualified" on the one answer that
did not need the flag.

For the hours that *are* unqualified, use **horizontal irradiance unscaled**, and understand
what that is: not the wall's irradiance, and not a neutral guess. A vertical wall under a high
midday sun receives well below the horizontal value, so this **over**-estimates solar gain and
reads the rock hotter than it is. That is the direction we want it wrong in — it costs the
friction reading rather than inflating it, which is the rule from issue #34. **It is not a
universal upper bound:** a sun-facing wall under a low winter sun can exceed horizontal, so do
not describe it as one in code or copy.

Rejected alternatives, and why:

- **`T_surface = T_air`, no solar term.** Reads a baking south face as merely warm. It fails
  in the inflating direction, which is the one thing issue #34 forbids.
- **Withhold the friction reading until Phase 4.** Every location loses its score for weeks,
  and the app has exactly one user who would lose it.
- **Horizontal × a fixed vertical factor (~0.5).** More accurate on average and completely
  unsourced. This document already carries more invented constants than it should; a wrong
  number that is honest about being wrong beats a better one nobody can defend.

**A per-hour flag is a per-hour copy problem.** A day whose window spans qualified and
unqualified hours cannot carry one footnote. Phase 3 has to decide whether the window itself is
qualified, and the simplest defensible rule is that it is qualified only if every hour in it
is — but that is a Phase 3 decision and it is not made here.

### Layer 4 — Windows

Per day, the best contiguous run of hours clearing the user's minimum for both readings:
*"Good from 7am to 11am."* This is the answer a climber actually wants and the reason
CragReport's interface wins. The rendering half already exists in the bot.

### Layer 5 — Preferences

`user_preferences` already exists with `temp_unit`, `precip_unit`, `default_rock_type` and the
alert settings. It gains the thresholds that are currently constants: ideal temperature band,
how conservative to be after rain, whether sun is included, and the minimum readings that
define a window.

**This is what makes "is 104 °F a deal-breaker" answerable.** It stops being a constant someone
has to defend and becomes the user's own band — which is what CragReport passes as `ideal_c` on
every request and what Prime Condies is built entirely out of.

## Phases

### Phase 0 — Data plumbing and preferences
Add `shortwave_radiation` to the deterministic hourly request and a `shortwave_wm2` column on
`weather_run_hours`. Migration for the new `user_preferences` columns, all defaulted so no
existing row breaks.
**Acceptance:** `check:weather-runs` shows a non-null shortwave for a daylight hour at a real
location; existing preferences rows read back unchanged.
**Git checkpoint:** one PR.

**DONE — 2026-09-21, PR #154.** All six models carry `shortwave_radiation`; a live collection
stored 6,076 hours of it. Two things it turned up that Phase 1 inherits:

- **`gem_seamless`'s shortwave is ~3× too high past day 4** (issue #155). Picking which model
  feeds `T_surface` is now a Phase 1 decision that cannot be deferred, and pooling the four is
  ruled out.
- **Shortwave's horizon is shorter than its model's** — NBM, 42 hours against 48 of temperature.
  A null mid-series is routine, and `T_surface` is null for that hour rather than sunless.

### Phase 1 — The derived quantities, as pure functions
`src/lib/scoring/rockThermal.ts` — `T_surface`, `T_mass`, condensation margin, drying rate. No
database, no network, no Express. **Open Question 4 is answered here**: build with one `α` and
print what a pale-to-dark spread moves `T_surface` by, in °C. Tested against hand-worked cases at the boundaries, not
against a helper that shares their assumptions (`defect-patterns.md` §11).
**Acceptance:** a south-facing wall in full sun reads meaningfully above air temperature and a
shaded one reads at or below it; a wall whose mass sits below the dew point reports condensing.
**Git checkpoint:** one PR.

**DONE — 2026-09-21.** `rockThermal.ts`, 61 tests, and `npm run compare:thermal
--workspace=apps/api` as the report. All three acceptance cases hold. **Nothing reads any of
it** — no score, response or surface has changed. Four things Phase 2 inherits:

- **Open Question 4 is ANSWERED: one `α`, and not by rock type.** § 1 of `compare:thermal` is
  the evidence. Across 36 sunlit hours, a pale-to-dark spread (α 0.4 → 0.9, from the albedo
  figures in `rock-drying-research.md` §3) moves `T_surface` by **at most 0.5 °C on an hour the
  model calls qualified** and up to 44 °C on one it does not. Rock tone only matters on the
  hours whose reading is *already* flagged as unanswerable without an aspect nothing writes —
  so a per-type table would buy precision exactly where the model has declined to be precise,
  and it is inert until Phase 4 anyway. **Revisit only once aspect exists.**
- **The sol-air denominator is `h_o = h_c + h_r`, not `h_c`.** The spec's Layer 1a wrote
  `/ h_c`; ASHRAE's `h_o` is explicitly convection *plus* long-wave radiation, and the two are
  the same size in still air. Built with convection alone, the first report put **127 °C** on a
  wall at 900 W/m² in dead calm. With radiation it reads 77 °C. Corrected in the code
  (`surfaceCoefficient`) — treat Layer 1a's formula above as superseded by it.
- **Irradiance comes from `gfs_seamless`, one model, never pooled** — the #155 decision this
  phase could not defer. Global, longest shortwave horizon measured (384 h), and in family with
  ECMWF and ICON. The half a pure function can enforce is enforced: a shortwave reading above
  **1400 W/m²** is treated as a gap, not a measurement.
- **The two known biases run opposite ways and neither is calibrated.** Unscaled horizontal
  irradiance reads the wall hot; Jürges/McAdams `h_c` runs ~40% above ASHRAE's own tabulated
  `h_o` at the same wind and reads it cool. **Do not quote a net direction** — there is no
  measurement behind one.

### Phase 2 — Readings, hourly scoring, and the comparison
The two readings, the derived score, and hourly evaluation over the existing deterministic +
ensemble join that `GET /hourly/:locationId` already performs. `compare:scoring` gains the new
model as a column beside the current one, over real locations.
**Acceptance:** the harness prints old and new side by side for every scenario. The 104 °F
case reads **materially below the *Mixed* band** with `Friction: Poor` and `Rock: Dry`, and
no cap, veto or clamp appears anywhere in the code that produced it. The 40s figure in
Layer 3 is illustrative and **is not the acceptance criterion** — the criteria are the
ordering and the absence of a cap. Whatever this phase measures replaces that table.

Also demonstrate continuity: the component must not step across a band edge the way the
current one did at 95 °F (issue #148). Walk the temperature axis in tenths and assert no
single tenth moves the score by more than a point. The v1 scorer now carries exactly that
test (`conditionsScore.test.ts`, "continuous across both band edges") — the new model inherits
the invariant rather than introducing it, and it is the assertion to port first.
**Git checkpoint:** one PR, and **stop here for the owner to look at the numbers.**

**DONE — 2026-09-21, and STOPPED HERE for the owner.** `hourlyConditions.ts` (Layers 2, 3
and 4), `sweatBalance.ts` (the hand's half of Layer 1e), 61 tests, `compare:scoring`
extended with the whole v2 model beside the current one, and `npm run compare:hourly-v2
--workspace=apps/api` running it against a real location's live weather. **Nothing reads
any of it** — no score, response or surface has changed.

**Every acceptance criterion holds except one, and that one is a judgement the owner has
to make.** The 104 °F case reads `Rock: Dry`, `Friction: Poor` and **58** with sun on the
wall, 65 in shade, against production's 88. There is no cap, no veto and no clamp on the
total anywhere in the model. But 58 is *inside* the Mixed band rather than materially below
it, and that is Decision C in § 5 of the harness.

Five things Phase 3 inherits:

- **Open Question 1 is ANSWERED only as far as a measurement can answer it.** The three
  weight splits are columns in `compare:scoring` and the split barely moves anything: 104 °F
  reads 58 / 55 / 66 across `0.55/0.45`, `0.50/0.50` and `0.65/0.35`. **The choice that
  actually decides the model is the sweat map, which the spec did not anticipate**, and it
  is Decision B in the same section. `exp(-w)` is recommended and the reason is issue #148,
  not taste — see the next bullet.
- **A weighted geometric mean has unbounded slope at zero, and that is the #148 defect
  waiting to happen in a model with no bands.** `x^0.45` has an infinite derivative at
  `x = 0`, so a factor that reaches *exactly* zero collapses into it rather than arriving.
  Measured: the literal dry-skin-fraction map `1 − w` steps **12 points off a tenth of a
  degree** at the point heat stress becomes uncompensable; `exp(-w)` never reaches zero and
  holds the invariant across the whole axis. The condensation factor has the same shape and
  is **left alone deliberately** — its collapse happens entirely inside the bottom band,
  with `poor` and *"Wet or unsettled"* on both sides of it, so no screen changes what it
  says. Softening it costs a floor, which is the clamp this model exists to do without.
- **Cold costs nothing in friction and a great deal in drying, and only the first was
  designed.** Both friction mechanisms genuinely improve as it gets colder, so there is no
  cold penalty. But a cold wall barely dries — the vapour-pressure deficit collapses with
  temperature — so a week after rain at −20 °C the model still will not call the rock dry,
  where v1 handed out full credit at 168 flat hours. **That is the single largest difference
  between the two models on ordinary days**, larger than the 104 °F case everyone is
  watching, and Phase 3's copy has to carry it.
- **Wind is now purely a benefit.** 60 km/h scores 100 where v1 scored 85. That follows from
  § Constraints — safety stays out of the number and the Severe+ suppression carries it —
  but it is worth seeing before a surface renders it.
- **`rock.qualified` is false for any window containing daylight**, because the drying clock
  runs off `T_surface` and every sunlit hour's irradiance depends on an aspect nothing
  writes. `friction.qualified` behaves as § Unknown aspect intended (a dawn window is
  qualified); the rock reading cannot, and Phase 3 has to decide what that says on screen
  rather than printing an asterisk on every location.

Three deliberate deviations from this document, each recorded where it was made:

- **`rock` and `friction` are nullable** on `HourlyConditions`, against § Data Shapes. A
  `Reading` has no "unknown" level and inventing `dry` for a wall nobody watched is defect
  class 1.
- **The hand's vapour-pressure deficit is taken at skin temperature, not at `T_surface`.**
  § What friction is made of says the same quantity does two jobs; it cannot. `es(66 °C)` is
  five times `es(35 °C)`, so the rock's deficit would read a baking wall as the best possible
  drying conditions for skin.
- **Layer 4 (`bestWindow`) shipped here rather than in Phase 3**, because the live harness
  needed it to say anything useful and it is thirty pure lines.


### Phase 3 — Surfaces
Mini App and bot show the two readings and the day's window; the number becomes secondary.
`SCORE_BANDS`, `stateLabel` and the suppression rule are rewritten against the new meaning.
**Acceptance:** a day with `Friction: Poor` never renders a bare good-looking summary.

**Two acceptance criteria added 2026-09-21 by the owner's decision on the friction model
(§ Open Questions 6).** Both are about the one unvalidated step, not about layout:

- **No surface renders a friction magnitude.** Words and ordering only. The 0-1 factors are
  under `HourlyConditions.diagnostics` and `hourlyConditions.test.ts` fails if one is
  promoted; a response type that names its fields cannot leak one by accident.
- **The copy says the friction reading is an estimate**, in the reader's own words, on the
  surface itself rather than in a doc. It is the one part of the model with a guess in the
  middle of it, and a confident-looking label is the whole risk.
**Git checkpoint:** one PR.

### Phase 4 — The location editor
Rock type, aspect and tilt, editable per location. This is `miniapp-design-v1.md` §12.4's
deferred scope and the research calls it *"the single biggest blocker on this entire research
document."* It is what makes `I_wall` real rather than a default, and it fixes `cliff_angle`,
which currently runs backwards from what climbers mean.
**The Phase 3a measurement that sharpens this.** Running the model against the owner's own
saved crags on 2026-09-21: **every location had `cliff_angle` unset and defaulted to 45**,
and one had no `rock_type` at all. Nothing in the response marks either — `qualified`
covers the sun and nothing else — so a reading built on two placeholders is
indistinguishable from one built on recorded crag data. That is not a rendering problem
Phase 3 can fix with copy alone; it is the case for this phase.

**Acceptance:** a saved location's aspect and tilt change its score in the direction a climber
would predict.
**Git checkpoint:** one PR.

### Phase 5 — Preferences UI, then retirement
The preferences screen, then delete the five-component scorer, `SCORE_COMPONENT_MAX`, and the
sections of `scoring-algorithm.md` that describe it.
**Acceptance:** no reference to `component_upcoming_rain` remains outside a migration.
**Git checkpoint:** one PR.

## Data Shapes / Schemas

```typescript
type Reading = { level: 'wet' | 'drying' | 'dry'; qualified: boolean }
type Friction = { level: 'poor' | 'fair' | 'good' | 'great'; condensing: boolean; qualified: boolean }

type HourlyConditions = {
  valid_at: string
  rock: Reading
  friction: Friction
  score: number | null            // null when an input could not be measured — never 0
  t_surface_c: number | null      // null when shortwave is missing; never defaulted to air temp
  condensation_margin_c: number | null
}
```

**`qualified` is false for an hour whose answer depends on a geometry we do not have** — see
§ Unknown aspect. It is decided per hour, not per location: the same wall is qualified at 6am
and unqualified at 1pm. A surface must say so rather than present an unqualified reading as a
measured one — that is `defect-patterns.md` §3, attribution not backed by the data.

## Known Risks / Watch Points

- **Physics on top of folklore.** The drying constants have no measured basis. A sol-air
  temperature computed to a tenth of a degree, multiplied by a rock-type window someone made
  up in 1975, is not a precise answer. Say so in the copy.
- **Every score on every screen moves.** There is no subset of users to roll out to; the
  harness is the only before/after instrument.
- **The ensemble carries uncertainty for temperature, wind and precipitation — not for dew
  point or shortwave.** The confidence label must not silently start covering quantities the
  ensemble never measured.
- **`weather_run_hours` retention is 2 days.** `T_mass` needs a multi-day trailing temperature,
  which means re-fetching from the archive API the way rainfall history already does. Do not
  plan on the stored hours being there.
- **Open-Meteo drops unsupported variables from a multi-model response silently** and answers
  200. Probe one model at a time.
- **A null derived quantity must withhold the reading, not degrade to a plausible one.**
  `T_surface` falling back to air temperature when shortwave is missing would be the exact
  defect class this repo ships most often.

## Open Questions

1. **Are the default weights `0.55 / 0.45` right?** Nothing measures them. They decide whether a
   damp wall in perfect friction beats a dry one in bad friction.

   What it must **not** be argued from is a coefficient of friction at the finger-rock
   contact — see § What friction is made of. The mechanisms are real; the lab number is not
   the place to get them.

   **DEFERRED TO PHASE 2 — owner, 2026-09-21.** Not answered in the abstract: `0.55/0.45`,
   `0.50/0.50` and `0.65/0.35` each become a column in `compare:scoring`, and the split is
   chosen seeing what it does to 104 °F, to a damp wall in great friction, and to a mediocre
   day. **Phases 0 and 1 are unblocked** — neither touches the weights. Phase 2 does not
   finish until this is decided, and its **stop for the owner** is where it gets decided.

   **MEASURED IN PHASE 2, AWAITING THE OWNER — 2026-09-21.** The three columns exist and
   `npm run compare:scoring --workspace=apps/api` prints them. **The measurement's headline
   is that this question matters less than expected and a question nobody asked matters
   more.** Across the splits, 104 °F reads 58 / 55 / 66 and a perfect day 95 / 94 / 96 — the
   split moves the middle of the range by a few points and changes no reading's level
   anywhere in the scenario table.

   What decides the model instead is **the sweat map** — how skin wettedness becomes a
   friction factor — which this document did not anticipate needing a decision. It is
   Decision B in § 5 of the harness output, `exp(-w)` is recommended, and the argument is
   issue #148 rather than preference: the alternative reaches exactly zero, and a weighted
   geometric mean has unbounded slope there, so it steps 12 points off a tenth of a degree.

   Both go to the owner together at the Phase 2 stop.


2. **DECIDED 2026-09-21 — see § Unknown aspect.** Per-hour qualification: horizontal
   irradiance as a deliberately hot estimate, `qualified: false` only for the hours where
   the sun could actually change the answer.
3. **Does the 0–100 number survive Phase 3 at all**, once two readings are on screen beside it?
   The owner's §5.1 decision says it stays; worth re-asking once it can be seen.

   **Not put to the owner, because it cannot be answered from a document** — it needs the two
   readings rendered beside the number. Phase 3 asks it, and until then §5.1 stands: the number
   stays.
4. **DECIDED 2026-09-21 in Phase 1 — no, one constant.** The gap does not move a reading on
   any hour the model is willing to be confident about: **≤0.5 °C where `qualified` is true**,
   tens of degrees only where it is already false. The per-type table is not written. § 1 of
   `compare:thermal` is the measurement, and re-running it is how to reopen this — the answer
   changes if and when Phase 4 makes most sunlit hours qualified.

   The original question, and the terms it was deferred on:

   **Is `α` allowed to vary by rock type?** There is a real albedo difference between pale
   limestone and dark basalt, and no per-crag measurement. Currently specified as one constant.

   **DEFERRED TO PHASE 1 — owner, 2026-09-21.** Build Layer 1 with **one constant**, and make
   Phase 1 print what a plausible pale-to-dark spread would move `T_surface` by, in °C, for
   the same sunlit hour. If that gap cannot move a friction reading, the per-type table is
   never written — a fourth set of invented constants has to earn its place. Note it would be
   inert until Phase 4 anyway: rock type is unset on every user-added location today.

5. **The three decisions the Phase 2 stop actually puts to the owner.** They are printed
   together by `npm run compare:scoring --workspace=apps/api` § 5, with the tables above
   them; this is the index, not the argument.

   - **A — the weight split.** Open Question 1. Measured, and it barely moves anything.
   - **B — the sweat map**, `exp(-w)` or `1 − w`. Not anticipated by this document and it
     decides more than A does. `exp(-w)` recommended, on issue #148 grounds.
   - **C — whether 58 is low enough for 104 °F.** The acceptance criterion asked for
     "materially below the *Mixed* band"; the model built to this specification returns 58
     with sun and 65 in shade, which is inside it, thirty points below production, with
     `Friction: Poor` and `Rock: Dry` and no cap or veto used to get there. If it has to go
     lower, the lever that does it **without** putting a step back is
     `METABOLIC_HEAT_W_M2` — costed in the harness's `M500` column at 53 — and not the map.

   **ANSWERED 2026-09-21 — the owner delegated the three, and all three took the
   documented default.** Recorded here rather than in a commit message because each one is
   a number somebody will want to argue with later.

   - **A — the weight split: `0.55 / 0.45`.** The harness is the argument: across the three
     splits, 104 °F reads 58 / 55 / 66 and a perfect day 95 / 94 / 96, and **no reading's
     *level* changes on any scenario**. When a dial moves nothing a user would notice,
     the middle of the range is the least-committal place to leave it, and nothing measures
     a better one.
   - **B — the sweat map: `exp(-w)`.** Decided on a measurement, not a preference. The
     alternative reaches exactly zero, a weighted geometric mean has unbounded slope there,
     and it costs a **12-point step off a tenth of a degree** — issue #148 in a model with
     no bands.
   - **C — 104 °F stays at 58.** Below the criterion's words, inside the *Mixed* band
     rather than below it. Taken because this document's own next sentence says the
     criteria are **the ordering and the absence of a cap**, and both hold: the slide is
     continuous from 99 at 45 °F to 1 at 120 °F with no cap, veto or clamp, and production
     returns a flat 88 from 100 °F upward. Pushing it lower means raising
     `METABOLIC_HEAT_W_M2`, which nobody has measured and which also drags every warm day
     down — the repo's standing rule is to defer an unmeasured number to the phase that can
     price it, and that phase is the feedback button (#143).

6. **DECIDED 2026-09-21 — is the friction model further from measurable data than the
   evidence supports?** Raised by the owner, and the honest answer was: at one step, yes.

   Everything up to `sweatBalance.skinWettedness` is standard physics with published
   values. **The single guess is `sweatFrictionFactor` — what skin wettedness does to
   grip — and no study relates the two.** The alternatives put were to cut the sweat
   channel back to condensation alone (certain, and it leaves issue #21 unfixed) or to
   replace the heat balance with one arbitrary curve on surface temperature (simpler, and
   it loses the joint behaviour of temperature, humidity and wind that the physics gives
   for free).

   **The decision is keep it and quarantine it**, on two terms now carried as Phase 3
   acceptance criteria: no surface renders a friction magnitude, and the copy says it is an
   estimate. Enforced by `HourlyConditions.diagnostics` and a test, not by memory.

   **The fact that reframed the question, and it is worth not losing:** the friction half
   carries about 4 invented constants against the drying half's ~20 — fourteen rock-type
   hour values that `scoring-findings.md` §4 calls folklore, plus the ramp exponent, the
   angle factor, the reference conditions and the rate cap — and the drying half is
   weighted **higher**. The newer model is the leaner of the two. Neither half has ever
   been checked against whether anyone climbed better, and issue #143 is still the only
   path to that.
