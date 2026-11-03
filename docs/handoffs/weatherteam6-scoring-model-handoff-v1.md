# WeatherTeam6: Scoring Model v2 — record

**A record, not direction.** The score on every screen is Crag A (owner decision 2026-09-24),
described in `.claude/docs/scoring-algorithm.md` and `.claude/rules/scoring.md`: read those
to change anything. This model's own score no longer reaches a response. What survives of it
in the app is Layer 1 (`rockThermal.ts`, `hourlyConditions.ts`, `sweatBalance.ts` feed Crag A)
and the reasoning below, which is kept because code comments cite it and because it records
why the app's numbers have the shape they do.

Written 2026-09-16; cut to this on 2026-11-03 (the full plan and phase notes are in git).
`conditionsScore.ts`, the five-component "v1" scorer, `compare:scoring` and the bot it mentions
are all deleted, and alert suppression was removed on 2026-10-29. Figures quoted below were
measured on the v2 model and are history. Before proposing a weight, veto or cap, measure it
with `compare:dryness` and `compare:rock-temp`.

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

**Superseded by the code:** the denominator is `h_o = h_c + h_r`, convection plus long-wave
radiation (`surfaceCoefficient`), not `h_c`. With convection alone the first report put 127 °C
on a wall at 900 W/m² in dead calm.

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
*(Owner, 2026-11-02: the score's penalty now reads each wall's margin, `T_mass + (T_surface −
air) − T_dew`, takes the median wall and never cuts the score by more than half; read on
`T_mass` alone it zeroed 15 sunlit hours that field checks found dry. And every dry hour now
credits at least one hour of drying, so the clock below never runs slower than elapsed time.
The cost on the reference test days is in `crag-a-reference/README.md`.)*

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

## Phases, as shipped

### Phase 0 — Data plumbing and preferences
Done 2026-09-21 (#154): `shortwave_wm2` on `weather_run_hours` and the `user_preferences`
columns of Layer 5, which nothing reads.

### Phase 1 — The derived quantities, as pure functions
Done 2026-09-21: `rockThermal.ts`, with `npm run compare:thermal --workspace=apps/api` as the
report that answers Open Question 4. Irradiance comes from `gfs_seamless` alone, never pooled
(#155), and a reading above 1400 W/m² is a gap.

### Phase 2 — Readings, hourly scoring, and the comparison
Done 2026-09-21: `hourlyConditions.ts` and `sweatBalance.ts`. A factor that reaches exactly
zero steps 12 points off a tenth of a degree under a weighted geometric mean (#148), which is
why the sweat map is `exp(-w)`. The hand's vapour-pressure deficit is taken at skin
temperature, not `T_surface`.

### Phase 3 — Surfaces
Done 2026-09-21 (#160 and 3b): `readingsCopy.ts` in `packages/types` is the shared copy model.
`stateLabel`, `summarizeConditions` and `limitingComponent` are deleted, not deprecated. Two
criteria from Open Question 6 still hold: no surface renders a friction magnitude, and the app
says the friction reading is an estimate (`.claude/rules/scoring.md`, the magnitude fence). The
suppression this phase rewrote was removed on 2026-10-29.

### Phase 4 — The location editor
Shipped 2026-09-23 and 2026-10-01: 27 rock types, known crags locked, `PATCH /locations/:id`
and `/location/:id/edit`. Crag A does not read aspect or angle (`.claude/rules/locations.md`).

### Phase 5 — Preferences UI, then retirement
Shipped 2026-10-01: a temperature range and the tab a crag opens on (5a), and the five-component
scorer deleted (5b). Still open: the temperature chart's colours stay centred on `TEMP_BAND_C`
(50–72 °F) while Crag A docks friction from 60 °F, which is the owner's call.

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

   **ASKED, AND IT IS THE OWNER'S TO ANSWER — 3b, 2026-09-21.** The number now
   renders as a small chip at the end of the window line, with the two readings
   above it at card-title size. It is still there because §5.1 says so, and
   nothing in building 3b argued against it — but two things the code turned up
   are worth having before answering:

   - **The number is doing less work than it was.** On the list card it is a
     bare figure beside the two labelled readings; on the detail screen the
     readings and the window answer the question and the score repeats them
     less precisely. The one place it still earns its keep is **ranking** — the
     daily list's bar and its seven-day comparison need a scalar, and two
     ordered word-pairs do not sort.
   - **It is what makes a suppression rule possible.** Dropping the number
     under a Severe+ alert is a thing a surface can do; there is no equivalent
     move for the words, because they are measurements.

   Deciding to drop it is a Phase 5 change, not a revert of this one.
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
