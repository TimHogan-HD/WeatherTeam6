# Sun and shade walls on the Overview: handoff v1

Phase 1 built; Phases 2 and 3 queued (owner, 2026-11-02). Tracking issue: **#445**, which holds the plan, the open
decisions and the evidence. This file is the entry point a new session reads first; the issue
is where the state is kept.

## Where things stand

- **Built:** Wall A's heat and cold read air plus the direct sun on that wall (#439,
  `sunWarmingC` in `apps/api/src/lib/scoring/cragModel.ts`). Beam only, gated by the lidar
  skyline, zero on a tree-shaded wall, lagged like `T_surface`, null when sunlight was not
  forecast. `/hourly` publishes it per wall as `HourlyReadings.walls` (Phase 1).
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

## Decided 2026-11-02 (owner)

- **Hero layout: idea 4**, one tappable line under the hero (`overview-34.html`).
- **Tree-shaded at Red Wing:** Annadonia, Large Roof, New Vice, Perfect Crimb
  (`KnownCrag.tree_shaded`).
- **Day rule:** the sun group is the walls with at least 2 sun hours inside the climbing
  hours, the shade group the rest; each group's day score is its best wall's.

**Phase 1 (API) is built:** `HourlyReadings.walls` on `/hourly`, paired by `sunShadeAt` and
`sunShadeOnDay` (`packages/types`). `scoring.md` and `readings.md` hold the rules.

**Phase 2 (Overview) is built:** the idea-4 line under the hero, rule 1's quiet line, the
wall sheet, the pinned wall per crag on the device, and Next days pairs
(`apps/miniapp/src/components/WallSunShade.tsx`, `lib/wallLine.ts`). Not built: the two
wall lines the idea-4 mockup adds to the Today chart. **Phase 3** (the walls × hours grid
on the Crag tab) is next.

## Open (owner)

The owner's own field test of Winter Wall at 55 °F and sunny, which settles whether the sun
boost is too strong. Details in #445.

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
