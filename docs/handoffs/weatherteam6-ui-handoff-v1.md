# WeatherTeam6: UI Build Handoff
Version: v1
Date: 2026-06-11
Status: Ready for Handoff

## Context
WeatherTeam6 is a single-user climbing conditions app (React Native + Expo). The backend is complete. Phase 7 produced React Query infrastructure, an API client, and a basic Home screen shell. This document covers all remaining UI phases: completing the Home screen through the Radar screen, including stat detail sheets, trip detail, and hourly multi-variable analysis added in this revision.

## Current State
- `apps/mobile` has React Query installed, an API client at `apps/mobile/src/lib/api.ts`, a hooks directory, and a Home screen shell with no real UI
- `packages/design/src/tokens.ts` exists with the full design token set (colors, typography, spacing, radii, shadows, component presets)
- No other screens exist yet
- Bottom nav is not yet implemented

## Phase order
7b (Home) → 7c (Location Detail) → 7e (Locations) → 7f (Stat Detail Sheets) → 7d (Search stub) → 8 (Walls + Setup) → 9 (Trips + Creation) → 9b (Trip Detail) → 10 (General Weather + Search Wired) → 11 (Hourly Multi-Variable Analysis) → 12 (Radar). 7e and 7f were added in this revision to cover screens documented in `weatherteam6UI.html` that had no prior phase; 9b and 11 fill previously-unused phase numbers for the same reason. Sequence can be adjusted, but 7e/7f depend on the Location Detail patterns from 7c, and 9b depends on the Trips List from 9.

## Objective
Build all remaining mobile screens pixel-accurately against the design mockups, using `packages/design/src/tokens.ts` as the single source of truth for all visual values. Never hardcode colors, font sizes, spacing, or radii — always import from tokens.

## Pre-Implementation Checklist
- [ ] Run `npm install` at repo root (links `@weatherteam6/design` into `node_modules`; the dependency was just added to `apps/mobile/package.json` and has not been installed yet)
- [ ] Run `npm run build -w packages/design` (or `turbo run build --filter=@weatherteam6/design`) to generate `packages/design/dist/` — `main`/`types` in its package.json point there and the package will not resolve until this runs
- [ ] Confirm `packages/design/src/tokens.ts` is in place and importable as `@weatherteam6/design/tokens`
- [ ] Confirm `expo-linear-gradient` is installed
- [ ] Confirm `expo-font` is installed
- [ ] Confirm `react-native-svg` is installed
- [ ] Check whether `react-native-gesture-handler` is installed — if not, use `PanResponder` for compass dial drag
- [ ] Confirm `@tabler/icons-react-native` is installed
- [ ] Load Barlow + BarlowCondensed (400/500/600/700) in root `_layout.tsx` via `useFonts` before any screen renders

## Design System (non-negotiable)

### Token source
All visual values come from `packages/design/src/tokens.ts`. Import like:
```ts
import { colors, type, spacing, radius, shadow, components, layout, fonts } from '@weatherteam6/design/tokens'
```
Never hardcode a color, font size, spacing value, or border radius anywhere in the codebase.

### Screen background
Every screen uses a `LinearGradient` from `expo-linear-gradient`:
```tsx
<LinearGradient
  colors={[colors.bgGradientTop, colors.bgGradientMid, colors.bgGradientBottom]}
  locations={[0, 0.45, 1]}
  style={StyleSheet.absoluteFill}
/>
```

### SVG
All data visualizations (sun arc, compass dial, angle profile, radar echoes, horizon ramp, confidence calendar) use `react-native-svg`. The mockup files contain exact SVG geometry — translate directly.

### Icons
Use `@tabler/icons-react-native` throughout. Match icon names 1:1 with the mockup `ICONS` map in `radar-shared.jsx`: `home`, `map-pin`, `calendar`, `radar-2`, `droplet`, `temperature`, `wind`, `cloud`, `bolt`, `player-play`, `chevron-left`, `chevron-right`, `x`, `check`, `plus`, `sun`, `sunrise`, `compass`, `edit`, `info-circle`, `search`, `calendar-plus`, `trending-up`, `history`, `file-text`, `droplet-half`, `current-location`, `cloud-rain`, `cloud-storm`, `target`, `clock`, `gauge`, `ripple`, `arrow-up-right`.

### Contrast rules (locked — never override)
- Labels (`txt4`): min opacity 0.50
- Body copy (`txt3`): min opacity 0.62
- Stat values (`txt2`): min opacity 0.82
- Lime (`good`) is reserved for numbers, accents, primary actions — never for body copy on dark background
- On lime fills: text color must be `colors.onGood` (`#0d1117`)

### Layout constants
- Horizontal screen gutter: `spacing.screenH` (20px)
- Top safe area: `spacing.topSafe` (48px)
- Card padding: `spacing.cardPad` (14px)
- Bottom nav inset: `spacing.bottomInset` (24px)

### Copy rules (locked)
- No climbing opinions ("go / don't go", "send conditions")
- No p10/p50/p90 jargon — plain language only ("models broadly agree", "firms up inside a week")
- Charts fill the full time axis with no gaps
- Score is a derived signal, never the headline — weather leads on every screen
- Always quote data sources by name (NWS, HRRR/ensemble, ACIS climatology, OpenBeta)
- Imperial units throughout: °F, mph, in, ft, mi

## Mockup Reference Files
These files ship alongside this document. They are HTML/CSS/Babel-React prototypes — not production code. Read them for exact layout geometry, SVG math, component structure, and token usage. Translate to React Native. Do not copy web-specific patterns (no CSS vars, no className, no div/span, no inline style strings).

| File | Covers |
|---|---|
| `weatherteam6UI.html` | Home, Locations (All Locations + Crags sub-tabs), Crag Detail (incl. long-press model-comparison drill-down sheets), four weather data sheets (Temp+Wind, Humidity & Moisture, Precipitation, Pressure/Vis/UV/Clouds), Hourly Multi-Variable Analysis, Trips List, Trip Detail (HCR reference trip). Single self-contained HTML/CSS/vanilla-JS file — open directly in a browser. AI hourly analysis feature has been stripped from this file for V1 (see note below); the chart-tap interaction still works and shows a plain stat grid per hour. |
| `radar-shared.jsx` | ICONS map, TopBar, BottomNav, LayerChips, radar primitives (Blob, Pin, Here, BlobField), RingDial, IntensityChart |
| `radar.css` | Canonical token set + radar/scrubber/chart/nav styles |
| `walls-viz.jsx` | SunArc, CompassDial, CompassRose, AngleProfile, CaveProfile |
| `walls-flow.jsx` | WallsClassic, WallsCards, SetupShell, SetupName, SetupCompassDial, SetupCompassRose, SetupTerrain, SetupAngle, SetupAngleCave, SetupReview |
| `walls.css` | Walls list + setup flow styles |
| `trips-flow.jsx` | HorizonRamp, ConfCalendar, TripDest, TripDatesCalendar, TripDatesHorizon, TripName, TripReview |
| `trips.css` | Trip flow styles |

`design-canvas.jsx` is review scaffolding only — ignore entirely.

**Note on `weatherteam6UI.html`:** an earlier draft of this file's Hourly Multi-Variable Analysis screen included a Claude API call that generated a "Go — conditions are suitable for climbing." / "No-go — [reason]." verdict per hour. This directly violated the locked copy rule (no climbing opinions, never "go/don't go") and has been removed entirely — markup, JS, and CSS. The file as it ships here has no AI call of any kind. Do not reintroduce per-hour AI analysis in V1; it's deferred to a later phase and will need its own copy review when it returns.

A second, separate copy-rule pass was also done on this file: several "What This Means" info cells in the Temperature, Wind, and Cloud Cover sheets had hardcoded static text inferring climbing suitability or rope/gear behavior (e.g. a "Sweet Spot · Climbing Temp — 60–75°F is ideal" cell, a wind compass note claiming a specific fabricated drying-speed percentage for a given wall aspect, a "For Climbing · Good — rope easy to manage, chalk stays put" cell, and similar). These were not AI-generated — just copy baked directly into the mockup — and have been rewritten to plain factual readouts (wind character, comfort-range crossing, sun pattern, drying threshold) with no suitability verdict and no fabricated percentages. If translating these sheets, use the corrected copy as written in the file, not as a template for inferring new climbing-opinion phrasing elsewhere.

All screens are designed at **375 x 812** (iPhone logical resolution).

## Bottom Navigation (persistent, all screens)
4 tabs: Home (`home`), Locations (`map-pin`), Trips (`calendar`), Radar (`radar-2`).
Active tab tinted `colors.good`. Inactive tabs `colors.txt3`.
Bottom inset `spacing.bottomInset` (24px) for the home indicator.
Build as a shared `BottomNav` component used by every screen.

---

## Phase 7b: Home Screen

### What to build
Complete the existing Home screen shell. Weather-first entry point for the device's current location. No climbing score on this screen.

### Screen
**Home** (`/`)
- Top bar: location name (lime dot + label), right side current time + menu icon
- Hero: city/state + station id + "Updated N min ago" meta line, then temp hero row (current temp, condition, feels-like + dew point, today's hi/lo)
- Stat grid: wind (speed + direction + gusts), humidity (+ dew point), pressure (+ trend), visibility, UV index, cloud cover, 1H precip
- Daylight bar: sunrise/sunset times, progress track, "now" marker, remaining daylight label
- 72H ensemble precip chart: column chart, 31-member spread shown as paired bars (median + p10–p90 range) per time bucket (Now/Tue PM/Wed AM/.../Fri PM), legend below ("p50 median", "p10–p90 range"). No raw p10/p50/p90 labels in the UI copy itself — the legend is the one place those terms may appear since it's explicitly labeling the chart, not describing conditions in prose.
- Hourly strip: temp / wind / rain% per hour, horizontal scroll, current hour highlighted
- Inline NWS alert bar when active: triangle icon, alert title + expiry, plain-language detail line (CAPE, totals, pressure trend, onset window)
- Pull-to-refresh triggers React Query refetch
- Empty state: search icon + prompt to add a location (only relevant if no current-location permission and no saved locations exist)

### Hooks
- `useCurrentLocation()` — device location → nearest conditions
- `useConditions(locationId)` — `GET /locations/:id/conditions`
- `useForecasts(locationId)` — `GET /locations/:id/forecasts` (for the 72H ensemble chart)
- `useAlerts(locationId)` — `GET /locations/:id/alerts`

### Acceptance criteria
- Screen renders from API with loading skeleton and error state
- Pull-to-refresh works
- Ensemble chart renders median + spread per bucket, fills the full time axis with no gaps
- No score displayed anywhere on this screen
- No hardcoded visual values

### Git checkpoint
`git commit -m "feat(mobile): home screen complete"`

---

## Phase 7c: Location Detail Screen

### What to build
Single crag detail. Weather leads, full page is one scroll — no internal tabs. Score never appears on this screen; it lives in the Walls button and on the Walls screen itself (Phase 8).

### Screen
**Location Detail** (`/locations/:id`)
- Top bar: back chevron + "Locations", heart (favorite) + overflow icons right
- Hero: crag name (`type.screenTitle`), rock type + county/state + distance + ASOS station + "Updated N min ago" as `components.sourceBadge`-style meta line, then temp hero row (current temp, condition, feels-like + dew point, today's hi/lo)
- Stat grid: wind (speed + direction + gusts), humidity (+ dew point), pressure (+ trend arrow), visibility, UV index, cloud cover, 1H precip, remaining daylight. Same data-cell pattern as Home.
- Small uppercase hint right-aligned under the stat grid: "Long press any tile for model data" (drives the bottom-sheet drill-down, see below)
- Daylight bar: sunrise/sunset times, progress track, "now" marker
- 72H precip line chart (`react-native-svg`): dual-line chart, dashed line for probability % (top half), solid line for accumulation amount (bottom half), shared time axis (Now/+12h/+24h/+36h/+48h/+60h/+72h), legend below. Fills full time axis, no gaps.
- Hourly strip: temp / wind / rain% per hour, horizontal scroll, current hour highlighted
- 7-day table: day-of-week, rain total, horizontal bar proportional to rain amount, hi/lo. Toggle row above lets the table re-key to Rain / Temp / Wind / Humid (Rain is default and the only variant required for V1; stub the others as disabled toggle options sharing the same row layout)
- Inline NWS alert card when active: triangle icon, alert title + expiry, plain-language detail line (CAPE, totals, pressure trend, onset window). No alert tier badge needed here — that's a Phase 7c addition only if NWS gives a tier; otherwise render the single active alert as shown
- Walls button (full-width row, tappable): mountain icon, "Walls" + "`N` defined · Tap to see climb conditions", right side shows up to 3 score pills (lime/amber/red) for existing walls + chevron. Navigates to the Walls screen for this crag (Phase 8). This is the only place climbing score appears on this screen.

### Stat tile long-press → model comparison sheet
Long-pressing any stat tile (wind, humidity, pressure, visibility, UV, clouds) opens a bottom sheet:
- Sheet header: stat name + "Dismiss"
- Source line: crag name · "Now" · ASOS station id
- Current value, large, with unit
- Observed-source caption: station id, timestamp, any secondary reading (e.g. dew point for humidity)
- 24H trend chart: single-line `react-native-svg` chart, 3–5 labeled points, time labels below (12A/4A/8A/12P/Now)
- Model Comparison table: one row per source — ASOS (labeled "Live", highlighted) at top, then GFS / ECMWF / HRRR / NBM / NAM. Each row: name, horizontal bar scaled to value, value, delta vs. ASOS (colored lime if closer to observed, amber if it overshoots — use existing tier color logic, do not invent a new one)
- Spread summary row: Model Low / Observed / Model High / Spread (±N), four cells
- This is a single reusable component (`StatDrillSheet` or similar) parameterized by stat type — build it once, wire it to all six stat tiles

### Hooks
- `useLocation(id)` — `GET /locations/:id`
- `useConditions(locationId)` — `GET /locations/:id/conditions`
- `useForecasts(locationId)` — `GET /locations/:id/forecasts`
- `useAlerts(locationId)` — `GET /locations/:id/alerts`
- `useModelComparison(locationId, stat)` — new hook; backend endpoint for per-model breakdown does not yet exist and needs to be added in this phase or flagged back to backend work if out of scope for a UI-only phase

### Acceptance criteria
- Full screen renders as a single scroll, no tab bar within the screen
- Precip chart fills full time axis with no gaps
- Score appears only on the Walls button (as pills) — nowhere else on this screen
- Long-press on any of the six listed stat tiles opens the model comparison sheet with real data
- Walls button navigates to the Walls screen, scoped to this crag
- No hardcoded visual values

### Git checkpoint
`git commit -m "feat(mobile): location detail screen complete"`

---

## Phase 7e: Locations Screen

### What to build
Top-level Locations screen (the second bottom-nav tab). Two sub-tabs: All Locations (pure weather, every saved/nearby location) and Crags (climbing data, saved/nearby crags only). Same row-expand interaction pattern in both.

### Screen
**Locations** (`/locations`)
- Top bar: "Locations" title + map icon
- Search bar (stub is fine here if Phase 7d/10's search isn't wired yet; otherwise reuse it)
- Sub-tabs: All Locations | Crags
- Filter row: chips ("Saved" / "Nearby" on All Locations; "Saved" / "Nearby" / "Climbable" on Crags) + sort control ("Sort: Distance" on All Locations, "Sort: Score" on Crags)

**All Locations tab**
- Section label "Saved · N locations"
- Row: location icon (current-location icon + lime tint for the device's current location, map-pin for others), name, sub-label (city/state or "Saved · N mi [direction]"), right side temp + condition + chevron
- Tap a row to expand in place: weather stat row (humidity/wind/precip/visibility) + 3-day mini strip (day, temp, hi/lo, rain) + "Full Weather" button linking to that location's detail
- Section label "Nearby · Not saved" below the saved list: pin icon, name, distance, temp, "+ Save" action

**Crags tab**
- Section label "Saved Crags · N locations"
- Row: score badge (number + Good/Fair/Poor label, colored lime/amber/red — same tiering as everywhere else) replaces the plain location icon, name, sub-label ("Rock type · Aspect · distance"), right side temp + "Nh dry" + chevron
- Expand in place: 3-day strip with a status dot per day (good/fair/poor dot under temp+rain) + stat row (humidity/wind/"Dry Since"/"72H Fcst") + a single drying-status line (dot + plain-language sentence, e.g. "18h dry · limestone climbable after 6h · well past threshold. Dry through Wednesday.") + "Full Conditions" button linking to Location Detail
- Section label "Nearby Crags · Not saved" below: score chip, name, "Rock type · aspect · distance · Nh dry", temp, "+ Save"

### Hooks
- `useLocations({ type: 'all' | 'crags' })` — `GET /locations?type=`
- `useNearbyLocations({ type })` — `GET /locations/nearby?type=`
- `useSaveLocation()` — mutation for "+ Save" action

### Acceptance criteria
- Both sub-tabs render with correct row variant (plain weather vs. score-led)
- Row expand/collapse works and shows the correct expanded content per tab
- Score badge colors and drying-status copy follow existing tier color rules, no new copy patterns invented
- "+ Save" persists via API and moves the row from Nearby to Saved
- No hardcoded visual values

### Git checkpoint
`git commit -m "feat(mobile): locations screen with all-locations and crags tabs"`

---

## Phase 7f: Stat Detail Sheets (Temperature, Wind, Humidity & Moisture, Precipitation, Pressure, Visibility, UV Index, Cloud Cover)

### What to build
Eight full-screen detail sheets, one per weather variable, reached by tapping (not long-pressing) the corresponding stat tile from Home or Location Detail. These are richer than the Phase 7c model-comparison drill-down — each one is a dedicated screen with its own hero stats, a range/scale visualization, a "What This Means" info grid, a chart, and an hourly strip. Temperature and Wind share one entry point (tap either tile, swipe/scroll between the two); Pressure, Visibility, UV Index, and Cloud Cover share a second swipeable group. Humidity & Moisture and Precipitation are each their own single sheet.

All eight follow the same shell: background mini-grid (4 stat cells with the active one highlighted) behind a sheet with handle, title, "Done" close. Use one shared `DetailSheet` shell component, eight content variants.

### Sheet: Temperature
- Hero row: Current Air Temp (large, with a one-line definition note) + Feels Like (large, with a one-line definition note)
- Today's Range bar: gradient track (cold→hot), needle at current position, ticks for low/comfortable-mark/high
- "What This Means" info grid (4 cells): Feels Like (wind chill delta, factual only), Today's High (timing), Tonight's Low (timing), Comfortable Mark (today's range vs. the 65°F comfort threshold — see corrected copy already in `weatherteam6UI.html`, do not reintroduce a "sweet spot" framing)
- 24H History + 12H Forecast line chart, "Now" marker
- Hourly strip: temp + feels-like per hour

### Sheet: Wind
- Hero row: Sustained Speed + Gusts, each with a one-line definition note
- Compass: N/S/E/W ring, arrow + dot showing current direction, direction name + degrees + a factual coming-from sentence only (no wall-facing drying inference — see corrected copy already in the file)
- Beaufort scale bar: named category + Beaufort number, needle, Calm/Breezy/Strong/Dangerous labels
- "What This Means" info grid (4 cells): Wind Character (factual, Beaufort-based), Drying Threshold (factual — wind above ~12 mph speeds drying, current sustained speed, no fabricated percentage), Chill Effect, Peak Gusts
- 24H Wind chart: sustained (solid) + gusts (dashed), "Now" marker
- Hourly strip: speed + gusts + direction per hour

### Sheet: Humidity & Moisture
- Hero row: Relative Humidity + Dew Point, each with a one-line definition note
- Dew Point Comfort Scale: gradient track, needle, Dry/Comfortable/Humid/Oppressive zone labels
- 24H History + 12H Forecast dual-line chart: RH (solid) + dew point (dashed), "Now" marker
- "What This Means Right Now" grid (4 cells): Feels Like (heat-index delta from RH), Dew Point (comfort framing, no climbing-friction claim — correct any "good friction conditions" language found in the source file the same way the other cells were corrected), Temp–Dew Spread (fog-risk framing), Time to 80% RH (trend projection)
- Hourly strip: RH / dew point / a plain comfort tag per hour (Good/Fair/Poor as a moisture-comfort tier, not a climbing verdict)

### Sheet: Precipitation
- Hero row: Past 1 Hour (ASOS observed, with "ground-truth, station-verified" note) + 72H Forecast Total at p50 (with "median of N ensemble members" note)
- Ensemble Spread chart: p10–p90 shaded band + p50 line, 8 time buckets (Now through +72h). Section label and legend may use p10/p50/p90 terms since they're labeling the chart itself, not describing conditions in prose
- Percentile summary row: p10 (dry scenario) / p50 (most likely) / p90 (wet scenario), three cells
- Model Agreement bar: plain-language sentence ("N of 31 members agree..."), agreement percentage track — this is the model for how ensemble confidence should be phrased everywhere else in the app
- Hourly strip: probability / amount / precip type per hour
- Recent History rows: verified ACIS totals + raw ASOS, source dot per row (verified vs. raw)

### Sheet: Pressure
- Hero row: Current Barometric Pressure + Trend arrow (Falling/Rising/Steady), each with a one-line definition note
- Normal Range bar: gradient track, needle, Storm Low / Normal / Clear High ticks
- "What This Means" info grid (4 cells): Trend, Change Per Hour, Until Storm Arrives (factual radar/rate-based estimate — keep as-is, this is a real meteorological inference not a climbing opinion), Right Now (plain reading)
- 24H Pressure Trend line chart, "Now" marker

### Sheet: Visibility
- Hero row: Current Visibility + Condition (Clear/Haze/etc.), each with a one-line definition note
- Visibility Scale bar: gradient track, needle, fog/rain/haze/clear ticks
- "What Affects Visibility" info grid (4 cells): Fog Risk (temp–dew spread based), Haze/Smoke (air quality based), Tonight (forecast visibility drop), Now (plain reading)
- Hourly strip: visibility distance + a Clear/Good/Reduced/Poor tag per hour

### Sheet: UV Index
- Hero row: Current UV Index + Risk Level, each with a one-line definition note
- UV scale bar: 11-segment gradient (green→purple), needle, None/Moderate/High/Very High/Extreme ticks
- "What This Means For a Day Out" info grid (4 cells): Current Risk, Today's Peak (timing), Cloud Cover (UV-reduction factor), UV Below 3 (timing)
- UV Through the Day line chart, peak + now markers

### Sheet: Cloud Cover
- Hero row: Cloud Cover % + Sky Condition (Clear/Partly/Overcast), each with a one-line definition note
- Sky Coverage bar: fill track, Clear/Partly Cloudy/Overcast zone labels
- "What This Means" info grid (4 cells): Sky Covered (plain %), Sun Pattern (factual — mixed vs. sustained exposure, no "good for climbing" framing, see corrected copy already in the file), Trend, Sun Exposure (estimated direct-sun hours on a given wall aspect accounting for cloud cover — this is the one place cloud cover may reference wall aspect, since it's a factual suncalc-derived estimate, not a suitability verdict)
- Cloud Cover Through the Day line chart, "Now" marker
- Hourly strip: cloud % + a Clear/Partly/Mostly/Overcast tag per hour

### Hooks
- `useConditions(locationId)`, `useForecasts(locationId)` — reused from 7b/7c
- `useHistoricalObservations(locationId, variable)` — new hook for 24H history charts (ASOS-backed)
- `usePrecipEnsemble(locationId)` — new hook for the percentile band + model agreement on the Precipitation sheet

### Acceptance criteria
- All eight sheets render with the shared `DetailSheet` shell
- Temperature/Wind swipe together; Pressure/Visibility/UV/Cloud Cover swipe together
- No climbing-suitability verdicts, fabricated percentages, or rope/gear suggestions anywhere in these sheets — copy matches the corrected text already in `weatherteam6UI.html`, not the original draft
- p10/p50/p90 terms appear only in chart legends/section labels on the Precipitation sheet, never in descriptive prose
- All charts fill the full time axis with no gaps
- No hardcoded visual values

### Git checkpoint
`git commit -m "feat(mobile): stat detail sheets complete"`

---

## Phase 7d: Search Screen (stub)

### What to build
Search/add locations UI. Real search wired in Phase 10 — mock data acceptable here.

### Screen
**Search** (modal or stack, accessible from Home empty state)
- Search bar (`components.input`) with search icon, blinking lime cursor when focused
- Results list: crag name, state/park, distance, rock type per row
- Lime check on selected rows
- "Add" action calls API to save location
- Pre-search state: recent locations or placeholder

### Acceptance criteria
- Input renders and accepts text
- Results list renders (mock data acceptable)
- Add action works against real API

### Git checkpoint
`git commit -m "feat(mobile): search screen stub complete"`

---

## Phase 8: Walls Screen + Wall Setup Flow

### What to build
Per-crag wall management. Aspect is terrain-derived and user-confirmed. Angle is user-defined only — no suggestion logic.

### Screens

**Walls Screen**
Two layout variants, togglable via a header control. Toggle state is **persistent per user** (save to AsyncStorage).

**Classic rows** (WallsClassic in `walls-flow.jsx`):
- Each row: 48px circular aspect badge (cardinal letter + amber tick rotated to bearing degrees), wall name + route count + aspect label, drying/sun wtags, score right-aligned
- Wtag states: `dry` (lime tint), `damp` (amber tint), `sun` (sun tint)
- Score color: lime/amber/red per conditions tier
- Dashed "Add a wall" row at bottom

**Data cards** (WallsCards in `walls-flow.jsx`):
- Each wall is a card with SunArc SVG viz: dotted dome from sunrise to sunset, direct-sun window as thick sun-colored arc, travelling sun dot
- Stats: "Direct sun" hours, "Rock state"
- Score top-right

Provenance badges always visible: "Aspect · OpenBeta + terrain" and "Angle · user-defined" as `components.sourceBadge` chips.

**Wall Setup Flow** — 4-step modal
Shared shell pattern (SetupShell in `walls-flow.jsx`): Cancel (x) + "Step N / 4" header, segmented step bar, scrollable body, sticky primary button footer.

**Step 1 — Name**
Crag selector (tap to change) + text input for wall name. Blinking lime cursor on focused input.

**Step 2 — Aspect**
Default to terrain suggestion (2c) if available; fall back to compass dial (2a). All three variants must be implemented.
- **2a Compass dial**: 218px draggable compass. 24 tick marks, N label in `colors.poor`. Lime wedge + knob showing facing direction. Center: direction text, degrees, plain-language caption. Drag rotates wedge, snaps to whole degrees. Use `react-native-gesture-handler` if installed, else `PanResponder`.
- **2b Tap rose**: 8-segment donut. Active segment = lime fill + `colors.onGood` label. Center: selection + degrees. Quick presets: AM sun / PM sun / Shade.
- **2c Terrain suggestion**: card showing proposed aspect + confidence note + mini terrain thumbnail placeholder. Primary: Confirm. Secondary: Pick manually (falls back to 2a dial).

**Step 3 — Angle**
Continuous slider from slab to cave. Live side-profile SVG (`react-native-svg`) redraws at every degree using exact geometry from `walls-viz.jsx` (AngleProfile + CaveProfile). 4 preset chips (Slab / Vert / Steep / Roof) jump the handle; slider remains fully customizable between presets. Readout: degree number + "° past vertical" + named band. Hard stop at ~90° (horizontal cave).

**Step 4 — Review**
Editable summary card. Rows: Wall name, Crag, Aspect (+ source: "Terrain-derived · confirmed" or "User-defined"), Angle (+ "User-defined"). Each row has an edit affordance. Plain-language first-read note. Footer: "Add wall" (primary action).

### State shape
```ts
{
  cragId: string
  wallName: string
  aspectDeg: number             // 0–359
  aspectSource: 'terrain' | 'manual'
  angleDeg: number              // degrees past vertical; 0 = vertical, 90 = cave
  angleBand: 'slab' | 'vertical' | 'steep' | 'roof'
}
```

### Acceptance criteria
- Both list layouts render and toggle; toggle state persists via AsyncStorage
- SunArc SVG renders with correct geometry from `walls-viz.jsx`
- Setup flow navigates forward/back; step bar updates correctly
- Compass dial drag updates facing text live; snaps to whole degrees
- Angle slider redraws side-profile SVG live at every degree
- State does not reset on back navigation
- Wall saved to API on "Add wall"

### Git checkpoint
`git commit -m "feat(mobile): walls screen + setup flow complete"`

---

## Phase 9: Trips Screen + Trip Creation Flow

### What to build
Trip planning. Forecast confidence updates as the trip date nears.

### Screens

**Trips Screen** (`/trips`)
- List of saved trips: trip name, crag(s), date range, days out, confidence badge (High = `colors.good`, Medium = `colors.fair`, Low = `colors.txt3`)
- "New trip" primary button (lime)
- Empty state: prompt to create first trip

**Trip Creation Flow** — 4-step modal
Reuses SetupShell pattern.

**Step 1 — Where** (TripDest in `trips-flow.jsx`)
- Search bar + multi-select crag list
- Each row: score pill (lime/amber/`colors.txt4` for unknown "?"), crag name, distance/meta, check circle
- Selected crags appear as removable `components.chosenChip` chips above the list
- Requires at least 1 crag to enable Continue

**Step 2 — When**
Default to **confidence calendar** (2a). Horizon ramp (2b) available as a toggle.
- **2a Confidence calendar** (ConfCalendar in `trips-flow.jsx`): month grid, each day shaded by forecast reliability. Lime = reliable (≤7d out), amber = trending (≤14d), dim = averages only (>14d). Tap start date, tap end date. Range-start/end cells: `colors.good` fill + `colors.onGood` text, rounded ends. Legend below.
- **2b Horizon ramp** (HorizonRamp in `trips-flow.jsx`): SVG confidence decay curve over 21 days, lime→amber→dim gradient. Selected window as highlighted band. Ranked weekend windows list below.
- Requires dates to enable Continue

**Step 3 — Name**
Optional trip name input + running summary row (crags + date range + days out).

**Step 4 — Review** (TripReview in `trips-flow.jsx`)
- Trip summary header
- Confidence preview hero: percentage + level label + plain-language note + progress bar + "Check back [date] — confidence should reach High" when level is Medium or Low
- Data availability rows: which sources are live for the chosen dates (NWS, HRRR/ensemble, Climatology) with status labels (Live / Soon / Now)
- Footer: "Create trip" (primary action)

### Confidence computation (client-side, recomputes as trip date nears)
```ts
function confidenceLevel(daysOut: number): { pct: number; label: 'High' | 'Medium' | 'Low' } {
  if (daysOut <= 7)  return { pct: 85, label: 'High' }
  if (daysOut <= 14) return { pct: 55, label: 'Medium' }
  return { pct: 25, label: 'Low' }
}
```

### State shape
```ts
{
  name: string
  cragIds: string[]
  startDate: string       // ISO date
  endDate: string
  // derived:
  daysOut: number
  confidenceLevel: 'High' | 'Medium' | 'Low'
  confidencePct: number
}
```

### Acceptance criteria
- Trip list renders with confidence badges colored correctly
- Multi-select works; chips appear and are removable
- Calendar variant renders with correct day shading per confidence tier
- Confidence preview in Step 4 reflects actual selected dates
- "Check back" hint appears for Medium and Low confidence
- Trip saved to API on "Create trip"

### Git checkpoint
`git commit -m "feat(mobile): trips screen + creation flow complete"`

---

## Phase 9b: Trip Detail Screen

### What to build
Tap a trip in the Trips List to reach this screen. Real weather/climbing data for the trip's locations and date range, not the creation flow's projected confidence — this is the "living" view of a trip once created, especially once it's inside the decision window (<7 days).

### Screen
**Trip Detail** (`/trips/:id`)
- Top bar: back chevron + "Trips", edit (pencil) + overflow icons
- Hero: trip name, date range + day count + location count, coordinates/rock type/county/NWS office meta line (when single-location; omit for multi-location trips)
- Confidence row: percentage + level label ("High Confidence") + plain-language note ("N days out — [NWS point forecast / ensemble] is reliable...") + progress track + days-out callout
- Day tabs: one per trip day, each showing day-of-week, date, projected high, condition icon, rain%; the best day gets a "Best Day" tag. Tapping a tab swaps the content below.
- Selected day weather: temp hero (current/projected high for that day) + condition + hi/lo + source line (station id, NWS office, forecast issue date), stat grid (wind + direction, precip% + forecast amount, low, sky condition)
- NWS forecast text card: the literal NWS point-forecast sentence for that day, quoted with source attribution
- Drying status card: rock type + target day, a Climbable/Marginal/Wet tier badge, a progress track with a "wet" marker and min/fully-dry ticks, plain-language note citing the rain-clear event, hours dry, and source (NWS office or ASOS station)
- Sectors list (when the location has named sectors/sub-walls, e.g. HCR): per sector — aspect badge (cardinal direction + one-line sun note), name, route count + grade range + a factual aspect description (e.g. "north-facing canyon wall"), wall-angle provenance note ("not in any public data source — set in app" or the user-defined angle once set), sun timing tag + dry-hours readout. Provenance badges above the list: "Aspect from OpenBeta + terrain", "Angle: user-defined"
- All trip days comparison: one row per day — day name + date (+ "first dry day after rain" or similar factual note when relevant), 4-stat row (high/low/rain%/wind), full NWS text sentence including a factual dry-hours mention. Best day gets a tag and highlighted row style.
- Collapsible "Forecast History" section: tap to expand, shows forecast snapshots over time for the target day (reuses the snapshot-row pattern from the trip creation Step 4 confidence preview — date, bar proportional to forecast rain amount, rain value, confidence tier label per snapshot)

### Hooks
- `useTrip(id)` — `GET /trips/:id`
- `useTripForecast(id)` — per-day forecast for all trip locations
- `useTripSnapshots(id, locationId, date)` — forecast evolution history (6h snapshots, per the Trip Projects background job)
- `useSectors(locationId)` — only if the location has sector data; omit the Sectors section entirely if empty

### Acceptance criteria
- Day tabs switch the selected-day content correctly; best day is tagged
- Drying status card cites a real source (NWS office or ASOS station), not a generic claim
- Sectors section renders only when sector data exists; otherwise omitted cleanly, no empty state needed
- Forecast History section collapses/expands and shows real snapshot data
- No score appears as a bare number without a tier label/color
- No hardcoded visual values

### Git checkpoint
`git commit -m "feat(mobile): trip detail screen complete"`

---

## Phase 10: General Weather + Search Wired

### What to build
Wire real search to the stub from Phase 7d. Add general weather mode for non-climbing locations.

### Search (wired)
- Connect to `GET /locations/search?q=`
- Climbing locations from OpenBeta; geocoding fallback for general locations
- Nearby section using device location if permission granted

### General weather mode
- Non-climbing location detail: Weather tab only — no Walls tab, no Alerts tab, no score anywhere
- All weather data renders identically to the climbing location Weather tab

### Acceptance criteria
- Search returns real results
- Non-climbing locations have no score, no Walls tab, no Alerts tab
- Nearby section works when location permission granted

### Git checkpoint
`git commit -m "feat(mobile): search wired + general weather mode"`

---

## Phase 11: Hourly Multi-Variable Analysis

### What to build
Per-crag single-day deep dive: a tappable hour selector driving four stacked chart groups, with a stat panel for the selected hour. Reached from Location Detail (e.g. tapping the 7-day table's "today" row, or a dedicated entry point — confirm with whoever wires navigation in this phase if no existing trigger is wired yet).

**No AI analysis in V1.** An earlier draft of this screen sent a per-hour prompt to the Claude API that generated a "Go"/"No-go" verdict. That violated the locked copy rule and has been fully removed from `weatherteam6UI.html` — markup, JS, and CSS. Build only the stat-panel version described below. Do not add any AI call, suitability verdict, or generated commentary to this screen for V1.

### Screen
**Hourly Analysis** (`/locations/:id/hourly?date=`)
- Top bar: back chevron + crag name, overflow icon
- Header: date (e.g. "Saturday June 1") + "Hourly conditions · Tap a chart row to view conditions for that hour"
- Hour selector: a horizontal bar canvas colored by climb-score gradient across all 24 hours, tappable/draggable, with a "Select Hour" label that updates to show the tapped time; tick labels at 12A/3A/6A/9A/12P/3P/6P/9P/12A
- Four stacked chart groups, each a multi-line `react-native-svg` chart sharing the same 24-hour x-axis:
  1. **Climb Conditions** — single line, the derived climb score (0–100), drawn as a smoothed curve with a bar-fill gradient underneath colored by score tier (lime/amber/red bands, not a single flat color)
  2. **Moisture** — three lines: Rain% (dashed), Humidity (solid), Dew Point°F (dashed)
  3. **Temperature & Sky** — three lines: Temp°F (solid), Feels°F (dashed), Clouds% (solid, dimmer)
  4. **Wind & Pressure** — two lines: Wind mph (solid), Pressure (dashed)
- Tapping anywhere on the hour selector or a chart row selects that hour and populates the stat panel below
- Stat panel (replaces the old AI panel): header shows the selected hour's time + a score pill (number + Excellent/Good/Fair/Poor tag, tier-colored), then an 8-cell stat grid for that hour: Temp, Humidity, Wind, Rain%, Feels Like, Dew Point, Pressure, Clouds
- "Tap any chart row to view conditions for that hour" hint fades out once an hour is selected

### Score tiering (reuse existing thresholds, do not invent new ones)
```ts
function scoreColor(s: number) {
  if (s >= 80) return colors.good   // Excellent and Good share the lime tier in this view
  if (s >= 60) return colors.good
  if (s >= 40) return colors.fair
  return colors.poor
}
function scoreLabel(s: number) {
  if (s >= 80) return 'Excellent'
  if (s >= 60) return 'Good'
  if (s >= 40) return 'Fair'
  return 'Poor'
}
```

### Hooks
- `useHourlyConditions(locationId, date)` — new hook; needs an endpoint returning all 24 hours of score/temp/feelsLike/clouds/humidity/dewPoint/precip/wind/pressure for a given day. Does not exist yet — flag to backend work if out of scope for a UI-only phase.

### Acceptance criteria
- All four chart groups render on a shared 24-hour axis with no gaps
- Tapping the hour selector or any chart row updates the stat panel
- Score line in the Climb Conditions group reflects tier coloring, not a flat color
- No AI call, no generated text, no "Go"/"No-go" language anywhere on this screen
- No hardcoded visual values

### Git checkpoint
`git commit -m "feat(mobile): hourly multi-variable analysis complete"`

---

## Phase 12: Radar Screen

### What to build
Precipitation radar map with timeline scrubber and layer toggles. **Variation A (classic full-bleed) is the default.** Variation C (data-forward) is available as a toggle.

Reference files: `radar-shared.jsx`, `radar-variations.jsx`, `radar.css`

### Shared elements (both variations)
- Radar map: `colors.mapCanvas` canvas with faint terrain contour grid overlay (translate CSS pattern to SVG or a styled View). Integrate real RainViewer radar tiles over a terrain basemap.
- Crag pins: colored dot (lime/amber/neutral) + `rgba(10,12,16,0.7)` label chip
- "You are here" pin: lime core + pulsing ring. Use `Animated.loop` + `Animated.timing` (2.6s ease-out). Respect `AccessibilityInfo.isReduceMotionEnabled` — stop animation when reduce motion is on.
- Timeline scrubber: 40px lime-tinted play circle, track with past fill (`colors.rain`), NOW marker, lime draggable handle, ticks (-2H … NOW … +2H). Intensity legend bar using `colors.radarLight/Moderate/Heavy/Severe`.
- Layer toggles: Precip / Temp / Wind / Cloud / Lightning. Use `components.layerChip` / `components.layerChipActive`.

### Variation A — Classic full-bleed (default)
- Map fills the screen
- Approaching-cell callout: `colors.poor`-bordered card with storm motion + ETA
- Scrubber + legend docked at base
- Layer chips at top

### Variation C — Data-forward (toggle from header control)
- Map 150px strip at top
- Radial ETA dial: SVG arc ("38 min to nearest cell"), bearing, cell speed, peak intensity, clears-at. Exact geometry in `radar-shared.jsx` (RingDial).
- Full-axis precip-intensity area chart below (IntensityChart in `radar-shared.jsx`)
- Layer toggles as segmented control with icons

### Radar intensity ramp
Precip echo blobs are blurred radial SVG gradients colored by `colors.radarLight/Moderate/Heavy/Severe`.

### State shape
```ts
{
  activeLayer: 'precip' | 'temp' | 'wind' | 'cloud' | 'lightning'
  frameIndex: number
  isPlaying: boolean
  selectedCragId: string | null
  variation: 'A' | 'C'
}
```

### Acceptance criteria
- Map renders with RainViewer tiles (or correctly styled placeholder)
- Scrubber drag and play both advance frames
- Layer toggle switches the active overlay
- Both variations render and toggle correctly
- Pulsing ring animates; stops when reduce motion is on
- No hardcoded visual values

### Git checkpoint
`git commit -m "feat(mobile): radar screen complete"`

---

## Constraints / Non-Goals
- No auth UI — `AUTH_ENABLED` is off, single user
- No backend changes in any of these phases
- Wall angle has no public data source — user-defined only, no suggestion logic
- Wall aspect terrain suggestion is UI only — no new backend endpoint needed
- No map tile provider decision required — use RainViewer for radar, defer basemap

## Known Risks / Watch Points
- `letterSpacing` in RN is in points not em — use values from `tokens.ts` directly, never re-derive
- `gap` in flex requires RN 0.71+ / Expo SDK 47+. If unavailable, use `marginRight`/`marginBottom` on children
- Compass dial drag: use `react-native-gesture-handler` if installed, else `PanResponder`
- `expo-linear-gradient`, `react-native-svg`, `expo-font`, `@tabler/icons-react-native` must all be installed before starting — verify in pre-implementation checklist
- Barlow fonts must load in `_layout.tsx` before any screen renders or text will flash unstyled
