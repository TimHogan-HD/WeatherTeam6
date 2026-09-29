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

- `cragModel.ts` — **Crag A, the number on every screen** (`evaluateCragA`,
  `dayRepresentative`), plus Wall A (`evaluateWallA`), which nothing calls yet. Called from
  `lib/runs/hourlyReadings.ts`. Checked hour for hour against
  `.claude/docs/crag-a-reference/model.ts`.
- `rockThermal.ts`, `hourlyConditions.ts` — the v2 layers. They supply Crag A's `T_mass`,
  `T_surface` and weather-sped drying rate; v2's own score and `sweatBalance.ts` friction
  reach no response.
- `dryingModel.ts` — hours since significant rain and the one `MIN_HOURS`/`MAX_HOURS` table,
  shared by every model.
- `conditionsScore.ts` — the legacy five-component scorer, `conditionsScore(input: ScoreInput):
  ScoreOutput`, synchronous and pure. Computed per day by `liveForecast.ts`; no score renders
  from it, but it still feeds the drying card's `Climbable in ~Nh` line (#178). Phase 5
  deletes it.
- `liveForecast.ts` — `computeLiveForecast(location)`: fetch, score per day, return. Nothing
  is persisted; its synthesized `id`s (`${locationId}:${date}`) are not stable across requests.

`ScoreInput`, `ScoreOutput` and `ScoreBreakdown` live in `packages/types`. Never redeclare them.
`ScoreInput.currentTempC` is a dead field — no scorer reads it (`defect-patterns.md` §10).

## Gotchas

Crag A:

- A null factor makes a null score, and an unmeasured rain hour nulls every hour after it
  until a full drying window has run. Never default a missing input.
- The day's score is `dayRepresentative`, chosen server-side. A surface must not pick its own
  hour.
- Every constant in `cragModel.ts` is a judgement call. Changing one needs an argument against
  the reference model's test days, not a commit message. Changing how the factors combine
  starts in the scoring-model handoff and `npm run compare:scoring --workspace=apps/api`.

The legacy five-component scorer:

- A `'pre'` window (>14 days out) returns `score: null` with zeroed components — "too far out",
  not "unclimbable". Null means missing data; 0 means genuinely unclimbable.
- `forecastDateDaysOut` >= 7 forces `confidence = 'low'` regardless of spread.
- `hoursSinceRain` is 0 while it is raining, never negative.
- Clamp the final score to 0–100.
- `currentWindKmh` and `currentHumidityPct` are read once from today and passed for every
  day. Both stretch `maxDry`, and `currentHumidityPct` also drives the humidity component —
  so every day's humidity component describes today. Making them per-day is a `ScoreInput`
  split (`architecture.md`, "Two inputs are still knowingly today-only").
- Heat costs at most the temperature component's 12 points, so a brutal day can still score
  high. That is why it no longer renders; do not re-weight it.
- Words on a surface come from `summarizeReadings` (`packages/types/src/readingsCopy.ts`),
  never from the number. Do not write a score-to-text mapping.
