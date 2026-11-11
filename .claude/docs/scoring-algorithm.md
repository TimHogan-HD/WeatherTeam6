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
| **Wall A** (`evaluateWallA`) | `cragModel.ts` | **Live** beside the crag's score: each lidar wall of a `sun_confirmed` crag on `/hourly` (`lib/runs/wallReadings.ts`, #445). Never a crag's score |
| v2 layers (`rockThermal`, `hourlyConditions`) | `lib/scoring/` | Live as **inputs** to Crag A (`T_mass`, `T_surface`, drying rate). Its own score and sweat-balance friction reach no response |

Where the research lives: `.claude/docs/crag-a-reference/README.md` (why these two models, the
seven errors corrected, what is still open) and `model.ts` beside it. The port has diverged
from `model.ts` on purpose since 2026-11-02 (per-wall condensation floored at half, a
drying floor of one hour per dry hour, since 2026-11-09 new rain adding to the water
left rather than to a storm total, and since 2026-11-10 no exponent on dryness); the README records what that moved. A change that
moves a result needs an argument, not a commit message. `scoring-findings.md` §6d records the switch.

## Crag A

```
score = round(100 × dryness × friction)        # both factors 0-1
```

Neither factor carries an exponent. Friction lost v2's `friction^0.45` because it let heat
through. Dryness lost v2's `^0.55` on 2026-11-10 (#536, owner): on top of the squared ramp it
made the score follow drying progress to the power 1.1, almost a straight line (a quarter,
half and three quarters of the window scored 22, 47, 73; now 6, 25, 56). The 60-point line
that starts good hours moved from 63% to 78% of the window. Either factor null → score null. There is no cap, veto or clamp beyond the 0-1
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
  this is any measurable rain; v2 reset only at 0.5 mm/h. `compare:dryness` measured raising
  it (2026-10-26): it called more wet days dry than it gave dry days back, so it stays.
- **Falling rain:** an hour with ≥ `FALLING_RAIN_MM` (0.5 mm, `REWETTING_PRECIP_MM`) reads
  dryness 0 whatever the storm's size — rain you would see on the rock (owner, 2026-10-26).
  On rock that breaks when wet, any wetting rain still falling also labels the hour `wet`
  (`fallingOn`), so drizzle under that line never reads Drying or joins a best window on
  that rock; its score keeps the scaled dent.
- **Rain size:** rain of `x` inches on dry rock needs
  `MAX_HOURS[rock] × min(1, √(x / 0.4))` hours, so 0.4" needs the rock type's full window
  and a small shower needs less.
- **New rain adds to the water still in the rock** (2026-11-09). The clock carries one
  figure, `R`, the hours of drying still needed. At a wetting hour `R` is turned back into
  the rain that would need it (`0.4" × (R / MAX_HOURS)²`), the hour's rain is added, and `R`
  is sized again from the sum. Rain that never stops adds up to its total. Rain after a dry
  spell adds to what is left, so a shower never erases a soak and never restarts one.
  Until then rain within 24 h of the last wet hour was added to the whole storm and the
  drying since was thrown away: 0.3 mm eighteen hours after a soak took dolomite from 74 to
  0 for another day, while the same 0.3 mm twenty-five hours after cost 19 points. Rain
  more than 24 h after a soak added nothing unless it was the bigger of the two.
- **Drying rate:** each dry hour removes the increase in v2's `effective_dry_hours`, the
  clock that runs faster with sun, wind and vapour-pressure deficit
  (`rockThermal.effectiveDryingHours`), **but never less than one hour** (owner,
  2026-11-02): rock reads dry within `MAX_HOURS` of real time after rain, whatever the
  weather. Rock that breaks when wet is also capped at one (`maxDryingRate`), so it dries at
  exactly elapsed time.
- `dryness = ((N − R) / N)²`, where `N` is the rock's full window
  `MAX_HOURS` and `R` what remains. The square curves slowly at first: rock strength returns
  late (issue #137). The score reads dryness as it is, so the curve reaches the number (#536). **Rain sets the clock back by its size** (owner, 2026-10-26): `N` was the
  storm's own need until then, so every wetting hour read 0 and only the recovery scaled —
  Barn Bluff scored 0 from noon on 2026-10-25 for about 0.03" forecast over a dry afternoon.
  Now a mist dips to ~90 and only a full soak reaches 0; the time to dry, and so the hour the
  rock reads `dry`, is unchanged.
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

condensation = max(0.5, clamp(median over walls of (T_mass + gain_wall − Td) / 2 °C, 0, 1))
heat         = exp(−max(0, Ta − 60 °F) / 12 °C)
humidity     = exp(−max(0, Td − 54 °F) / 10 °C)
cold         = exp(−max(0, 30 °F − Ta) / 12 °C)
```

**Condensation** (`condensationA`, owner 2026-11-02) reads each wall's sun on top of
`T_mass` — Crag A's eight walls, Wall A's one — and is floored at `CONDENSATION_FLOOR`
(0.5, a guess). `gain_wall` is the wall's solar gain lagged like `T_surface`
(`diagnostics.solar_gain_c`), never `T_surface − air`, which also carried the surface's lag
behind the air and chilled every warming morning (#534). `T_mass` alone is a days-long air average; read as the rock, it zeroed every
sunlit hour at Red Wing and Sandstone on 10/31–11/1 that friends checked dry. Because the
margin takes the sun, a missing shortwave withholds friction. Heat, humidity and cold read
air and dew point only (Wall A's heat and cold add the wall's direct sun, below), so they cannot see
an overhang's shade on a warm humid afternoon (G10 / F13 in the reference README). Any input
null → null, never a default.

**Wall A's sun** (`sunWarmingC`, the direct beam on that wall, lagged like `T_surface`):

```
cold = exp(−max(0, 30 °F − (Ta + sun)) / 12 °C)
heat = exp(−max(0, Ta − 60 °F, (Ta + sun) − 60 °F − 15 °F) / 12 °C)
```

Cold reads the sunlit rock in full. Heat reads the larger of the air's excess over 60 °F and
the sunlit rock's over 75 °F (`SUN_HEAT_ALLOWANCE_C`, #537); with no sun the second never wins,
so a shaded or tree-shaded wall reads as Crag A does. Both edges move with the reader's range.
Until #537 the rock was read against 60 °F, as if 86 °F rock in 45 °F air were an 86 °F day: a
sunny 45 °F south wall scored at most 30. The 15 °F was priced against 10–30 °F and against
reading a share of the sun (the table is in the PR for #537); it keeps Red Wing's 2026-10-19 Winter
Wall, reported unbearable, at 31–42 from 11 AM to 2 PM and lifts the 45 °F row to 60. A
judgement call, pending the owner's Winter Wall field test.

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
- **No alert withholds the number** (owner, 2026-10-29), and the number does not wait for
  the alerts query. Warnings show beside the score on the crag screen and the trip screen (`AlertBanner`) and on the list card; a map pin is a dot and carries the score alone. See `.claude/rules/readings.md`.

### Still open

From `crag-a-reference/README.md`: rain-history seeding (#176); Wall A has nothing to score
until walls are recorded; a condition-report screen, the only way to validate any of this
(#143).

**Closed 2026-10-21, F17:** rock that breaks when wet (`rockGuide`'s `whenWet: 'fragile'`, and
`unknown`) never dries faster than elapsed time (`maxDryingRate` in `cragModel.ts`). Red Rock
48 h after 0.5" in January sun went from 76 to 39. The measurements are in the reference
README. Relaxed 2026-11-02: weather no longer slows any rock's clock either (the one-hour
floor above).

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
