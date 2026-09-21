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
```
sandstone:         24-72h after rain before climbable
limestone:          6-24h after rain before climbable
granite:            2-12h after rain before climbable
basalt:            12-48h  kind not recorded — takes the slower of the two below
basalt_dense:       2-8h   columnar / massive
basalt_vesicular:  12-48h  scoriaceous flow top
unknown:           24-48h (use sandstone-conservative default)
```

**Why basalt is three rows.** Porosity across the family runs **0.1-1.0% for dense
columnar rock and 30-50% for a vesicular flow top** — a wider spread than the gap
between granite and sandstone, and wider than any other family in this enum
(`.claude/docs/rock-drying-research.md` §3). One value had to be wrong for one of
them.

`basalt` is retained and does **not** mean "average basalt" — it means the kind was
never recorded, which is what every row written before this change holds. It keeps
12-48h so no existing location's score moved, and because an unrecorded kind should
read as caution rather than as a guess. That is the rule `unknown` follows, applied
inside one family.

Note `basalt_dense` at 8h is now the fastest-drying row, ahead of granite's 12h.
That follows the porosity (dense basalt is *less* porous than granite); granite's
12h is unchanged and was not re-examined here.

**Known issue, unchanged by the above:** `unknown` at 48h is still less conservative
than `sandstone` at 72h, so supplying a correct rock type can make the app *more*
cautious than leaving it unset — the opposite of what the comment intends. See
`rock-drying-research.md` §6.2.

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
