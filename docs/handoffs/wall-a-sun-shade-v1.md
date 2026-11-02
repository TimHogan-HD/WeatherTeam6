# Sun and shade walls on the Overview: handoff v1

Queued, not built (owner, 2026-11-02). Tracking issue: **#445**, which holds the plan, the open
decisions and the evidence. This file is the entry point a new session reads first; the issue
is where the state is kept.

## Where things stand

- **Built:** Wall A's heat and cold read air plus the direct sun on that wall (#439,
  `sunWarmingC` in `apps/api/src/lib/scoring/cragModel.ts`). Beam only, gated by the lidar
  skyline, zero on a tree-shaded wall, lagged like `T_surface`, null when sunlight was not
  forecast. Nothing calls `evaluateWallA` from a route yet.
- **Wall data:** only Red Wing has lidar walls (`SUN_WALLS['red-wing']`, six walls, generated
  by `npm run sun:walls`; never hand-edit `sunWallsData.ts`). The skyline is bare earth, so
  tree shade must be a hand-set list. Walls carry no area yet (#293).
- **Why it matters:** on 10/4 and 10/19 Crag A read 100 at Red Wing while Winter Wall was
  unbearable. Wall A scores Winter Wall 18–21 at 1 PM on the 10/19 fixture, with the shaded
  side at 100.

## Decided

- Sun vs shade appears on the Overview for crags with wall data. This overrides
  `readings.md`'s "never on the Overview" (2026-10-05); write the override into
  `readings.md` and `scoring.md` in the first PR that ships it.
- Walls are regrouped every hour by whether the sun is on them then. Each group shows its best
  wall, by name.
- **Rule 1:** within ~10 points, show today's Overview plus one quiet line; the sun/shade
  element appears only when the gap is real.
- Tapping the sun/shade element opens a sheet to pick a wall (grouped by area, Auto at the
  top). A pinned card names the wall and its current sun/shade state.
- Wanted next to it: a walls × hours grid on the Crag tab, and ☀/◐ pairs in Next days.

## Open (owner)

Hero layout (idea 3 swipe vs idea 4 one line; Claude recommends 4), the tree-shaded wall list,
the day rule for Next days, and the owner's own field test of Winter Wall at 55 °F and sunny.
Details in #445.

## Mockups

`docs/handoffs/design-mockups/wall-a-sun-shade/`, opened in a browser. "Pine Bluff" is a
made-up crag; Red Wing numbers are real Wall A output for 2026-10-19 from 1 PM.

| File | Shows |
| --- | --- |
| `overview-variants.html` | A (tiles under the hero), B (two scores as the hero), C (two lines on Today) |
| `overview-scale.html` | A and B on a 9-wall, 3-area crag, and the edge states |
| `overview-pick.html` | B with tap-to-pick cards: default, the sheet, a pinned wall |
| `overview-pick-a.html` | The same in A's layout |
| `overview-34.html` | Idea 3 (swipe hero) and idea 4 (one line under the hero), with rule 1 |
| `ideas.html` | Walls × hours grid, "good again at" line, Next days pairs, Profile preference, crag map, follow-the-shade sentence |
