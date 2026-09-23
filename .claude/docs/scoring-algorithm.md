# Conditions Scoring Algorithm

Read this before any work on the conditions score. The algorithm is agreed and must not be modified without explicit approval.

## Score Overview
- Output: integer 0-100
- Confidence label: `high` | `medium` | `low`
- Displayed when: location is a crag AND forecast window is <14 days out
- Hidden when: general weather mode (non-crag location)

## Forecast Window Tiers
```
>14 days:   climatological normals only — no score computed
7-14 days:  score computed, confidence = 'low', p10/p90 bands shown
<7 days:    score computed, confidence derived from ensemble spread
```

## Weight Order (non-negotiable)
1. Drying time remaining (highest weight)
2. Upcoming rain in next 72h
3. Wind
4. Temperature
5. Humidity (lowest weight)

## Drying Time Rules (by rock type)

**Changed 2026-09-23 by owner decision: the full taxonomy of
`rock-drying-research.md` §7**, twenty-seven values where there were seven. The table
is `MIN_HOURS` / `MAX_HOURS` in `apps/api/src/lib/scoring/dryingModel.ts`, which
carries each row's confidence marker; `conditionsScore` imports it rather than keeping
a copy. Hours are for a moderate storm on a vertical wall, before the angle modifier.
**No row is a measured drying time** — §8 records that none exists for any climbing
rock.

```
slate                       1-4h
granite (fresh)             1-6h     was 2-12h
anorthosite, quartzite      1-6h
rhyolite, basalt_dense      2-8h
gneiss_schist               2-12h
granite_weathered           3-12h
tuff_welded                 4-16h
limestone_dense             4-18h
dolomite, carbonate_cherty,
  sandstone_quartz_arenite  6-24h
syenite_porous, basalt_vesicular, sandstone_ferruginous,
  sandstone_arkose, volcanic_breccia                    12-48h
limestone_porous, conglomerate                          24-72h
tuff_nonwelded, sandstone_eolian                        36-96h
sandstone_soft                                          48-120h

basalt     12-48h   kind not recorded → basalt_vesicular
limestone  24-72h   kind not recorded → limestone_porous     was 6-24h
sandstone  48-120h  kind not recorded → sandstone_soft       was 24-72h
unknown    48-120h  the most conservative row (§6.2)         was 24-48h
```

**The not-recorded values take the slowest window in their family.** That was
`basalt`'s rule when the family split on 2026-09-16, and it now applies to all three:
not knowing which sandstone reads as caution, not as an average. `unknown` is the
most conservative row in the table, which closes `rock-drying-research.md` §6.2 — it
was 48h against sandstone's 72h, so labelling a crag made the app *more* cautious.

**Every generic row moved, and so did granite.** Any saved location holding
`sandstone`, `limestone`, `granite` or `unknown` reads differently from 2026-09-23.
The fix for a real crag is a real rock type: the picker offers all twenty-seven, and
**a location on a known crag has its rock type locked from the research**
(`packages/types/src/knownCrags.ts`, applied on save by `resolveRockType`).

Fresh granite (6h) now dries before dense basalt (8h). The basalt split had the
opposite order on porosity grounds and noted that granite's 12h "was not
re-examined"; §7 re-examined it.

Drying time is modified by:
- **Cliff angle:** steeper = dries faster (water runs off)
- **Aspect + shade window:** sun exposure accelerates drying
- **Wind:** >20 km/h reduces drying time by 20%
- **Humidity:** >80% RH increases drying time by 30%

## Score Calculation

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

# The ramp is CURVED, not linear, and it curves the way that awards points
# SLOWLY at first (issue #137). At half the drying window it gives 10 of 40,
# where the old linear ramp gave 20. Endpoints are unchanged: 0 at 0 hours,
# 40 at max_dry.
#
# Why: rock strength recovers late, not early. Duda & Renner (GJI) — "much of
# the weakening, if present, occurs at LOW moisture contents" — so a wall that
# is half dry is NOT half recovered, and a linear ramp is most wrong the day
# after rain, when the wall looks dry and someone is deciding whether to drive.
#
# RAMP_EXPONENT = 2 is a JUDGEMENT CALL, not a measurement. The research
# establishes the shape and says nothing about the exponent — nobody has
# measured a drying curve for any climbing rock. See scoring-findings.md §1.2.
#
# Still no step-function at min_dry, and do not add one. A granite wall at 3h
# scores lower than one at 11h on a continuous curve; that part was always right.
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

### Total Score
```
score = drying_score + rain_score + wind_score + temp_score + humidity_score
score = clamp(score, 0, 100)
```

## Confidence Calculation
Derived from ensemble spread (p90 - p10) for precipitation:

```
spread = precip_p90 - precip_p10

if spread <= 2mm:    confidence = 'high'
if spread <= 8mm:    confidence = 'medium'
else:                confidence = 'low'

Also force confidence = 'low' if forecast_date >= 7 days out (7-14 days is the low-confidence window per architecture.md)
```

## Score Labels (for UI)
```
80-100:  Excellent
60-79:   Good
40-59:   Fair
20-39:   Poor
0-19:    Do Not Climb
```

## score_breakdown Shape

Returned in the API response. **Not persisted** — `conditions_scores` has no writer since
the `forecast-snapshot` job was removed; scores are computed live per request. The
authoritative type is `ScoreBreakdown` in `packages/types`; if this doc and that type
disagree, the type wins.
```typescript
{
  drying: {
    score: number,
    hours_since_rain: number,
    hours_remaining: number,
    rock_type: string,
    modifiers: { angle: number, wind: number, humidity: number }
    // NOTE: no `shade` modifier — aspect/sun-exposure was specced but never implemented.
    // ScoreBreakdown in packages/types is authoritative.
  },
  rain: {
    score: number,
    forecast_72h_mm: number
  },
  wind: {
    score: number,
    max_kmh: number
  },
  temp: {
    score: number,
    temp_c: number
  },
  humidity: {
    score: number,
    pct: number
  },
  total: number,
  confidence: string,
  computed_at: string
}
```
