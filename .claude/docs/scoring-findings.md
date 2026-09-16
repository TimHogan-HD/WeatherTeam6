# What the research means for the scoring model

**Read this instead of the research when you are changing scoring code.**

Two research documents totalling ~4,900 lines sit behind this one. They are sources and
reasoning; this is the part that touches the app. Every row links back, so nothing here has to
be taken on trust — but nothing here needs the 4,900 lines read first either.

- `rock-drying-research.md` — absorption, drying, rock families, per-crag facts
- `climbing-terminology-research.md` — angle, aspect, sun, vocabulary, the community pass
- `crag-facts.json` — 96 crags, validated by `npm run check:crag-facts`

**Status of the research itself: closed as of 2026-09-16.** Phases 0–4 complete, Phase 3
scrapped by the owner. Sources were verified at first hand in a browser pass; §10 of the rock
doc lists the six figures of nine that had been attributed to papers not containing them.

---

## How to read this

Every finding carries three things: **what is wrong**, **how sure we are**, and **what it would
change**. Confidence uses the research docs' markers.

| | |
| --- | --- |
| **[M]** | Measured in a peer-reviewed source, read at first hand |
| **[C]** | Climbing-community usage — widely held, rarely written down |
| **[R]** | Read directly from this repository's source |
| **[?]** | Inference — nobody stated this |
| **[X]** | The cited source was opened and **does not** support the claim |

**Nothing in this document has been validated against an outcome.** Not one constant in the
scorer has ever been checked against whether a crag was actually climbable that day. That is
itself the largest finding, and it is §5.4.

---

## 1. The model is wrong in ways that change what a user sees

These are ranked by how much they affect the number on screen.

### 1.1 A crag can get wetter on a dry day — and `dryingModel` cannot express it **[C]**

**Severity: structural.** This is the one that says the model's *shape* is wrong, not its
constants.

`dryingModel` is monotonic in `hoursSinceRain`. The wall can only get drier as time passes.
Climbers describe three separate wetting mechanisms and only one of them behaves that way:

| Mechanism | Driven by | In our model |
| --- | --- | --- |
| Rain landing on the face | The rain event | ✅ this is what we model |
| **Seepage** | Saturation of the ground above, over **weeks** | ❌ a nullable boolean in `crag-facts.json`, read by nothing |
| **Runoff** | Drainage path over the cliff top | ❌ **no representation anywhere** |

Seepage has **two independent time constants** — an onset lag of hours to weeks, and a duration
of days to weeks — so a crag can *begin* seeping on a day it did not rain, while our score is
climbing toward 40/40.

> *"some limestone seeps soon after rain and some has a **multi-week lead in before it seeps**.
> Some limestone takes **many weeks to stop seeping** and some stops seeping in days."*
> — rock research §14.1

**The discriminator is topography, not rock type** — a hillside-backed crag versus a freestanding
block, which can be metres apart in the same stone.

**What it would change:** nothing small. The honest short-term move is **not to model it but to
withhold** — a known-seepage-prone crag within its antecedent-wet window should return
`unavailable_reason`, not a confident 85. The repo already has that mechanism and it is the
right shape for this.

---

### 1.2 The drying ramp is least accurate exactly where it matters most **[M]**

**Severity: high. This one is live in production right now.**

§2.4 of the rock research had the saturation curve backwards. The corrected finding, from Duda &
Renner (GJI), with five citations behind it:

> *"much of the weakening, if present, occurs at **low moisture contents**"*

The old reading assumed a half-dry rock was nearly back to full strength, so the ramp's tail was
treated as the safe part. **It is the opposite.** `dryingModel` ramps linearly over elapsed time,
which means **the score is least trustworthy at the end of its own ramp** — the day after rain,
when the wall looks dry, the number is climbing through the 30s, and someone is deciding whether
to drive two hours.

**What it would change:** the ramp should be concave, not linear — slow to award points early,
and it should not reach full marks until well past the point the current curve does.
`dryingRaw = (hoursSinceRain / maxDry) * 40` is the line.

**Caveat, and it is real:** the shape is established, the exponent is not. Nobody has measured a
curve for any climbing rock. Changing linear to concave is defensible; picking the specific
exponent is a judgement call and should be written down as one.

---

### 1.3 Every future day is scored as wet as today — issue #108 **[R]**

Already an open issue. What is new is that **a competitor has shipped the fix and described it**:

> *"By default, we include **12 hours of past precipitation data from the forecasted time
> point**. For instance, if you're viewing the Climbit Score for 11 am on Saturday, it will
> account for rain starting from 11 pm on Friday. **This principle applies to both past
> precipitation and projected precipitation leading up to a forecast in the future.**"*
> — Climbit FAQ, terminology research §21.7

**The window anchors to the hour being scored, not to now, and it is filled with forecast rain
wherever that hour lies in the future.** That is the whole design. Read §21.7 before building
#108.

---

### 1.4 Four good components can outvote one fatal one — issue #21's real cause **[?]**

The scorer is additive: `drying 40 + rain 25 + wind 15 + temp 12 + humidity 8`. Issue #21
records the symptom — 104 °F can only cost 12 points, so extreme heat still reads *"looks great
— go climb"*. **That is not a mis-tuned band. It is what a weighted sum does.**

Climbers do not reason additively. One fatal factor ends the discussion — *"it's seeping, forget
it"* — regardless of how good everything else is. A UKC poster proposed the fix without being
asked:

> *"score them all for rain exposure, dry wind exposure and solar insolation […] then rank them
> e.g. according to the **geometric mean** of those exposures."* — terminology research §21.9

**A geometric mean lets any single near-zero factor drag the whole result to near zero**, which
is both how climbers talk and a structural fix for the entire issue-#21 class rather than a
re-tune of one band.

**What it would change:** `conditionsScore`'s final sum. This is the highest-leverage single
change in this document and also the one most likely to move every score on every screen — it
needs a before/after comparison over real locations before anyone ships it.

---

### 1.5 We may be tracking the wrong strength property entirely **[M]**

Every strength figure in §2.4 is **compressive** strength, topping out at 55% loss. Bruthans et
al. measured an overhang by comparing wet and dry parts of the *same cliff* and found wetting
dropped **tensile** strength to **14% of dry — an 86% loss**.

**A climber breaks a hold in tension, not compression.** A crimp levered outward, a flake pulled
on. The property governing the failure people actually experience is several times more
water-sensitive than the one the research has been quoting.

**What it would change:** nothing directly — no constant in the app is a strength figure. It
matters because it says the wet-rock risk is **larger than §2.4 implies**, which bears on how
conservative 1.2's ramp should be. **Caveats are large**: one sandstone, artificially wetted, at
a site chosen for fast erosion. Direction and scale, not a number.

---

## 2. Dead wiring — things that look live and are not

All **[R]**, all verified by reading the source this session.

| What | State | Consequence |
| --- | --- | --- |
| **`ScoreInput.aspectDegrees`** | Computed in `liveForecast.ts:205`, passed in, **never read** | **Sun direction scores zero points.** Now carries a warning comment |
| **Solar radiation** | Fetched and aggregated on every request, then **dropped**. Its only column is on `forecast_snapshots`, which nothing writes | The physical input both competitors use for sun is already being paid for and thrown away |
| **`dewpoint_c`** | Stored, **never read** | It is one of the two terms in the condensation rule (§3.1) — and the metric climbers actually use |
| **`ScoreInput.currentTempC`** | **Never read** — carries a warning comment | Already caused one near-miss: a draft rule that would have hidden a 103 °F heat warning |
| **`cliff_angle`** | Default `45`, and **nothing writes it** for user-added locations | Every user location is scored at a value that means "severe overhang" to a climber and "half-slab" to us |

**`aspectDegrees` is the second instance of `defect-patterns.md` §10 in the same type.** Both
now carry warnings. The pattern is worth naming: *this repo plumbs fields it does not consume,
and readers reason from them.*

---

## 3. Inputs the model does not have, and one it has wrong

### 3.1 The humidity component averages over the thing that decides the answer **[C]**

`conditionsScore` scores relative humidity on a fixed curve: 8 points at ≤50%, 0 at ≥90%.

> *"the key cause for condensation is **rock colder than the air temperature**. If it is 10 °C
> and 90% humidity and **was 0 °C for the previous few days**, then most/all places will be
> **streaming wet**. If it is 10 °C and 90% humidity but **was 25 °C for the previous few
> days** then everywhere not seeping will be **bone dry**."* — rock research §14.3

**Identical humidity, opposite outcomes, discriminated by a variable the scorer does not have.**
A fixed humidity curve cannot be right — it is not mis-weighted, it is incomplete.

**This is also the answer to a question the research had marked open twice.** "How long does a
wall stay greasy" is not a duration; it is a comparison between **rock temperature (a multi-day
lag of air temperature)** and **dew point (current)**. And it is §13.9's Yungang result —
condensation driving wetting cycles in caves rain never reaches — arriving independently from
Peak District climbers.

**What it would change:** a trailing temperature average as a rock-temperature proxy, compared
against `dewpoint_c`, replacing or gating the RH curve. **Blocked on data we delete:**
`pruneRuns.ts` retains 2 days parsed / 6 hours raw. The history would have to be re-fetched from
the archive API, the way rainfall history already is.

**Confidence: [C], one climber, stated as a belief.** But it is falsifiable, the physics is
standard, and a measured study agrees. **Test it before it becomes a constant.**

### 3.2 Aspect has three jobs and we do none of them **[C]**

| Job | Needs | Have |
| --- | --- | --- |
| Was the rain blown onto this face? | aspect × wind direction **at the hours it rained** | ❌ precip history is **daily totals**, no wind |
| Is this face in the drying wind? | aspect × wind direction after rain | ❌ wind modifier is a scalar speed threshold |
| How much sun does it take? | aspect × sun position × terrain | ❌ see §2 |

**And the same aspect flips sign between seasons** — a crag sheltered from the drying wind is
out of condition in spring and in condition in midsummer because it is also sheltered from the
sun. **So a scalar aspect bonus is wrong in principle: no constant is right in both cases.**

**The design that resolves it, shipped by Climbit:** sun is not a component — it is an input to a
climbing-specific *"feels like"* temperature, alongside humidity, wind and UV. Whether sun helps
or hurts then falls out of the temperature curve automatically, with no seasonal rule.
**Mountain Project reached the same split from the other side:** compute the sun mathematically,
ask humans for the shade, put terrain and trees in free text.

### 3.3 Missing columns both climbers' own schemas listed **[C]**

Two climbers independently wrote out data models for this problem. Both included things we have
no column for: **trees at the base** (and it is *seasonal* — deciduous shade changes), and
**tidal or not** (a whole class of cliff whose condition depends on a variable no weather API we
call reports). Neither listed **wall angle** as an input to condition at all.

---

## 4. Constants that must not become load-bearing

These are in the research and in the code, and **none of them has a source that survives
checking.** Anyone reaching for one should read the linked section first.

| Constant | Status |
| --- | --- |
| `MIN_HOURS` / `MAX_HOURS` per rock type | **Folklore.** No measured drying-rate data exists for any real crag — rock §8 |
| ">90% strength loss in extreme cases" | **[X]** — sourced to nothing found. Rock §13.6 |
| Sorption regime break at RH ≈ 75% | **[X]** — not in Keppert; searched in full. Rock §13.7 |
| Dew point 60 °F threshold | **Unsourced** — terminology §17.2 |
| Temperature vs humidity weighting | **No measured basis in either direction** — terminology §18.2 |
| §3's porosity table | **[S]** industry teaching aid from 1957–1975 textbooks, not measurements |
| Slavík's 0.4–2447 mm/yr, 2.2 orders | **Second-hand** — the one genuine paywall found |

**The honest framing:** the drying constants are the app's core and they are convention, not
measurement. That is not a reason to remove them — a convention that matches climber expectation
is worth something. It is a reason not to build precision on top of them.

**A competitor's alternative is worth knowing:** Climbit does not encode rock type at all. It
lets the user set the past-precipitation window, with the sandstone rule in a parenthetical —
*"remember to wait up to 48+ hours before climbing on sandstone!"*. Given §8, **a user-set
window is arguably more honest than our per-type constants.** Ours is more automatic and less
defensible.

---

## 5. Product decisions — these are the owner's, not a developer's

Each is a real fork where the research points somewhere other than where the app currently is.

### 5.1 Is the score 0–100, or 0–5 with a written meaning per level?

**Two independent sources landed on the same answer, neither knowing of this app.** A UKC poster
told the student building it: *"rather than 0-100 you could have more like the **0-5 avalanche
warning** which can be much more descriptive of what each number means."* Climbit ships exactly
that, with prose for each star level.

**The argument for it:** a 0–100 score implies a precision the inputs cannot support (§4). Five
levels with written meanings promise only what they can deliver.

### 5.2 Is this a safety product or a performance product? **Currently it is both, unlabelled.**

> *"Define 'safe'? For the rock or the climbers?"*
> *"The only weather which might make it **unsafe** are **lightning and extreme wind**. Rain etc
> you just **modify the grade**."* — terminology §21.1

**Climbers treat almost everything as performance** and respond by climbing something easier,
not by staying home. Only two inputs are safety inputs. Climbit's copy is purely performance at
every level, including zero.

**If that is right, the alert suppression is the entire safety product** and the number should be
openly about friction and fun. Our copy currently straddles it.

### 5.3 Fixed thresholds, or user-tunable?

The research could not find an agreed numeric threshold for good conditions **because there is
not one** — it is personal, and several sources say so outright. Conditions-sensitivity also
varies by discipline (bouldering runs ~5 °C colder), by intent (projecting vs getting miles in)
and by hold size.

**Climbit's answer is a preferences menu.** That converts our unanswerable §16 into a product
feature.

### 5.4 Should anything be validated before more is built?

**Nothing in either research document has been checked against an outcome.** The browser pass
verified that sources say what they were quoted as saying — not that the model predicts
anything.

The one proposal anyone has made, and it needs no sensors:

> *"the number of climbs **logged on a specific day compared to a multi-year seasonal average for
> that day of week** could give an indirect measurement of local subjective sentiment as to rock
> condition."* — terminology §21.10

**Public logbook ascent counts, day-of-week normalised, are a revealed-preference ground truth.**
It is the only way anyone has suggested to find out whether any of this works.

---

## 6. Accept and stop trying

Things that are real, dominant, and not obtainable. Recorded so nobody spends another session on
them.

- **Vaporization plane depth** — the dominant control on evaporation rate, moving it by up to
  2.2 orders of magnitude. Measuring it is a **patented laboratory technique**.
- **Albedo and lichen cover** — needed for any real rock-temperature model.
- **Terrain occlusion** — needs a DEM we do not have. Climbit has one.
- **Route-level granularity** — one row per crag cannot express a cliff whose drying class
  changes with height, and both the Nuttall result and the wind-driven-rain literature say it
  does. Mountain Project's answer was to attach facts to the smallest area unit; ours has no
  smaller unit.
- **US climbing sandstones have never been studied**, stated outright in the literature
  (rock §13.5).

---

## 7. If you only do three things

1. **Do not let the drying ramp reach full marks as early as it does** (§1.2). It is wrong in
   the direction that matters and it is live now.
2. **Fix #108 using the design in §21.7** — it is written down, shipped, and cheap.
3. **Decide 5.1 and 5.2 before building anything else.** They change what every other number on
   this list is *for*, and both are one-sentence answers from the owner.

**And one thing not to do:** do not add a sun or aspect component that scores `aspectDegrees`
directly. §3.2 explains why no constant works; the "feels like" route is the one two shipped
products chose.
