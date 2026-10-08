---
paths:
  - "apps/api/src/lib/scoring/**"
  - "apps/api/src/lib/runs/**"
  - "apps/api/src/lib/preferences/**"
  - "apps/api/src/lib/weather/rainMedian.ts"
  - "apps/api/src/routes/{hourly,conditions,preferences}.ts"
  - "packages/types/src/**"
---

# Scoring rules

How Crag A scores, and what may feed it. Part of the architecture rules, split out of `architecture.md` on 2026-10-08 so it
loads only when a matching file is read or edited. The global rules, and the index of every
scoped file, are in `architecture.md`. Reasoning behind a rule: grep
`.claude/docs/session-archive.md`.

## Scoring model

- **The score on every screen is Crag A (`lib/scoring/cragModel.ts`), owner decision
  2026-09-24.** `score = 100 × dryness^0.55 × friction`, the drying clock on eight vertical
  walls, median taken. A location's score is always Crag A: its recorded aspect and angle are
  not inputs. **Wall A (`evaluateWallA`)** scores individual walls only and nothing calls it
  yet. Friction is condensation × heat × humidity × cold from air temperature, dew point and
  `T_mass` — no sun. A day's score is the worst hour of its best 3-hour run between 08:00 and
  18:00 local (`dayRepresentative`). **Today counts only hours not yet over**
  (`buildHourlyReadings`'s `now`); after 18:00 today has no score. The port is checked
  hour-for-hour against `.claude/docs/crag-a-reference/model.ts` — a change that moves a
  result needs an argument. **Every constant is a judgement call**; nothing is validated
  against outcomes (#143).
- **A reader's temperature range moves Crag A's friction edges, and nothing else** (scoring
  Phase 5, owner decision 2026-10-01). `user_preferences.temp_low_c`/`temp_high_c`, null for
  the default; `TEMP_RANGE_DEFAULT_F` (`packages/types`) is the one spelling of 30–60 °F and
  `COLD_START_C`/`HEAT_START_C` derive from it. `/hourly` and `/conditions` read it per
  request through `tempRangeFor` into `ScoringLocation.range`, so **readings are per reader,
  not per crag** — two partners can see two scores for one crag. A failed read is a
  500, never the default. Limits and the 10 °F minimum gap are `TEMP_RANGE_LIMITS_F`. The
  Phase 0 columns on that table (`ideal_temp_*`, `drying_caution`, `include_sun`,
  `window_min_*`) are read by nothing.
- **`rockThermal.ts` is Layer 1.** Irradiance comes from one deterministic model,
  `gfs_seamless` (`THERMAL_MODEL`); a reading above 1400 W/m² is a gap. **One model is a
  cost decision, not a safety rule** (#212): the mean of GFS, ECMWF and ICON measured 0.2 °F
  better in arid daytime MAE and 1.1 °F in humid, for two more fetches per read and more
  stored history. **`gem_seamless` never feeds irradiance, pooled or alone** (#155). Pooling
  the other three is allowed if a rerun of `compare:rock-temp` earns it — that script tests
  short lead times only, so check days 5–7 first, where GEM went wrong. **`T_surface` is null whenever an input was missing and never degrades to air
  temperature**, and the per-hour `qualified` flag travels with the reading. **The series'
  `T_surface` lags the sun by `SURFACE_TAU_HOURS` (2 h)** — the one rock-thermal constant
  measured against outcomes (`npm run compare:rock-temp`); the drying rate and display read
  the lagged value, `evaluateHour` stays instantaneous.
- **`hourlyConditions.ts` and `sweatBalance.ts` supply `T_mass`, `T_surface` and the drying
  rate** to Crag A (via `evaluateHourlyConditions`); v2's own score and sweat-balance friction
  no longer reach a response. A weighted geometric mean has unbounded slope at zero, so **a new factor must
  approach zero, not reach it** (#148). The hand's vapour-pressure deficit is taken at skin
  temperature, never `T_surface`. `rock.qualified` is false for any drying window containing
  daylight — honest, not a bug.
- **The magnitude fence:** `sweatBalance.sweatFrictionFactor` (skin wettedness → grip) is an
  unmeasured guess, kept and quarantined (owner decision 2026-09-21). **Words and ordering
  reach a screen; 0-1 factors do not** — never "friction 0.29". **Friction is not a word on
  screen either** (owner, 2026-10-05): it graded an unvalidated estimate and read `Great` on
  wet rock. It stays in the score, its penalties reach the reader only through Score
  breakdown, and no surface prints a cause phrase outside it. `FrictionReading` still
  travels on the response (trip records, the condensation qualifier);
  and the app says it is an estimate **once** — in the measurements disclosure
  (`FRICTION_MECHANISM`) and on How the score works, never under every gauge (owner,
  2026-10-02). Factors live under `HourlyConditions.diagnostics`;
  `hourlyConditions.test.ts` fails if one is promoted to the top level. `t_surface_c` and
  `condensation_margin_c` stay renderable. The same fence holds for Crag A's penalties:
  they stay in `diagnostics.penalties`, and only their order reaches a response, as
  `held_back_by` from `heldBackBy` (`cragModel.ts`, #218). The client shows it as
  `Score breakdown` at the top of the measurements panel, suppressed with the score, and
  absent — not a "nothing" row — when no penalty costs a point.
- **The drying clock's rain is the median of the four global models' six-hour means**
  (`lib/weather/rainMedian.ts`, #209, #324), not `THERMAL_MODEL`'s own — GFS alone called wet
  rock dry far more often (`npm run compare:dryness`). Each model is averaged over
  `RAIN_WINDOW` before the median because a per-hour median shrinks a shower the models
  place in different hours, and the clock sizes drying from the storm total; it is a mean,
  never a sum, so totals keep. Measured per day at 0-2 days' lead; a model that did not
  answer an hour is left out of it, never filled from its neighbours. HRRR and NBM are left
  out so a crag abroad gets the same statistic. `readings.rain_models` names the models and
  the measurements disclosure prints them (`dryingRainMechanism`). A thermal run stored
  without a median reads its own rain whole and names only itself; an hour with fewer than
  three models is a gap, never a fallback to GFS. **The Precip tab draws the same four
  models' median hour by hour** (`recentPrecipMedian`), never `best_match` and never
  smoothed — a chart of past rain keeps its hours. Its "last real rain" is `REWETTING_PRECIP_MM` (`packages/types`), which
  `hourlyConditions.SIGNIFICANT_HOURLY_PRECIP_MM` re-exports; a lighter shower never resets
  the headline.
- **There is one drying table, `MIN_HOURS`/`MAX_HOURS` in `dryingModel.ts`, and everything
  imports it.** Never reintroduce a copy. Not-recorded kinds (`sandstone`, `limestone`,
  `basalt`) take their family's slowest window and `unknown` is the slowest row.
- **Every factor ramp reaches its floor at its own band edge — no factor may step** (#148). A
  new factor or band gets a test that walks its input in tenths past both edges.
  `TEMP_BAND_C` no longer feeds any score; it only colours the client's temperature chart.
- **Every degradation path must withhold, never inflate** (#21, #32, #34). Any change to the
  score starts from *"what does this say when the inputs are missing"*, never from
  re-weighting (`scoring-findings.md` §6c).
- **The five-component scorer is gone** (scoring Phase 5b, 2026-10-01): `conditionsScore.ts`,
  its station-rainfall lookup (`acis.ts`), `compare:scoring` and the `conditions_scores`
  table. `computeLiveForecast` now returns weather only. Recover any of it from git history,
  not by rebuilding it.

## State machine: forecast window

- `>14 days out`: climatological normals only, no conditions score
- `7-14 days out`: low-confidence ensemble, score shown with low confidence label
- `<7 days out`: full conditions score active, p10/p90 bands shown
