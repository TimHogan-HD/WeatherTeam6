# Crag A / Wall A — reference model

Scratch research from 2026-09-24, kept so the work survives the session. **None of this is app
code and none of it is shipped.** The live score is still v2 (`hourlyConditions.ts`).

- `model.ts` — every candidate model, test day and error check from the comparison. The
  corrected Crag A and Wall A are `hourScoreOpt('CA' | 'WA', …)` with
  `FIX = { dry: true, snow: true, shelterReal: true, window: 3 }`.
- `wx/` — Open-Meteo hourly forecasts (21 past days + 7 ahead, fetched 2026-09-24) for 10 crags.
  Open-Meteo's daily limit cut coverage: only Squamish has three weather models; several crags
  have one.
- Decision page with every result: https://claude.ai/artifact/GpBjWbgwe3omFZNjVdFUuw (private
  to the owner).

## Run it

```bash
cp .claude/docs/crag-a-reference/model.ts apps/api/src/scripts/crag-a-model.ts
cd apps/api && npx tsx src/scripts/crag-a-model.ts /tmp/out.json   # ~4 min
rm src/scripts/crag-a-model.ts
```

It prints the error checks and accuracy "as picked" and "corrected". Expected corrected output:
crag days 28/28, fresh crag 17/18 (F17), wall days WA 33/33, fresh wall WA 8/10 (G5, G10), one
explained overhang flag at Joshua Tree.

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
  smaller later one). `dryness = min(((N−R)/N)²)` over both.
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

- **Owner decisions:** approve corrected Crag A (primary) and Wall A (walls, later); a minimum
  wait after rain for soft and eolian sandstone (F17: Red Rock reads Go 48 h after 0.5" in
  January); who the testers are.
- G5: an overhang in all-day drizzle scores 0 because the synthetic weather sets dew point =
  air temperature in rain. Check on real drizzle days.
- G10 / F13: the heat rule can't see an overhang's shade on a warm humid afternoon.
- Production needs the rain history seeded (issue #176); the app keeps ~5 trailing days.
- Nothing is validated against outcomes (issue #143).

## Next build, once approved

Crag A as its own module beside v2, shown to testers only, plus a condition-report screen
(crag, time, dry/damp/wet, grip 1–4, wall with aspect and angle if known) that stores the hourly
weather each report was made under, so any model can be re-scored later.
