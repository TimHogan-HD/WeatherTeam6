# Climbing Terminology, Walls and Locations — Research

What climbers mean, what they actually want from the weather, and how the two differ from
what this app models. Written 2026-09-16 against `main` @ `48ea8a8`.

**This document changes no code and no constant.** `scoring-algorithm.md` is agreed and
locked. §6 and §15 list findings against the current implementation; acting on any of them is
a separate, approved change.

Companion to `.claude/docs/rock-drying-research.md`, which covers the rock itself. This one
covers everything around it — geometry, vocabulary, disciplines, the variables climbers
actually track, and how climbing places are structured.

**The four findings that matter most, if you read nothing else:**

1. **§1 — `cliff_angle` runs backwards.** A climber typing `40` means a steeply overhanging
   wall; we read it as a low-angle slab. The default is `45`, the most confusable value on
   the scale, and nothing can ever overwrite it.
2. **§10 — we store `dewpoint_c` and score relative humidity.** Dew point is the variable
   the community actually uses, and no scorer reads ours. (**The specific 60 °F threshold did
   not survive §17.2** — but the finding does, and the variable the readable sources actually
   describe, dew-point *spread*, needs no threshold at all.)
3. **§9 — the temperature band is calibrated for a comfortable day out**, not for climbing.
   It scores zero at the temperature where shoe rubber grips best.
4. **§13 — 85 to 100 US crags are legally closed for months each year** and nothing in the
   app can know it.

## Confidence markers

| Marker | Means |
| --- | --- |
| **[M]** | Measured or defined in an academic / standards source |
| **[I-C]** | Industry convention — climbing-wall manufacturers, gyms, route databases |
| **[C]** | Climbing-community usage, widely held and rarely written down |
| **[R]** | Read directly from this repository's source |
| **[?]** | My inference, not stated by any source |
| **[X]** | **The cited source was opened and does not support this claim** — added 2026-09-16. Not "false": the number may be right and simply attributed to the wrong place. It means nobody can point at where it came from. Same meaning as in the rock doc. |

**The same caveat as the rock research applied, and §17 is the start of lifting it.** The
session that wrote §1–§16 was behind an egress proxy that blocked direct page fetches, so
published sources came through search-result summaries — attributed but **not read at
source**. Everything marked **[R]** is the exception: that was read from the files in this
repo and is the most reliable material here.

**§17 (2026-09-16) opened the three figures most likely to become constants.** One confirmed
and two do not say what they were cited as saying. Claims it checked carry a dated note in
place; **everything it did not check is still in the state this caveat describes.**

---

## 1. The headline: "angle" has four meanings and we use the rarest one

There is no single convention. Four are in active use, and they disagree about both the
**zero point** and the **direction of increase**.

| Convention | Flat ground | Vertical wall | Overhanging | Used by |
| --- | --- | --- | --- | --- |
| **A. From horizontal** | 0° | 90° | 90–180° | Academic work, route databases **[M]** |
| **B. Past vertical, signed** | −90° | **0°** | positive | Gyms, wall builders, climbers **[I-C]** |
| **C. "Wall angle" (builders)** | — | 90° | *less* than 90° | Some hold/wall vendors **[I-C]** |
| **D. `locations.cliff_angle`** | 90° | **0°** | *cannot be expressed* | **This app** **[R]** |

**A and B are the two that matter.** C appears on some wall-builder sites and inverts B;
it is a minority usage and is noted only so it is recognised when met.

**D is ours, and it shares B's zero point while running in the opposite direction.** Both
say "degrees from vertical" and both put vertical at 0 — then B goes positive into
overhang and D goes positive into slab. A climber who types `40` means a steeply
overhanging wall; we read it as a low-angle slab. **Same words, same zero, opposite sign.**

### 1.1 The academic classification, with real thresholds

The one source found that puts numbers on the bands classifies routes by the steepness of
the rock wall, measured **from horizontal**:

| Band | Range (from horizontal) |
| --- | --- |
| **slab** | ≤ 88° |
| **vertical** | 88–95° |
| **overhanging** | 95–165° |
| **roof** | ≥ 165° |

([Springer — Content-Based Recommendations for Crags and Climbing Routes](https://link.springer.com/chapter/10.1007/978-3-030-94751-4_33)) **[C]**

> **Confirmed verbatim at source 2026-09-16 (§17.1), and downgraded from [M] to [C].** The
> chapter is readable in full and prints *"slab (≤88°), vertical (88°–95°), overhanging
> (95°–165°), roof (≥165°)"* exactly. But it takes the scheme from the **8a.nu e-guidebook** —
> it is a website's tagging convention that a paper adopted, not thresholds anyone measured.
> The argument below is unaffected; a convention is what §5 wants.

Two things to take from it. The **vertical band is only 7° wide** — climbers treat
"vertical" as a narrow category, not a midpoint. And **overhanging occupies 70° of the
range against slab's 88°**, so the scale is not symmetric around vertical in use.

### 1.2 The gym convention, which is what a climber will type

A **"45-degree wall"** in a gym is **45° past vertical** — severely overhanging. Gyms
commonly build 25°, 40° and 45° walls, and a 40° wall is described as "a staple of indoor
climbing" where the hardest problems are set
([Atomik wall angle chart](https://www.atomikclimbingholds.com/wall-angle-chart),
[Interface Climbing](https://www.interfaceclimbing.com/choosing-your-wall/what-is-the-best-angle-for-a-home-climbing-wall/)) **[I-C]**.

The same source notes a 45° wall is *"also described as a 135 degree wall"* — the
supplementary angle, i.e. convention A. **The two are used interchangeably for the same
wall**, which is exactly how a sign error survives review.

**Outdoors the vocabulary is words, not degrees.** Guidebooks say *slightly overhanging*
(~5° past vertical), *steep*, *overhanging*, *roof* — a number is rare
([Wikipedia — Overhang](https://en.wikipedia.org/wiki/Overhang_(climbing))) **[C]**.
Community usage puts the overhang threshold at *"5 or 10 degrees past the vertical or
steeper"* **[C]**, and slabs *"bottom out at about 20 degrees less than vertical"* **[C]**.

### 1.3 Nobody means "45" the way we do

Our default is `45`, which in convention D is a half-slab. In convention B — the one a
climber uses — 45 is a **severely overhanging** wall, which is very nearly the opposite
kind of terrain and has the opposite effect on wetting. The number is not just a poor
default; it is the single most confusable value on the scale.

---

## 2. The vocabulary, with the parts that bear on weather

Terms are gathered from
[REI's glossary](https://www.rei.com/learn/expert-advice/rock-climbing-glossary.html),
[theCrag's glossary](https://www.thecrag.com/en/article/glossary) and
[Devils Lake Climbing Guides](https://www.devilslakeclimbingguides.com/blog/climbing-terms-for-beginners) **[C]**.

### 2.1 Formations

| Term | What it is | Why it matters here |
| --- | --- | --- |
| **Crag** | A climbing area, usually one cliff or outcrop | This is what a `location` row *is* |
| **Sector / wall** | A named subdivision of a crag | What the `walls` table models |
| **Buttress** | Rock projecting out from the main face | Own aspect, often two of them |
| **Face** | A broad, relatively featureless wall | — |
| **Arête** | An **outside** corner — convex, like a pyramid edge | Exposed to wind and sun on two sides; dries fastest **[?]** |
| **Dihedral / corner / open book** | An **inside** corner — concave, two walls meeting | Collects drainage, shelters from wind; dries slowest **[?]** |
| **Chimney** | A crack wide enough to fit a whole body | Effectively a deep dihedral |
| **Roof** | Terrain at or near horizontal | Sheds rain completely |
| **Prow** | A narrow overhanging arête | — |

**Arête and dihedral are a drying axis nothing in this app models.** They are the same rock,
the same aspect and the same angle band, and they behave oppositely: a convex feature drains
and ventilates on two sides, a concave one concentrates runoff and stills the air. Marked
**[?]** because no source found states it in drying terms — but it follows directly from the
geometry, and it maps onto the "sky view factor" term the rock research's §9.7 already
identified for terrain shading.

### 2.2 Aspect

The compass direction a wall **faces**. Northern hemisphere: **north-facing = shade all
day**, **south-facing = sun all day**, east gets morning sun, west afternoon
([Gripped — sun and shade at the crag](https://gripped.com/profiles/understanding-sun-and-shade-at-the-crag/)) **[C]**.
The avalanche world calls these *solar* and *shady* aspects and uses the identical concept
([Avalanche.org — aspect](https://avalanche.org/avalanche-encyclopedia/terrain/slope-characteristics/aspect/)) **[M]**.

Note the word is used for **two different things** and the app conflates them: a *slope*
aspect (which way the hillside falls) and a *wall* aspect (which way the cliff looks). For a
crag they can differ by a lot, and it is the wall aspect that decides sun on the holds.

---

## 3. Why overhang is the strongest shelter signal there is

This is the reason the missing half of our scale matters.

Community weather-proof-crag lists are built almost entirely out of overhanging rock:
*"there are odd crags that stay dry in the rain because they're very overhanging"*, and the
two named classes of weatherproof venue are **steep overhanging crags** and artificial
structures with ceilings. Named examples: **Ben's Roof** (*"climbable no matter the
conditions"*), **Dark Art** (*"rarely gets wet from rain"*), **the roof of Rubicon**
(*"reliably dry"*)
([UKC forums](https://www.ukclimbing.com/forums/rock_talk/climbing_in_the_rain-637804),
[Warwick University Climbers' Union — weatherproof crags](https://warwickclimbersunion.co.uk/weatherproof_crags.html)) **[C]**.

And the summarising line, which is the one to keep: *"most of the dry stuff is by default
overhanging"* **[C]**.

This matches the rock research independently. Its §4.18 records El Salto's La Boca, where
*"due to the wall inclination … water will not hit the wall nor drip from the holds"* — a
wall with tufa on it, proving water has run there, that rain nonetheless never lands on.

**So the single most useful geometric fact about a wall, for a drying model, is how far past
vertical it leans — and that is precisely the half of the range `cliff_angle` cannot
represent.** Its minimum, 0, is vertical. There is no value meaning "this never gets wet".

---

## 4. What this repo actually stores

Two angle models, in two tables, with **opposite sign conventions**. All **[R]**.

### 4.1 `locations.cliff_angle` — drives the score

- `numeric`, nullable, **no database default** (`schema.ts`).
- Read as `parseNum(location.cliff_angle, 45)` in `liveForecast.ts`, twice.
- Consumed as `angleFactor = 1.0 + (cliffAngle / 90) * 0.3` in both `dryingModel.ts` and
  `conditionsScore.ts` — so **higher = slower drying**, up to +30%.
- Convention D: `0` vertical, `90` slab. `conditionsScore.ts`'s own comment says
  *"slab (90°) dries 30% slower than vertical wall (0°)"*.

### 4.2 `walls.angle_deg` + `angle_band` — drives nothing

- `walls` carries `aspect_deg`, `aspect_source`, `angle_deg` and
  `angle_band: 'slab' | 'vertical' | 'steep' | 'roof'`, all `notNull` (`schema.ts`).
- The band is a four-value enum, and it is **the same shape as the academic classification
  in §1.1** — arrived at independently.
- **Nothing reads it for scoring.** `computeLiveForecast` takes `cliff_angle` from
  `locations` and never looks at `walls`.

### 4.3 The sign conflict, resolved

`LocationIdentity.tsx` states plainly that it will not print `walls.angle_deg` as a number
because nothing establishes its convention:

> *"`walls.angle_deg` has no writer anywhere in the repo — no seed, no importer, no UI — so
> nothing establishes whether it is measured from vertical … or from horizontal … Printing
> '14° off vert' would pick one of those on no evidence."*

**That is resolvable, and this is the evidence.** The archived
`apps/mobile/src/components/walls/WallSetupModal.tsx` — the UI the table was built for —
labels the control **`"° past vertical"`** and seeds its presets as:

```
slab → -15        vertical → 0        (steep/roof positive)

angleToBand(deg):  deg < 0 → 'slab'        deg <= 9  → 'vertical'
                   deg <= 30 → 'steep'     else      → 'roof'
```

So `walls.angle_deg` is **convention B**: signed, negative for slab, positive for overhang.
Its naming ladder is worth keeping as-is — *Slab, Gentle slab, Vertical, Near-vertical,
Overhanging, Steep, Very steep, Severely overhanging, Deep roof · cave*.

**The two columns therefore disagree about the sign of the same physical quantity.** A wall
stored as `-15` in `walls.angle_deg` and `15` in `locations.cliff_angle` is the same slab;
`45` means "severe overhang" in one and "half-slab" in the other. Nothing converts between
them because nothing reads both — which is the only reason this has not produced a wrong
number yet.

### 4.4 And `cliff_angle` has no writer either

Traced end to end: `insertGeneralLocation` (the shared write path for `POST /locations` and
the bot's Save button) does not include the column; `parseGeneralLocationInput` does not
parse it; `SaveBar` does not capture it; editing is deferred by design (§12.4). The only
writer in the repo is `seed.ts`, which sets **30, 10 and 5** for its three rows.

**So every user-created location takes the 45 default, permanently.** The seed values are
themselves evidence against it: whoever chose 30/10/5 did not think 45 was typical either.

---

## 5. Which convention this app should use

Recommendation, for the record — not a change.

**Adopt convention B (signed, past vertical) for anything a human enters or reads**, because
it is what climbers say, it is what the archived wall UI already used, and it is the only one
of the four that can express an overhang as a distinct direction rather than an absence.

**Keep a band alongside the number, and prefer the band in the interface.** §1.1's bands and
`walls.angle_band` already agree; CragReport's own input is a three-way *slab / vertical /
overhang* toggle rather than degrees (rock research §9.1). A band cannot be read backwards,
which is the failure mode this whole document is about. `LocationIdentity` reached that
conclusion on its own and it is the right one.

**If a numeric column must keep convention D**, its name should say so — `slab_angle_deg`
rather than `cliff_angle` — because "cliff angle" reads as convention A to a climber, and
"degrees from vertical" reads as convention B.

---

## 6. Findings against the current implementation

Read from the source, not inferred.

**6.1 The default asserts a geometry nobody chose, on every location.** `parseNum(…, 45)`
gives every unset location `angleFactor = 1.15` — a flat **+15% drying time** for everyone,
forever, since nothing can set the column. An unset value should not assert a shape: either
`angleFactor = 1.0` when null (my preference — it says "unknown" rather than guessing), or a
default of 0 (vertical), which §1.1 shows is a much better single guess than a half-slab.

**6.2 The scale cannot express the strongest shelter signal in the domain.** §3: overhang is
what makes a crag weatherproof, and `cliff_angle`'s range stops at vertical. A roof and a
vertical wall score identically for drying, and the roof is the one that never got wet.

**6.3 Two columns hold the same quantity with opposite signs.** §4.3. Harmless today only
because nothing reads both. Anyone wiring `walls` into scoring — which is the obvious next
step for that table — inverts every slab and every overhang unless they notice first.

**6.4 The number shown to the user is the one a climber will misread.** `LocationIdentity`
renders `"8° off vert"` and its comment says the suffix is load-bearing precisely because a
bare `8°` would be read backwards. That is a correct mitigation of a problem that should not
exist at the data layer.

**6.5 `walls` is dead data with a live schema.** Four `notNull` columns, an API route, and
no writer anywhere in the build — the only UI that wrote it is in the archived `apps/mobile`.
The Mini App renders a read-only strip and says *"Score is crag-wide"*. Worth either wiring
up or deciding against, because a `notNull` column nothing fills is a schema that lies.

**6.6 Aspect is free text.** `locations.aspect` is `text` and `aspectValue` passes through
whatever was entered, while `walls.aspect_deg` is a proper `integer` bearing with an
`aspect_source` provenance field. The newer model is right and the one that drives scoring is
the older one — the same split as the angle.

---

## 7. What I could not establish

- **No source quantifies how much an overhang reduces wetting.** Everything in §3 is
  categorical — "stays dry", "weatherproof". The relationship between degrees past vertical
  and rain reaching the face is presumably a function of wind-driven rain angle, and no
  climbing source models it.
- **No agreed threshold for "steep".** `angleToName` puts it at 21–30° past vertical;
  the band function at 10–30°; community usage is vaguer. There is no standard.
- **Nothing on arête-versus-dihedral drying**, despite it being an obvious and large effect.
  §2.1's reasoning is mine, marked **[?]**.
- **Whether `walls.angle_deg` rows exist in production.** The table has no writer in this
  build, but the archived app did write it, so rows may predate the archive. Unverified —
  this environment cannot reach the database.
</content>

---

## 8. Discipline is the missing dimension — one weather model cannot serve them

The app has one score. Climbing has at least seven disciplines and they want **different
weather**, sometimes opposite weather. Sources:
[Explore-Share](https://www.explore-share.com/blog/different-types-climbing/),
[WeighMyRack](https://blog.weighmyrack.com/the-different-types-of-climbing-and-what-gear-they-use/),
[Wikipedia — mixed climbing](https://en.wikipedia.org/wiki/Mixed_climbing) **[C]**.

| Discipline | Exposure | What decides the day |
| --- | --- | --- |
| **Bouldering** | Minutes per attempt, many attempts | **Cold and dry.** Friction is everything; the landing must be dry too |
| **Sport** | One pitch, 10–30 min | Cold-ish and dry; shade on the wall |
| **Trad** | Slower, gear placement | As sport, **plus dry cracks** — a wet crack is unprotectable as well as slick |
| **Multi-pitch** | **Hours, committing** | A *window*, not an instant. Escape matters; an afternoon storm is a different hazard |
| **Ice** | Hours, seasonal | **Inverted — needs sustained freezing.** Warm is the hazard |
| **Mixed** | Hours | Both, and the transition between them |
| **Alpine** | A day or more | Approach, snowpack, freeze line, storms |

Three consequences the current model cannot express:

**Multi-pitch needs a window, not a number.** A score for "today" is the wrong shape for a
route that takes six hours; the question is whether a *contiguous block* is good, and whether
the bad weather arrives while the party is committed. Rock research §9.5's hourly window view
is the same feature seen from the other side.

**Ice inverts every sign in the model.** Freeze–thaw is *required* to build water ice —
*"temperatures rise to or slightly above freezing during the day, only to cool well below
freezing at night"* — and "hero ice" is cited at **−4 to −1 °C (25–30 °F)**, with sustained
deep cold making ice brittle
([Rock Climbing Realms — decode ice](https://rockclimbingrealms.com/decode-ice-formations-conditions-for-safe-ascents/)) **[C]**.
Rock research §2.6 treats freeze–thaw as damage; for ice it is the *construction mechanism*.
The repo already stores an ice venue — Robinson Park's farmed ice park (rock research §4.7) —
and would score it as unclimbable rock all winter.

**Bouldering cares about the ground.** A dry wall over a soaked landing is not a bouldering
day. Nothing in the model looks down.

---

## 9. The temperature band is a comfort band, not a climbing band

`TEMP_BAND_C` is `{ min: 0, idealMin: 10, idealMax: 22, max: 35 }` **[R]** — full points from
**10–22 °C**, zero at or below 0 °C.

What climbers actually seek:

- **Bouldering: 32–50 °F (0–10 °C)** is cited as ideal **[C]**.
- **Climbing-shoe rubber reaches maximum friction at roughly 32–41 °F (0–5 °C)**, just before
  its glass transition
  ([Climbing — science friction](https://www.climbing.com/skills/science-friction-the-truth-behind-perfect-climbing-conditions/),
  [Friction Labs — the science behind send temps](https://shop.frictionlabs.com/blogs/climb-your-impossible/the-science-behind-send-temps)) **[X]**.

> **Attribution fails — checked at source 2026-09-16 (§17.3).** The Friction Labs article
> mentions **no** rubber friction, **no** glass transition and **no** optimal send temperature.
> It compares finger-flexor endurance at 50 °F versus 80 °F, suggests a 4 °C drink for heat
> stress, and concludes that *"humidity seems to have a larger indirect effect on our
> performance"* than temperature. The other source, climbing.com, is behind a login wall and
> was not read — the rubber claim may be there.
>
> The band below is still the community's view and the argument about `TEMP_BAND_C`'s inverted
> floor still stands on that. But it now rests on convention alone, not on two named articles.
- **Roped climbing tolerates far more: 32–80 °F (0–27 °C)** **[C]**.
- *"Splitter conditions"* is described as **a sunny, low-humidity 60 °F (15.5 °C) day** **[C]**.

So the band's ceiling is defensible and **its floor is inverted**. The single best range for
hard bouldering — 0–10 °C — sits entirely in the app's *rising ramp*, scoring partial marks,
and **0 °C scores zero** when it is close to the optimum for rubber. A climber driving to a
boulder at −3 °C with a brush and a hot flask is having the best friction day of the year and
the app calls it unclimbable.

The honest reading is that one band cannot serve both cases: 10–22 °C is roughly right for a
**comfortable roped day** and roughly inverted for a **hard bouldering day**. That is §8's
point arriving as a number.

**One caution against over-correcting.** Cold has a real limit and it is the climber, not the
rock: *"cold skin hardens and cannot mold to crystalline edges, reducing contact"* **[C]**,
and the practical rule offered is *the coldest temperature at which the climber can stay warm
between attempts*. That is a personal threshold, not a constant.

---

## 10. Dew point is the metric climbers use; we store it and score relative humidity instead

The strongest single finding in this document, because the fix needs no new data.

**Relative humidity is the wrong variable.** *"Air at 4 °C at 90% humidity has a lot less
moisture in it than air at 24 °C at 90% humidity"* **[C]** — so a 90% morning and a 90%
afternoon are not the same conditions, and our component scores them identically.

**Dew point is temperature-independent and is what the community tracks.** The rule quoted is
blunt and usable: **above a dew point of 60 °F (15.6 °C) conditions are poor regardless of
relative humidity** — there is simply too much moisture present
([UKC — can anyone explain humidity](https://www.ukclimbing.com/forums/rock_talk/can_anyone_explain_humidity_to_me-678224),
[The Climbing Journal — monitoring climbing conditions](https://theclimbingjournal.com/learn/climbing-conditions/),
[Plas y Brenin — interpreting the forecast](https://info.pyb.co.uk/blog/interpreting-the-weather-forecast-for-rock-climbing)) **[X]**.
The stated reason is exactly the mechanism: lower atmospheric moisture lets sweat evaporate
and reduces condensation on the rock.

> **Attribution fails — checked at source 2026-09-16 (§17.2).** Two of those three sources are
> reachable and **neither states a 60 °F threshold**. Plas y Brenin only defines dew point. The
> Climbing Journal describes the **gap between dew point and air temperature** closing, and
> explicitly declines to prescribe a universal number. UKC is the third and ukclimbing.com is
> blocked here, so the threshold may be in that forum thread — unread.
>
> **The finding this section rests on is unharmed**: relative humidity is still the wrong
> variable, dew point is still what climbers track, and we still store it without scoring it.
> What is unsupported is **the constant**. Do not put `60` in `conditionsScore.ts` on this
> citation. The mechanism the readable sources describe — **dew-point spread** — needs no
> threshold constant at all and comes from two columns we already have.

**And we already have it.** `dewpoint_c` is a column on **both** `forecast_snapshots` and
`weather_ensemble_hours` **[R]**. Grepping `apps/api/src/lib/scoring/` for `dewpoint` returns
**one hit, in a test fixture** — no scorer reads it. Meanwhile `conditionsScore` spends 8
points and a drying modifier on `currentHumidityPct`.

This also connects to rock research §2.8: sorption says the *surface* equilibrates with the
air almost instantly, so the variable that governs greasiness is atmospheric moisture — which
is what dew point measures and relative humidity obscures.

**A caveat worth keeping.** One friction source claims *"temperature seems to have minimal
effects on skin friction and force production — it's the humidity that we need to look out
for"* **[C]**. If that is right, the 12-point temperature component and the 8-point humidity
component are weighted the wrong way round. Recorded as a claim, not a conclusion: it is one
source and it sits against a large body of community practice that treats temperature as
decisive.

---

## 11. The vocabulary of conditions

What a climber says, and what it means — useful for copy, and as the label set if the "was it
dry?" report from rock research §9.8 is ever built
([rockclimbing.com slang dictionary](https://rockclimbing.com/Articles/Introduction_to_Climbing/The_Climbing_Dictionary_Slang_Edition_1581.html),
[GearJunkie jargon guide](https://gearjunkie.com/climbing/definitive-guide-climbing-jargon)) **[C]**.

| Term | Means |
| --- | --- |
| **Conditions** (as a noun) | Weather *plus* humidity, wind, exposure — the climbing-relevant composite. "Conditions were bad" is not "the weather was bad" |
| **Greasy** | Slipping off holds because they are warm, humid, or loaded with chalk and sweat |
| **Manky** | Seeping, mossy or damp |
| **Swarmy / schmarmy** | Hot, wet, humid — the summer failure mode |
| **Splitter** (of weather) | Perfect: sunny, low humidity, ~60 °F. Also means a perfect crack — context decides |
| **Send** | To climb without falling |

**"Conditions" is a term of art and the app should use it as one.** It already does the right
thing by name — a *conditions* score — and the vocabulary above is the register its copy
should match. Note `manky` is precisely the seepage state rock research §2.3 says the model
cannot see.

---

## 12. How climbing locations are actually structured

**Mountain Project's model is a recursive tree**: areas run from states and countries down to
individual crags and boulders, sub-areas nest arbitrarily deep, and there is one strict rule —
**a sub-area contains either more sub-areas or routes, never both**
([Mountain Project — adding areas & routes](https://www.mountainproject.com/help/12/adding-new-climbing-areas-routes)) **[C]**.
A route carries name, type (with pitch count), grade, first ascent, GPS, a description, and a
separate **`location_description` covering the approach** **[C]**.

Our model is three flat tables **[R]**: `locations` (what a user saves), `crags` (imported
OpenBeta rows) and `walls` (one level below a location, unused). There is no recursion and no
route level.

That is a defensible simplification for a weather app — but two of its costs are already
documented findings. **Sinks Canyon** (rock research §4.9) is one `location` spanning
sandstone, limestone and granite with elevation, which the real hierarchy would model as
sub-areas. And **§3's shelter problem is per-wall, not per-crag**: one crag routinely has a
roof that never gets wet and a slab that seeps, which is what `walls` was for.

The piece worth stealing regardless of hierarchy is **`location_description` as a field
distinct from the route description** — the approach is separately described because it fails
separately, which is §13's point.

---

## 13. A crag can be closed, and no weather model can see it

**85 to 100 US climbing areas close each year**, typically **February to August**, for nesting
raptors; peregrine falcons account for about half
([Outside — raptor closures](https://www.outsideonline.com/outdoor-adventure/climbing/climbers-changing-outdated-raptor-closures-peregrine-falcon/),
[WDFW](https://wdfw.wa.gov/species-habitats/at-risk/species-recovery/raptor-closures),
[Smith Rock seasonal closures](https://www.smithrock.com/seasonal-closures)) **[C]**.
Scope and dates vary per site and are set by land managers, not by season alone.

**A perfect score on a closed crag is worse than no score.** This is the same class as rock
research §7's wet-sandstone ethic — a state where the correct answer is "do not go" for a
reason weather cannot supply — and it is strictly outside what any forecast can determine. It
needs a per-location flag with dates, human-maintained, exactly like the `seepage_prone` flag
that research proposed.

Note the shape of the risk: raptor season **overlaps spring**, which in the Upper Midwest and
Front Range is also when the freeze–thaw and snowmelt findings say conditions finally improve.
The app will be at its most confident and most encouraging precisely when a meaningful slice
of crags are legally shut.

---

## 14. The approach fails separately from the wall

Rock research recorded this at three crags (Index's river, Wild Iris's snowmelt, El Salto's
watercourses). The general mechanism is documented and it is **diurnal**:

> Snowmelt- and glacier-fed streams **rise during warm daytime hours and fall overnight**;
> cross them between **04:00 and 08:00**, when levels are at their daily low.
> ([The Big Outside](https://thebigoutside.com/how-to-safely-cross-a-stream-when-hiking-or-backpacking/),
> [The Hiking Life](https://www.thehikinglife.com/hiking-and-backpacking-skills/snow/)) **[C]**

Two further approach facts worth holding: snow lingers on high trails in the US West *"until
mid- or late July"* above roughly 9,000–10,000 ft **[C]**, and spring snowfields soften near
rocks where the rock warms the snow **[C]**.

**The inversion is the useful part.** Everything in the drying model says a warm sunny
afternoon is the best time to climb. For a snowmelt-crossed approach, a warm sunny afternoon
is the *worst* time to walk in, and the safe window is dawn — before the rock has dried. A
model that only scores the wall will confidently recommend the hour the approach is most
dangerous.

---

## 15. Findings against the current implementation, continued

Continuing §6. All **[R]** unless noted.

**6.7 `dewpoint_c` is stored twice and read by nothing.** It is a column on
`forecast_snapshots` and `weather_ensemble_hours`; `grep dewpoint apps/api/src/lib/scoring/`
returns a single test fixture. §10 says it is the variable the community actually uses, with a
usable threshold at 15.6 °C. This is the cheapest substantive improvement found in either
research document: the data is already fetched, already stored, and already flows to the
scorer's caller.

**6.8 The temperature band's floor is inverted for bouldering.** §9. `TEMP_BAND_C.min = 0`
scores zero at the temperature where shoe rubber is near its friction maximum, and the
0–10 °C ideal bouldering range falls on the partial-credit ramp. Not a bug in isolation — it
is right for a roped day — but the app has no notion of discipline to choose between them.

**6.9 There is no discipline field.** §8. `locations.is_climbing_location` is a boolean; there
is nothing to say whether a place is a boulder, a sport crag, or an ice venue, and the three
want different — in ice's case opposite — weather. The repo already stores a farmed ice park.

**6.10 Nothing models access closures.** §13. No column, no flag, no dates. 85–100 US areas
are shut for months each year and the app will score them as normal.

**6.11 Nothing models the approach.** §14. And its safe window can be the inverse of the
wall's.

**6.12 The copy register is close but the vocabulary is not used.** §11. "Conditions" is
already the right noun; `manky`, `greasy` and `splitter` are the words a climber would use for
states the app tries to describe, and the report vocabulary from rock research §9.8 should
draw on them rather than invent a scale.

---

## 16. What I still could not establish

- **No source quantifies overhang versus wetting** (carried from §7, still open).
- **No agreed numeric threshold for "good conditions" at all.** ~~beyond the dew-point 60 °F
  rule.~~ Everything else is personal calibration, and several sources say so explicitly.
  **Updated 2026-09-16 (§17.2): the 60 °F rule is not an exception** — it is not in either
  reachable source, and the one that discusses dew point most directly declines to give a
  number on purpose.
- **The temperature-versus-humidity weighting is contested, and §17.3 changed which side has
  the evidence.** §10's closing caveat: one friction source says temperature barely matters
  for skin and humidity dominates, against a community that treats temperature as decisive.
  Unresolved, and it would change the score's component weights if settled. **Updated
  2026-09-16:** that one source is Friction Labs, it was read at first hand, and it says
  exactly that. The claims it was cited *against* — the 0–5 °C rubber peak and the 0–10 °C
  bouldering band — come from sources nobody here can open. The caveat is now better sourced
  than the position it qualifies.
- **Nothing on how bouldering landings dry**, which is a separate surface from the wall and
  the thing that actually closes a boulder after rain.
- **No data on closure schedules in machine-readable form.** Every source found is a land
  manager's web page in prose. Whether Access Fund or a regional org publishes a feed is
  ~~unknown — this environment cannot fetch pages to check.~~ **Partly answered 2026-09-16.**

  > Three closures were read at source while building `crag-facts.json` (Phase 2), and the
  > shape of the answer is now clearer than "prose on a web page".
  >
  > **NYSDEC publishes a maintained, per-route closure list** for the Adirondacks
  > (`dec.ny.gov/things-to-do/rock-and-ice-climbing/adirondack-route-closures`). It is HTML,
  > not a feed — but it is structured, current, and **route-level**: in a typical spring all
  > Poke-O-Moonshine Main Face routes are closed with a named handful excepted, while the rest
  > of the mountain stays open, leaving roughly 25 of 300+ routes. So the granularity problem
  > from §12 shows up here too, and a crag-level closed/open flag would be wrong in both
  > directions at that cliff.
  >
  > **Not every closure is ecological.** Devils Tower's June closure is *voluntary* and
  > *cultural* — the NPS asks visitors to refrain because 'June is a culturally significant
  > time when many (but not all) Indian ceremonies occur'. A schema modelling closures as
  > raptor-nesting date ranges would represent it as a mandatory ban or miss it entirely, and
  > either is worse than saying nothing.
  >
  > **And a land manager may publish a closure without publishing what is closed.** The NPS
  > advisory for Pinnacles gives the window — 'Seasonal closures (January to July) are in place
  > to protect nesting raptors' — and names neither formations nor species, telling climbers to
  > check the board at the visitor centre. That one cannot be consumed by any program.
  >
  > **Still open:** whether any of this exists as an actual feed, and whether the Access Fund
  > or a regional org aggregates across land managers.

---

## 17. Source verification pass — 2026-09-16

Phase 1 of `docs/handoffs/climbing-research-brief-v1.md`. This document was written in a
session that could not reach any content domain, so its figures were attributed from
search-result summaries. Three of them were named in the brief as headed for constants. All
three were opened at source.

**Two of the three do not say what they are cited as saying.**

| Claim | Where | Verdict |
| --- | --- | --- |
| Steepness bands: slab ≤88°, vertical 88–95°, overhanging 95–165°, roof ≥165° | §1.1 | **Confirmed verbatim** — but it is not a measurement |
| Dew point above 60 °F means poor conditions | §10 | **Attribution fails** — neither reachable source says it |
| Ideal bouldering 0–10 °C; shoe rubber peaks at 0–5 °C | §9 | **Attribution fails** — the cited source says neither, and argues the opposite emphasis |

### 17.1 The steepness bands confirm, and the marker is still wrong

The Springer chapter is readable in full, and the classification is there word for word:

> *"slab (≤88°), vertical (88°–95°), overhanging (95°–165°), roof (≥165°)"*
> — [Content-Based Recommendations for Crags and Climbing Routes](https://link.springer.com/chapter/10.1007/978-3-030-94751-4_33)

**But the paper is not the origin of it.** The chapter takes the scheme from the **8a.nu
e-guidebook**, where it is a website's category system for tagging routes. It is a convention
that an academic paper adopted, not thresholds that anyone measured. §1.1 marks it **[M]**;
it is **[C]** — a community convention with unusually precise edges, which is exactly what you
would expect from a dropdown menu.

That does not weaken §1.1's argument. A convention is precisely what §5 needs, and 8a.nu's is
better evidence of what climbers mean than a measurement would be. **Corrected in place.**

### 17.2 The dew-point 60 °F rule has no source we can reach

§10 calls this *"the strongest single finding in this document"* and cites three sources.
Two of them are reachable and **neither gives a threshold**:

- **Plas y Brenin** defines dew point — *"the atmospheric temperature where moisture in the
  air condenses"* — and uses it to explain why coastal venues are drier. **No number, and no
  statement about conditions above or below one.**
- **The Climbing Journal** says *"Dew point can be a killer. Keep an eye at the dew point"*
  and describes the mechanism as the **gap between dew point and air temperature** closing —
  condensation *"like condensation on a cold glass"*. It prescribes no threshold and
  explicitly declines to: it *"emphasises monitoring these factors individually rather than
  prescribing universal perfect conditions"*.
- **UKC** is the third source and ukclimbing.com answers 402/403 to every tool here. The
  threshold may well be in that forum thread. It has not been read.

**The mechanism the reachable sources actually describe is the dew-point *spread*, not an
absolute threshold** — how close dew point is to air temperature, which is when condensation
forms on the rock. That is a different and better-behaved variable than "above 60 °F": it is
scale-free, it works in January as well as July, and both inputs are already columns on
`weather_ensemble_hours`.

**§10's core finding survives intact and arguably improves.** Relative humidity is still the
wrong variable, dew point is still the one climbers track, and we still store it and do not
score it. What does not survive is the specific constant: **60 °F is currently sourced to a
forum thread nobody here has opened**, and it should not become a threshold in
`conditionsScore.ts` on that basis. Marked in place.

### 17.3 The friction temperatures are not in the cited source

§9 cites Friction Labs for *"climbing-shoe rubber reaches maximum friction at roughly
32–41 °F (0–5 °C), just before its glass transition"*.

**The Friction Labs article does not mention rubber friction, glass transition, or an optimal
send temperature.** What it contains is a comparison of finger-flexor endurance at **50 °F
versus 80 °F**, a recommendation for a **4 °C / 40 °F** cold drink to manage heat stress, and
this conclusion: *"humidity seems to have a larger indirect effect on our performance"* than
temperature.

The second cited source, climbing.com's *Science Friction*, sits behind an Outside Online
login wall and could not be read. The rubber and glass-transition claim may be there.

**Two consequences.**

First, the **0–10 °C ideal-bouldering band and the 0–5 °C rubber peak are currently
unsourced**, and §9 builds its strongest argument on them — that `TEMP_BAND_C`'s floor is
inverted. That argument is still plausible and widely held in the community, but it is now
**[C]** resting on nothing readable, not **[C]** resting on two named articles.

Second — and this cuts the other way — **§9 and §10's own closing caveat is the better-sourced
claim.** Both flag a single source arguing humidity dominates temperature for skin friction.
That source is Friction Labs, it was read at first hand, and it says exactly that. So the
caveat is verified while the claim it qualifies is not. **§16's "temperature-versus-humidity
weighting is contested" is now the more defensible of the two positions**, which is the
opposite of how this document presents it.

### 17.4 What this changes

Nothing in the code, and nothing in `scoring-algorithm.md`, which is locked.

What it changes is which of this document's findings are ready to become constants. On the
evidence now available:

- **Ready:** the steepness bands, as a convention — they are what a climber means, confirmed
  verbatim, and §1.3's point about `45` being the most confusable value on the scale is
  untouched.
- **Not ready:** the 60 °F dew-point threshold and the 0–5 °C rubber peak. Both are single
  numbers from unreadable sources, and both were about to become comparisons in a scorer.
- **Better than it looked:** dew-point *spread* as the variable, which needs no threshold
  constant at all and is derivable from two columns we already store.

The three blocked hosts — ukclimbing.com, climbing.com, sciencedirect.com — are why
`.claude/research-inbox/` exists.
