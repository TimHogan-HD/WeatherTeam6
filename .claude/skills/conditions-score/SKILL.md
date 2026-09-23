---
name: conditions-score
description: Use when implementing or modifying the conditions quality score calculation, drying time logic, confidence bands, or anything that produces or consumes a score value. Always read .claude/docs/scoring-algorithm.md alongside this skill.
---

# Conditions Score Implementation

Always read `.claude/docs/scoring-algorithm.md` before implementing. This skill covers the code structure only.

## File Location
`apps/api/src/lib/scoring/` — the actual layout:

```
scoring/
  conditionsScore.ts   # conditionsScore(input: ScoreInput): ScoreOutput — the 5 components
  dryingModel.ts       # dryingModel(input): hours since significant rain, dryness estimate
  liveForecast.ts      # computeLiveForecast(location) — orchestration: fetch, score, return
  climbabilityHistory.ts
  rockThermal.ts       # v2 Layer 1 — T_surface, T_mass, condensation margin, drying rate.
                       # Pure, and NOTHING READS IT YET. Do not reason about production
                       # scores from it; see the v2 scoring-model handoff, Phase 1.
```

Types (`ScoreInput`, `ScoreOutput`, `ScoreBreakdown`) live in **`packages/types`**, not in
a local `types.ts`. Never redeclare them here — shared types are single-source by rule.

## Main Function Signature
```typescript
// apps/api/src/lib/scoring/conditionsScore.ts
import type { ScoreInput, ScoreOutput } from '@weatherteam6/types'

// Synchronous and pure — no I/O, no persistence. All five components are computed
// inline in this one function, not delegated to per-component modules.
export function conditionsScore(input: ScoreInput): ScoreOutput
```

Returns `score: null` with zeroed components when the forecast window is `'pre'`
(>14 days out) — a null score means "too far out to score", not "unclimbable".

Callers get here through `computeLiveForecast()` in `liveForecast.ts`, which does the
fetching and calls this per forecast day.

## Input Type
```typescript
// packages/types — NOT a local types.ts
export type ScoreInput = {
  rockType: RockType           // ROCK_TYPES in packages/types — 27 values
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
}
```

## Drying Modifier Logic
```typescript
// scoring/drying.ts
// The table is MIN_HOURS / MAX_HOURS in dryingModel.ts — 27 rock types since
// 2026-09-23 (rock-drying-research.md §7), and conditionsScore imports it. Do
// not copy it here or anywhere else: a second copy is how the two drifted.
// A location on a KNOWN_CRAGS entry has its rock type locked (resolveRockType).

function applyModifiers(base: number, input: ScoreInput): number {
  let hours = base
  if (input.currentWindKmh > 20) hours *= 0.8       // wind accelerates drying
  // NOTE: implementation keys off currentWindKmh, not maxWindKmh24h. Today both are
  // passed the same value by liveForecast.ts, so the distinction is inert — but don't
  // assume maxWindKmh24h is what drives the drying modifier.
  if (input.currentHumidityPct > 80) hours *= 1.3   // high humidity slows drying
  // cliffAngle = degrees from vertical. 0 = vertical wall (drains fast), 90 = flat slab (drains slow).
  // Higher angle = more slab = slower drainage = longer drying time. This is correct.
  const angleFactor = 1 + (input.cliffAngle / 90) * 0.3
  hours *= angleFactor
  return hours
}
```

## Scores are NOT persisted

**The `forecast-snapshot` job that used to write `conditions_scores` was deleted** on 2026-07-31 (PR #20). Scores are computed **live, per request**, and returned in-memory — nothing is written to `conditions_scores` or `forecast_snapshots` anymore. Those tables still exist in the schema but have no writer.

The orchestration lives in `apps/api/src/lib/scoring/liveForecast.ts`:

```typescript
// Called directly from GET /conditions/:id, GET /forecast/:id,
// and GET /trips/:id/forecast.
const { snapshots, scores } = await computeLiveForecast(location)
```

`computeLiveForecast` synthesizes `id` fields as `` `${locationId}:${date}` `` since nothing is persisted — **do not treat these as stable or lookupable** across requests.

If you ever need persistence back (caching, history), that is a design change — read `.claude/rules/architecture.md` § Background Jobs first, and do not reintroduce a queue to do it.

## Gotchas
- `forecastDateDaysOut` must force `confidence = 'low'` when >7, regardless of spread
- Score = 0 does not mean "no data" — use null for missing data, 0 for genuinely unclimbable
- `hoursSinceRain` should be 0 if it is currently raining, not negative
- Always clamp the final score between 0 and 100
- **Known issue #21, half fixed.** The temp component is capped at 12 of 100 points and saturates above 35 °C, so a location at 39.9 °C (unclimbable) still scores ~85. **The scoring half is still open.** The copy half was fixed twice. 2026-08-26 stopped any surface mapping a score to an opinion; **Phase 3b (2026-09-21) deleted the mapping itself** — `summarizeConditions`, `stateLabel` and `limitingComponent` are gone, and the words on a surface are the v2 readings, from `summarizeReadings` in `packages/types/src/readingsCopy.ts`. Use that function — do not write a new score-to-text mapping anywhere.
- **Known issue:** `computeLiveForecast` derives current wind/temp/humidity once from *today's* forecast day and reuses them for every future day, so a day-7 score's wind/temp/humidity components describe today's weather, not day 7's.
