# Crag A / Wall A — reference model

Research from 2026-09-24. **Shipped the same day** in `apps/api/src/lib/scoring/cragModel.ts`
(owner decision: everyone, no tester gate). Crag A is every location's score; Wall A
(`evaluateWallA`) scores individual walls only and never stands in for a crag. This
directory is the research record; the port has diverged from it since 2026-11-02 (below).

- `model.ts` — every candidate model, test day and error check from the comparison. The
  corrected Crag A and Wall A are `hourScoreOpt('CA' | 'WA', …)` with
  `FIX = { dry: true, snow: true, shelterReal: true, window: 3 }`.
- `wx/` — Open-Meteo hourly forecasts (21 past days + 7 ahead, fetched 2026-09-24) for 10 crags.
  Open-Meteo's daily limit cut coverage: only Squamish has three weather models; several crags
  have one.
- Decision page with every result: https://claude.ai/artifact/GpBjWbgwe3omFZNjVdFUuw (private
  to the owner).

**The port diverges from `model.ts` on purpose since 2026-11-02** (owner, after field checks
at Red Wing and Sandstone on 10/31–11/1 found dry rock through 15 hours the app scored 0):
condensation is read per wall (`T_mass + (T_surface − air) − dew`, median of the eight, floored
at 0.5), and every dry hour credits at least one hour of drying. `model.ts` is unchanged.
Measured here with both ported behind a switch: the drying floor alone passes every check
(moves F3 45 → 67, F12 28 → 54, F17 39 → 48, all in band). With the condensation change too:
crag 24/28, fresh crag 17/18, wall WA 29/33. C11 (warm humid air after a cold snap) 0 → 47,
the floor's alone (a 0.25 floor kept it at 24). C14 4 → 48, C17 9 → 64, C19 7 → 65 and
F9 0 → 47, grey humid days after heavy rain, flip whatever the floor: the mass-only
condensation penalty had been what held them at No. The owner chose this over a 0.25 floor
and over the drying floor alone: field outcomes over the judged test days.

**Third divergence, 2026-11-09: new rain adds to the water left in the rock.** `model.ts`
adds rain within 24 h of the last wet hour to one storm total and resets the clock to that
total's need, which throws away the drying since: 0.3 mm eighteen hours after a soak restarts
the whole window, and the same 0.3 mm twenty-five hours after costs a fraction. Its surface
store never decides a reading, because it is never above the soak store. The port carries one
figure, turns it back into rain at each wetting, adds the hour's rain and sizes again
(`drynessTrack`). Ported into a copy of `model.ts` (line 443, the wetting branch) and run cut
to `accuracy()`: every line unchanged, crag 28/28, fresh crag 18/18, wall WA 33/33 (CA 32/33,
A3), fresh wall 8/10 (G5, G10). No test day has rain after a partial dry-out, so the test days
neither argue for nor against it; the argument is the step.

## Run it

```bash
cp .claude/docs/crag-a-reference/model.ts apps/api/src/scripts/crag-a-model.ts
cd apps/api && npx tsx src/scripts/crag-a-model.ts /tmp/out.json   # 9 min on 2026-10-21
rm src/scripts/crag-a-model.ts
```

It prints the error checks and accuracy "as picked" and "corrected". Expected corrected output:
crag days 28/28, fresh crag 18/18, wall days WA 33/33 (CA 32/33, A3), fresh wall WA 8/10 (G5, G10), one
explained overhang flag at Joshua Tree, and one explained `H5 step in rain amount` (soft
sandstone 24 h after rain, 5 points at 0.018"). Fresh crag was 17/18 (F17) until the
fragile-rock rate cap below, and the H5 flag arrived with it.

The H5 flag is a slope, not a jump. Swept in 0.002" steps, the score runs 86, 83, 78, 73, 69
from 0.014" to 0.022", which is where a sprinkle stops drying out inside the 24 h. Storm sizing
is `√(storm / 0.4")`, steepest near zero. Before the cap the same slope sat at 0.07", where it
falls about a point per step, because weather-sped drying finished small storms early.

To test one change quickly, cut the script's last block (`const modes …` onward) down to
`Object.assign(FIX, { dry: true, snow: true, shelterReal: true, window: 3 })` and a
`console.log(accuracy())`: that runs in under 10 seconds. A full run reaches about 2 GB. Four
started at once on 2026-10-21 each ran out of Node's default heap after 17 minutes without
printing. One alone, with `NODE_OPTIONS=--max-old-space-size=8000`, finished in 9 minutes.

## The model

`score = 100 × dryness^0.55 × friction` (no 0.45 exponent on friction; that weight let heat
through in v2).

**Friction (Crag A's grip, "H"):** `condensation(T_mass − Td, 0→1 over 2 °C) × heat × humidity × cold`
- heat `exp(−max(0, Ta − 60 °F)/12 °C)`, humidity `exp(−max(0, Td − 54 °F)/10 °C)`,
  cold `exp(−max(0, 30 °F − Ta)/12 °C)`. Air temperature and dew point only, so it ignores sun
  and still scores when shortwave is missing (v2 returns null).

**Dryness:** rain-size clock on v2's weather-sped effective hours.
- Storm = rain hours with gaps under 24 h. `need = MAX_HOURS[rock] × min(1, √(storm_in / 0.4))`.
- Two stores: surface (reset by any wetting) and soak (topped up by a storm, never lowered by a
  smaller later one). `dryness = min(((N−R)/N)²)` over both, with `N` the rock's full window
  (`maxH`) and `R = need` at a wetting. Until 2026-10-26 `N` was the storm's own need, so every
  wetting hour read 0 and only the recovery scaled; the owner found that too strict (Barn Bluff,
  2026-10-25: about 0.03" over a dry afternoon scored 0 from noon). Now rain sets the clock back
  by its size, and an hour with ≥ 0.5 mm/h still falling reads 0. The change moved C13
  45 → 65, A1 13 → 43 (now passing on CA), A2 13 → 43 and F12 18 → 28, all inside their bands,
  and nothing else.
- Rock whose guide says it breaks when wet (`whenWet: 'fragile'`, and `unknown`) dries at most
  one hour per elapsed hour: weather can slow its clock, never speed it (F17, 2026-10-21; the
  owner asked for a wait after rain, and this form was picked by the measurement below). The table's hours for those rocks are land-manager waiting times, and the
  hazard is water inside the rock. Tested against two floors on elapsed time since the rain
  (`MIN_HOURS`, and half of `MAX_HOURS`), both scaled by storm size: neither moved F17, because
  48 h had already passed both. The cap moved F17 76 → 39 and kept F18 at 100. It also moved
  F3 86 → 45, C13 86 → 45 and C18 86 → 52, all still inside their expected bands.
- Wetting = ≥ 0.05 mm in the hour (any measurable rain; v2 only resets at 0.5 mm/h). A
  sheltered overhang keeps 0.5 mm/h on the reduced rain, because its shelter factor
  `max(0.1, 1 − deg_past_vertical/30)` was calibrated against that.
- Rain unknown in an hour → that hour and every hour after it are withheld until a full
  `MAX_HOURS` of drying has run.
- Snow: rain at ≤ 0.5 °C builds up as snow water; melt `0.15 mm/h per °C + 0.0015 × shortwave`
  wets the rock again; dryness ≤ 0.25 while ≥ 1 mm lies. The melt rates are a guess nothing has
  checked.
- Seep flag (known seeping crag, storm ≥ 0.75"): dryness ≤ 0.25 for N days. Needs crag data the
  app does not have.

**Crag A** runs the drying clock on eight vertical walls (N, NE, …, NW) through v2's wall
geometry and takes the median each hour. **Wall A** runs the same model on one recorded wall
(aspect, angle, overhang shelter).

**Day score:** best run of 3 consecutive hours between 8 am and 6 pm, each run valued at its
worst hour. Single-hour reads are used for the post-rain test days.

Verdicts: Go ≥ 60, Mid 40–59, No < 40.

## Why these two

Four options were tested (crag/wall × heat-rule grip / rock-temperature grip "G"). The G grip
options (Crag B, Wall B) were dropped: further from expected bands, less agreement across
weather models, and no score when shortwave is missing. Keep them re-scorable from stored
weather in case condition reports show sun matters.

Against v2 as deployed, every test day the winners miss, v2 also misses. v2's extra misses are
muggy, hot, very cold, seeping and overhang-after-rain days, where it calls Go at 75–100.

## Seven errors found and corrected (2026-09-24)

Drizzle read as dry rock; rain falling in real forecast hours scored climbable; a small shower
erased a big soak; more rain scored higher with unknown history; a blank rain reading scored
up to 100; overhang shelter only applied to synthetic weather; snow ignored; a hot day read Go
from one mild 8 am hour. The first correction then wetted overhangs in drizzle, which was fixed
by keeping 0.5 mm/h for sheltered walls.

## Still open

- G5: an overhang in all-day drizzle scores 0 because the synthetic weather sets dew point =
  air temperature in rain. Check on real drizzle days.
- G10 / F13: the heat rule can't see an overhang's shade on a warm humid afternoon.
- The clock starts soaked at the series' first hour. The app keeps 7 trailing days, which a
  92-day replay found enough for every rock type (`compare:trailing-days`, #176); rerun it in
  winter.
- Nothing is validated against outcomes (issue #143).

## Not built

The tester gate was dropped. Still unbuilt: a condition-report screen
(crag, time, dry/damp/wet, grip 1–4, wall with aspect and angle if known) that stores the hourly
weather each report was made under, so any model can be re-scored later.
