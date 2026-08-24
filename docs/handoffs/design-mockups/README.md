# Handoff: WeatherTeam6 — Radar, Walls & Trip Creation

> ## ⚠️ ARCHIVED — describes the React Native app, which is no longer being built
>
> Direction changed **2026-07-31**: WeatherTeam6 is now a Telegram bot + Telegram Mini App.
> `apps/mobile` is archived and out of the build. This document is retained as a historical
> record of the mobile-era design and **must not be used as a spec for new work**.
>
> Current direction: `docs/handoffs/telegram-crossover-v4.md`. Current roadmap:
> `.claude/docs/plan.md`.


## Overview
WeatherTeam6 is a **climbing-specific weather app** (React Native + Expo front end; Node/TypeScript + Postgres back end). It tells a climber whether a crag is climbable now, over the next 7 days, and helps plan trips weeks out as forecast confidence builds. **Weather data always leads; the climbing score is a derived signal, never the headline.**

This bundle covers three feature areas that were designed but not yet built:
1. **Radar screen** — 4 exploratory directions
2. **Walls screen + Wall setup flow** — 2 list layouts + a 4-step add-a-wall flow
3. **Trip creation flow** — a 4-step new-trip flow

## About the Design Files
The files in this bundle are **design references created in HTML/CSS/React-in-Babel** — prototypes showing intended look and behavior. **They are not production code to copy directly.** Your task is to **recreate these designs in the Crux Conditions codebase** (React Native + Expo) using its established components, navigation, and styling patterns. The HTML uses inline SVG, plain CSS, and React only as a rendering convenience for the mockup; translate the layouts, tokens, and interactions into the native environment.

The designs are laid out on a pannable "design canvas" (the `design-canvas.jsx` wrapper). That wrapper is **scaffolding for review only** — ignore it when implementing. Each phone screen is the content of a `<DCArtboard>` at **375 × 812** (iPhone logical resolution).

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and component structure are all intentional and match the locked design system. Recreate pixel-accurately using the codebase's existing libraries. The only deliberately abstract element is the **radar/terrain basemap**, which is a styled placeholder — drop in the real map/terrain tiles in implementation (see Assets).

What is static in the mocks (and must become real in code): slider drag, calendar/date selection, compass dial drag, multi-step navigation, crag multi-select. These are described under **Interactions & Behavior**.

---

## Design System (Locked)

### Colors / Design Tokens
All UI lives on a fixed dark gradient. Tokens are defined once on the `.crux-phone` root in `radar.css`:

| Token | Value | Use |
|---|---|---|
| Background gradient | `linear-gradient(180deg, #4a5568 0%, #1a202c 45%, #0d1117 100%)` | Every screen background |
| Map/near-black | `#0a0e14` | Radar map canvas, deep wells |
| `--txt-1` | `#f0f4f8` | Hero / primary text, stat values |
| `--txt-2` | `rgba(226,232,240,0.82)` | Body copy / stat values (floor 0.82) |
| `--txt-3` | `rgba(226,232,240,0.62)` | Subtitles / meta (body floor 0.65 — round to .62–.65) |
| `--txt-4` | `rgba(226,232,240,0.50)` | Labels / keys (label floor **0.50**) |
| `--txt-5` | `rgba(226,232,240,0.38)` | Time-axis ticks ONLY (below normal floor; reserved) |
| `--card` | `rgba(255,255,255,0.07)` | Default card background |
| `--card-2` | `rgba(255,255,255,0.10)` | Raised/active card background |
| `--line` | `rgba(226,232,240,0.14)` | Default border |
| `--line-2` | `rgba(226,232,240,0.22)` | Stronger border / input outline |
| `--good` | `#b8f542` (lime) | Good conditions, primary action, "high confidence" |
| `--fair` | `#f6ad55` (amber) | Fair conditions, "medium confidence" |
| `--poor` | `#fc8181` (red) | Poor conditions, severe weather, N on compass |
| `--rain` | `rgba(144,205,244,0.95)` | Precip / rain accents, info-blue |
| Sun accent | `rgba(253,186,116,0.9)` | Sun window / direct-sun viz |

**Contrast rule (locked):** minimum opacity 0.50 for any label, 0.65 for body copy, 0.82 for stat values. Never put lime text on the dark gradient for body copy — lime is reserved for numbers/accents/actions. On lime fills, text is `#0d1117`.

### Radar intensity ramp (precip echoes)
`Light` → `rgba(99,179,237,…)` · `Moderate` → `rgba(63,131,248,…)` · `Heavy` → `rgba(246,173,85,…)` (amber) · `Severe` → `rgba(252,129,129,…)` (red). Intensity ties to the same good/fair/poor language used everywhere.

### Typography
- **Display / UI:** `Barlow Condensed` (weights 400/500/600/700). Used for all headings, stat values, labels, nav, buttons. Labels are uppercase with letter-spacing 0.10–0.16em.
- **Body / running copy:** `Barlow` (400/500/600). Used for sentences, hints, metadata, source provenance. Class `.body-font` in the mocks.
- In React Native, load both Barlow and Barlow Condensed via `expo-font` / Google Fonts.

Representative type scale (px @ 375 width):
| Role | Family | Size / Weight | Notes |
|---|---|---|---|
| Screen title | Barlow Condensed | 30 / 700 | `.scr-title`, letter-spacing −0.01em |
| Setup question | Barlow Condensed | 24 / 700 | `.setup-q` |
| Big stat / dial number | Barlow Condensed | 26–46 / 700 | scores, compass dir, angle |
| Card / wall name | Barlow Condensed | 16–17 / 700 | uppercase, 0.03em |
| Body / hint | Barlow | 11–13 / 400–500 | `--txt-3`, line-height 1.5 |
| Label / key | Barlow Condensed | 9–11 / 600 | uppercase, 0.10–0.16em, `--txt-4` |
| Time-axis tick | Barlow Condensed | 9 / 500–700 | `--txt-5` (or `--txt-2` for NOW) |

### Spacing / Radius / Shadow
- **Radius:** cards **10px** (some 11–12px on larger cards), inner elements **7px**, chips/tiles 5–8px, pills/circles 50%.
- **Screen padding:** 20px horizontal is the standard gutter. Top safe area ~46–48px.
- **Card padding:** 12–16px.
- **Gaps:** lists use 6–10px vertical gap; chip rows 5–6px.
- **Shadows:** minimal. Glow accents only — e.g. lime handle `0 0 10–14px rgba(184,245,66,0.5)`, status dots `0 0 8–12px` of their color. No drop shadows on cards (separation is via border + translucency).

### Units
Imperial throughout: °F, mph, inches, feet, miles.

### Copy rules (locked — important)
- **No climbing opinions or assumptions.** Facts and data only. Never "go / don't go", never "send conditions".
- **No p10/p50/p90 jargon.** Plain language ("models broadly agree", "firms up inside a week").
- Charts **fill the full time axis, no gaps**.
- Score is a derived signal, never the headline — weather leads everywhere.
- Wall **angle** is not in any public source → **user-defined only**.
- Wall **aspect** is derivable from canyon geometry / terrain → **suggested, user-confirmed**.
- Always quote data sources by name (NWS, HRRR/ensemble, ACIS climatology, OpenBeta).

### Bottom navigation (persistent)
4 tabs: **Home** (`home`), **Crags** (`map-pin`), **Trips** (`calendar`), **Radar** (`radar-2`). Active tab tinted lime. Bottom inset ~24px for the home indicator.

### Icons
All icons in the mocks are **inline SVG** (Tabler-style, 24×24 viewBox, 2px stroke, `currentColor`), defined in the `ICONS` map at the top of `radar-shared.jsx` and rendered via the `<I n="name" s={size} />` helper. In React Native use your icon library (e.g. `@tabler/icons-react-native` or equivalent) with matching glyph names: `home, map-pin, calendar, radar-2, droplet, temperature, wind, cloud, bolt, player-play, chevron-left/right, x, check, plus, sun, sunrise, compass, edit, info-circle, search, calendar-plus, trending-up, history, file-text, droplet-half, current-location, cloud-rain, cloud-storm, target, clock, gauge, ripple, arrow-up-right`.

---

## Screens / Views

### A. RADAR SCREEN — 4 directions (`Radar Explorations.html`)
A precip-radar map with a **timeline scrubber** (past → future loop) and **layer toggles** (Precip / Temp / Wind / Cloud / Lightning). Pick one direction or mix.

**Shared elements across all four:**
- **Radar map**: near-black `#0a0e14` canvas with faint terrain contour + grid overlay (placeholder for real tiles). Precip "echoes" are blurred radial-gradient blobs colored by the intensity ramp; `mix-blend-mode: screen`.
- **Crag pins**: small dot (lime = good / amber = fair / neutral) with a `rgba(10,12,16,0.7)` label chip. "You are here" = lime core + pulsing ring (`pulsering` keyframe, 2.6s).
- **Timeline scrubber** (`.scrub`): play button (40px lime-tinted circle), a track with a "past" fill (info-blue), a NOW marker, a lime draggable handle, and ticks (−2H … NOW … +2H). Intensity **legend** bar (light→heavy gradient).
- **Layer toggles**: as horizontal chips (`.layer-chip`, active = lime tint), a segmented control (`.seg`), or a floating vertical rail (`.rail`) depending on variation.

1. **A · Classic full-bleed** — map fills the screen; crag pins; an approaching-cell **callout** (red-bordered, storm motion/ETA); scrubber + legend docked at the base. The baseline.
2. **B · Timeline-forward** — map on top (fixed 322px); the loop becomes a tappable **filmstrip** of mini radar frames; layer toggles move to a floating right rail; a `map-readout` banner ("Rain reaches you 2:58 PM").
3. **C · Data-forward** — map demoted to a 150px strip; a **radial ETA dial** (SVG arc, "38 min to nearest cell") + side stats (bearing, cell speed, peak intensity, clears-at); a **full-axis precip-intensity area chart** (same chart language as Home) with its own mini scrubber. Layers as a segmented control with icons.
4. **D · Crag-centric** — map recentred on one wall with **range rings** (5/10/15 mi), a **storm-motion vector** arrow pointing at the crag, a conic **sweep** overlay, and an ETA-to-the-wall readout + storm-track scrubber (NOW … ETA … +3H).

### B. WALLS SCREEN — 2 layouts (`Walls and Setup.html`)
A crag's "walls" are user-defined sectors, each with its own score, drying state, and sun window. Aspect is terrain-derived/confirmed; angle is user-defined. Both carry **provenance badges** (`.src-badge`).

1. **A · Classic rows** (`WallsClassic`) — each wall is a row: a 48px circular **aspect badge** (cardinal letter + a small amber tick rotated to the facing bearing), wall name + route count + aspect, drying/sun **tags** (`.wtag` — lime "Dry" / amber "Damp" / sun window), and a big **score** (lime/amber/red) on the right. A dashed "Add a wall" row at the bottom.
2. **B · Data cards** (`WallsCards`) — each wall is a card with a **sun-arc viz** (`SunArc`): a dotted dome from sunrise→sunset with the **direct-sun window** drawn as a thick sun-colored arc and a travelling sun dot; plus "Direct sun" hours and "Rock state". For people who plan around sun.

### C. WALL SETUP FLOW — add a wall, 4 steps (`Walls and Setup.html`)
Shared shell: `SetupShell` — a header with **Cancel (×)** + "Step N / 4", a segmented **step bar** (done = faded lime, current = solid lime), a scrollable body (question + hint + content), and a sticky footer button (`.btn-primary`, lime).

- **Step 1 · Name** (`SetupName`) — crag selector (tap-through) + a text field for wall name (with a blinking lime cursor in the mock).
- **Step 2 · Aspect — shown 3 ways (choose one in implementation):**
  - **2a · Draggable dial** (`SetupCompassDial`) — a 218px compass with 24 tick marks, cardinal labels (N in red), a lime **wedge** + knob showing the facing direction; center reads the direction ("ESE"), degrees ("122°"), and a plain-language caption. **Drag to rotate.**
  - **2b · Tap rose** (`SetupCompassRose`) — an 8-segment donut (N/NE/E/…); tap a segment to select (active = lime fill, `#0d1117` label). Center shows selection + degrees. Plus quick "AM sun / PM sun / shade" presets.
  - **2c · Terrain suggestion** (`SetupTerrain`) — a card that proposes an aspect derived from canyon geometry ("We think it faces SE · 135°", confidence note) with a mini terrain thumbnail; primary action confirms, secondary "Pick manually" falls back to a dial/rose.
- **Step 3 · Angle** (`SetupAngle`) — **the steepness step.** A live **side-profile** (`AngleProfile`) that tilts as you drag: a rock mass with the climbing face drawn at the chosen angle past vertical, an angle arc + degree label, a climber dot on the face, and a dashed vertical reference. Below: a **continuous slider** spanning Slab → Vertical → Steep → Roof, plus 4 **preset chips** (Slab <0° / Vert 0° / Steep 10–30° / Roof 30°+) as quick-sets on the same scale. Readout: big degree number + "° past vertical" + named band ("Overhanging").
  - **Step 3 (cave variant)** (`SetupAngleCave`) — the same step pushed to the extreme **roof/cave** end: the profile shows a deep horizontal roof (cave) the climber hangs under; readout "92° past vertical · Deep roof · cave"; slider handle near the far end. Use this to confirm the scale runs all the way to a horizontal cave.
- **Step 4 · Review** (`SetupReview`) — an editable summary card (Wall / Crag / Aspect [+ "Terrain-derived · confirmed"] / Angle [+ "User-defined"]), each row with an edit affordance and its **data source**, plus a plain-language "first read" note. Footer: "Add wall".

### D. TRIP CREATION FLOW — 4 steps (`Trip Creation.html`)
Built around the app's core idea: **forecast confidence builds as the date nears.** Reuses `SetupShell`.

- **Step 1 · Where** (`TripDest`) — a search bar + **multi-select** crag list. Each option shows its current score (lime/amber, or "?" when the date is beyond forecast range), distance/meta, and a check. Selected crags appear as removable **chips** above the list.
- **Step 2 · When — shown 2 ways (choose one):**
  - **2a · Confidence calendar** (`TripDatesCalendar`) — a month grid where **each day is shaded/dotted by forecast reliability**: lime "Reliable" (≤7 days out), amber "Trending" (≤14), dim "Averages only" (>14). Selected range highlighted in lime (range-start/end rounded). Legend below.
  - **2b · Horizon ramp** (`TripDatesHorizon`) — an SVG curve of **confidence decaying over 21 days** (lime→amber→dim gradient line + area fill), with the selected window highlighted as a band. Below: ranked **weekend windows** ("Jun 5–7 · High", "Jun 12–14 · Medium", "Jun 19–22 · Low").
- **Step 3 · Name** (`TripName`) — optional trip name field + a running summary ("Taylors Falls + Red Wing · Jun 12–14 · 3 days · 11 days out") and recap chips.
- **Step 4 · Review** (`TripReview`) — trip summary header + a **confidence preview** hero (e.g. "54% · Medium · 11 days out", progress bar, plain-language note, and "Check back Jun 9 — confidence should reach High"), then **data-availability rows** showing which sources feed the trip now (NWS point forecast = Live, HRRR/ensemble = Soon, Climatology = Now). Footer: "Create trip".

---

## Interactions & Behavior
These are static in the mocks and must become real in the app:

- **Radar scrubber**: dragging the handle / pressing play steps the radar frames through time (loop −2H → +2H or per variation). The map echoes, ETA readouts, and (variation C) the chart cursor update with the frame.
- **Layer toggles**: switching a layer swaps the map overlay (precip ↔ temp ↔ wind ↔ cloud ↔ lightning). One active at a time in the segmented/rail variants; chips can be single-select.
- **Compass dial (2a)**: drag to rotate the facing wedge; snap to whole degrees; live-update direction text + caption. **Rose (2b)**: tap a segment to set 8-way aspect. **Terrain (2c)**: confirm or fall through to manual.
- **Angle slider (Step 3)**: continuous drag across the full range (slab→cave). The side-profile redraws live at any degree; preset chips jump the handle to band values but the slider remains fully customizable in between. Hard-stop at a horizontal roof/cave (~90° past vertical) — nothing climbable goes beyond.
- **Crag multi-select (Trip 1)**: tapping a row toggles selection + adds/removes a chip.
- **Date selection (Trip 2)**: calendar = tap start, tap end → range; horizon = tap a window to select. Selected dates drive the Step-4 confidence number.
- **Multi-step nav**: forward via the footer button, back via the header ×/Cancel; the step bar reflects progress. Validate required fields (Step 1 needs ≥1 crag; Trip needs dates) before enabling Continue.
- **Animations**: keep them subtle. "You are here" pulse ring (2.6s ease-out infinite). Entrance transitions optional; respect reduced-motion. No infinite decorative loops on data.

## State Management
- **Radar**: `activeLayer`, `frameIndex` (timeline position), `isPlaying`, `selectedCragId` (for crag-centric). Radar frames keyed by timestamp.
- **Wall setup**: `{ cragId, wallName, aspectDeg | aspect8, aspectSource: 'terrain'|'manual', angleDeg, angleBand }`. Aspect default may come from a terrain-suggestion fetch; angle is purely user input.
- **Trip creation**: `{ name, cragIds: [], startDate, endDate }`. Derived: `daysOut`, `confidencePct`/`confidenceLevel` (a function of how near the dates are + model agreement), and `dataAvailability` (which feeds are live for the chosen dates). Confidence and availability **recompute** as the trip nears — surface a "check back on <date>" hint.
- Persist slider/scrub/selection state so a refresh doesn't lose position (the mocks note this pattern).

## Design Tokens
See the **Design System** section above for the full color, type, spacing, radius, and shadow tables. The canonical source is the `:root`-equivalent block on `.crux-phone` at the top of `radar.css`; `walls.css` and `trips.css` extend it without redefining tokens.

## Assets
- **No bitmap assets ship with this bundle.** All iconography is inline SVG (see `radar-shared.jsx` `ICONS`). All data-viz (radar echoes, dials, sun arc, angle profile, cave profile, confidence calendar, horizon ramp) is hand-built SVG/CSS and should be reimplemented natively (e.g. `react-native-svg`).
- **Map/terrain basemap is a placeholder.** In implementation, integrate the real map + radar tile layers (e.g. RainViewer/NWS radar tiles over a terrain basemap). The mock's contour/grid texture stands in for it.
- **Fonts:** Barlow + Barlow Condensed (Google Fonts) — load via `expo-font`.

## Files
HTML prototypes (open in a browser; each is a pannable canvas of screens):
- `Radar Explorations.html` — radar, 4 variations
- `Walls and Setup.html` — walls list (2) + setup flow (Name, 3 aspect pickers, Angle, **Angle/cave variant**, Review)
- `Trip Creation.html` — trip flow (Where, 2 date pickers, Name, Review)

Supporting source (reference for exact values & SVG geometry):
- `radar.css` — **canonical token set** + radar/scrubber/chart/nav styles
- `walls.css` — walls list + setup flow styles
- `trips.css` — trip flow styles (calendar, horizon, confidence preview)
- `radar-shared.jsx` — `ICONS` map, `<I>` icon helper, `TopBar`, `BottomNav`, `LayerChips`, radar primitives (`Blob`, `Pin`, `Here`, `BlobField`), `RingDial`, `IntensityChart`
- `walls-viz.jsx` — `SunArc`, `CompassDial`, `CompassRose`, `AngleProfile`, `CaveProfile`
- `walls-flow.jsx` — all Walls + setup screen components (incl. `SetupAngle`, `SetupAngleCave`)
- `trips-flow.jsx` — all Trip flow components (`HorizonRamp`, `ConfCalendar`, steps)
- `design-canvas.jsx` — review-only canvas wrapper; **ignore when implementing**

> Note: the `.jsx` files render via in-browser Babel for the mock. Treat them as readable references for layout math, SVG geometry, and exact token usage — not as code to ship.
