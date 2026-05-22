---
name: conditions-score
description: Use when implementing or modifying the conditions quality score calculation, drying time logic, confidence bands, or anything that produces or consumes a score value. Always read .claude/docs/scoring-algorithm.md alongside this skill.
---

# Conditions Score Implementation

Always read `.claude/docs/scoring-algorithm.md` before implementing. This skill covers the code structure only.

## File Location
`apps/api/src/lib/scoring/`

```
scoring/
  index.ts           # main computeScore() export
  drying.ts          # drying time calculation + modifiers
  components.ts      # rain, wind, temp, humidity component scores
  confidence.ts      # ensemble spread → confidence label
  types.ts           # ScoreInput, ScoreOutput, ScoreBreakdown types
```

## Main Function Signature
```typescript
// scoring/index.ts
import type { ScoreInput, ScoreOutput } from './types'

export async function computeScore(input: ScoreInput): Promise<ScoreOutput> {
  const drying = computeDryingScore(input)
  const rain = computeRainScore(input)
  const wind = computeWindScore(input)
  const temp = computeTempScore(input)
  const humidity = computeHumidityScore(input)
  const confidence = computeConfidence(input)

  const total = Math.min(100, Math.max(0,
    drying.score + rain.score + wind.score + temp.score + humidity.score
  ))

  return {
    score: total,
    confidence,
    breakdown: { drying, rain, wind, temp, humidity, total, confidence, computed_at: new Date().toISOString() }
  }
}
```

## Input Type
```typescript
// scoring/types.ts
export type ScoreInput = {
  rockType: 'sandstone' | 'limestone' | 'granite' | 'basalt' | 'unknown'
  cliffAngle: number           // degrees from vertical (0 = vertical, 90 = slab)
  aspectDegrees: number        // wall facing direction in degrees
  hoursSinceRain: number       // hours since last rain event ended
  lastRainMm: number
  forecastRain72hMm: number    // p50 precip sum next 72h
  forecastRain72hP10: number
  forecastRain72hP90: number
  currentWindKmh: number
  maxWindKmh24h: number
  currentTempC: number
  forecastHighC: number
  currentHumidityPct: number
  forecastDateDaysOut: number  // how far out is this forecast
  sunExposureHours: number     // from suncalc shade window
}
```

## Drying Modifier Logic
```typescript
// scoring/drying.ts
const BASE_DRY_HOURS = {
  sandstone: { min: 24, max: 72 },
  limestone: { min: 6,  max: 24 },
  granite:   { min: 2,  max: 12 },
  basalt:    { min: 12, max: 48 },
  unknown:   { min: 24, max: 48 },
}

function applyModifiers(base: number, input: ScoreInput): number {
  let hours = base
  if (input.maxWindKmh24h > 20) hours *= 0.8        // wind accelerates drying
  if (input.currentHumidityPct > 80) hours *= 1.3   // high humidity slows drying
  // cliffAngle = degrees from vertical. 0 = vertical wall (drains fast), 90 = flat slab (drains slow).
  // Higher angle = more slab = slower drainage = longer drying time. This is correct.
  const angleFactor = 1 + (input.cliffAngle / 90) * 0.3
  hours *= angleFactor
  return hours
}
```

## Persisting the Score
Write to `conditions_scores` table after computing. Called by `forecast-snapshot` job:
```typescript
await db.delete(conditionsScores).where(eq(conditionsScores.locationId, locationId))
await db.insert(conditionsScores).values({
  locationId,
  scoredAt: new Date(),
  score: output.score,
  confidence: output.confidence,
  scoreBreakdown: output.breakdown,
  // ... individual component fields
})
```

## Gotchas
- `forecastDateDaysOut` must force `confidence = 'low'` when >7, regardless of spread
- Score = 0 does not mean "no data" — use null for missing data, 0 for genuinely unclimbable
- `hoursSinceRain` should be 0 if it is currently raining, not negative
- Always clamp final score between 0 and 100 before persisting
