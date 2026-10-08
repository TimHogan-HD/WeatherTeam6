---
paths:
  - "apps/api/src/lib/{locations,guidebook,logbook}/**"
  - "apps/api/src/lib/weather/climbingAreas*"
  - "apps/api/src/lib/runs/scoringLocation.ts"
  - "apps/api/src/lib/scoring/rockThermal.ts"
  - "apps/api/src/routes/{locations,logbook,guidebook,walls,geocode}.ts"
  - "packages/types/src/{wallAngle,geocodeCopy}.ts"
  - "apps/miniapp/src/**/*{Add,Crag,Guidebook,Logbook,Route,Wall,Location}*"
---

# Locations and rock

Saved places, known crags, rock types, the guidebook snapshot and the logbook. Part of the architecture rules, split out of `architecture.md` on 2026-10-08 so it
loads only when a matching file is read or edited. The global rules, and the index of every
scoped file, are in `architecture.md`. Reasoning behind a rule: grep
`.claude/docs/session-archive.md`.

## Locations and rock

- **A known crag's rock type is locked, and `resolveRockType`
  (`lib/locations/resolveRockType.ts`) is the only place it is applied** on save;
  `npm run locations:lock-known-crags` applies it to existing rows — **only after the API that
  knows the new types has deployed.** `PATCH /locations/:id` refuses a rock-type change on a
  `known_crag` row with a 409. A `KNOWN_CRAGS` entry needs a `crag-facts.json` family mapping
  to exactly one §7 value and a box no larger than ~30 km (`knownCrags.test.ts`).
- **`PATCH /locations/:id` speaks climbers' wall angle** (`wall_angle_deg`, degrees past
  vertical, positive overhanging); `cliff_angle` keeps 0 vertical, 90 slab. `wallAngle.ts`
  (`packages/types`) is the only place the sign flips. **An unknown body key is a 400.** Rules
  in `lib/locations/updateLocation.ts`; `check:edit-location` runs them against Postgres.
- **The solar geometry runs only on a recorded wall.** `scoringLocationFor`
  (`lib/runs/scoringLocation.ts`) builds `wall` only when both `aspect` (16-point compass) and
  `cliff_angle` were recorded; the 45° default and `aspectToDegrees`'s 180 fallback are never
  a recorded wall. With a wall, `rockThermal.wallIrradianceWm2` replaces the horizontal value
  (sun position, Erbs split, isotropic sky) and every computed hour is qualified. The sun is
  taken mid-hour, because Open-Meteo stamps shortwave at the end of the hour it averages. Terrain shading is not modelled (reads hotter —
  the safe direction). An overhang dries on the vertical factor.
- **`insertGeneralLocation` (`lib/locations/createLocation.ts`) is the one write behind
  `POST /locations`.** `is_climbing_location` is always explicit, never inferred
  (`miniapp-design-v1.md` §12). The `/add` subtitle is `placeSubtitle`
  (`packages/types/geocodeCopy.ts`), one implementation (#82).
- **The guidebook is a committed OpenBeta snapshot, never a runtime call**
  (`lib/guidebook/guidebookMn.ts`, `npm run guidebook:pull`), linked by `guidebookFor` on every
  request — nothing stored on `locations`. Conditions are the **crag's**: no wall or route
  screen shows its own reading. "Left to right" renders only where `GuidebookWall.ordered`.
  Walls are listed A–Z and never placed by OpenBeta's coordinates, which are wrong on the
  ground (owner, 2026-09-29). Grade colours (`gradeScale`/`gradeBoulder`, including status
  hues, owner decision 2026-09-29) are for grade marks only, always beside the printed grade.
- **`/add`'s climbing-area search and browse read per-state OpenBeta snapshots**
  (`lib/weather/climbingAreas<Xx>.ts`, `npm run climbing:pull -- <State> <XX>`, one line in
  `STATES`), never OpenBeta at runtime. Browsing walks `parent_id`, never names, which repeat;
  an area whose parent was filtered out lists at its state's top level, and
  `climbingAreas.test.ts` walks every snapshot to prove nothing is unreachable.
- **The logbook sits beside the snapshot, keyed by OpenBeta ids with no FK** (`lib/logbook/`,
  `routes/logbook.ts`). `route_ticks` and `route_todos` are per user; an unknown id is a 404
  (`routeExists`/`areaExists`). `area_locations` is **shared by every account** — a later
  recording replaces the earlier, so the client asks first. **`recorded_by` never leaves the
  API**; `toPosition` builds the response field by field. `POSITION_ACCURACY_MAX_M` (50 m) is
  a judgement call. None has a `location_id`. The CORS preflight must list `PUT`;
  `check:logbook` asserts it.
