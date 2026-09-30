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
| Five-component scorer (`conditionsScore`) | `conditionsScore.ts` | Computed per request, **renders no score**. Still feeds the drying card's `Climbable in ~Nh` line (#178). Phase 5 deletes it. See [Legacy](#legacy-the-five-component-scorer) |

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
  which is why `collect-runs` fetches this one model with `past_days`. The past hours feed the
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

**Shared by Crag A and the legacy scorer.** The table is `MIN_HOURS` / `MAX_HOURS` in
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

## Legacy: the five-component scorer

`conditionsScore.ts`, called per day by `computeLiveForecast`. **No score from it renders.**
It still supplies `drying.hours_remaining` to the drying card's `Climbable in ~Nh` line, which
can disagree with the Crag A `Dryness` reading above it (#178). Phase 5 retires it. Change it
only to keep that line honest; do not re-weight it.

### Forecast Window Tiers
```
>14 days:   climatological normals only — no score computed
7-14 days:  score computed, confidence = 'low', p10/p90 bands shown
<7 days:    score computed, confidence derived from ensemble spread
```

### Weight Order
1. Drying time remaining (highest weight)
2. Upcoming rain in next 72h
3. Wind
4. Temperature
5. Humidity (lowest weight)

Drying time is modified by:
- **Cliff angle:** the angle factor above
- **Wind:** >20 km/h reduces drying time by 20%
- **Humidity:** >80% RH increases drying time by 30%
- Aspect and shade were specced and never implemented

### Step 1: Drying Time Component (0-40 points)
```
# PER DAY BEING SCORED, not once per request (issue #108).
#   as_of        = now + days_out * 24h      — same local time, N days on
#   rain_events  = history up to and including today
#                + FORECAST rain after today, up to the day being scored
#   hours_since_rain = as_of - end of the latest of those events
#
# Rain in the forecast RESETS the clock, so this is not
# `hours_since_rain + days_out * 24`. Anchoring `as_of` at the same local
# time of day means day 0 is exactly `now` — today does not move.
#
# The 720-hour no-rain sentinel is never arithmetic on. It stays 720 on
# every day, because it means "nobody measured any rain", not "720 hours".
min_dry = rock_type_min_hours * modifiers
max_dry = rock_type_max_hours * modifiers

if hours_since_rain >= max_dry:   drying_score = 40
if hours_since_rain <= 0:          drying_score = 0
else: drying_score = (hours_since_rain / max_dry) ** RAMP_EXPONENT * 40   # RAMP_EXPONENT = 2

# CURVED, awarding points SLOWLY at first (issue #137): rock strength recovers
# late, not early (Duda & Renner, GJI). RAMP_EXPONENT = 2 is a JUDGEMENT CALL;
# it may never drop to 1 or below. See scoring-findings.md §1.2.
# No step-function at min_dry, and do not add one.
```

### Step 2: Upcoming Rain Component (0-25 points)
```
forecast_rain_72h = sum of p50 precip for next 72h

if forecast_rain_72h == 0:         rain_score = 25
if forecast_rain_72h >= 10mm:      rain_score = 0
else: rain_score = 25 * (1 - forecast_rain_72h / 10)
```

### Step 3: Wind Component (0-15 points)
```
max_wind_kmh = max wind in next 24h

if max_wind_kmh <= 15:   wind_score = 15
if max_wind_kmh >= 50:   wind_score = 0
else: wind_score = 15 * (1 - (max_wind_kmh - 15) / 35)
```

### Step 4: Temperature Component (0-12 points)
```
temp_c = current or forecast high

Optimal range: 10-22°C
<0°C or >35°C:    temp_score = 0
0-10°C:           temp_score = scale 0-12
10-22°C:          temp_score = 12
22-35°C:          temp_score = scale 12-0   # reaches 0 AT 35, no step (issue #148)
```

### Step 5: Humidity Component (0-8 points)
```
humidity_pct = current RH

if humidity_pct <= 50:   humidity_score = 8
if humidity_pct >= 90:   humidity_score = 0
else: humidity_score = 8 * (1 - (humidity_pct - 50) / 40)
```

### Total and confidence
```
score = clamp(drying + rain + wind + temp + humidity, 0, 100)

spread = precip_p90 - precip_p10
if spread <= 2mm:    confidence = 'high'
if spread <= 8mm:    confidence = 'medium'
else:                confidence = 'low'
force 'low' if forecast_date >= 7 days out
```

The old `Excellent` … `Do Not Climb` label ladder is gone and must not come back; see
[What reaches a screen](#what-reaches-a-screen).

### score_breakdown shape

**Not persisted.** `conditions_scores` has no writer; scores are computed live per request.
The authoritative type is `ScoreBreakdown` in `packages/types`; where this sketch and the type
disagree, the type wins.
```typescript
{
  drying: { score, hours_since_rain, hours_remaining, rock_type,
            modifiers: { angle, wind, humidity } },   // no `shade`: never implemented
  rain:     { score, forecast_72h_mm },
  wind:     { score, max_kmh },
  temp:     { score, temp_c },
  humidity: { score, pct },
  total, confidence, computed_at
}
```
