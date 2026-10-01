# Conditions Scoring Algorithm

Read this before any work on the conditions score. The model is agreed and must not be
modified without explicit approval. **Every constant below is a judgement call, and nothing
is validated against outcomes (#143).**

## What is live

**The score on every screen is Crag A** (`apps/api/src/lib/scoring/cragModel.ts`), owner
decision 2026-09-24, shipped in #186. It replaced the v2 model's score for every location;
there is no tester gate.

| Model | Where | Status |
|---|---|---|
| **Crag A** (`evaluateCragA`) | `cragModel.ts` | **Live.** Every crag's score, list card, detail screen, daily pills |
| **Wall A** (`evaluateWallA`) | `cragModel.ts` | Built, **not called**. Scores one recorded wall; never a crag's score |
| v2 layers (`rockThermal`, `hourlyConditions`) | `lib/scoring/` | Live as **inputs** to Crag A (`T_mass`, `T_surface`, drying rate). Its own score and sweat-balance friction reach no response |

Where the research lives: `.claude/docs/crag-a-reference/README.md` (why these two models, the
seven errors corrected, what is still open) and `model.ts` beside it, the reference the port is
checked against hour for hour. A change that moves a result there needs an argument, not a
commit message. `scoring-findings.md` §6d records the switch.

## Crag A

```
score = round(100 × dryness^0.55 × friction)        # both factors 0-1
```

`DRYNESS_EXPONENT = 0.55`. Friction carries **no** exponent: v2's `friction^0.45` is what let
heat through. Either factor null → score null. There is no cap, veto or clamp beyond the 0-1
domain guard.

### Inputs

- One deterministic model, `THERMAL_MODEL` = `gfs_seamless`, from stored runs
  (`lib/runs/hourlyReadings.ts`). Irradiance is one model's by cost, not safety (#212);
  `gem_seamless` never feeds it (#155).
- **Every stored hour, past included.** `T_mass` needs ~96 h of trailing air temperature,
  which is why this one model is fetched with `past_days` (`lib/runs/deterministicFetch.ts`,
  7 days — also what the drying clock needs to see the last rain, #176). The past hours feed the
  calculation and never reach the response.
- The crag's `lat`/`lon` (for the sun) and rock type. A location's recorded aspect and angle
  are **not** inputs.

### Dryness: the drying clock, 0-1 per hour (`drynessTrack`)

- **Wetting:** an hour with ≥ `WET_MM` (0.05 mm) of rain. Open-Meteo reports 0 or ≥ 0.1, so
  this is any measurable rain; v2 reset only at 0.5 mm/h.
- **Storm size:** rain hours with gaps under `STORM_GAP_H` (24 h) add up to one storm.
  `need = MAX_HOURS[rock] × min(1, √(storm_in / 0.4))`, so a 0.4" storm needs the rock type's
  full window and a small shower needs less.
- **Two stores.** The surface is reset by any wetting. The soak is topped up by a storm and
  never lowered by a smaller later one, so a shower does not erase a big soak.
- **Drying rate:** each dry hour removes the increase in v2's `effective_dry_hours`, the
  clock that runs faster with sun, wind and vapour-pressure deficit
  (`rockThermal.effectiveDryingHours`).
- `dryness = min(((N − R) / N)²)` over the two stores, where `N` is the store's need and `R`
  what remains. The square curves slowly at first: rock strength returns late (issue #137).
- **Snow:** rain at ≤ 0.5 °C builds snow water; melt `0.15 mm/h per °C + 0.0015 × shortwave`
  wets the rock again; dryness ≤ 0.25 while ≥ 1 mm lies. The melt rates are a guess nothing
  has checked.
- **The first hour of the series is treated as fully soaked**, because the rain before it is
  unknown (issue #176). That is the direction to be wrong in.

**Crag vs wall.** Crag A runs the clock on eight vertical walls (N, NE … NW) at the crag's
position through `rockThermal`'s wall geometry and takes the **median** each hour; any wall's
hour null → the crag's hour is null. Wall A runs it on one recorded wall, with overhang rain
shelter `max(0.1, 1 − deg_past_vertical / 30)` and the 0.5 mm/h wetting threshold that
shelter was calibrated against. An overhang dries on the vertical factor, not faster.

### Friction: grip, 0-1 (`frictionFactorA`)

```
friction = condensation × heat × humidity × cold

condensation = clamp((T_mass − Td) / 2 °C, 0, 1)
heat         = exp(−max(0, Ta − 60 °F) / 12 °C)
humidity     = exp(−max(0, Td − 54 °F) / 10 °C)
cold         = exp(−max(0, 30 °F − Ta) / 12 °C)
```

Air temperature, dew point and `T_mass` only. It reads no sunlight, so it still answers when
shortwave is missing, and it cannot see an overhang's shade on a warm humid afternoon
(G10 / F13 in the reference README). Any input null → null, never a default.

### Withholding

Every factor withholds rather than degrades (issues #21, #32, #34):

- An hour whose rain was not measured is null, **and so is every hour after it** until a full
  `MAX_HOURS` of drying has run.
- A series too short for `T_mass` scores nothing: `unavailable_reason: insufficient_history`.
- `THERMAL_MODEL` did not answer: `model_unavailable`. Never another model's numbers.
- A non-climbing location is never scored: `not_a_climbing_location`. The route decides this
  by not passing `scoring`; the model itself does not check the flag.

### A day's score (`dayRepresentative`)

The worst hour of the day's **best run of 3 consecutive hours between 08:00 and 18:00 local**.
A run with an unscored hour, or a gap in time, does not count. No qualifying run → no score.
Chosen server-side so no two surfaces can pick differently; it replaced the single best hour,
which let one mild 8 am hour carry a hot day.

The published window is `WINDOW_DAYS` (7) local days from today. `/hourly/:id` and
`/conditions/:id` carry the same readings through `toConditionsReadings`, so one crag cannot
show two numbers on two screens.

### Good hours (`bestWindow`)

The longest run of hours with rock `drying` or `dry`, friction `fair` or better, and score
≥ `DEFAULT_WINDOW_MIN_SCORE` (60).

### What reaches a screen

- **Words and ordering, not factors.** The 0-1 dryness and friction live under
  `HourlyConditions.diagnostics`; a surface prints levels:
  - Rock: `wet` while `dryness < (MIN_HOURS / MAX_HOURS)²` for the rock type, `dry` at 1,
    `drying` between (`rockLevelA`).
  - Friction: `poor` < 0.35 ≤ `fair` < 0.6 ≤ `good` < 0.85 ≤ `great` (`FRICTION_BANDS`).
- **The words come from the readings, never from the number** (`summarizeReadings` in
  `packages/types/src/readingsCopy.ts`). There is no score-to-text ladder, and there must not
  be one: `stateLabel` and `summarizeConditions` were deleted for this.
- **The number's colour** uses `SCORE_BANDS` (`packages/types/src/conditionsCopy.ts`):
  ≥ 80, ≥ 60, ≥ 40, below. Colour only, no words.
- **Severe+ NWS alerts drop the number and keep the readings.** The number also waits for the
  alerts query (`alertsPending`). Both live in `summarizeReadings`.

### Still open

From `crag-a-reference/README.md`: a minimum wait after rain for soft and eolian sandstone
(F17, owner decision); rain-history seeding (#176); Wall A has nothing to score until walls
are recorded; a condition-report screen, the only way to validate any of this (#143).

## Drying Time Rules (by rock type)

The table is `MIN_HOURS` / `MAX_HOURS` in
`apps/api/src/lib/scoring/dryingModel.ts`, which carries each row's confidence marker;
everything imports it rather than keeping a copy. Crag A uses `MAX_HOURS` as a full soak's
need and `MIN_HOURS` only for the `wet` / `drying` boundary.

**Changed 2026-09-23 by owner decision: the full taxonomy of
`rock-drying-research.md` §7**, twenty-seven values where there were seven. Hours are for a
moderate storm on a vertical wall, before the angle modifier. **No row is a measured drying
time**: §8 records that none exists for any climbing rock.

```
slate                       1-4h
granite (fresh)             1-6h     was 2-12h
anorthosite, quartzite      1-6h
rhyolite, basalt_dense      2-8h
gneiss_schist               2-12h
granite_weathered           3-12h
tuff_welded                 4-16h
limestone_dense             4-18h
dolomite, carbonate_cherty  6-24h
basalt_vesicular, sandstone_ferruginous,
  sandstone_arkose                                      12-48h
sandstone_quartz_arenite, syenite_porous                24-48h   was 6-24h, 12-48h
limestone_porous, conglomerate                          24-72h
tuff_nonwelded, sandstone_eolian                        36-96h
sandstone_soft, volcanic_breccia                        48-120h  breccia was 12-48h

basalt     12-48h   kind not recorded → basalt_vesicular
limestone  24-72h   kind not recorded → limestone_porous     was 6-24h
sandstone  48-120h  kind not recorded → sandstone_soft       was 24-72h
unknown    48-120h  the most conservative row (§6.2)         was 24-48h
```

**The not-recorded values take the slowest window in their family**: not knowing which
sandstone reads as caution, not as an average. `unknown` is the most conservative row in the
table, which closes `rock-drying-research.md` §6.2. A new rock type that undercuts `unknown`
breaks that rule.

**A location on a known crag has its rock type locked from the research**
(`packages/types/src/knownCrags.ts`, applied on save by `resolveRockType`). The fix for a real
crag reading wrong is a real rock type.

Fresh granite (6h) dries before dense basalt (8h); §7 re-examined granite.

**Angle** (`dryingAngleFactor`): 0° vertical is the base, a 90° slab takes 30% longer, an
overhang takes the vertical base. Crag A's eight walls are vertical, so it always uses the base.

## Retired: the five-component scorer

`conditionsScore.ts` (drying 40, rain 25, wind 15, temperature 12, humidity 8) was deleted in
scoring Phase 5b (2026-10-01), with its station-rainfall lookup, `compare:scoring` and the
`conditions_scores` table. No score had rendered from it since Crag A went live. If a
comparison ever needs it, read it from version history; do not rebuild it.
