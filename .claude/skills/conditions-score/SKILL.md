---
name: conditions-score
description: Use when implementing or modifying the conditions quality score calculation, drying time logic, confidence bands, or anything that produces or consumes a score value. Always read .claude/docs/scoring-algorithm.md alongside this skill.
---

# Conditions Score Implementation

Read `.claude/docs/scoring-algorithm.md` and `.claude/docs/scoring-findings.md` before
implementing. The invariants the scorer must hold are in `.claude/rules/scoring.md` and
`.claude/rules/readings.md`, which load when a scoring file is opened.

## Where things are

`apps/api/src/lib/scoring/`:

- `cragModel.ts` — **Crag A, the number on every screen** (`evaluateCragA`,
  `dayRepresentative`), plus Wall A (`evaluateWallA`), which nothing calls yet. Called from
  `lib/runs/hourlyReadings.ts`. Checked hour for hour against
  `.claude/docs/crag-a-reference/model.ts`.
- `rockThermal.ts`, `hourlyConditions.ts` — the v2 layers. They supply Crag A's `T_mass`,
  `T_surface` and weather-sped drying rate; v2's own score and `sweatBalance.ts` friction
  reach no response.
- `dryingModel.ts` — the one `MIN_HOURS`/`MAX_HOURS` table, shared by every model.
- `liveForecast.ts` — `computeLiveForecast(location)`: the daily forecast, **weather only**,
  and the location's local `todayStr`. Nothing is persisted; its synthesized `id`s
  (`${locationId}:${date}`) are not stable across requests.

The five-component scorer (`conditionsScore.ts`, `ScoreInput`/`ScoreOutput`/`ScoreBreakdown`)
was deleted in scoring Phase 5b (2026-10-01). Recover it from git history if it is ever
needed for comparison; do not rebuild it.

## Gotchas

Crag A:

- A null factor makes a null score, and an unmeasured rain hour nulls every hour after it
  until a full drying window has run. Never default a missing input.
- The day's score is `dayRepresentative`, chosen server-side. A surface must not pick its own
  hour.
- Every constant in `cragModel.ts` is a judgement call. Changing one needs an argument against
  the reference model's test days, not a commit message. Changing how the factors combine
  starts in the scoring-model handoff, and is measured (`compare:dryness`,
  `compare:rock-temp`) before it is proposed.
- Words on a surface come from `summarizeReadings` (`packages/types/src/readingsCopy.ts`),
  never from the number. Do not write a score-to-text mapping.
