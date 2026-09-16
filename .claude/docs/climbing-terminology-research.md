# Climbing Terminology: Walls, Angles and Aspect — Research

How climbers actually describe rock, and what that means for the fields this app
stores. Written 2026-09-16 against `main` @ `48ea8a8`.

**This document changes no code and no constant.** `scoring-algorithm.md` is agreed and
locked. §6 lists findings against the current implementation; acting on any of them is a
separate, approved change.

Companion to `.claude/docs/rock-drying-research.md`, which covers the rock itself. This one
covers the *geometry* and the *vocabulary*, because the app already stores both and gets one
of them backwards.

## Confidence markers

| Marker | Means |
| --- | --- |
| **[M]** | Measured or defined in an academic / standards source |
| **[I-C]** | Industry convention — climbing-wall manufacturers, gyms, route databases |
| **[C]** | Climbing-community usage, widely held and rarely written down |
| **[R]** | Read directly from this repository's source |
| **[?]** | My inference, not stated by any source |

**The same caveat as the rock research applies.** This environment's egress proxy blocks
direct page fetches, so published sources came through search-result summaries — attributed
but **not read at source**. Everything marked **[R]** is the exception: that was read from
the files in this repo and is the most reliable material here.

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

([Springer — Content-Based Recommendations for Crags and Climbing Routes](https://link.springer.com/chapter/10.1007/978-3-030-94751-4_33)) **[M]**

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
