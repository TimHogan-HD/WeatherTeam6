# WeatherTeam6: Scoring Model v2 — Handoff

Version: v1
Date: 2026-09-16
Status: Draft — awaiting the owner on § Open Questions 1, 3 and 4. **Q2 is decided** (2026-09-21).

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
3. **The temperature component has a cliff at 95 °F** — issue #148. It scores 6 of 12 at
   95.0 °F and 0 at 95.2 °F, a 6-point step in the total from a fifth of a degree, and every
   mechanism that makes a zero matter amplifies it: 22 points under the geometric mean, 33
   under a veto. The cold end is continuous; only the hot end steps.
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

**Illustrative behaviour of this shape — NOT a measurement, and nothing in the repo
reproduces it.** It came from a scratch script written to feel out the curve during the
session that wrote this document, and that script was not kept. It is recorded because the
*shape* is the argument; treat every individual figure below as unverified.

| °F | 45 | 72 | 86 | 94 | 100 | 104 | 108 | 110 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| score | 100 | 100 | 83 | 71 | 59 | 48 | 31 | 0 |

The **claim** those numbers stand in for, and the thing Phase 2 has to demonstrate, is:
heat slides continuously from the top of the band to zero, nothing is capped, nothing is
vetoed, and there is no step anywhere — because temperature carries ~45% of the answer
rather than 12%. **Build it into `compare:scoring` and re-measure before quoting any
number here.** If the rebuilt curve disagrees with this table, the table is what is wrong.

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

### Phase 1 — The derived quantities, as pure functions
`src/lib/scoring/rockThermal.ts` — `T_surface`, `T_mass`, condensation margin, drying rate. No
database, no network, no Express. Tested against hand-worked cases at the boundaries, not
against a helper that shares their assumptions (`defect-patterns.md` §11).
**Acceptance:** a south-facing wall in full sun reads meaningfully above air temperature and a
shaded one reads at or below it; a wall whose mass sits below the dew point reports condensing.
**Git checkpoint:** one PR.

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
current one does at 95 °F (issue #148). Walk the temperature axis in tenths and assert no
single tenth moves the score by more than a point.
**Git checkpoint:** one PR, and **stop here for the owner to look at the numbers.**

### Phase 3 — Surfaces
Mini App and bot show the two readings and the day's window; the number becomes secondary.
`SCORE_BANDS`, `stateLabel` and the suppression rule are rewritten against the new meaning.
**Acceptance:** a day with `Friction: Poor` never renders a bare good-looking summary.
**Git checkpoint:** one PR.

### Phase 4 — The location editor
Rock type, aspect and tilt, editable per location. This is `miniapp-design-v1.md` §12.4's
deferred scope and the research calls it *"the single biggest blocker on this entire research
document."* It is what makes `I_wall` real rather than a default, and it fixes `cliff_angle`,
which currently runs backwards from what climbers mean.
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

2. **DECIDED 2026-09-21 — see § Unknown aspect.** Per-hour qualification: horizontal
   irradiance as a deliberately hot estimate, `qualified: false` only for the hours where
   the sun could actually change the answer.
3. **Does the 0–100 number survive Phase 3 at all**, once two readings are on screen beside it?
   The owner's §5.1 decision says it stays; worth re-asking once it can be seen.
4. **Is `α` allowed to vary by rock type?** There is a real albedo difference between pale
   limestone and dark basalt, and no per-crag measurement. Currently specified as one constant.
