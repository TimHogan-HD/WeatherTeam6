# Rock Types, Absorption and Drying — Research

Research notes for improving the drying model. **This document does not change the
scoring algorithm.** `.claude/docs/scoring-algorithm.md` is agreed and locked; §7 below
is a *proposal* that needs explicit approval before any of it reaches code.

Last updated: 2026-09-01 (twelfth pass: §4.13 PNW and Sierra — vegetation and road access as non-weather limiters)

## How to read the confidence markers

Every number in this document carries one, because they are not equally trustworthy and
the difference matters if any of them end up as constants in `dryingModel.ts`.

| Marker | Means |
| --- | --- |
| **[M]** | Measured, from peer-reviewed rock-mechanics or petrophysics literature |
| **[S]** | Stone-industry standard test data (ASTM C97 and similar) |
| **[C]** | Climbing-community convention or land-manager guidance — widely held, rarely measured |
| **[I]** | My inference from the above, not stated by any source |

**A caveat that applies to the whole document.** This environment's egress proxy blocked
every domain I tried to fetch directly (climbing.com, ukclimbing.com, accessfund.org, a
university PDF). Everything here came through search-result summaries, so the numbers are
attributed but **not read at source**. Before any figure becomes a constant in the scoring
code, it should be re-verified against the primary paper from an unrestricted machine.

---

## 1. On the Mohs premise

The instinct is half right, and the half that is right is the useful half — but the scale
needs to be pointed at a different thing.

**Mohs hardness does not predict absorption.** It measures one mineral's resistance to
being scratched, it is ordinal rather than linear, and it says nothing about durability or
toughness ([geology.com](https://geology.com/minerals/mohs-hardness-scale.shtml),
[Britannica](https://www.britannica.com/science/Mohs-hardness)). Absorption is governed by
*texture* — how well the grains are packed, sorted and cemented — not by how hard the
grains are.

The counterexample is decisive and it is a climbing rock. Navajo/Aztec Sandstone is
overwhelmingly quartz, so its framework grains are Mohs 7 — the hardest common rock-forming
mineral. Its dune facies still measures **~28% porosity and ~100 mD permeability** [M]
([BYU thesis via UtahGeology](https://utahgeology.com/navajo-sandstone/)). That is the most
absorbent rock most climbers ever touch, and it is made of the hardest grains. Meanwhile a
dense micritic limestone is calcite — Mohs 3 — and can sit near 1% porosity. Grain hardness
and absorption run in opposite directions in that pair.

**Where Mohs earns its keep: the cement, not the rock.** What holds a clastic rock together
is the cement and matrix between the grains, and *that* is where mineral hardness tracks
real behaviour, because the hardness ordering happens to coincide with the solubility and
swelling ordering:

| Cement / matrix | Mohs | Consequence |
| --- | --- | --- |
| Silica (microcrystalline quartz) | 7 | Insoluble, non-swelling. Lowest porosity, best wet strength. Fontainebleau, Shawangunk, Nuttall. |
| Iron oxide (limonite/hematite) | 5–6 | Durable, often forms a case-hardened rind. Nuttall joint veins, Corbin's red bands. |
| Calcite | 3 | Soluble. Dissolves over geological time leaving porosity; the classic weak eolian sandstone cement. Navajo, Wingate. |
| Clay (esp. montmorillonite) | 1–2 | Swells on wetting. The single strongest predictor of water-weakening. |

Clay content and porosity are named in the literature as the main intrinsic properties
controlling how much a sandstone weakens when wet, and expansive montmorillonite does more
damage than non-expansive clays [M]
([Springer, Bull. Eng. Geol. Env.](https://link.springer.com/article/10.1007/s10064-022-02822-9)).
So "how hard is the glue" is a genuinely good proxy — it just is not "how hard is the rock",
and it is not something a user can read off a guidebook.

**One place Mohs is directly useful to a conditions score, and it is not absorption:
polish.** Calcite at Mohs 3 polishes to glass under traffic; quartz at 7 does not. That is
why a popular limestone sport route is slick in a way a granite crack never becomes, and
why wet limestone's problem is friction rather than breakage. If the app ever models
friction separately from integrity, framework-grain hardness is the right input for it.

---

## 2. The physics that actually governs it

### 2.1 Getting wet

Three properties, in order of how much they matter:

1. **Effective (connected) porosity** — how much water the rock can hold at all.
2. **Pore-throat size distribution** — how hard it sucks water in, and how hard it holds on.
   Fine pores generate stronger capillary suction, which means they wet readily *and* release
   slowly. Larger pores and better-connected pore channels give higher drying rates; small
   pores impede both airflow and vapour diffusion [M]
   ([Drying Technology review](https://www.tandfonline.com/doi/abs/10.1081/DRT-120038738)).
3. **Permeability** — how deep the water gets in the time it is raining.

**Penetration depth is a function of storm character, not storm total.** BLM guidance for
Red Rock puts it plainly: a quick but heavy thunderstorm mostly wets the outer surface
layer because most of the water runs off, while prolonged rain wets the rock below the
surface, sometimes two to three inches, especially in softer rock [C]
([BLM Red Rock Canyon NCA](https://www.blm.gov/nevada/red-rock-canyon-nca/recreation)).
This is the most operationally important sentence in the whole research: **12 mm in one
hour and 12 mm over twelve hours produce completely different drying times, and a daily
rainfall total cannot tell them apart.**

### 2.2 Drying

Porous media dry in two stages with genuinely different rate controls, and conflating them
is why single-number drying estimates fail [M]
([Drying Technology](https://www.tandfonline.com/doi/abs/10.1081/DRT-120038738),
[J. Fluid Mech.](https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/mathematical-modelling-of-drying-capillary-porous-media/9DD4E6AC296676090F943B5CC80CFE0F)):

- **Stage 1 — constant rate period.** Capillary flow keeps liquid at the surface and
  evaporation runs at a near-constant rate set by the *air*: wind speed, relative humidity,
  temperature, solar input. The rock is barely a variable here.
- **Stage 2 — falling rate period.** Capillary forces can no longer supply the surface, the
  meniscus retreats into the pores, and the rate falls away. The rock is now the whole
  variable: vapour has to diffuse out through the pore network.

**The consequence for a drying model:** weather dominates the first phase and rock type
dominates the tail. A model that multiplies a fixed rock-type duration by weather modifiers
(which is what we do today) has the coupling roughly the right shape but applies the weather
term to the whole curve, including the part where weather has stopped mattering.

### 2.3 Seepage is a third mechanism, and it is not drying at all

At many crags — most limestone ones — the wall is not wet because it absorbed rain. It is
wet because the catchment above it is draining through joints and karst conduits and will
keep doing so for days or weeks after the rock itself would have dried. Reported drying at
a UK limestone crag spans **2–3 hours to 2 days depending on how much seepage the crag
takes, plus aspect and tree cover** [C]
([UKC forum](https://www.ukclimbing.com/forums/rock_talk/limestone_-_drying_properties-323074)).
The variance inside a single rock type at a single crag is larger than the difference
between rock types.

Seepage is a property of the *location*, not the rock type, and no amount of rock-type
refinement will capture it.

### 2.4 Why wet rock breaks

Four mechanisms, all documented, and they stack:

- **Rehbinder effect.** Water adsorbs onto quartz grain surfaces at a crack tip and drops
  the surface free energy needed to propagate the fracture [M]
  ([Springer, Phys. Met. Metallogr.](https://link.springer.com/article/10.1134/S0031918X22601585)).
- **Stress corrosion / subcritical crack growth.** Water reacts with the siloxane bonds in
  quartz, so cracks grow at stresses well below the failure threshold. Measured reductions
  in the subcritical crack growth index of 6.2–48.5% in aqueous solution versus air [M]
  ([Springer, PAGEOPH](https://link.springer.com/article/10.1007/BF00876082),
  [Elsevier](https://www.sciencedirect.com/science/article/abs/pii/0040195180901626)).
- **Loss of matric suction.** A damp rock is partly held together by capillary tension
  between grains. Saturation removes it. This is why the strength curve is not linear —
  see the critical-saturation figure below.
- **Clay swelling.** Expansive clays force grains apart from the inside [M].

**The numbers, and their spread — this is the important part:**

| Finding | Value | Source |
| --- | --- | --- |
| Strength loss range across sandstones | **0% (quartz-rich, clay-free) to 55% (Pennant sandstone)**, with extreme cases of UCS dropping >90% | [M] [Springer](https://link.springer.com/article/10.1007/s10064-022-02822-9) |
| Critical saturation band | **60–80%** — most of the strength loss happens crossing it, then the curve flattens | [M] [Springer](https://link.springer.com/article/10.1007/s10064-022-02822-9) |
| Fracture toughness reduction | 6–35% | [M] [Elsevier](https://www.sciencedirect.com/science/article/pii/S1365160921003002) |
| Fracture energy reduction | 21–52% | [M] same |
| Static friction coefficient reduction | 0–19% | [M] same |
| Millstone Grit (Peak District) | ~41% weaker when wet | [C] reported via [Climbing](https://www.climbing.com/travel/wet-sandstone/) |
| "Western sandstone" | up to 75% strength loss while wet | [C] [Climbing](https://www.climbing.com/travel/wet-sandstone/) / Access Fund |

Two things follow, and both contradict how the app currently models this.

**First: "sandstone" is not a strength-loss class.** The measured range within the single
family runs from *no measurable effect* to *catastrophic*. A clean quartz arenite and a
clay-rich wacke are the same word in a guidebook and 55 percentage points apart in the lab.

**Second: the critical-saturation band explains the "damp is worse than you think"
folklore.** A rock at 50% saturation is nearly at dry strength; the same rock at 80% has
given up most of it. The transition is a step, not a ramp — which is interesting, given
that `scoring-algorithm.md` explicitly forbids a step function in the drying component.
Those are not in conflict (the score's ramp is over elapsed time, and the physics step is
over saturation), but the mapping from one to the other is not linear and we currently
assume it is.

---
### 2.5 The study this project was looking for — and it challenges the model

Fifth-pass research found peer-reviewed rock-moisture work carried out **at a climbing area,
explicitly to support climbing-conditions decisions**. It is the closest thing to ground truth
in this whole document, and three of its findings cut against how we model drying.

**"Investigating rock moisture at a sandstone massif in the Saxonian Switzerland climbing
area"** ([Journal of Geomorphology](https://www.schweizerbart.de/papers/jgeomorphology/detail/prepub/100842/Investigating_rock_moisture_at_a_sandstone_massif_in_the_Saxonian_Switzerland_climbing_area);
method context in [Weiss & Sass, Geomorphology 2022](https://www.sciencedirect.com/science/article/abs/pii/S0169555X22003233)).
Six sites on the Gohrisch massif, measured in four cardinal directions at the wall base and
near the summit, using microwave and 2D-resistivity moisture sensing plus Schmidt Hammer for
surface strength.

**First: the product already exists, as a public-safety system.** Saxonian Switzerland runs
**"rock traffic lights"** — visitor-guidance measures that temporarily stop climbing on rocks
that are too wet — and the study's stated aim is to assess the spatial distribution of rock
moisture *to support those measures*. §4.1(d) recorded the local rule (no climbing on rain
days or the day after) as folklore; it is in fact backed by instrumentation and research.
This is the strongest prior art found anywhere for what WeatherTeam6 is building.

**Second, and independently confirming §2.4: the sandstone loses stability mainly between
60% and 100% pore saturation** [M]. That is a different method — Schmidt Hammer rebound —
reaching the same threshold as the UCS literature's 60–80% critical-saturation band. Two
independent lines converging is the strongest single result in this document, and it says
the wet/dry transition is a **step over saturation**, not a ramp over elapsed time.

**Third, and this is the uncomfortable one: the water may not be coming from the rain.**
The study reports the **interior of the rock wetter than the surface in most cases**, the
**foot of the rock face wetter than the summits**, and concludes that wetness *"seems to
derive from a pore water body inside the rock rather than from direct precipitation"* [M].
A companion Saxony survey found a non-monotonic depth profile — slightly wet at the surface,
**drier at 5–15 cm**, moderately wet at 20–30 cm
([EGU21](https://meetingorganizer.copernicus.org/EGU21/EGU21-14871.html)).

A second, independent account of Saxon measurements resolves what that means, and it is
better news for the model than the abstract alone suggested: **the outer five to ten inches
of rock dries out after each rain, while the deeper layers remain more or less saturated**,
and the upper parts of walls are drier inside than the bottoms **because water drains top to
bottom** ([Climbing](https://www.climbing.com/travel/wet-sandstone/), reporting measurements
made by climbers themselves).

So there are two reservoirs, and they behave differently. The **outer ~12–25 cm responds to
weather on the timescale the drying rules assume, and it is the only part that carries a
hold.** The deep pore-water body is largely decoupled from any individual rain event, and it
is what produces persistent seepage, wet cliff bases, and the "wetness is not from
precipitation" conclusion. An hours-since-rain model is therefore tracking the right layer —
but it explains only that layer, and it should not be expected to predict base-of-cliff
seepage at all. That is a per-location property, exactly as §2.3 argued.

Still read from abstracts and secondary reporting rather than the full papers, and still one
soft Saxon sandstone; the depth figures should not be transferred to a quartz arenite or a
desert eolian sandstone without checking.

**Fourth: the lab correlation did not survive the field.** Schmidt Hammer rebound tracked
moisture cleanly in the laboratory (wetter → lower rebound) but **not in the field, where the
wetter site showed the highest rebound**. The authors attribute the summits' lower rebound to
cumulative weathering from more dry–wet cycles. So surface strength is a function of
weathering *history*, not just current moisture — and a field measurement of "how wet is it"
does not straightforwardly predict "how strong is it". This is the same failure mode
`defect-patterns.md` §11 warns about, arriving from the geomorphology side.

Related, and it strengthens §5.1's rock-temperature finding: 2D-resistivity and Schmidt Hammer
found **surface-parallel zones of weakness at every site exposed to solar radiation**,
attributed to thermal weathering. Aspect therefore affects not only how fast a wall dries but
how damaged it is.

**Condensation puts liquid water into rock, not just onto it.** Five years of simulated rock
water content in a sandstone cave found the **maximum wetting-and-drying depth was only 1.2 m**,
and that on high-vapour days the positive flux into the rock is dominated by **liquid water
flow** from infiltrating condensed water, driven by cool interior walls favouring condensation
([Engineering Geology 2025](https://www.sciencedirect.com/science/article/abs/pii/S0013795225002819);
see also [physics-informed ML on the same problem, HESS 2023](https://hess.copernicus.org/articles/27/2579/2023/)).
The condensation term proposed in §7 is therefore not only a friction correction — it is a
**wetting input**, and Cathedral/Whitehorse's "humidity feels like climbing in the rain"
(§4.10) has a physical mechanism behind it.

#### 2.5a The Felsampel — a decade-old production system, and what it chose to build

The "rock traffic light" has a name, a history and an architecture, and all three matter.

**What it is.** The **Felsampel** is an online indicator showing when climbing in Saxon
Switzerland is likely possible again after precipitation. It has been initiated, designed and
operated **since 2015** by the volunteer *Projektgruppe Felsampel* of the Sächsischer
Bergsteigerbund (SBB) ([ASD-DAV](https://www.asd-dav.de/service/felsampel-des-elbsandsteingebirges/),
[DAV Dessau](https://www.dav-dessau.de/bergsport/klettern/felsampel),
[SBB, SSI 36](https://bergsteigerbund.de/wp-content/uploads/2022/09/SSI-Heft-36_Die-Felsampel-eine-Erfolgsstory-im-Ehrenamt.pdf)).
Its stated purpose is exactly ours: protect fragile sandstone and prevent accidents. It is
explicit that wetness costs **both** friction (slipping) and strength (hold breakage) — the
two-failure-mode split this document arrived at separately.

**What it is built from, and this is the finding.** Each measurement point carries
**moisture sensors on the rock itself**, plus **wind, rain and temperature instruments**;
ten such points are planned across Saxon Switzerland [C]
([ASD-DAV](https://www.asd-dav.de/service/felsampel-des-elbsandsteingebirges/)).

The people who have worked hardest on this problem, for a decade, on the rock type where
getting it wrong does the most damage, **did not build a forecast-only model. They
instrumented the rock**, and paired each sensor with the three variables §2.2 identifies as
setting the stage-1 drying rate: wind, temperature and rain.

That is worth stating plainly rather than filing away. It sets a realistic ceiling on what
WeatherTeam6 can claim from gridded forecast data alone, and it suggests the honest framing
for our output is a **likelihood that conditions have recovered**, not an assertion that a
crag is dry. It also points at a cheap future option: a single sensor at one crag would
calibrate the model for that crag far better than any refinement of the rock-type constants.

**Note also that Saxony is chalk-free** ([OCÚN](https://www.ocun.com/news/saxony-from-iii-to-xii-chalk-free)),
joining Garden of the Gods and the MN North Shore in §4.9's list of crags where a humid day
cannot be mitigated.


**Why nobody has published crag drying curves, restated honestly.** It is not neglect. A
laboratory comparison of **eight sensor types** — 1D and 2D resistivity, TDR, borehole
humidity, microwave reflectance, capacitance, IR thermography and uranine probes — through
wetting, drying and freeze–thaw cycles concluded that measuring dielectric properties is the
best available proxy, while noting that **no sensor yet meets all of non-destructiveness,
reliability, repeatability and field applicability** [M]. In the Gohrisch fieldwork,
lab-to-field calibration **failed outright**: many field readings fell outside the calibration
curves. Rock moisture is genuinely hard to measure, which is the real reason §8's gap exists.

## 3. Reference table: absorption and drying by rock family

Porosity values from engineering-geology compilations [M]
([Liverpool table of porosities](https://geohubliverpool.org.uk/wp-content/uploads/2020/01/Table-of-porosities.pdf),
[Leeds petrophysics ch.2](https://homepages.see.leeds.ac.uk/~earpwjg/PG_EN/CD%20Contents/GGL-66565%20Petrophysics%20English/Chapter%202.PDF));
absorption from ASTM C97 practice [S]
([Natural Stone Institute](https://www.naturalstoneinstitute.org/designprofessionals/astm/)).

| Family | Porosity | Absorption (ASTM C97) | Wet strength loss | Dominant wet-weather limiter |
| --- | --- | --- | --- | --- |
| Granite / granodiorite / quartz monzonite | 0.5–1.5% | ~0.2–0.4% | negligible | Friction only |
| Basalt (dense, columnar) | 0.1–1.0% | very low | negligible | Friction only |
| Basalt (vesicular flow top) | **30–50%+** | high | moderate | Water retention in vesicles |
| Gabbro / diabase | 0.1–0.5% | very low | negligible | Friction only |
| Gneiss / schist | low matrix; fracture- and foliation-controlled | low | low | Seepage along foliation |
| Quartzite | near-zero matrix | very low | negligible | Friction, drainage from cracks |
| Marble | up to 2% | ~0.2% | low | Polish |
| Limestone (dense micrite) | ~1–10% | 1–3% | low–moderate | **Seepage**, then polish |
| Limestone (low-density / chalky) | high | **up to 12%** | high | Absorption + hold breakage |
| Dolomite / dolostone | often higher than parent limestone | moderate | low–moderate | Seepage |
| Sandstone (silica-cemented quartz arenite) | 5–15% | low–moderate | **~0%** | Friction; surface film only |
| Sandstone (eolian, calcite/clay-cemented) | **18–30%** | high | **50–75%** | Structural — do not climb |
| Sandstone (clay-rich wacke) | variable | high | up to >90% | Structural — do not climb |
| Welded tuff (densely welded) | low | low | low | Friction |
| **Non-welded tuff** | **38–60%** | very high | high | Structural — more porous than most sandstone |
| Conglomerate | matrix-controlled | matrix-controlled | matrix-controlled | Cobbles pulling from a softened matrix |

Two rows in that table should be alarming given the current five-value `RockType` enum:
`basalt` spans 0.1% to 50% porosity depending on whether you are on a column or a flow top,
and tuff — which the enum does not have at all — spans low-porosity welded rock to 38–60%
porosity non-welded rock, and both are famous bouldering venues.

---

## 4. Variation *within* each family — the part that matters most

This is the heart of the brief and it is where a five-value enum breaks down.

### 4.1 Sandstone — the widest spread of any family

Four sub-classes that behave nothing alike. Sandstone classification is by framework grain
composition (quartz arenite ≥95% quartz; arkose >10% feldspar; lithic arenite >10% rock
fragments) and separately by matrix content (arenite <15% silt/clay; **wacke >15%**)
([Britannica](https://www.britannica.com/science/sedimentary-rock/Classification-of-sandstones),
[Geological Digressions](https://www.geological-digressions.com/classification-of-sandstones/)).
The arenite/wacke split is the one that predicts wet behaviour.

**(a) Silica-cemented quartz arenite — climbs wet, essentially undamaged**

- **New River Gorge, WV — Nuttall Sandstone.** Up to **98% quartz**, with case hardening
  and limonite cement veins along tectonic joints adding to its resistance. A WVU thesis
  set out specifically to answer "what makes good climbing rock?" and identified a 15–20 m
  homogeneous quartz-arenite interval lacking bedding-plane partings as the desirable
  climbing horizon; the basal conglomerate and underlying shale are weaker and less
  weathering-resistant [M]
  ([WVU thesis](https://researchrepository.wvu.edu/etd/3434/),
  [GSA 2010 abstract](https://gsa.confex.com/gsa/2010AM/webprogram/Paper175992.html)).
  Note what that means: **the drying class changes with height on the same cliff.**
- **The Gunks — Shawangunk Formation.** Quartz conglomerate whose cement is dominantly
  silica with relatively little iron oxide, described as one of the hardest and most durable
  of rocks ([NY State Museum](https://nysm.nysed.gov/research-collections/geology/resources/shawangunk-ridge),
  [Shawangunk Formation](https://en.wikipedia.org/wiki/Shawangunk_Formation)). Behaves far
  closer to quartzite than to sandstone.
- **Fontainebleau.** Microcrystalline quartz coatings on the grains inhibit further quartz
  cement growth and *preserve anomalously high porosity* — so it is simultaneously
  silica-cemented and porous [M]
  ([Elsevier](https://www.sciencedirect.com/science/article/abs/pii/S0037073812003296)).
  Despite the durable cement, the local ethic is an explicit no-wet-climbing rule, because
  the sculpted surface patina is what breaks
  ([UKC, 2024](https://www.ukclimbing.com/news/2024/04/protect_fontainebleau_sandstone_-_dont_climb_on_wet_or_damp_rock-73647)).
  **A good cement does not automatically license climbing wet.**
- **Red River Gorge, KY — Corbin Sandstone Member**, Early Pennsylvanian, 30–85 m thick,
  quartz arenite ranging fine-grained to conglomeratic, iron-rich and orange-red in places
  ([Earth magazine](https://www.earthmagazine.org/article/travels-geology-rocks-and-climbing-kentuckys-red-river-gorge/),
  [KY-AIPG guidebook](https://ky.aipg.org/GUIDEBOOKS/2010%20Guidebook.pdf)). Sits between
  classes: solid overall, but **friable in certain areas, particularly after rainfall** [C].
  The Red is also the standing example of geometry beating rock type — its overhangs stay
  dry through rain that shuts everything else down.

**(b) Coarse feldspathic grit**

- **Millstone Grit, Peak District.** Coarse quartz-feldspathic sandstone from delta
  deposits ([Geological Society](https://www.geolsoc.org.uk/science-and-policy/plate-tectonic-stories/stanage-edge/)).
  Reported ~41% weaker when wet [C]. Feldspar at Mohs 6 weathers to clay in a way quartz
  does not, which is the mechanistic reason grit sits below the arenites.

**(c) Eolian, calcite/clay-cemented — the "24–48 hour rule" rocks**

- **Red Rock, NV (Aztec) and Zion (Navajo)** are the same Jurassic dune system
  ([SU Independent](https://suindependent.com/st-george-geology-navajo-sandstone-aztec-sandstone-jurassic-sandstone-jurassic-trace-fossils-snow-canyon-zion-canyon/)).
  Weak calcium-carbonate cement, friable and very porous.
- **This formation is also the best single demonstration of within-type variance.**
  Measured facies within the Navajo [M]:

  | Facies | Porosity | Permeability |
  | --- | --- | --- |
  | Dune | ~28% | 100 mD |
  | Interdune | ~18% | 29 mD |
  | Wavy algal-matted | 10% | **0.265 mD** |

  That is a **~400×** permeability spread inside one formation — the kind of difference you
  can walk past between two sectors of one canyon. No rock-type label can express it.
- **Indian Creek — Wingate Sandstone** (Late Triassic eolian), with **Cedar Mesa Sandstone**
  below. The homogeneous composition and cementation is exactly what produces the splitter
  joint systems, and the cementing agents binding the quartz grains — **calcite and clay** —
  are hydro-sensitive ([Sharp End / Creek Freak](https://stores.sharpendbooks.com/blog/snapshots-of-a-geological-moment-indian-creek-geology-excerpts-from-creek-freak/),
  [Wingate Sandstone](https://en.wikipedia.org/wiki/Wingate_Sandstone)). The 24-to-48-hour
  rule exists here for that reason.
- **Land-manager guidance is 24–48h after major rain or snow** [C] (BLM Red Rock), but
  community guidance increasingly says that is too short: 36 hours minimum, up to 3 days
  after heavy prolonged storms, and **5 days to a week** after the biggest ones. The
  conditional version is the useful one: ~24h needs air above ~70°F, a southerly sunny
  aspect, and only a couple of hours of rain; cold, shady or big-storm cases want 48–72h
  [C] ([Access Fund](https://www.accessfund.org/latest-news/open-gate-blog/how-to-assess-sandstone-after-rain-or-snow),
  [SNCC](https://www.southernnevadaclimbers.org/rain)).

**(d) Weakly cemented / structurally marginal**

- **Elbsandsteingebirge (Saxon Switzerland).** ~1,100 towers of mostly highly weathered,
  extremely soft sandstone. Climbing is **prohibited on rainy days and the following day** —
  a rule, not advice ([Bergzeit](https://www.bergzeit.de/magazin/klettern-saechsische-schweiz/),
  [Saxon Switzerland](https://en.wikipedia.org/wiki/Saxon_Switzerland)). Note the implied
  drying model: a flat 24h from the *end of rain*, regardless of amount.
- **Southern Sandstone, UK (Harrison's, High Rocks).** So soft that lead climbing is banned
  outright and everything is top-roped on static rope; **the rock has only a thin outer
  layer** and that rind is the entire load-bearing structure
  ([Southern Sandstone Code](http://www.southernsandstoneclimbs.co.uk/p/code-of-practice.html),
  [Wikipedia](https://en.wikipedia.org/wiki/Southern_Sandstone)). The extreme end of case
  hardening: protective while intact, catastrophic once wet.

### 4.2 Limestone and carbonates — the failure mode is different

Limestone's wet problem is usually **friction and seepage, not hold breakage**, which makes
it categorically unlike sandstone even though the current model treats both as "hours until
dry". Limestone is generally strong and less likely to break wet than sandstone, but is
widely reported as more slippery, and polished holds get dangerous
([Send Edition](https://sendedition.com/can-you-boulder-in-the-rain-or-when-the-rock-is-wet/)).
The exception is real though: soft and porous carbonates do break, and holds on both
limestone and sandstone are reported as notably breakable after rain
([8a.nu](https://www.8a.nu/news/limestone-and-sandstone-holds-get-really-breakable-after-rain)).

Sub-classes:

- **Dense micritic limestone** — low porosity, dries fast at the surface, seeps for days.
  Ceuse, Verdon, much of the Peak.
- **Dolomite / dolostone** — dolomitization involves a slight volume reduction that
  *creates* a porosity zone, so dolomite typically has **higher** porosity than the
  limestone it replaced, and is slightly harder (Mohs 3.5–4 vs 3)
  ([Geology.com](https://geology.com/rocks/dolomite.shtml),
  [Sandatlas](https://sandatlas.org/dolomite-rock/)). **Ten Sleep, WY is dolomite, not
  limestone**, though the climbing is hard to distinguish
  ([Nice Climbs](https://niceclimbs.com/areas/wyoming/ten-sleep/)); so is much of the
  Frankenjura. Pocketed dolomite holds standing water in pockets long after the face dries —
  a distinct drying behaviour worth its own class [I].
- **Tufa and travertine** — the outlier. At Kalymnos, the rock generally **dries fast**, but
  *if the winter has been rainy, tufas may be seeping*, and dripping stalactites in spring
  are **softer and more likely to break**
  ([Climb Kalymnos](https://climbkalymnos.com/climbing/)). So the same crag on the same day
  has a fast-drying vertical wall and a soft, seeping, breakable tufa line. Feature type
  beats rock type.
- **Chalk and low-density limestone** — up to **12% absorption** by ASTM C97 [S], the
  highest of any dimension stone. Different sport entirely.
- **Tropical karst (Thailand, Vietnam, Laos)** — rain is often not the binding constraint;
  **condensation is**. Warm moisture-laden air meeting cooler rock puts water on a wall that
  has seen no rain for a week. Dew points above ~60°F are reported as poor conditions
  ([PYB](https://info.pyb.co.uk/blog/interpreting-the-weather-forecast-for-rock-climbing)).
  A drying model driven only by precipitation will report these crags dry and be wrong.

### 4.3 Granite and the plutonic family — friction-limited, not integrity-limited

Granite is the safest family to climb wet: strong, barely porous, dries quickly, and the
practical cost is that shoe rubber does not stick
([Send Edition](https://sendedition.com/can-you-boulder-in-the-rain-or-when-the-rock-is-wet/)).
Porosity 0.5–1.5% [M]. But "granite" still hides real variation:

- **Fresh, fine-grained plutonic rock** (Yosemite granodiorite, Squamish, Cathedral Ledge)
  — near-zero effective porosity, surface-film drying only.
- **Coarse, biotite-rich, weathered granite** (Joshua Tree monzogranite, Vedauwoo's Sherman
  Granite, the Buttermilks' quartz monzonite). Biotite expands by absorbing water, freeing
  crystals and disaggregating the rock into **grus**; darker biotite-rich and coarser-grained
  granites weather to grus much more readily than light, fine-grained ones
  ([USGS / Huber](https://www.yosemite.ca.us/library/geologic_story_of_yosemite/final_evolution.html),
  [Geology is the Way](https://geologyistheway.com/the-origin-of-the-granite-landscape-of-joshua-tree-national-park/)).
  A grussy weathered rind holds water like a sponge over an impermeable core. **The
  weathered surface, not the granite, sets the drying time** [I].
- **Weathering pits and dishes** on low-angle granite hold standing water for days after the
  wall itself is dry ([SFSU / Yosemite weathering pits](https://diva.sfsu.edu/collections/pestrong/bundles/218788)).
  Slabs are the one granite case where drying time is not trivial.

### 4.4 Volcanic — the welding spectrum is the whole story

Currently the app has `basalt` and nothing else volcanic, and that is the biggest single gap.

- **Densely welded tuff — Smith Rock, OR.** Welded rhyolite ash/tuff, ~30 Ma, from the
  Crooked River caldera. Welded tuffs become hard rock because of the heat and compaction
  during emplacement, and Smith's is popular precisely because it **does not crumble easily**
  ([Tuff](https://en.wikipedia.org/wiki/Tuff),
  [geologictimepics](https://geologictimepics.com/2019/05/08/smith-rock-state-park-great-geology-at-the-edge-of-oregons-largest-caldera/)).
  Behaves close to granite.
- **Non-welded tuff — Bishop, CA.** The basal non-welded Bishop Tuff measures **38–60%
  porosity** at densities of 1.1–1.5 g/cm³, most samples 45–57% [M]
  ([Vadose Zone Journal](https://acsess.onlinelibrary.wiley.com/doi/10.2136/vzj2004.0602)).
  **That is more porous than any sandstone in this document.** The Happy and Sad Boulders and
  the Volcanic Tablelands are Bishop Tuff
  ([Rock+Run](https://rockrun.com/blogs/the-flash-rock-run-blog/bouldering-in-bishop-usa-destination-article));
  Owens River Gorge is the same unit, cut by the Owens River. Welding varies laterally and
  vertically within the sheet, and localisation of fracturing tracks the degree of welding
  [M]. So Bishop is a single town where the tuff spans most of the porosity range in the
  entire table above — and a fifteen-minute drive away, the Buttermilks are quartz monzonite
  at ~1%.
- **Basalt.** Dense columnar basalt (Trout Creek) is near-impermeable at 0.1–1.0% porosity.
  Basaltic **flow tops** commonly exceed a ~30% percolation threshold and reach **40–50% or
  higher** [M] ([arXiv](https://arxiv.org/pdf/2601.00710)). One word, two orders of magnitude.
- **Devils Tower is not basalt.** It is columnar-jointed porphyritic **phonolite porphyry**,
  Eocene, ~49 Ma ([USGS Bulletin 1021-I](https://pubs.usgs.gov/publication/b1021I),
  [Geosphere](https://pubs.geoscienceworld.org/gsa/geosphere/article/11/2/354/132219/Devils-Tower-Wyoming-USA-A-lava-coulee-emplaced)).
  Drying-wise it behaves like dense plutonic rock; the label is just wrong in most sources.

### 4.5 Metamorphic — foliation is the variable

- **Quartzite — Seneca Rocks, WV (Tuscarora Quartzite)**, described as very similar to the
  Gunks rock, and highly erosion-resistant because of quartzite's extreme hardness
  ([WV Explorer](https://wvexplorer.com/recreation/rock-climbing/west-virginia-crag/article-seneca-offers-climbers-a-taste-of-the-alps/),
  [Seneca Project](https://thesenecaproject.org/natural-history/geology/)). Effectively zero
  matrix porosity; all water lives in fractures and drains by gravity.
- **Schist and gneiss — Rumney, NH; Magic Wood; Ticino.** Rumney is schist with some granite,
  and its foliation — the tendency to fracture along parallel layers — is what makes the
  holds ([Mountain Project](https://www.mountainproject.com/area/105867829/rumney),
  [Rockclimbing.com, Geology for Climbers III](https://rockclimbing.com/Articles/Geology_for_Climbers_Part_III_Metamorphic_Rocks_1595.html)).
  Matrix porosity is low, but **those same foliation planes are drainage paths**, so water
  tracks along and emerges from them long after the face looks dry [I]. Metamorphic
  permeability is generally fracture- and foliation-controlled rather than matrix-controlled
  [M].
- **Marble** — up to 2% porosity, dries fast, polishes badly.

### 4.6 Conglomerate — two materials, one wall

Maple Canyon (UT), Margalef and Montsant (Spain), Riglos (Spain), Meteora (Greece). Rounded
cobbles — frequently quartzite, so near-zero porosity — set in a sandy or calcareous
**matrix** that is far more porous
([MojaGear](https://mojagear.com/climbing-destination-guide-maple-canyon-utah/),
[Climbing on Riglos](https://www.climbing.com/travel/hammer-of-the-gods-the-wild-multipitch-conglomerate-of-riglos-spain/)).
The cobbles are dry almost immediately; the matrix holding them in is not. The wet failure
mode is a **cobble pulling out of a softened matrix**, so **the drying time is the matrix's,
and it is invisible from the surface** [I]. Conglomerate needs its own class, keyed to
matrix type, and it should be conservative.

### 4.7 Worked regional set — Upper Midwest, and why guidebook labels mislead

Four areas that look like one region and are four different drying problems. Three of them
are commonly described as "sandstone" and only one is.

- **Red Wing, MN (He Mni Can / Barn Bluff) — Oneota Dolomite, not sandstone.** The bluff is
  Cambrian shale/siltstone/glauconitic sandstone → Jordan Sandstone → **Oneota Dolomite** cap,
  under ~35 ft of glacial sand, gravel and loess. The climbing is on the dolomite cap; the
  sandstone sits below the routes ([Wikipedia](https://en.wikipedia.org/wiki/Barn_Bluff_(Red_Wing,_Minnesota)),
  [MP](https://www.mountainproject.com/area/105812663/red-wing-aka-he-mni-can-barn-bluff)).
  Two things follow. The Oneota's defining feature is **highly variable chert** — nodules,
  lenses, thin irregular beds, tripolitic quartz between dolomite rhombs
  ([IGWS](https://legacy.igws.indiana.edu/compendium/oneota-dolomite)) — so it is a
  **two-material rock**: dolomite (Mohs 3.5–4, moderate porosity) studded with chert (Mohs 7,
  ~zero porosity). That is §4.6's conglomerate problem at nodule scale, and the interface is
  a plausible mechanism for the loose flakes and choss bands climbers report [I]. And the
  loess/gravel cap on steep slopes above the cliff line is a **catchment**: the face
  surface-dries in hours, the crag can stay damp much longer, worst at spring thaw [I].
  A fault visible from Hwy 61 is credited with making this Oneota better for climbing than
  the same unit elsewhere — within-formation variation from structure, not facies.
- **It is not Ten Sleep dolomite.** Same mineral name, different rock. Ten Sleep's Bighorn is
  massive, cliff-forming, mildly overhung, and defined by **pockets** (monos to jugs) with a
  surface soft enough that "comfortizing" edges is a local norm
  ([Common Climber](https://www.commonclimber.com/ten-sleep.html),
  [Access Fund](https://www.accessfund.org/latest-news/open-gate-blog/what-we-can-learn-from-the-ten-sleep-controversy)).
  Red Wing is bedded, cherty, and **crimpy** — "incredibly crimpy, super technical, very
  temperature dependent". Pockets hold standing water; crimps and edges shed it. Reasoning
  about one from the other gets the drying behaviour backwards.
- **Willow River State Park (Wisconsin, not MN) — dolomite, and the best documented seepage
  case found.** A steep sport amphitheatre in the Willow Falls gorge
  ([MP](https://www.mountainproject.com/area/105795588/willow-river-state-park)). Community
  guidance names **four** inputs: *"certain combinations of humidity, precipitation, snowmelt,
  and/or river levels can leave the cliff wet and unclimbable due to seep"*
  ([Forged Guides](https://www.climbforged.com/blog/forged-guides-and-the-midwest-what-safety-measures-are-essential-for-rock-climbing)).
  We model one of the four. Snowmelt is unmodelled and river level has no data source.
- **Taylors Falls / Interstate State Park, MN — basalt.** Midcontinent Rift flood basalt,
  ~1.1 Ga, eroded into the St. Croix Dalles with the famous glacial potholes
  ([MN DNR](https://files.dnr.state.mn.us/destinations/state_parks/interstate/interstate_geology.pdf)).
  Dense columnar type, so 0.1–1.0% porosity: hours, not days, and no integrity risk. The
  potholes and river-level base still pond water independently of the rock.
- **Robinson Park, Sandstone MN — Hinckley Sandstone, in a quarry.** Trad, sport, boulder,
  ice and mixed in one footprint; mostly 5.9–5.11b
  ([MP](https://www.mountainproject.com/area/105812719/robinson-park)). Three unusual
  properties. **Quarried faces have no case hardening** — fresh-cut rock has no protective
  rind, which removes the thin-shell failure mode of §4.1(d) but also removes the armour [I].
  Hinckley was **selected commercially as a structural building stone** for its strength
  ([Star Tribune](https://www.startribune.com/curious-minnesota-sandstone-history-quarry-banning-state-park/601862816)),
  a strong signal it sits near the well-lithified end rather than the friable one [I] — no
  porosity or absorption figures were found for it. And the **ice park is farmed**: four
  managed areas are deliberately watered all winter ([MCA](https://www.mnclimbers.org/sandstone-ice-park)),
  so those walls take annual full saturation plus freeze–thaw by design, and in shoulder
  season can be soaking for reasons no forecast can see.
- **Horseshoe Canyon Ranch, AR** — Pennsylvanian Hale and Bloyd formations, the only genuine
  sandstone of the set ([MP](https://www.mountainproject.com/area/105903004/horseshoe-canyon-ranch)).
  Mid-spectrum Ozark sandstone: 24–48h after moderate rain, longer for prolonged storms, and
  the humid Ozark summer suppresses the stage-1 evaporation rate that does most of the work.

**Three of these have a wetness input outside the weather model entirely** — Willow River's
river level, Robinson's farmed ice, Red Wing's loess cap. That is a stronger argument for a
per-location flag than any rock-type refinement.

### 4.8 Further areas, and the cases that break the family rules

- **Mount Arapiles vs the Grampians — the cleanest natural experiment available.** Same
  original sediment; a volcanic incursion ~400 Ma contact-metamorphosed the Arapiles rock to
  **quartzite** while the Grampians stayed **sandstone**, "often of a softer variety"
  ([UKC](https://www.ukclimbing.com/articles/destinations/mount_arapiles_-_australia-6830),
  [Wikipedia](https://en.wikipedia.org/wiki/Mount_Arapiles)). Adjacent areas, one protolith,
  opposite wet-weather rules. Nothing about the sediment predicted it; the thermal history did.
- **Slate — Llanberis / Dinorwig — the fast-drying champion.** The community states the
  mechanism itself: *"the layering of minerals means that water can't easily penetrate...
  slate doesn't have pore spaces like sandstone does. So in the absence of crack systems
  slate dries quickly"* ([UKC geology series](https://www.ukclimbing.com/articles/series/the_geology_of_britain/the_geology_of_britain_-_a_climbers_perspective_part_3_-_metamorphic_rocks-11874)).
  Note the qualifier — fracture drainage is the exception, exactly as §4.5. The limiter is
  friction: slate slabs are notoriously frictionless with no protruding crystals.
- **Hueco Tanks — syenite porphyry, and it breaks the igneous rule.** Described as **highly
  porous**, collecting rainwater "like stony sponges", and the huecos themselves **hold water
  for several days to several months** depending on pool size and shelter
  ([TPW magazine](https://tpwmagazine.com/archive/2004/sept/ed_4/),
  [Texas Beyond History](https://www.texasbeyondhistory.net/hueco/setting.html)). Climbers are
  warned the syenite "becomes fragile with extra humidity from rain". An igneous rock with a
  real wet-weather ethic — do not assume plutonic means climbable wet.
- **Eldorado Canyon / Flatirons — Fountain Formation arkose.** Coarse feldspar-rich
  conglomeratic sandstone ([Wikipedia](https://en.wikipedia.org/wiki/Fountain_Formation)).
  Guide-service framing is precise and matches the taxonomy: *"harder and less fragile than
  many desert sandstones, but wet stone is slick, **flakes can seep**"*
  ([Skyward](https://www.skywardmountaineering.com/rock-climbing/boulder-colorado)). A
  sandstone whose limiter is friction and seepage, not structure.
- **Devil's Lake, WI — Baraboo Quartzite.** ~1.6 Ga, "flint-hard", glassy, and it **dries
  quickly** — but its defining property to climbers is an "almost complete lack of friction"
  ([Climbing](https://www.climbing.com/travel/rock-climbing-devils-lake-wisconsin/),
  [KAYA](https://blog.kayaclimb.com/devils-lake-bouldering-guide-how-when-and-where/)).
  Friction-limited, and temperature/humidity matter more than hours-since-rain.
- **Rifle Mountain Park — sector-level, month-scale seepage.** *"Oftentimes, the Wasteland and
  the left side of the Project Wall do not dry out until June"*
  ([ClimbingHouse](https://climbinghouse.com/rifle-mountain-park-colorado-guide/)). Spring
  runoff is the driver, and the same seepage is what farms the canyon's winter ice. No
  rock-type constant can produce a per-sector June date.
- **Squamish — low-porosity granite that still dries slowly.** Exposed sun-and-wind areas can
  dry in minutes; shaded rainforest boulders take a day or more in April even in good weather
  ([Mountain Life](https://www.mountainlifemedia.ca/2018/11/where-to-climb-when-its-raining-in-squamish/)).
  Moss, seepage and shade dominate a rock with ~1% porosity.
- **Rocklands, South Africa — Table Mountain Sandstone, and a dissenting local norm.** Coarse
  large-grained sandstone; the standard "never climb wet sandstone" warning applies, yet
  *"it seems common in Rocklands to climb after rain, which is definitely not the case at
  sandstone climbing areas in the U.S."* ([MadBoulder](https://www.madboulder.org/rocklands)).
  **Resolved in §4.12: the rock genuinely tolerates it** — Table Mountain Sandstone is partially
  metamorphosed to a hard quartzitic sandstone, so it belongs with the arenites, not the eolian
  class the US waiting periods were written for.
- **Blue Mountains, AU** — sandstone, fragile and more so after rain; local guidance is **at
  least 24h, more for heavy rain**, and the softness drives a glue-in bolting norm
  ([theCrag](https://www.thecrag.com/en/climbing/australia/blue-mountains)).
- **Chattanooga / TAG sandstone (Stone Fort, Rocktown, LRC)** — Pennsylvanian sandstone with
  an unusually explicit community ethic: *"Never climb on wet sandstone — it damages the rock
  permanently by pulling off crystals... If it rained in the last 24 to 48 hours, stick to the
  gym. This is not a suggestion"* ([NoogaFinder](https://noogafinder.com/blog/rock-climbing-chattanooga-guide)).
- **Poke-O-Moonshine, Adirondacks — anorthosite.** Glacially polished, ~1000 ft, plagioclase-
  dominated plutonic rock with gneiss interfingering and an unusual chert-like rock welded into
  it ([theCrag](https://www.thecrag.com/en/climbing/united-states/adirondacks/poke-o-moonshine),
  [SummitPost](https://www.summitpost.org/poke-o-moonshine/150972)). Behaves as dense plutonic
  rock for drying; glacial polish makes it friction-limited on the slabs.

---

### 4.9 US focus — Minnesota, Wisconsin, South Dakota, Wyoming, Colorado

**Minnesota alone spans six rock families**, which is the clearest possible argument against
any regional or state-level default: dolomite (Red Wing), basalt (Taylors Falls), sandstone
(Robinson Park / Banning), **rhyolite** (North Shore), **anorthosite** (Carlton Peak) and
**quartzite** (Blue Mounds). Nothing about "a Minnesota crag" predicts drying behaviour.

- **North Shore — Palisade Head and Shovel Point (Tettegouche SP).** Midcontinent Rift
  **rhyolite**, radiometrically dated 1,096.6 Ma, capping softer basalt
  ([MN Earth Science Guy](https://mnearthscienceguy.blogspot.com/2012/07/minnesota-geology-monday-palisade-head.html),
  [Grokipedia](https://grokipedia.com/page/Palisade_Head)). Dense fine-grained volcanic rock:
  low porosity, fast-drying, friction-limited. The real conditions inputs are **Lake Superior
  spray and fog**, not rainfall — these are lake cliffs climbed on rappel. A **strict no-chalk
  ethic** applies and a free state-park permit is required
  ([MP](https://www.mountainproject.com/area/105812783/tettegouche-sp-north-shore)).
- **Carlton Peak — anorthosite**, described as abrasive; anorthosite blocks that punched
  through the rift magma, the surrounding melt becoming diabase
  ([SummitPost](https://www.summitpost.org/carlton-peak/627635),
  [Wikipedia](https://en.wikipedia.org/wiki/Carlton_Peak)). Same family as Poke-O-Moonshine
  (§4.8): dense plutonic, drying-trivial, friction-led.
- **Blue Mounds SP — Sioux Quartzite** escarpment on the prairie, Precambrian, pink
  ([MN DNR](https://www.dnr.state.mn.us/state_parks/blue_mounds/geology_details.html)).
  Near-zero matrix porosity; fracture drainage only.

**South Dakota — two areas, two completely different problems.**

- **The Needles, Custer State Park — Harney Peak Granite**, ~1.8 Ga. The key fact is grain
  size, and it varies **within the same batholith**: fine-grained at Mount Rushmore, coarse
  with abundant **pegmatite crystals** at the Needles, and those crystals *are* the holds —
  climbers pinch, crimp and jug individual feldspar and quartz crystals
  ([LiveAbout](https://www.liveabout.com/facts-about-the-needles-756164)). Drying is trivial
  (granite), but the wet-failure vector is unusual: when the hold is a single crystal, hold
  loss is crystal detachment rather than surface spalling [I].
- **Spearfish Canyon — Pahasapa Limestone** (Mississippian, equivalent to the Madison),
  475–600 ft of capstone, ~600 routes over ~19 crags. Texture is the interesting part:
  **finely crystalline beds interspersed by chert lenses and solution breccias**, giving the
  cavernous, pocketed character
  ([Grokipedia](https://grokipedia.com/page/spearfish_canyon),
  [Climbing](https://www.climbing.com/places/spearfish-south-dakota-climbing-destination-guide/)).
  Community conditions note: **spring through June can be wet**, though usually partly
  climbable. Rock quality improves further up the canyon — a within-crag gradient again.
- **Chert in carbonate is now a repeated pattern, not a one-off.** Oneota at Red Wing (§4.7)
  and Pahasapa here both interleave near-zero-porosity chert with moderately porous carbonate.
  Two materials, different absorption and thermal response, and the interface is where holds
  loosen [I]. Worth treating as a carbonate sub-class rather than an oddity.

**Wyoming.**

- **Vedauwoo — Sherman Granite**, ~1.4 Ga, coarse-grained and famously sharp: alkali feldspar
  crystals 1–2 cm across with "scalpel-like edges", and the landscape shaped by differential
  weathering along ENE joints
  ([Geology of Wyoming](https://www.geowyo.com/vedauwoo.html),
  [turnstone.ca](https://turnstone.ca/vedauwoo.htm)). Offwidth country. Drying is granite-fast;
  the coarse texture means skin, not conditions, is the limiter.
- **Wild Iris — pocketed dolomite at ~2,600 m.** Season **begins when the snow melts (early
  June)** and runs to late autumn ([theCrag](https://www.thecrag.com/en/climbing/united-states/wyoming-wild-iris)).
  **Altitude gates the season here, not rainfall** — a conditions model that answers "dry" in
  April is answering the wrong question.
- **Sinks Canyon breaks the one-location-one-rock-type model outright.** *"The rock type
  changes from sandstone to limestone to granite the higher you go"*
  ([Outpost Wilderness](https://outpostwilderness.com/sinks-canyon-wild-iris-climbing-your-guide-to-limestone-more-in-lander/)).
  One canyon, one lat/lon, three drying classes stacked vertically. Our schema cannot express
  it, and averaging them would be wrong in both directions.

**Colorado.**

- **Garden of the Gods names a mechanism our model does not have.** Park guidance: sandstone
  *"absorbs water like a sponge, and the rock **swells and decompresses as it dries**. During
  this process, it is extremely fragile"*
  ([gardenofthegodscolorado.com](https://gardenofthegodscolorado.com/how-to-climb-in-garden-of-the-gods/),
  [City of Colorado Springs](https://coloradosprings.gov/rock-climbing)). If that is right, the
  **drying transient is its own hazard state** rather than a monotonic improvement from wet to
  dry — which sits awkwardly against §2.4's critical-saturation band and against the score's
  smooth linear ramp. Flagged as land-manager guidance [C], **not lab-verified**; worth
  checking against the swelling-clay literature before it influences anything.
  Operational data point: a local guide service reschedules for **at least 24h after
  significant precipitation, and 2–3 days after snow, cloud or persistent rain**. All chalk and
  substitutes are banned and a free annual permit is mandatory.
- **Penitente Canyon — Fish Canyon Tuff**, welded, from the La Garita Caldera ~28 Ma
  ([StephAbegg](https://stephabegg.com/trip-reports/colorado/penitente/),
  [MP](https://www.mountainproject.com/area/105744316/penitente-canyon)). Described as
  **"bulletproof rock with great friction"**, textured by quartz and sanidine crystals, with
  hueco-ridden walls. A second welded-tuff datapoint alongside Smith Rock, and it confirms the
  §4.4 welding spectrum: densely welded tuff behaves near-granitic, non-welded Bishop Tuff does
  not. The huecos hold water independently, as at Hueco Tanks.
- **Shelf Road is the aspect-planning crag.** 1,000+ limestone sport routes, ~250 sunny days,
  winter highs in the 40s–50s °F, and the explicit local strategy is **aspect rotation**: climb
  the sun-facing walls in winter and the shaded ones in summer
  ([ClimbingHouse](https://climbinghouse.com/shelf-road-rock-guide/),
  [MP](https://www.mountainproject.com/area/105744267/shelf-road)). The unimplemented
  aspect/solar term is not a refinement here — it *is* the product. Note also that trad is
  considered dangerous because the limestone is brittle, so "dry" and "safe" are not the same
  claim.
- **Clear Creek Canyon — migmatitic biotite gneiss and gneissic granite**, locally "sandy
  granite", distinct from Boulder Canyon's granite sweeps
  ([MP](https://www.mountainproject.com/area/105744243/clear-creek-canyon)). Metamorphic
  drainage behaviour per §4.5: low matrix porosity, water tracking along foliation and folds.

**One cross-cutting finding: access rules are conditions-adjacent, and we model none of them.**
Garden of the Gods and the North Shore ban chalk; Palisade Head needs a permit and rappel
access; Willow River closes on Saturdays and restricts Fri/Sun (§4.7). A conditions score that
says "excellent" for a day the crag is closed, or for a climber who cannot use chalk on a
humid day, is answering a narrower question than the user asked [I].
### 4.10 Further US areas, and two that break the model in new ways

- **Fisher Towers, UT — the climbing surface is not the rock.** The towers are hard Cutler
  sandstone capped by Moenkopi, **draped in mud curtains**; the rock is "actually very hard"
  but what you climb is a thick mud layer, giving mud chimneys, bolts protruding inches from
  erosion, and fixed slings drilled through rock
  ([MP](https://www.mountainproject.com/area/105716787/fisher-towers),
  [Wikipedia](https://en.wikipedia.org/wiki/Fisher_Towers)). A drying model keyed to rock type
  is meaningless here — dried mud rehydrates on a completely different curve from the sandstone
  under it [I]. The most extreme "rock type is the wrong variable" case in this document.
- **Pinnacles NP, CA — volcanic breccia**, and the NPS says plainly it is **"very weak compared
  to the granite and basalt of many climbing areas"**, brittle, loose on the West Side, with
  many old or incorrectly installed bolts ([NPS](https://www.nps.gov/pinn/planyourvisit/climbadv.htm)).
  A distinct class: angular fragments in a finer matrix, so like conglomerate the matrix governs.
- **Frenchman Coulee / Vantage, WA** — columnar Columbia River basalt carved by the Ice Age
  floods, 600+ routes, and explicitly **"one of Washington's great winter crags"**
  ([MP](https://www.mountainproject.com/area/105792231/frenchman-coulee-vantage),
  [WCC](https://washingtonclimbers.org/index.php/2015/10/13/vantage/)). Dense columnar basalt
  as the wet-season option, exactly as §4.4 predicts.
- **Big vs Little Cottonwood, UT — adjacent canyons, different rock.** Big Cottonwood is
  **quartzite**, described as slippery and hard; Little Cottonwood is **quartz monzonite**
  ([MP BCC](https://www.mountainproject.com/area/105739280/big-cottonwood-canyon),
  [Visit Utah](https://www.visitutah.com/articles/where-to-climb-near-salt-lake)). Both dry
  fast; both are friction-limited; they are not interchangeable.
- **Cochise Stronghold, AZ — "plated granite."** The plates and chickenheads are the holds
  ([Brice Pollock](https://www.bricepollock.com/wilderness-granite-plates-in-west-cochise-stronghold/)),
  the same structural situation as the Needles' crystals: hold loss is a discrete feature
  detaching, not surface spalling. **Queen Creek / Oak Flat** nearby is pocketed **volcanic
  tuff** — a third welded-tuff datapoint after Smith Rock and Penitente
  ([57hours](https://57hours.com/best-of/rock-climbing-arizona/)).
- **Enchanted Rock, TX — an exfoliation dome**, emplaced 1,082 Ma, peeling in concentric
  sheets like an onion as confining pressure is released
  ([BEG, UT Austin](https://www.beg.utexas.edu/texas-through-time/enchanted-rock.html),
  [Wikipedia](https://en.wikipedia.org/wiki/Enchanted_Rock)). Water gets *behind* exfoliation
  sheets, so the drying-relevant volume is not the surface [I]. Granite domes generally
  (City of Rocks, Wichitas, Stone Mountain) share this.
- **Cathedral / Whitehorse, NH — humidity alone produces rain-equivalent conditions.** On
  New England granite slabs, climbers report *"the biggest problem is heat and humidity; the
  effect is very similar to climbing in the rain here... slick and slippery"*
  ([UKC](https://www.ukclimbing.com/forums/destinations/whitehorsecathedral_ledges_new_hampshire-413031)).
  Low-porosity rock, zero rainfall, unclimbable conditions — a precipitation-driven score
  cannot see this at all.
- **Carderock / Great Falls, MD-VA — mica schist**, "very slippery and not conducive to placing
  solid trad gear" ([Potomac Mountain Club](https://potomacmountainclub.org/climbing-crags-beta/virginia-crags/great-falls-national-park-rocktr/)).
  River-level dependent, and **NOAA publishes Potomac gauges**
  ([water.noaa.gov](https://water.noaa.gov/gauges/gtnd2)) — a real data source for the
  river-level input Willow River (§4.7) needs.
- **NJ Palisades — diabase sill**, feldspar plus augite, salt-and-pepper, ~500 ft above the
  Hudson ([NJGS](https://dep.nj.gov/wp-content/uploads/njgws/reports/ofreport/ofr92-1.pdf)).
  Dense intrusive: 0.1–0.5% porosity per §3.
- **Obed and Foster Falls, TN — Pennsylvanian sandstone**, hard and high quality
  ([NPS Geodiversity Atlas](https://www.nps.gov/articles/nps-geodiversity-atlas-obed-wild-and-scenic-river-tennessee.htm)).
  Community summary is precisely the shape this document keeps finding: *"can take a while to
  dry after a storm, but the large overhanging roofs at Foster's keep some routes dry even in
  the pouring rain."* Geometry beats rock type.
- **Turkey Rocks, South Platte, CO** — bomber Pikes Peak granite, and the feature climbers
  name first is a **"friendly southerly aspect"**
  ([MP](https://www.mountainproject.com/area/105797943/turkey-rocks)). Aspect again.
- **Mount Charleston, NV** — limestone, and the high-altitude summer counterpart to Red Rock.

**The Red River Gorge shows that per-crag conditions metadata already exists commercially.**
Guidebooks for the Red carry **per-crag icons for sun exposure and rain protection** alongside
driving and walking times ([Wolverine Publishing](https://www.wolverinepublishing.com/shop-all-guidebooks/p/red-river-gorge-select)).
And the community distinguishes crags at a fine grain: Bob Marley cave is *"surely one of the
driest locations in the Red,"* with a breeze that keeps condensation away **"when other crags
are beaded with water"** ([MP](https://www.mountainproject.com/area/106091151/bob-marley)).
Two things follow. Condensation is crag-specific within one gorge on one day, so it cannot be
derived from a grid-cell forecast. And the `seepage_prone` / rain-shelter flag proposed in §7
is not a novel schema invention — **guidebook publishers already ship that field.**
### 4.11 European limestone — and a morphological seepage predictor

- **Frankenjura, Germany — limestone below, dolomite above.** Laminated lime structures in the
  lower layers, magnesium-enriched dolomite above
  ([SummitPost](https://www.summitpost.org/frankenjura/311566)). Three findings, all community:
  **dry rock can be found in almost any weather**, and there is a known list of crags that stay
  dry through long rainy spells and "almost never get wet"; in August **the humidity makes you
  grease straight off the holds**; and the shaded forest walls are the hot-humid-day answer
  ([UKC](https://www.ukclimbing.com/articles/destinations/frankenjura_-_limestone_in_the_limelight-2742),
  [MP](https://www.mountainproject.com/area/106172652/frankenjura)). Mountain Project carries a
  curated sub-area literally named **["Sheltered and also fast drying"](https://www.mountainproject.com/area/111969104/sheltered-and-also-fast-drying)** —
  a third instance, after the SWCW wiki (§8.1) and the RRG guidebook icons (§4.10), of the
  community maintaining structured drying metadata. And the August greasing is the **third
  independent report** of humidity alone ruining conditions, after Cathedral/Whitehorse (§4.10)
  and the chalk mechanism (§5.1).
- **Céüse, France — the catchment argument made literal.** ~2,100 m, season late spring to
  autumn, and the warning is explicit: do not go too early after a heavy-snow winter, because
  **the area above the crag is a ski area** and seepage plus cornice danger follow
  ([UKC](https://www.ukclimbing.com/articles/destinations/ceuse_-_summer_sport_climbing_in_france-118),
  [climbingaway](https://climbingaway.fr/en/climbing-areas/ceuse)). The thing draining onto the
  wall is a snowfield. Alongside Willow River's river level (§4.7) and Wild Iris's snowmelt
  (§4.9), that is three crags whose limiting input is neither rain nor rock.
- **Rodellar, Spain — tufa-lined, and it seeps.** Too hot in summer, and *"the crag is tufa
  lined and consequently suffers seepage after extended periods of rain,"* with high danger of
  seeping tufas in spring ([Planetmountain](https://www.planetmountain.com/english/Rock/crags/falesia.html?idfalesia=90)).
- **Chulilla, Spain — the opposite.** One of the warmest and driest European winter
  destinations; September and October are the wettest months but **the rock dries very quickly**
  ([theCrag](https://www.thecrag.com/en/climbing/spain/chulilla),
  [UKC](https://www.ukclimbing.com/articles/destinations/chulilla-6242)).
- **Siurana** has few tufas — L'Olla is called an anomaly — and correspondingly is not
  described as a seepage crag ([UKC](https://www.ukclimbing.com/articles/destinations/siurana_revisited-3709)).
- **Arco, Italy** — 5,000+ routes on high-quality limestone north of Lake Garda, climbable most
  of the year and the standard fallback when the Dolomites are wet
  ([Climb Europe](https://climb-europe.com/pages/rock-climbing-italy-arco)).

**The pattern across all of them gives a seepage predictor that needs no local knowledge: a
tufa is a fossil seep.** A tufa or stalactite is a mineral deposit *formed by flowing water*,
so its presence is direct morphological evidence that water drains down that line. The
correlation holds everywhere this document has looked — Rodellar is tufa-lined and seeps,
Kalymnos's tufas seep after a wet winter while the rest of the crag dries fast (§4.2), Siurana
has almost no tufas and no seepage reputation, Chulilla has none and dries very quickly.

That matters because it is **inferable from a guidebook photograph or a route description**,
unlike the catchment above a cliff. If the app ever asks a user to characterise a crag, "does
it have tufas / stalactites?" is a far better seepage question than "is it seepage-prone?" —
it is observable, it is in every guidebook, and it points at the mechanism rather than the
symptom [I].

---

### 4.12 Rest of world — and the Rocklands question resolved

**Rocklands: the dissenting local norm was right, and §4.8 can be closed.** §4.8 recorded that
climbers at Rocklands commonly climb after rain, "which is definitely not the case at sandstone
climbing areas in the U.S.", and left open whether the rock tolerates it or the ethic is simply
looser. The answer is the rock. Table Mountain Sandstone was **compressed and partially
metamorphosed into very hard quartzitic sandstone**
([Wikipedia](https://en.wikipedia.org/wiki/Table_Mountain_Sandstone)). That places it at the
quartz-arenite/quartzite end of §4.1(a) — the class with **~0% measured strength loss when wet**
— not with the calcite-and-clay-cemented eolian sandstones the US 24–48 h rules were written
for. The local norm is defensible, and the general lesson is the one this document keeps
returning to: **"sandstone" is not a wet-weather class**, and exporting a waiting period across
formations is how a correct rule becomes a wrong one.

- **Castle Hill / Kura Tāwhiti, NZ — very soft Oligocene limestone**, weather-sculptured, and
  **prone to polishing quickly** ([NZ Geographic](https://www.nzgeo.com/stories/the-rocks-of-castle-hill/),
  [theCrag](https://www.thecrag.com/en/climbing/new-zealand/castle-hill-basin)). The polish
  mechanism from §1 — calcite at Mohs 3 under traffic — at its most extreme.
- **Rio de Janeiro — granite and gneiss ending in the ocean.** Pedra da Gávea, 844 m, tropical
  savanna climate. The conditions rule is not about drying: afternoon thunderstorms and heat
  make **early starts essential to avoid thunderstorms and slick rock**
  ([SummitPost](https://www.summitpost.org/pedra-da-g-vea/150534),
  [climbgrades](https://www.climbgrades.com/seasons/brazil)). Low-porosity rock, and the
  limiting variables are convective-storm timing and humidity — a *time-of-day* answer, which
  a daily score cannot express.
- **Ogawayama, Japan — granite slabs at ~1,600 m.** Season July to mid-October, cold from
  mid-October to May, and **autumn is markedly drier** than spring
  ([UKC](https://www.ukclimbing.com/articles/destinations/ogawayama_bouldering-264),
  [theCrag](https://www.thecrag.com/en/climbing/japan/ogawayama)). Altitude gates the season,
  as at Wild Iris (§4.9) and Céüse (§4.11).
- **Tonsai / Railay, Thailand — condensation without rain.** Peak season December–February when
  humidity is lowest; monsoon roughly June–September leaves routes **seeping for days**. The
  finding that matters: **in La Niña conditions condensation seeps out of tufa streaks even when
  it is not raining**, and standard chalk **turns to sludge** in the humidity
  ([Basecamp Tonsai](https://basecamptonsai.substack.com/p/when-is-the-best-time-of-year-for),
  [Just Climb Thailand](https://justclimbthailand.com/rock-climbing-thailand-best-season/)).
  That single sentence fuses three separate threads of this research: §2.5's condensation-as-
  liquid-water mechanism, §4.11's tufa-as-fossil-seep predictor, and §5.1's hygroscopic chalk.
  It is also the fourth independent report of humidity alone deciding conditions.

**Alpine rock has a different cement, and it is melting.** In high mountains the ice filling
cracks *acts as cement* holding the rock mass together, so permafrost degradation is
directly a strength problem — the same framing as §1's cement argument, with ice in the role of
silica or calcite. Published anchors worth recording: the **zero-degree isotherm** normally sits
at **3,500–4,000 m** in an Alpine summer and reached **5,500–5,800 m in July 2026**; permafrost
temperatures are rising at nearly **+0.1 °C per year**; and rockfall activity in freshly
deglaciated rockwall sections has increased by **an order of magnitude**
([Gruber & Haeberli, JGR Earth Surface](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2006JF000547),
[ESP 2026](https://onlinelibrary.wiley.com/doi/10.1002/esp.70063),
[ESurf — temperature-dependent stability model](https://esurf.copernicus.org/articles/9/1125/2021/)).
Thaw by **advection along fractures** goes deeper and faster than conduction, which is why a
single hot spell can destabilise large volumes.

For an alpine location the useful conditions output is therefore neither a drying time nor a
friction score but a **freeze-line altitude relative to the route**, plus the overnight-refreeze
call from §5.2. Both are computable from data already fetched. Out of scope for the current
product, but it confirms §5.2's conclusion that "conditions" is at least three different models.

---

### 4.13 Pacific Northwest and the Sierra — two limiters that are not weather

- **Darrington, WA — vegetation is the drying limiter on granite.** The area is *"heavily
  vegetated with trees growing even on boulders or granite domes,"* and many climbs *"may remain
  wet for a day or two after a prolonged wet period"*
  ([WCC](https://washingtonclimbers.org/index.php/2015/10/13/darrington/),
  [MP](https://www.mountainproject.com/area/106006698/darrington)). Granite at ~1% porosity
  taking two days to dry is not the rock — it is canopy drip, moss and shade, the same mechanism
  as Squamish (§4.8) and the lichen finding in §5.1. **In a temperate rainforest, the biology
  sets the drying time and the lithology is nearly irrelevant** [I].
- **Index, WA** — Yosemite-like granite above the Skykomish, and notable for the *opposite*
  reason to most entries here: being west of the Cascade crest keeps it **cool when the east
  side is over 90 °F** ([AAI](https://www.alpineinstitute.com/programs/guided-rock-climbing-at-index-wa/)).
  A rain-shadow boundary can put two crags an hour apart in different seasons.
- **Tuolumne Meadows, CA — the limiter is a road.** The season runs roughly June to October
  because **Tioga Pass (Highway 120) closes on the first snow, usually November, and reopens
  late May to June depending on the snow year**
  ([MP](https://www.mountainproject.com/area/105833384/tuolumne-meadows),
  [Planetmountain](https://www.planetmountain.com/en/crags/tuolumne-meadows-yosemite.html)).

**That last one is a limiter class this document has not had: access infrastructure.** The rock
can be bone dry and the answer still "no", because the road is shut. It is not weather, not rock,
and not seepage — and unlike the ski-field above Céüse (§4.11) or the snowmelt at Wild Iris
(§4.9), it does not even correlate with conditions at the crag once the road is open.

Collected across the document, the app's honest answer now depends on at least **five things it
does not model**: seepage catchment (§2.3), access rules and closures (§4.9), river level and
farmed ice (§4.7), road and pass status (here), and fixed-gear condition (§5.3). Each is
per-location, none is derivable from a forecast, and all of them can turn a green score into a
wasted drive. That is the strongest argument in this research for the per-location notes field
proposed in §7 — not as a refinement of the score, but as the only place the app can be honest
about what it cannot see.

---

## 5. Non-rock modifiers that frequently dominate the rock type

Ranked by how often they decide the answer, most-often first:

1. **Seepage / catchment above the crag.** Discussed in §2.3. Location-level, not rock-level.
2. **Wall angle and shelter.** Steep rock takes less rain in the first place. This is a
   different mechanism from our current `cliffAngle` drying modifier, which models runoff.
   The Red's overhangs and Kalymnos's Sikati Cave are climbable *during* rain.
3. **Storm duration versus storm total** (§2.1). Surface rind versus 2–3 inches deep.
4. **Aspect and solar exposure.** Named repeatedly in the community guidance as the
   difference between 24h and 72h on the same rock [C]. Specced in our docs, never
   implemented.
5. **Wind and relative humidity** — these set the stage-1 rate directly.
6. **Dew point.** Condensation can re-wet a wall that never saw rain, and above ~60°F dew
   point conditions are reported as poor regardless of precipitation [C].
7. **Air temperature and season.** Freeze–thaw, and specifically *thawing* sandstone, is
   called out as a distinct hazard at the Red — the rock is wet from the inside as it thaws
   ([RRG Tourism](https://redrivergorgetourism.com/the-science-of-sandstone-how-winter-shapes-the-red-river-gorge/)).
8. **Tree cover and drip lines.**
9. **Case hardening / desert varnish.** The outer shell hardens as silica, iron and calcite
   precipitate at the surface, temporarily limiting weathering
   ([Case hardening of rocks](https://en.wikipedia.org/wiki/Case_hardening_of_rocks),
   [NPS](https://www.nps.gov/articles/desertvarnish.htm)). Protective while dry — and the
   part that fails when wet, because it is a thin stiff shell over softer rock.
10. **Elevation** — already stored; affects temperature and therefore drying rate.

---

### 5.1 The modifiers, quantified — and one that undercuts the score's temperature term

Fourth-pass research put numbers on several of the modifiers above, and turned up three the
list did not have at all.

**Rock temperature is not air temperature, and the gap is large.** Long-term infrared
thermography of a rock face measured surface temperatures from **−11.7 °C to +40.2 °C**, with
change rates up to **+20 °C/hour** heating and **−13.7 °C/hour** cooling, and found the cliff
**colder than air in winter and hotter in summer, with the extremes not aligned in time or in
magnitude** [M]
([JGR Earth Surface](https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2025JF008816),
[solar-induced thermal stress](https://pages.charlotte.edu/eric-delmelle/wp-content/uploads/sites/150/2012/12/Deciphering-the-role-of-solar-induced-thermal-stresses-in-rock-weathering.pdf)).
South-facing surfaces warmed ~1.3 °C in 15 minutes under changing cloud. Everything the score
does with `temp_c` — the temperature component, the drying rate, and any future condensation
check — is using a proxy that is demonstrably not the quantity of interest.

**The score's optimal temperature band may be modelling comfort rather than friction.**
Climbing rubber reaches maximum friction just below a molecular transition at roughly
**0–5 °C (32–41 °F)**; below that it is too hard to conform to the rock, above it too soft and
it deforms and slips [C]
([Climbing](https://www.climbing.com/skills/science-friction-the-truth-behind-perfect-climbing-conditions/),
[Tribonet](https://www.tribonet.org/news/friction-the-key-to-rock-climbing/)). Our temperature
component awards full marks over **10–22 °C** and scales *down* above 22 °C only. Those are
different claims: 10–22 °C is a pleasant day, 0–5 °C is when the shoe works best. This is a
tension to resolve deliberately, not silently — a "conditions" score for climbing performance
and a "comfort" score are not the same product, and the current curve is the latter wearing
the former's name.

**Chalk is hygroscopic, so humidity degrades it before it touches skin.** Climbing chalk is
magnesium carbonate, which draws water from the air; in humid conditions the chalk in the bag
absorbs moisture before use, and builds up unevenly on holds mixed with skin oils to give a
polished, greasy feel [C]
([FrictionLabs](https://shop.frictionlabs.com/blogs/climb-your-impossible/the-ultimate-climber-s-guide-for-using-chalk-in-any-condition)).
Humidity therefore has a friction cost that is independent of both rainfall and rock moisture.
Note the interaction with §4.9's access rules: at a chalk-banned crag (Garden of the Gods, the
MN North Shore) a humid day cannot be mitigated at all.

**Lichen is a moisture-tracking friction variable.** Wet lichen "turns on" and grows; dry
lichen goes brittle and dormant [C]
([MDC](https://mdc.mo.gov/discover-nature/field-guide/stippleback-lichens-dermatocarpon-lichens)).
Crustose lichen is embedded in the rock and cannot be removed without removing rock
([UKC](https://www.ukclimbing.com/forums/rock_talk/cleaning_moss_and_lichen_off_routes-599675)),
so on shaded, damp, north-facing or seepy faces it is a permanent modifier rather than a
transient one, and it worsens in exactly the conditions the drying model already flags.

**Cold-air pooling breaks grid-cell temperature in canyons.** Radiative cooling drives dense
air downslope into valleys and basins; measured spatial temperature variability exceeds
**15 °C at 15-minute intervals**, with near-surface lapse rates steeper than the free-air rate
[M] ([cold-air pooling](https://pmc.ncbi.nlm.nih.gov/articles/PMC10985370/),
[UBC ATSC](https://www.eoas.ubc.ca/courses/atsc113/snow/met_concepts/06-met_concepts/06a-cold-air-pooling/)).
Most crags in this document sit in canyons — Rifle, Clear Creek, Sinks, Spearfish, Boulder,
Willow River, Taylors Falls, Frenchman Coulee — so this is the common case, not the exception.

**Freeze–thaw is a countable daily cycle, not a season.** Ice wedging does its damage where
nights fall below freezing and days rise above, so the damaging quantity is the **number of
zero-crossings**, which is directly computable from the hourly forecast already stored
([SLCC](https://slcc.pressbooks.pub/physicalgeography/chapter/5-1/)). Coastal measurement found
freeze–thaw conditions present nearly six months of the year [M].

**Tides and swell are an entire missing dimension for sea cliffs.** Tidal range reaches ~8 m at
Pembroke; spring versus neap tides change *which routes exist* on a given day; swell swamps
tidal platforms; and **salt spray greases the rock without any rain at all**, while chloride
corrodes fixed gear [C]
([UKC — judging sea cliff conditions](https://www.ukclimbing.com/forums/rock_talk/judging_sea_cliff_conditions-769275),
[UKC — Pembroke](https://www.ukclimbing.com/articles/destinations/beginners_pembroke-10261)).
Nothing in a precipitation-and-temperature model reaches any of it. Acadia, the MN North Shore,
Gogarth, Swanage and Pembroke are all in this category.

**Three data sources that would close gaps, all already reachable:**

| Gap | Source | Status |
| --- | --- | --- |
| Aspect / solar exposure | `shortwave_radiation` | **Already fetched and stored** as `shortwave_wm2` (`openMeteo.ts`). The aspect term is blocked on geometry, not data. |
| Antecedent wetness (§8.1) | Open-Meteo soil moisture | Available on the endpoint already called |
| Snowmelt (Willow River, Wild Iris) | Open-Meteo snowfall / snow depth | Available but **model-dependent** — snow depth is missing from some models, and snowfall is water-equivalent at a fixed 1 mm : 7 cm factor |
| River level (Willow River, Carderock) | NOAA water gauges | Public, per-gauge, US only |
| Tides and swell (sea cliffs) | Not investigated | Would need a separate provider |

### 5.2 Prior art — what shipping climbing-conditions models actually compute

The Felsampel (§2.5a) is not the only one, and the closest peer is much closer than expected.

**CragReport** ([how it works](https://www.cragreport.com/how-it-works),
[FAQ](https://www.cragreport.com/faq)) publishes hourly conditions for thousands of crags
worldwide from a **physics-based model of rock surface temperature, friction and dryness** —
and it is built on **Open-Meteo**, the same source this app uses, plus **NOAA MRMS radar
within 1 km of the crag**.

Its stated rock-surface-temperature model uses thermal radiation, convection and solar
exposure, from:

- **sun on the wall** — time of day plus the wall's **aspect and tilt**
- **terrain and face shading** when the sun is behind the wall
- **shortwave radiation**, hourly
- **wind cooling, stronger when the wind hits the wall head-on**
- **sky cooling** — clear skies cool the wall more than cloudy ones
- **surface traits** — rock tone / emissivity, and snow on the ground raising reflectivity
- **thermal inertia** — the wall warms and cools gradually rather than tracking the hour

Dryness is tracked with **rock-type-specific drying rates**, a **dew risk** derived from
dewpoint depression and preferring **rock surface temperature** over air temperature, and a
separate slickness term because *"some rocks feel slick at high humidity even without dew."*

**This independently validates almost every gap this document identified** — rock temperature
over air temperature (§5.1), aspect and solar (§5, §4.9), condensation as a first-class term
(§2.5, §7), rock-type-specific drying rates (§7), and humidity slickness distinct from wetness
(§5.1's chalk finding). It also names **five inputs we do not model, three of which this
research had not identified at all:**

| Input | Status here |
| --- | --- |
| **Wind *direction* relative to the wall** | **Not previously identified.** Our wind component is a scalar `max_wind_kmh`; cooling and drying are strongest head-on, so the same wind speed does different work depending on aspect. |
| **Cloud cover / sky radiative cooling** | **Not previously identified.** Clear nights cool a wall below air temperature, which drives condensation — the §2.5 mechanism. Not currently fetched. |
| **Rock tone / emissivity, and snow albedo** | **Not previously identified.** A rock-type property that is nothing to do with porosity: dark rock heats faster and dries faster. Every rock class in §7 could carry an albedo alongside its drying hours. |
| Thermal inertia | §5.1 found the lag; they model it explicitly. |
| Wall aspect and tilt | Known gap. `cliff_angle` is stored; aspect is not. |

**And one data-source finding worth acting on: they use radar for observed precipitation.**
NOAA MRMS at 1 km resolution answers "did it actually rain on this crag", where our daily
totals from ACIS or the Open-Meteo archive answer only "did it rain in this grid cell today".
That is the §2.1 storm-duration gap and the §6.5 architectural limitation, both addressed by a
source we are already adjacent to — `GET /api/v1/radar/frames` exists in this codebase.

**The wider field**, for context on how crowded this is:

- **Prime Condies** ([GitHub, Apache-2.0](https://github.com/mnaylor5/prime-condies)) — open
  source and therefore readable. Scores hourly forecasts against user-set ideal/acceptable
  bands for **temperature, humidity and precipitation chance**, reporting *how many of the next
  24 hours are at least decent*. Data from the **NWS API**, locations from **OpenBeta's open
  dataset**. Self-described as an early wireframe. Notable mostly for the framing: a *count of
  good hours* rather than a single score, which is arguably a more honest output shape than a
  0–100 number.
- **ClimbingWeather.com** — 300+ US areas.
- **Meteo & Climb**, **BlocWeather**, **Climbit**, and per-crag pages such as
  [jareddillard.com](https://www.jareddillard.com/crags/vantage-washington-weather).

The differentiator for this project therefore cannot be "weather, for crags" — that exists
several times over, and one competitor already implements the physics this research
recommends. The defensible ground is the parts that are hard to copy: per-location seepage and
shelter knowledge (§8.1), the honest withholding rules in §7, and the Telegram-native
interface.

**Alpine crags are a different problem again.** In Chamonix the governing variable is the
**overnight refreeze**, not drying: a good freeze holds routes together, and warming that
prevents proper refreezing at night makes rockfall hazard severe early in the day
([UKC](https://www.ukclimbing.com/forums/expedition+alpine/best_month_to_go_to_chamonix_for_alpine_rock_and_mixed_climbing-673030),
[phys.org on alpine rockfall and climate](https://phys.org/news/2019-07-alpine-climbing-routes-crumble-climate.html)).
La Chamoniarde publishes a regional conditions page during summer. For an alpine location the
useful output is a **minimum overnight temperature and a refreeze/no-refreeze call**, which is
nearly the inverse of the drying question and shares the freeze–thaw zero-crossing count from
§5.1. Out of scope for now, but it means "conditions" is not one model.

---

### 5.3 The hazard that inverts the shelter rule — bolt stress corrosion cracking

Wet-weather conditions research keeps arriving at the same practical advice: when it rains, go
to the steep sheltered sector. At coastal and tropical crags that advice is in direct tension
with a second, slower hazard, and the tension is worth stating because nothing else in this
document points the same way twice.

**Stainless steel climbing anchors fail by chloride stress corrosion cracking (SCC) in marine
and tropical environments, on timescales far shorter than their nominal life.** A 316L anchor
in seaside Thai limestone failed by transgranular chloride SCC after ten years; at Railay,
stainless bolts began failing after only a few years, prompting the large-scale titanium
rebolting of the Thaitanium Project; on Cayman Brac, stainless bolts and hangers have failed in
**as little as 18 months**. In marine settings, steel expected to last 20 years can degrade in
**as little as three months**, while titanium is credited with up to 200 years
([UIAA — corrosion and SCC of climbing anchors](https://theuiaa.org/documents/safety/09122020_UIAA_ClimbingAnchors_Update_123.pdf),
[Climbing — saltwater-corroded bolts](https://www.climbing.com/community/why-do-seaside-crags-around-the-world-still-have-so-many-bad-bolts/),
[Climb Cayman Brac — bolt safety](https://www.climbcaymanbrac.com/safety/)).

**Two details make this a conditions problem rather than a gear problem.**

**First, the driver is not constant wetness — it is salt that deposits and then concentrates.**
The UIAA names elevated temperature, **low humidity**, and the formation of magnesium- or
calcium-rich chloride deposits **at unwashed locations** [C]. That reads backwards until you
consider the mechanism: a deliquescent chloride film is most aggressive when it is a
concentrated brine, which is a drying condition, not a soaking one. Salt spray plus a drying
cycle is worse than salt spray plus rain.

**Second, and this is the inversion: rain washes salt off, so the sheltered overhangs are the
worst place for it.** The steep, rain-protected sectors this research repeatedly identifies as
the wet-weather answer — Bob Marley at the Red (§4.10), Foster Falls' roofs (§4.10), Sikati Cave
at Kalymnos (§4.2), Thailand's overhangs (§4.12) — are, at a coastal crag, precisely the
"unwashed locations" where chloride accumulates [I]. **"Stays dry in the rain" is a
bolt-safety liability at a sea cliff.**

**Third, rock type matters again — and the ranking is different from the drying one.**
Limestone and dolomite are worse than sandstone or granite for SCC, with **karst the worst
case** [C]. Compare that to §3, where limestone is the *benign* family for wet strength and
sandstone the dangerous one. The same crag can be low-risk for hold breakage and high-risk for
anchor failure, and a single "conditions" number cannot carry both.

**What this means for the product.** Nothing here belongs in a drying score, and pretending
otherwise would be worse than silence — this is a fixed-gear hazard on a multi-year timescale,
not a today question. But it is a real reason to be careful about how confidently a sheltered
coastal sector is recommended, and if the app ever carries per-location notes it is exactly the
kind of thing a local flag should say. Recorded here so that a future "best sheltered option in
the rain" feature does not cheerfully send someone to a sea cave on 18-month-old stainless.

---

## 6. What this means for WeatherTeam6 — gap analysis

Read against `apps/api/src/lib/scoring/dryingModel.ts` and `scoring-algorithm.md` as they
stand today. These are findings, not changes.

**6.1 The `RockType` enum is too coarse in two specific, checkable ways.**
`basalt` covers 0.1%–50% porosity (dense column vs. flow top), and there is no volcanic-tuff
value at all, so Smith Rock, the Happys, the Sads and Owens River Gorge have no correct
label — and those two would need *opposite* settings. `unknown` is the only available answer
and it is the wrong one for both.

**6.2 `unknown` is less conservative than `sandstone`, which contradicts its own docstring.**
`scoring-algorithm.md` says `unknown: 24-48h (use sandstone-conservative default)`, but
sandstone is 24–72h. Since `estimated_dry` is `hoursSince >= maxDry`, an unlabelled crag is
declared dry at **48h** while the identical wall labelled `sandstone` waits **72h**. Adding
the correct rock type currently makes the app *more* cautious, which is backwards from what
the comment intends. Either the comment or the number is wrong.

**6.3 The model uses only the most recent rain event, so antecedent wetness is invisible.**
`dryingModel` picks `mostRecent` by date and reads `last_rain_mm` from that one event. Six
days of rain followed by a dry day and a single day of rain followed by a dry day produce
**identical** output. Given that penetration depth is what sets the drying tail (§2.1), this
is the single largest modelling gap I found.

**6.4 `SIGNIFICANT_RAIN_MM = 2` is flat across rock types.** 2 mm on Nuttall quartz arenite
is a surface film gone in an hour; 2 mm on Aztec sandstone is a real event. The threshold
should scale with absorptivity if the rock classes are going to mean anything.

**6.5 Daily precipitation totals cannot express storm intensity.** This one is architectural,
not a bug: rainfall history arrives as daily totals (ACIS, or Open-Meteo archive), so
duration is not recoverable from the current source. Hourly data would be needed, and
`weather_run_hours` already stores hourly precipitation for the forecast side.

**6.6 Limestone is modelled as if its limiter were drying, when it is seepage.** 6–24h is a
reasonable *surface* drying time and irrelevant at a seepage crag, where the honest answer
ranges from 2 hours to two weeks and depends on the catchment. This probably wants a
per-location `seepage_prone` flag rather than a rock-type constant.

**6.7 No condensation term.** A dew-point-versus-rock-temperature check would catch the
tropical-karst and cold-morning cases that precipitation alone cannot see. `dewpoint_c` is
already fetched and stored.

**6.8 Aspect/solar is still unimplemented**, as `scoring-algorithm.md` already notes. Given
that community guidance treats aspect as the difference between 24h and 72h, it is likely
worth more than any refinement to the rock-type constants.

**6.9 `importCrags.ts`'s upsert is a no-op on conflict, and says otherwise.** The `set` clause
assigns every column to itself:

```ts
.onConflictDoUpdate({
  target: crags.openbeta_id,
  set: { name: crags.name, lat: crags.lat, rock_type: crags.rock_type, /* … */ },
})
```

`crags.name` is the column reference, so this compiles to `SET name = "crags"."name"` — the
existing value. Postgres needs the `excluded` pseudo-table to take the incoming row. **The repo
already knows this**: `sqlExcluded()` in `lib/runs/storeRun.ts` exists for exactly this purpose,
with a docstring naming it, and is used at three upserts there; `checkAlerts.ts` passes the
incoming values directly, which is also correct. Only `importCrags.ts` self-assigns.

The script's header says *"Rows are upserted by openbeta_id — safe to re-run."* It is safe, but
it can never update an existing row, and the run still prints `Upserted: N`. That is
`defect-patterns.md` §2 — a failure state that reads as success — and it means correcting crag
data upstream and re-importing would silently do nothing.

**6.10 `crags.rock_type` is probably not a rock type.** Two problems stacked.

First, `rock_type: e.type ?? null` assumes an OpenBeta area record carries lithology. OpenBeta's
documented schema has `type` on **routes**, meaning the *climbing discipline* (`trad`, `sport`),
while area records document `area_name`, `children` and `metadata{lat,lng}`
([OpenBeta climbing-data](https://github.com/OpenBeta/climbing-data),
[openbeta-graphql](https://github.com/OpenBeta/openbeta-graphql)). So `e.type` is either absent —
in which case every imported crag gets `rock_type = null` — or it is the discipline, in which
case the lithology column fills with `"trad"`. **Not verified against a real export**, which is
the check to run first; but neither outcome is a rock type.

Second, **`crags.rock_type` is `text`, while `locations.rock_type` is `rockTypeEnum`.** Nothing
constrains the crag values, and `packages/types` mirrors the split (`Crag.rock_type: string | null`
against `Location.rock_type: RockType | null`). Whatever the importer writes will be accepted.

Chained with §6.2, the consequence is concrete: an unlabelled crag falls to `unknown`, which has
a **48 h** maximum against sandstone's **72 h** — so a bulk import of crags with no usable
lithology produces the *least* conservative drying answer available, silently, at scale.

**A better source exists for the field.** OpenStreetMap's climbing schema includes a
**`climbing:rock`** key for the rock type at a crag, alongside the `sport=climbing` +
`climbing=crag` site relations ([OSM Climbing wiki](https://wiki.openstreetmap.org/wiki/Climbing)).
Coverage is uneven and it is user-contributed, but unlike OpenBeta it is the right field for the
question — and §4.11's tufa test is the kind of thing a user can answer even where OSM is blank.

---

## 7. Proposed taxonomy — NOT APPROVED, NOT IMPLEMENTED

`scoring-algorithm.md` is locked and this section changes nothing. It exists so the research
lands as something actionable rather than as prose.

Suggested replacement for the five-value enum. Hours are drying windows for a moderate storm
on a vertical wall, before the existing angle/wind/humidity modifiers.

| Proposed type | min h | max h | Basis |
| --- | --- | --- | --- |
| `granite` (fresh plutonic) | 1 | 6 | 0.5–1.5% porosity; friction-limited [M] |
| `rhyolite` / dense felsic volcanic | 2 | 8 | Fine-grained, low porosity. MN North Shore [I] |
| `anorthosite` | 1 | 6 | Dense plutonic; abrasive, friction-led. Carlton Peak, Poke-O [I] |
| `granite_weathered` (grussy, coarse, biotite-rich) | 3 | 12 | Grus rind retains water [I] |
| `syenite_porous` (Hueco-type) | 12 | 48 | Highly porous plutonic; huecos hold water days–months. Breaks the igneous rule [C] |
| `quartzite` | 1 | 6 | Near-zero matrix porosity [M] |
| `slate` | 1 | 4 | No pore space; fastest-drying rock in community rankings. Friction-limited [C] |
| `gneiss_schist` | 2 | 12 | Low matrix porosity, foliation drainage [M/I] |
| `basalt_dense` (columnar) | 2 | 8 | 0.1–1.0% porosity [M] |
| `basalt_vesicular` | 12 | 48 | 30–50% porosity [M] |
| `tuff_welded` | 4 | 16 | Behaves near-granitic [C] |
| `tuff_nonwelded` | 36 | 96 | 38–60% porosity — more than any sandstone [M] |
| `limestone_dense` | 4 | 18 | Low porosity; seepage handled separately [M/C] |
| `dolomite` | 6 | 24 | Higher porosity than parent limestone; pocket water [M/I] |
| `carbonate_cherty` (chert lenses / nodules) | 6 | 24 | Two materials in one wall; holds loosen at the interface. Oneota, Pahasapa [I] |
| `limestone_porous` / chalk / tufa | 24 | 72 | Up to 12% absorption; tufa softens and breaks [S/C] |
| `sandstone_quartz_arenite` (silica-cemented) | 6 | 24 | ~0% strength loss measured for clean quartz-rich sandstone [M] |
| `sandstone_ferruginous` (iron-cemented, case-hardened) | 12 | 48 | Intermediate; Corbin-type [I] |
| `sandstone_arkose` (feldspathic — Fountain, Millstone Grit) | 12 | 48 | Slick and seep-prone when wet, but far less fragile than eolian [C] |
| `sandstone_eolian` (calcite/clay-cemented) | 36 | 96 | 50–75% strength loss; land-manager 24–48h is the floor, not the answer [M/C] |
| `sandstone_soft` (weakly cemented) | 48 | 120 | Elbsandstein / Southern Sandstone class [C] |
| `conglomerate` | 24 | 72 | Matrix-controlled and invisible from the surface [I] |
| `volcanic_breccia` (Pinnacles-type) | 12 | 48 | Angular clasts in finer matrix; NPS calls it very weak vs granite/basalt [C] |
| `unknown` | 48 | 120 | Must be the **most** conservative row, not a middle one |

Four companion changes that the research says matter more than the table itself:

1. **Accumulate antecedent rainfall** over a rock-type-dependent window (say 7 days for the
   eolian classes, 48h for arenites) instead of reading only the most recent event.
2. **Add a per-location `seepage_prone` boolean.** At limestone crags it will outweigh the
   rock type. It cannot be derived from rock type or from weather — but §4.11 gives one
   observable proxy that can be asked of a user or read from a guidebook: **does the crag have
   tufas or stalactites?** A tufa is a deposit formed by flowing water, so it is direct
   evidence of a drainage line.
3. **Add a condensation check** from the already-stored dewpoint against an estimated rock
   surface temperature.
4. **Fetch soil moisture and use it as the drying proxy.** This is the community's own test —
   *"if the ground is still damp then the rock is still wet"* (§8.1). It integrates antecedent
   rainfall and evaporative demand for free, which is exactly what §6.3's most-recent-event
   model discards, and [Open-Meteo exposes soil moisture at multiple depths](https://open-meteo.com/en/docs) on the
   same forecast endpoint we already call (confirm the exact depth bands before relying on one).
   Likely the cheapest high-value change here.

And one warning about how to display any of this: per
`.claude/rules/defect-patterns.md` §1 and §3, a drying estimate derived from a *guessed*
rock class must not be rendered as a measurement. If the class is `unknown`, the honest
output is a withheld estimate, not the most conservative number wearing a confident label.

---

## 8. What I could not establish

- **No measured drying-rate data for any actual crag exists in anything I found.** All
  crag-level drying times in §4 are community convention. The lab literature measures
  strength loss and porosity, not "hours until a cliff is climbable". The gap between the
  two is currently bridged by folklore, including in our own model.
- **The 41% (Millstone Grit) and 75% ("western sandstone") figures are climbing-media
  numbers** whose primary sources I could not reach. Treat as indicative. The peer-reviewed
  0–55%-with-outliers-above-90% range is the defensible one.
- **Nothing on how fast rock re-wets from high humidity alone**, which is the mechanism
  behind "it never really came into condition" at humid crags.
- **Vertical variation within a cliff** (the Nuttall result) is real and I have no way to
  model it — the app has one rock type per location and a route-level property would be a
  much larger change.

### 8.1 Update — community data partly closes the first gap

The first bullet above is now too pessimistic. Crag-level drying evidence **does** exist; it
is just not in the scientific literature. Climbers have been maintaining it for decades, and
in the UK it is close to a structured dataset.

- **Ranked crag drying lists.** The South Wales climbing wiki maintains a dedicated
  [Seepage / Quick drying](https://swcw.org.uk/wiki/Seepage/Quick_drying) page; Warwick's club
  publishes a [quick-drying crags](https://warwickclimbersunion.co.uk/quick_drying_crags.html)
  list; UKC has recurring threads that converge on consistent orderings. Sample consensus:
  **slate is the quickest-drying rock type**, Trowbarrow and the Llanberis slate crags being
  the reliable options; on Eastern Grit, **Stanage and Derwent dry fastest, then Burbage**;
  on Peak limestone, **Beeston Tor and High Tor seep little**, and **Chee Tor dries much
  faster than the steep Chee Dale crags**. The stated drivers are wind exposure and a
  south-facing aspect, with a crag drying fastest when wind blows directly onto it
  ([UKC](https://www.ukclimbing.com/forums/rock_talk/fastest_drying_rock-513137)).
- **The community's own proxy for rock moisture is ground moisture.** Joe's Valley guidance:
  wait 48–72h, and *"if the ground is still damp then the rock is still wet"*
  ([KAYA](https://blog.kayaclimb.com/joes-valley-bouldering-guide-how-when-and-where/)).
  This is worth taking seriously as a **feature**, not just folklore: soil moisture is an
  available forecast product, it integrates antecedent rainfall and evaporative demand
  automatically, and it is exactly the quantity §6.3 says our most-recent-event model throws
  away. Probably the single cheapest fix for that gap.
- **Prior art exists for this product, at one crag.** [crag.day](https://crag.day/) grades
  dryness and friction for Squamish granite from rain data plus local calibration, and states
  its own limitation plainly: local seepage, shade and microclimates still vary. That is the
  same wall we hit in §2.3, reached independently.
- **Local climbing organisations publish conditions guidance** — e.g. Rifle Climbers'
  [weather page](https://rifleclimbers.org/weather/), SNCC's rain page. These are the natural
  source for a per-location seepage flag, and they are human-curated rather than derivable.

What this changes: the honest framing is not "no data exists" but **"the data exists as
per-crag community knowledge, is qualitative and ranked rather than measured, and is
strongest in the UK."** For the app that means a seepage/drying-class field should be
**editable per location and seeded from local knowledge**, not computed. It also means a
"days since rain" number will always be a weaker signal than a resident's ranking, and the
product should not pretend otherwise.

---

## Sources

Peer-reviewed and technical:
[Springer — water saturation and sandstone strength](https://link.springer.com/article/10.1007/s10064-022-02822-9) ·
[Elsevier — water and sandstone fracture toughness](https://www.sciencedirect.com/science/article/pii/S1365160921003002) ·
[OUP GJI — weakening effect of water on brittle failure](https://academic.oup.com/gji/article/192/3/1091/822850) ·
[Springer — Rehbinder effect in fracturing of metals and rocks](https://link.springer.com/article/10.1134/S0031918X22601585) ·
[Springer PAGEOPH — subcritical tensile cracking of quartz in wet environments](https://link.springer.com/article/10.1007/BF00876082) ·
[Elsevier — water and subcritical crack growth in silicate rocks](https://www.sciencedirect.com/science/article/abs/pii/0040195180901626) ·
[Drying Technology — constant and falling rate periods](https://www.tandfonline.com/doi/abs/10.1081/DRT-120038738) ·
[J. Fluid Mech. — modelling drying of capillary porous media](https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/mathematical-modelling-of-drying-capillary-porous-media/9DD4E6AC296676090F943B5CC80CFE0F) ·
[Vadose Zone Journal — non-welded Bishop Tuff](https://acsess.onlinelibrary.wiley.com/doi/10.2136/vzj2004.0602) ·
[Elsevier — microcrystalline quartz and porosity preservation, Fontainebleau](https://www.sciencedirect.com/science/article/abs/pii/S0037073812003296) ·
[WVU — what makes good climbing rock? (Nuttall Sandstone)](https://researchrepository.wvu.edu/etd/3434/) ·
[GSA 2010 — not all sandstones are created equal](https://gsa.confex.com/gsa/2010AM/webprogram/Paper175992.html) ·
[Geosphere — Devils Tower](https://pubs.geoscienceworld.org/gsa/geosphere/article/11/2/354/132219/Devils-Tower-Wyoming-USA-A-lava-coulee-emplaced) ·
[USGS Bulletin 1021-I — Devils Tower](https://pubs.usgs.gov/publication/b1021I) ·
[Liverpool — table of porosities](https://geohubliverpool.org.uk/wp-content/uploads/2020/01/Table-of-porosities.pdf) ·
[Leeds — petrophysics ch.2, porosity](https://homepages.see.leeds.ac.uk/~earpwjg/PG_EN/CD%20Contents/GGL-66565%20Petrophysics%20English/Chapter%202.PDF) ·
[Penn State — some useful numbers](https://cpb-us-e1.wpmucdn.com/sites.psu.edu/dist/1/57960/files/2016/10/Some-Useful-Numbers-1g1rkuu.pdf) ·
[arXiv — vesicular pore architecture in basalt](https://arxiv.org/pdf/2601.00710) ·
[Natural Stone Institute — ASTM standards](https://www.naturalstoneinstitute.org/designprofessionals/astm/) ·
[Stone World — structural and chemical effects on water absorption](https://www.stoneworld.com/articles/82270-granite-limestone-and-marble-part-i-structural-and-chemical-effects-on-water-absorption)

Geology reference:
[geology.com — Mohs hardness scale](https://geology.com/minerals/mohs-hardness-scale.shtml) ·
[Britannica — Mohs hardness](https://www.britannica.com/science/Mohs-hardness) ·
[Britannica — classification of sandstones](https://www.britannica.com/science/sedimentary-rock/Classification-of-sandstones) ·
[Geological Digressions — classification of sandstones](https://www.geological-digressions.com/classification-of-sandstones/) ·
[Geology.com — dolomite](https://geology.com/rocks/dolomite.shtml) ·
[Sandatlas — dolostone](https://sandatlas.org/dolomite-rock/) ·
[Wikipedia — Tuff](https://en.wikipedia.org/wiki/Tuff) ·
[Wikipedia — Case hardening of rocks](https://en.wikipedia.org/wiki/Case_hardening_of_rocks) ·
[NPS — desert varnish](https://www.nps.gov/articles/desertvarnish.htm) ·
[UtahGeology — Navajo Sandstone](https://utahgeology.com/navajo-sandstone/) ·
[Wikipedia — Wingate Sandstone](https://en.wikipedia.org/wiki/Wingate_Sandstone) ·
[Wikipedia — Cedar Mesa Sandstone](https://en.wikipedia.org/wiki/Cedar_Mesa_Sandstone) ·
[Wikipedia — Shawangunk Formation](https://en.wikipedia.org/wiki/Shawangunk_Formation) ·
[NY State Museum — Shawangunk Ridge](https://nysm.nysed.gov/research-collections/geology/resources/shawangunk-ridge) ·
[Geological Society — Stanage Edge](https://www.geolsoc.org.uk/science-and-policy/plate-tectonic-stories/stanage-edge/) ·
[KY-AIPG — Red River Gorge guidebook](https://ky.aipg.org/GUIDEBOOKS/2010%20Guidebook.pdf) ·
[Earth magazine — rocks and climbing at the Red River Gorge](https://www.earthmagazine.org/article/travels-geology-rocks-and-climbing-kentuckys-red-river-gorge/) ·
[geologictimepics — Smith Rock](https://geologictimepics.com/2019/05/08/smith-rock-state-park-great-geology-at-the-edge-of-oregons-largest-caldera/) ·
[Geology is the Way — Joshua Tree granite](https://geologyistheway.com/the-origin-of-the-granite-landscape-of-joshua-tree-national-park/) ·
[USGS/Huber — geologic story of Yosemite](https://www.yosemite.ca.us/library/geologic_story_of_yosemite/final_evolution.html) ·
[Wikipedia — Saxon Switzerland](https://en.wikipedia.org/wiki/Saxon_Switzerland) ·
[Wikipedia — Southern Sandstone](https://en.wikipedia.org/wiki/Southern_Sandstone) ·
[Seneca Project — geology](https://thesenecaproject.org/natural-history/geology/)

Climbing community and land managers:
[BLM — Red Rock Canyon NCA](https://www.blm.gov/nevada/red-rock-canyon-nca/recreation) ·
[Access Fund — how to assess sandstone after rain or snow](https://www.accessfund.org/latest-news/open-gate-blog/how-to-assess-sandstone-after-rain-or-snow) ·
[SNCC — rain](https://www.southernnevadaclimbers.org/rain) ·
[Climbing — are you killing your favorite crag?](https://www.climbing.com/travel/wet-sandstone/) ·
[UKC — protect Fontainebleau sandstone](https://www.ukclimbing.com/news/2024/04/protect_fontainebleau_sandstone_-_dont_climb_on_wet_or_damp_rock-73647) ·
[UKC — limestone drying properties](https://www.ukclimbing.com/forums/rock_talk/limestone_-_drying_properties-323074) ·
[8a.nu — holds get breakable after rain](https://www.8a.nu/news/limestone-and-sandstone-holds-get-really-breakable-after-rain) ·
[Southern Sandstone Code of Practice](http://www.southernsandstoneclimbs.co.uk/p/code-of-practice.html) ·
[Bergzeit — Klettern in der Sächsischen Schweiz](https://www.bergzeit.de/magazin/klettern-saechsische-schweiz/) ·
[Climb Kalymnos](https://climbkalymnos.com/climbing/) ·
[Sharp End — Indian Creek geology](https://stores.sharpendbooks.com/blog/snapshots-of-a-geological-moment-indian-creek-geology-excerpts-from-creek-freak/) ·
[Nice Climbs — Ten Sleep](https://niceclimbs.com/areas/wyoming/ten-sleep/) ·
[Mountain Project — Rumney](https://www.mountainproject.com/area/105867829/rumney) ·
[Rockclimbing.com — geology for climbers III, metamorphic](https://rockclimbing.com/Articles/Geology_for_Climbers_Part_III_Metamorphic_Rocks_1595.html) ·
[MojaGear — Maple Canyon](https://mojagear.com/climbing-destination-guide-maple-canyon-utah/) ·
[Climbing — Riglos](https://www.climbing.com/travel/hammer-of-the-gods-the-wild-multipitch-conglomerate-of-riglos-spain/) ·
[Rock+Run — bouldering in Bishop](https://rockrun.com/blogs/the-flash-rock-run-blog/bouldering-in-bishop-usa-destination-article) ·
[Send Edition — bouldering on wet rock](https://sendedition.com/can-you-boulder-in-the-rain-or-when-the-rock-is-wet/) ·
[PYB — interpreting the weather forecast for rock climbing](https://info.pyb.co.uk/blog/interpreting-the-weather-forecast-for-rock-climbing) ·
[WV Explorer — Seneca Rocks](https://wvexplorer.com/recreation/rock-climbing/west-virginia-crag/article-seneca-offers-climbers-a-taste-of-the-alps/) ·
[RRG Tourism — winter and sandstone](https://redrivergorgetourism.com/the-science-of-sandstone-how-winter-shapes-the-red-river-gorge/)

Community drying data and crag conditions (second pass):
[SWCW wiki — Seepage / Quick drying](https://swcw.org.uk/wiki/Seepage/Quick_drying) ·
[WUCU — quick-drying crags](https://warwickclimbersunion.co.uk/quick_drying_crags.html) ·
[UKC — fastest drying rock](https://www.ukclimbing.com/forums/rock_talk/fastest_drying_rock-513137) ·
[UKC — quick drying Peak limestone](https://www.ukclimbing.com/forums/destinations/quick_drying_peak_limestone_crags-57007) ·
[UKC — geology for climbers, metamorphic rocks](https://www.ukclimbing.com/articles/series/the_geology_of_britain/the_geology_of_britain_-_a_climbers_perspective_part_3_-_metamorphic_rocks-11874) ·
[crag.day — Squamish conditions](https://crag.day/) ·
[Mountain Life — climbing in the rain in Squamish](https://www.mountainlifemedia.ca/2018/11/where-to-climb-when-its-raining-in-squamish/) ·
[Rifle Climbers — weather](https://rifleclimbers.org/weather/) ·
[ClimbingHouse — Rifle guide](https://climbinghouse.com/rifle-mountain-park-colorado-guide/) ·
[KAYA — Joe's Valley guide](https://blog.kayaclimb.com/joes-valley-bouldering-guide-how-when-and-where/) ·
[KAYA — Devil's Lake guide](https://blog.kayaclimb.com/devils-lake-bouldering-guide-how-when-and-where/) ·
[Climbing — Devil's Lake](https://www.climbing.com/travel/rock-climbing-devils-lake-wisconsin/) ·
[MadBoulder — Rocklands](https://www.madboulder.org/rocklands) ·
[theCrag — Blue Mountains](https://www.thecrag.com/en/climbing/australia/blue-mountains) ·
[UKC — Mount Arapiles](https://www.ukclimbing.com/articles/destinations/mount_arapiles_-_australia-6830) ·
[NoogaFinder — Chattanooga climbing guide](https://noogafinder.com/blog/rock-climbing-chattanooga-guide) ·
[Skyward — Boulder / Eldorado](https://www.skywardmountaineering.com/rock-climbing/boulder-colorado) ·
[Forged Guides — Midwest safety](https://www.climbforged.com/blog/forged-guides-and-the-midwest-what-safety-measures-are-essential-for-rock-climbing) ·
[MCA — Sandstone ice park](https://www.mnclimbers.org/sandstone-ice-park) ·
[MP — Robinson Park](https://www.mountainproject.com/area/105812719/robinson-park) ·
[MP — Willow River State Park](https://www.mountainproject.com/area/105795588/willow-river-state-park) ·
[MP — Red Wing / Barn Bluff](https://www.mountainproject.com/area/105812663/red-wing-aka-he-mni-can-barn-bluff) ·
[MN DNR — Interstate State Park geology](https://files.dnr.state.mn.us/destinations/state_parks/interstate/interstate_geology.pdf) ·
[IGWS — Oneota Dolomite](https://legacy.igws.indiana.edu/compendium/oneota-dolomite) ·
[Star Tribune — Sandstone quarry history](https://www.startribune.com/curious-minnesota-sandstone-history-quarry-banning-state-park/601862816) ·
[TPW magazine — Hueco Tanks](https://tpwmagazine.com/archive/2004/sept/ed_4/) ·
[Texas Beyond History — Hueco Tanks setting](https://www.texasbeyondhistory.net/hueco/setting.html) ·
[Wikipedia — Fountain Formation](https://en.wikipedia.org/wiki/Fountain_Formation) ·
[theCrag — Poke-O-Moonshine](https://www.thecrag.com/en/climbing/united-states/adirondacks/poke-o-moonshine) ·
[Open-Meteo docs](https://open-meteo.com/en/docs)

US regional pass (§4.9):
[MP — Tettegouche / North Shore](https://www.mountainproject.com/area/105812783/tettegouche-sp-north-shore) ·
[MN Earth Science Guy — Palisade Head Rhyolite](https://mnearthscienceguy.blogspot.com/2012/07/minnesota-geology-monday-palisade-head.html) ·
[SummitPost — Carlton Peak](https://www.summitpost.org/carlton-peak/627635) ·
[MN DNR — Blue Mounds geology](https://www.dnr.state.mn.us/state_parks/blue_mounds/geology_details.html) ·
[LiveAbout — The Needles](https://www.liveabout.com/facts-about-the-needles-756164) ·
[Climbing — Spearfish destination guide](https://www.climbing.com/places/spearfish-south-dakota-climbing-destination-guide/) ·
[Geology of Wyoming — Vedauwoo](https://www.geowyo.com/vedauwoo.html) ·
[turnstone.ca — Granites of the Vedauwoo Rocks](https://turnstone.ca/vedauwoo.htm) ·
[theCrag — Wild Iris](https://www.thecrag.com/en/climbing/united-states/wyoming-wild-iris) ·
[Outpost Wilderness — Sinks Canyon & Wild Iris](https://outpostwilderness.com/sinks-canyon-wild-iris-climbing-your-guide-to-limestone-more-in-lander/) ·
[Garden of the Gods — how to climb](https://gardenofthegodscolorado.com/how-to-climb-in-garden-of-the-gods/) ·
[City of Colorado Springs — rock climbing](https://coloradosprings.gov/rock-climbing) ·
[StephAbegg — Penitente Canyon](https://stephabegg.com/trip-reports/colorado/penitente/) ·
[MP — Penitente Canyon](https://www.mountainproject.com/area/105744316/penitente-canyon) ·
[ClimbingHouse — Shelf Road](https://climbinghouse.com/shelf-road-rock-guide/) ·
[MP — Shelf Road](https://www.mountainproject.com/area/105744267/shelf-road) ·
[MP — Clear Creek Canyon](https://www.mountainproject.com/area/105744243/clear-creek-canyon)

Fourth pass — modifiers and further US areas (§4.10, §5.1):
[JGR Earth Surface — rock face temperature from IR thermography](https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2025JF008816) ·
[Solar-induced thermal stresses in rock weathering](https://pages.charlotte.edu/eric-delmelle/wp-content/uploads/sites/150/2012/12/Deciphering-the-role-of-solar-induced-thermal-stresses-in-rock-weathering.pdf) ·
[Cold-air pooling drives forest composition](https://pmc.ncbi.nlm.nih.gov/articles/PMC10985370/) ·
[UBC ATSC — cold air pooling](https://www.eoas.ubc.ca/courses/atsc113/snow/met_concepts/06-met_concepts/06a-cold-air-pooling/) ·
[Climbing — science of friction and shoe rubber temperature](https://www.climbing.com/skills/science-friction-the-truth-behind-perfect-climbing-conditions/) ·
[Tribonet — friction and rock climbing](https://www.tribonet.org/news/friction-the-key-to-rock-climbing/) ·
[FrictionLabs — chalk in any condition](https://shop.frictionlabs.com/blogs/climb-your-impossible/the-ultimate-climber-s-guide-for-using-chalk-in-any-condition) ·
[UKC — cleaning moss and lichen](https://www.ukclimbing.com/forums/rock_talk/cleaning_moss_and_lichen_off_routes-599675) ·
[MDC — stippleback lichens](https://mdc.mo.gov/discover-nature/field-guide/stippleback-lichens-dermatocarpon-lichens) ·
[SLCC — weathering and ice wedging](https://slcc.pressbooks.pub/physicalgeography/chapter/5-1/) ·
[UKC — judging sea cliff conditions](https://www.ukclimbing.com/forums/rock_talk/judging_sea_cliff_conditions-769275) ·
[UKC — beginners' Pembroke](https://www.ukclimbing.com/articles/destinations/beginners_pembroke-10261) ·
[MP — Fisher Towers](https://www.mountainproject.com/area/105716787/fisher-towers) ·
[NPS — Pinnacles climber safety advisory](https://www.nps.gov/pinn/planyourvisit/climbadv.htm) ·
[MP — Frenchman Coulee](https://www.mountainproject.com/area/105792231/frenchman-coulee-vantage) ·
[MP — Big Cottonwood Canyon](https://www.mountainproject.com/area/105739280/big-cottonwood-canyon) ·
[Brice Pollock — plated granite, West Cochise](https://www.bricepollock.com/wilderness-granite-plates-in-west-cochise-stronghold/) ·
[BEG UT Austin — Enchanted Rock](https://www.beg.utexas.edu/texas-through-time/enchanted-rock.html) ·
[UKC — Whitehorse/Cathedral](https://www.ukclimbing.com/forums/destinations/whitehorsecathedral_ledges_new_hampshire-413031) ·
[Potomac Mountain Club — Great Falls](https://potomacmountainclub.org/climbing-crags-beta/virginia-crags/great-falls-national-park-rocktr/) ·
[NOAA — Potomac gauge](https://water.noaa.gov/gauges/gtnd2) ·
[NJGS — Palisades Sill and Watchung Basalt](https://dep.nj.gov/wp-content/uploads/njgws/reports/ofreport/ofr92-1.pdf) ·
[NPS Geodiversity Atlas — Obed](https://www.nps.gov/articles/nps-geodiversity-atlas-obed-wild-and-scenic-river-tennessee.htm) ·
[MP — Bob Marley, RRG](https://www.mountainproject.com/area/106091151/bob-marley) ·
[Wolverine Publishing — Red River Gorge Select](https://www.wolverinepublishing.com/shop-all-guidebooks/p/red-river-gorge-select) ·
[MP — Turkey Rocks](https://www.mountainproject.com/area/105797943/turkey-rocks)

Fifth pass — rock-moisture instrumentation and the Saxony climbing-area study (§2.5):
[Investigating rock moisture at a sandstone massif in the Saxonian Switzerland climbing area — Journal of Geomorphology](https://www.schweizerbart.de/papers/jgeomorphology/detail/prepub/100842/Investigating_rock_moisture_at_a_sandstone_massif_in_the_Saxonian_Switzerland_climbing_area) ·
[Weiss & Sass — the challenge of measuring rock moisture, eight sensor types](https://www.sciencedirect.com/science/article/abs/pii/S0169555X22003233) ·
[EGU21 — measuring rock moisture in the sandstone area of Saxony](https://meetingorganizer.copernicus.org/EGU21/EGU21-14871.html) ·
[Engineering Geology 2025 — rock moisture dynamics in sandstone caves](https://www.sciencedirect.com/science/article/abs/pii/S0013795225002819) ·
[HESS 2023 — physics-informed ML for rock moisture in a sandstone cave](https://hess.copernicus.org/articles/27/2579/2023/) ·
[Vadose Zone Journal — soil moisture sensors in weathered limestone](https://acsess.onlinelibrary.wiley.com/doi/10.1002/vzj2.20164) ·
[Env. Earth Sciences — ERT monitoring of capillary rise and drying in sandstone](https://link.springer.com/article/10.1007/s12665-012-1858-x) ·
[Geomorphology — ERT and San rock art deterioration, Golden Gate Highlands](https://www.sciencedirect.com/science/article/abs/pii/S0169555X10000346) ·
[npj Heritage Science — remote monitoring of rock art shelters, Albarracín](https://www.nature.com/articles/s40494-025-02123-w) ·
[ScienceDirect — fibre Bragg grating moisture sensor for sandstone](https://www.sciencedirect.com/science/article/abs/pii/S0925400525004666)

Sixth pass — the Felsampel system (§2.5a):
[ASD-DAV — Felsampel des Elbsandsteingebirges](https://www.asd-dav.de/service/felsampel-des-elbsandsteingebirges/) ·
[DAV Dessau — Felsampel](https://www.dav-dessau.de/bergsport/klettern/felsampel) ·
[SBB SSI Heft 36 — Die Felsampel, eine Erfolgsstory im Ehrenamt](https://bergsteigerbund.de/wp-content/uploads/2022/09/SSI-Heft-36_Die-Felsampel-eine-Erfolgsstory-im-Ehrenamt.pdf) ·
[Nationalpark Sächsische Schweiz — climbing](https://nationalpark-saechsische-schweiz.de/en/climbing) ·
[Sandsteinblogger — Zu nass zum Klettern](https://www.sandsteinblogger.de/2016/12/zu-nass-zum-klettern/) ·
[OCÚN — Saxony chalk-free](https://www.ocun.com/news/saxony-from-iii-to-xii-chalk-free) ·
[Climbing — wet sandstone (Saxon depth measurements)](https://www.climbing.com/travel/wet-sandstone/)

Seventh pass — prior art and competing implementations (§5.2):
[CragReport — how it works](https://www.cragreport.com/how-it-works) ·
[CragReport — FAQ](https://www.cragreport.com/faq) ·
[Prime Condies — open source, GitHub](https://github.com/mnaylor5/prime-condies) ·
[ClimbingWeather.com](https://climbingweather.com/) ·
[BlocWeather](https://blocweather.com/) ·
[Climbit](https://climbitscore.com/) ·
[Meteo & Climb](https://play.google.com/store/apps/details?id=com.tomito.climbapp) ·
[jareddillard.com — per-crag weather](https://www.jareddillard.com/crags/vantage-washington-weather) ·
[UKC — Chamonix alpine rock conditions](https://www.ukclimbing.com/forums/expedition+alpine/best_month_to_go_to_chamonix_for_alpine_rock_and_mixed_climbing-673030) ·
[phys.org — alpine routes and climate change](https://phys.org/news/2019-07-alpine-climbing-routes-crumble-climate.html)

Eighth pass — European limestone (§4.11):
[UKC — Frankenjura destination guide](https://www.ukclimbing.com/articles/destinations/frankenjura_-_limestone_in_the_limelight-2742) ·
[MP — Frankenjura "Sheltered and also fast drying"](https://www.mountainproject.com/area/111969104/sheltered-and-also-fast-drying) ·
[SummitPost — Frankenjura](https://www.summitpost.org/frankenjura/311566) ·
[UKC — Céüse, summer sport climbing in France](https://www.ukclimbing.com/articles/destinations/ceuse_-_summer_sport_climbing_in_france-118) ·
[climbingaway — Céüse](https://climbingaway.fr/en/climbing-areas/ceuse) ·
[Planetmountain — Rodellar](https://www.planetmountain.com/english/Rock/crags/falesia.html?idfalesia=90) ·
[theCrag — Chulilla](https://www.thecrag.com/en/climbing/spain/chulilla) ·
[UKC — Chulilla](https://www.ukclimbing.com/articles/destinations/chulilla-6242) ·
[UKC — Siurana revisited](https://www.ukclimbing.com/articles/destinations/siurana_revisited-3709) ·
[Climb Europe — Arco](https://climb-europe.com/pages/rock-climbing-italy-arco)

Ninth pass — tropical areas, dataset schemas, importer findings (§6.9, §6.10):
[Basecamp Tonsai — best time of year](https://basecamptonsai.substack.com/p/when-is-the-best-time-of-year-for) ·
[Just Climb Thailand — best season](https://justclimbthailand.com/rock-climbing-thailand-best-season/) ·
[OpenBeta — climbing-data](https://github.com/OpenBeta/climbing-data) ·
[OpenBeta — openbeta-graphql](https://github.com/OpenBeta/openbeta-graphql) ·
[OSM Climbing wiki](https://wiki.openstreetmap.org/wiki/Climbing)

Tenth pass — rest of world and alpine permafrost (§4.12):
[Wikipedia — Table Mountain Sandstone](https://en.wikipedia.org/wiki/Table_Mountain_Sandstone) ·
[NZ Geographic — the rocks of Castle Hill](https://www.nzgeo.com/stories/the-rocks-of-castle-hill/) ·
[theCrag — Kura Tāwhiti / Castle Hill Basin](https://www.thecrag.com/en/climbing/new-zealand/castle-hill-basin) ·
[SummitPost — Pedra da Gávea](https://www.summitpost.org/pedra-da-g-vea/150534) ·
[climbgrades — best time to visit Brazil](https://www.climbgrades.com/seasons/brazil) ·
[UKC — Ogawayama bouldering](https://www.ukclimbing.com/articles/destinations/ogawayama_bouldering-264) ·
[theCrag — Ogawayama](https://www.thecrag.com/en/climbing/japan/ogawayama) ·
[Gruber & Haeberli — permafrost in steep bedrock slopes](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2006JF000547) ·
[ESP — permafrost degradation and high mountain rockfall](https://onlinelibrary.wiley.com/doi/10.1002/esp.70063) ·
[ESurf — temperature-dependent stability model for degrading permafrost rock slopes](https://esurf.copernicus.org/articles/9/1125/2021/)

Eleventh pass — anchor stress corrosion cracking (§5.3):
[UIAA — corrosion and stress corrosion cracking of climbing anchors](https://theuiaa.org/documents/safety/09122020_UIAA_ClimbingAnchors_Update_123.pdf) ·
[Climbing — why seaside crags still have bad bolts](https://www.climbing.com/community/why-do-seaside-crags-around-the-world-still-have-so-many-bad-bolts/) ·
[Climb Cayman Brac — bolt safety](https://www.climbcaymanbrac.com/safety/) ·
[MountaiNow — stress corrosion cracking](https://www.mountainow.net/en/2022/06/watch-your-anchor-stress-corrosion-cracking-could-be-next/)

Twelfth pass — PNW and Sierra (§4.13):
[WCC — Darrington](https://washingtonclimbers.org/index.php/2015/10/13/darrington/) ·
[MP — Darrington](https://www.mountainproject.com/area/106006698/darrington) ·
[AAI — guided climbing at Index](https://www.alpineinstitute.com/programs/guided-rock-climbing-at-index-wa/) ·
[MP — Tuolumne Meadows](https://www.mountainproject.com/area/105833384/tuolumne-meadows) ·
[Planetmountain — Tuolumne Meadows](https://www.planetmountain.com/en/crags/tuolumne-meadows-yosemite.html)
