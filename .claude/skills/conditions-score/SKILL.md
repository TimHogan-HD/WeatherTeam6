---
name: conditions-score
description: Use when implementing or modifying the conditions quality score calculation, drying time logic, confidence bands, or anything that produces or consumes a score value. Always read .claude/docs/scoring-algorithm.md alongside this skill.
---

# Conditions Score Implementation

Read `.claude/docs/scoring-algorithm.md` and `.claude/docs/scoring-findings.md` before
implementing. The invariants the scorer must hold are in `.claude/rules/architecture.md`
§ Backend Patterns.

## Where things are

`apps/api/src/lib/scoring/`:

- `conditionsScore.ts` — `conditionsScore(input: ScoreInput): ScoreOutput`, synchronous and
  pure; all five components inline, including the drying modifiers (angle, wind, humidity).
- `dryingModel.ts` — hours since significant rain and the one `MIN_HOURS`/`MAX_HOURS` table.
- `liveForecast.ts` — `computeLiveForecast(location)`: fetch, score per day, return. Nothing
  is persisted; its synthesized `id`s (`${locationId}:${date}`) are not stable across requests.
- `rockThermal.ts`, `hourlyConditions.ts`, `sweatBalance.ts` — the v2 readings. They produce
  the number on screen. The five-component score is still computed on every request and
  still feeds the drying card's `Climbable in ~Nh` line (#178), but no score renders from
  it; Phase 5 deletes it.

`ScoreInput`, `ScoreOutput` and `ScoreBreakdown` live in `packages/types`. Never redeclare them.
`ScoreInput.currentTempC` is a dead field — no scorer reads it (`defect-patterns.md` §10).

## Gotchas

- A `'pre'` window (>14 days out) returns `score: null` with zeroed components — "too far out",
  not "unclimbable". Null means missing data; 0 means genuinely unclimbable.
- `forecastDateDaysOut` >= 7 forces `confidence = 'low'` regardless of spread.
- `hoursSinceRain` is 0 while it is raining, never negative.
- Clamp the final score to 0–100.
- `currentWindKmh` and `currentHumidityPct` are read once from today and stretch every day's
  `maxDry`; every other per-day input comes from that day.
- Heat costs at most the temperature component's 12 points, so a brutal day can still score
  high. Changing how components combine starts in the scoring-model handoff and
  `npm run compare:scoring --workspace=apps/api`.
- Words on a surface come from `summarizeReadings` (`packages/types/src/readingsCopy.ts`),
  never from the number. Do not write a score-to-text mapping.
