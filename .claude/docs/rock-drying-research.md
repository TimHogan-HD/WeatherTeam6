# Rock Types, Absorption and Drying — Research

Research notes for improving the drying model. **This document does not change the
scoring algorithm.** `.claude/docs/scoring-algorithm.md` is agreed and locked; §7 below
is a *proposal* that needs explicit approval before any of it reaches code.

Last updated: 2026-09-01

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

---

## 7. Proposed taxonomy — NOT APPROVED, NOT IMPLEMENTED

`scoring-algorithm.md` is locked and this section changes nothing. It exists so the research
lands as something actionable rather than as prose.

Suggested replacement for the five-value enum. Hours are drying windows for a moderate storm
on a vertical wall, before the existing angle/wind/humidity modifiers.

| Proposed type | min h | max h | Basis |
| --- | --- | --- | --- |
| `granite` (fresh plutonic) | 1 | 6 | 0.5–1.5% porosity; friction-limited [M] |
| `granite_weathered` (grussy, coarse, biotite-rich) | 3 | 12 | Grus rind retains water [I] |
| `quartzite` | 1 | 6 | Near-zero matrix porosity [M] |
| `gneiss_schist` | 2 | 12 | Low matrix porosity, foliation drainage [M/I] |
| `basalt_dense` (columnar) | 2 | 8 | 0.1–1.0% porosity [M] |
| `basalt_vesicular` | 12 | 48 | 30–50% porosity [M] |
| `tuff_welded` | 4 | 16 | Behaves near-granitic [C] |
| `tuff_nonwelded` | 36 | 96 | 38–60% porosity — more than any sandstone [M] |
| `limestone_dense` | 4 | 18 | Low porosity; seepage handled separately [M/C] |
| `dolomite` | 6 | 24 | Higher porosity than parent limestone; pocket water [M/I] |
| `limestone_porous` / chalk / tufa | 24 | 72 | Up to 12% absorption; tufa softens and breaks [S/C] |
| `sandstone_quartz_arenite` (silica-cemented) | 6 | 24 | ~0% strength loss measured for clean quartz-rich sandstone [M] |
| `sandstone_ferruginous` (iron-cemented, case-hardened) | 12 | 48 | Intermediate; Corbin-type [I] |
| `sandstone_eolian` (calcite/clay-cemented) | 36 | 96 | 50–75% strength loss; land-manager 24–48h is the floor, not the answer [M/C] |
| `sandstone_soft` (weakly cemented) | 48 | 120 | Elbsandstein / Southern Sandstone class [C] |
| `conglomerate` | 24 | 72 | Matrix-controlled and invisible from the surface [I] |
| `unknown` | 48 | 120 | Must be the **most** conservative row, not a middle one |

Three companion changes that the research says matter more than the table itself:

1. **Accumulate antecedent rainfall** over a rock-type-dependent window (say 7 days for the
   eolian classes, 48h for arenites) instead of reading only the most recent event.
2. **Add a per-location `seepage_prone` boolean.** At limestone crags it will outweigh the
   rock type. It cannot be derived from rock type or from weather.
3. **Add a condensation check** from the already-stored dewpoint against an estimated rock
   surface temperature.

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
