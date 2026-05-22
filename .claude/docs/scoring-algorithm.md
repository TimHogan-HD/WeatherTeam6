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
sandstone:  24-72h after rain before climbable
limestone:   6-24h after rain before climbable
granite:     2-12h after rain before climbable
basalt:     12-48h after rain before climbable
unknown:    24-48h (use sandstone-conservative default)
```

Drying time is modified by:
- **Cliff angle:** steeper = dries faster (water runs off)
- **Aspect + shade window:** sun exposure accelerates drying
- **Wind:** >20 km/h reduces drying time by 20%
- **Humidity:** >80% RH increases drying time by 30%

## Score Calculation

### Step 1: Drying Time Component (0-40 points)
```
hours_since_rain = now - last_rain_event_start
min_dry = rock_type_min_hours * modifiers
max_dry = rock_type_max_hours * modifiers

if hours_since_rain >= max_dry:   drying_score = 40
if hours_since_rain <= 0:          drying_score = 0
else: drying_score = (hours_since_rain / max_dry) * 40

# Note: this is intentionally a smooth linear ramp from 0 to max_dry.
# There is no step-function at min_dry. A granite wall at 3h scores lower
# than one at 11h on a continuous curve. Do not add a step-function here.

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
22-35°C:          temp_score = scale 12-6
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

Also force confidence = 'low' if forecast_date > 7 days out
```

## Score Labels (for UI)
```
80-100:  Excellent
60-79:   Good
40-59:   Fair
20-39:   Poor
0-19:    Do Not Climb
```

## score_breakdown Shape (stored in conditions_scores.score_breakdown)
```typescript
{
  drying: {
    score: number,
    hours_since_rain: number,
    hours_remaining: number,
    rock_type: string,
    modifiers: { angle: number, shade: number, wind: number, humidity: number }
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
