# Plan: Phase 7b (Home) + Phase 7c (Location Detail)

## Context
WeatherTeam6 mobile app (React Native + Expo, Expo Router). Phase 7 previously produced React Query infra, an API client, and a basic home/location-detail shell. That shell needs to be replaced with weather-first screens that match the handoff spec.

The handoff's main structural changes from what currently exists:
- Home is currently a **locations list** (`useLocations()` → FlatList of crags). It becomes a **single-location weather dashboard** for the device's current location.
- Location Detail currently shows a **conditions score prominently** + forecast snapshots. It becomes a **score-free, weather-first single scroll** — score only appears in the Walls button row.
- Navigation is currently a **bare Stack**. It becomes a **4-tab bottom nav** (Home / Locations / Trips / Radar).

---

## Decisions made

1. **Design tokens**: `packages/design/src/tokens.ts` already exists on branch `claude/modest-heisenberg-t5ed7o` (committed `7cfc2a3`). Do **not** overwrite — only add missing values. Confirmed diff against plan derivation is in "Token diff notes" section below.
2. **Mockup files**: All 10 JSX/CSS files pushed to repo under `docs/handoffs/design-mockups/`. `weatherteam6UI.html` key sections read directly — Home at lines 1620–1846, Crag Detail at lines 2179–2564. All component structure below reflects the actual HTML, not prose inference.
3. **Weather obs data**: Mock data in hooks (`useWeatherObservations`). Typed interface, placeholder values. Real API wiring is a follow-up task. Phase 7b/7c is "UI structurally complete, explicitly non-functional for weather-obs and hourly data until backend adds those endpoints." Real today: alerts (`/alerts/:locationId` endpoint exists), daylight (client-side suncalc), 72H chart reshaped from existing ForecastSnapshot. Mocked: weather observations, hourly forecast, model comparison.

---

## What Currently Exists (to be replaced/extended)

### app/index.tsx — Home screen
Currently: `useLocations()` → FlatList of location cards (name, rock type, chevron). No weather data shown.
Replacing with: Weather-first dashboard for current location.

### app/location/[id].tsx — Location Detail
Currently: Score hero (48pt number, confidence label) + ComponentBar + ForecastSnapshot rows.
Replacing with: Score-free single scroll — weather stat grid, daylight bar, precip chart, hourly strip, 7-day table, Walls button.

### app/_layout.tsx — Root layout
Currently: Stack with 3 screens (index, location/[id], search).
Replacing with: Nested `(tabs)/_layout.tsx` with 4 bottom tabs; Stack screens become children.

### Existing hooks (keep, some need renaming/augmenting)
- `useLocation(id)` → `/locations/:id` ✅
- `useLocations()` → `/locations` ✅
- `useConditions(locationId)` → `/conditions/:locationId` ✅ (returns ConditionsScore)
- `useForecast(locationId)` → `/forecast/:locationId` ✅ (returns ForecastSnapshot[])

### Missing hooks (must add)
- `useCurrentLocation()` — device GPS → nearest location
- `useAlerts(locationId)` → `/alerts/:locationId` ✅ endpoint exists
- `useForecasts(locationId)` — 72H ensemble chart (maps to `/forecast/:locationId` with reshaping, or new endpoint)
- `useHourlyForecast(locationId)` — hourly strip (no backend endpoint)
- `useDaylight(locationId)` — sunrise/sunset (no backend endpoint)
- `useWeatherObservations(locationId)` — stat grid (temp, wind, humidity, pressure, UV, cloud cover) — **no backend endpoint**

---

## Phase 7b: Home Screen

### Navigation restructure (prerequisite)

```
app/
  (tabs)/
    _layout.tsx        ← new: BottomNav with 4 tabs
    index.tsx          ← was app/index.tsx
    locations.tsx      ← stub for Phase 7e
    trips.tsx          ← stub for Phase 9
    radar.tsx          ← stub for Phase 12
  location/
    [id].tsx           ← stays here, reachable from tab screens
  search.tsx           ← stays (Phase 7d)
```

`BottomNav` component: 4 tabs, active tab `colors.good`, inactive `colors.txt3`, bottom inset `spacing.bottomInset`.

### Layout (375×812 design target)

```
LinearGradient (full-screen, 3-stop: bgGradientTop → bgGradientMid → bgGradientBottom)
SafeAreaView
  ScrollView (pull-to-refresh)
    TopBar                   ← location name + lime dot | current time + menu
    HeroSection              ← city/state + station id + "Updated N min ago"
                               current temp large | condition | feels-like + dew | hi/lo
    StatGrid                 ← 2-col grid: wind, humidity, pressure, visibility, UV, cloud cover, 1H precip
    DaylightBar              ← sunrise | track + now marker | sunset | remaining daylight
    EnsemblePrecipChart      ← 72H, react-native-svg, median bar + p10-p90 range bar per bucket
    HourlyStrip              ← horizontal ScrollView: temp/wind/rain% per hour
    NWSAlertBar?             ← conditional: triangle icon + title + expiry + plain detail line
  EmptyState?                ← if no location permission + no saved locations
```

### Hooks / data plan
- `useCurrentLocation()` — Expo Location API, reverse-geocode to nearest saved location
- `useConditions(locationId)` — existing hook, but NOTE: this returns a climbing score, not raw weather data. For V1, weather data (temp/wind/etc.) will be **mocked** until a weather-obs endpoint exists.
- `useAlerts(locationId)` — new hook, `/alerts/:locationId`
- Weather stat values mocked as typed `WeatherObservation` interface until backend provides them

### Key implementation notes
- `LinearGradient` from `expo-linear-gradient` on every screen
- Token import: `import { colors, spacing, type, radius } from '@weatherteam6/design/tokens'`
- 72H precip chart: must fill full time axis with no gaps; x-axis labels: Now/Tue PM/Wed AM/.../Fri PM
- Pull-to-refresh: `RefreshControl` in ScrollView, calls `queryClient.invalidateQueries()`
- Barlow + BarlowCondensed fonts load in root `_layout.tsx` via `useFonts` before screens render
- No climbing scores, no "go/no-go" language anywhere on this screen

---

## Phase 7c: Location Detail

### Routing
`app/location/[id].tsx` stays at same path. No tab changes needed.

### Layout

```
LinearGradient
SafeAreaView
  ScrollView
    TopBar                   ← back chevron + "Locations" | heart + overflow
    HeroSection              ← crag name (screenTitle) + rock type / county / station / "Updated N min ago"
                               current temp | condition | feels-like | hi/lo
    StatGrid                 ← same 2-col pattern as Home + remaining daylight
                               "Long press any tile for model data" hint (right-aligned, under grid)
    DaylightBar              ← same component as Home
    PrecipChart              ← 72H dual-line SVG: dashed=probability%, solid=accumulation
    HourlyStrip              ← same component as Home
    SevenDayTable            ← day-of-week | rain bar | hi/lo; toggle row stub (Rain only)
    NWSAlertCard?            ← conditional: same inline alert pattern
    WallsButton              ← full-width row: mountain icon | "Walls" + N defined | score pills + chevron
  StatDrillSheet?            ← bottom sheet (portal/Modal), opens on long-press of stat tile
```

### StatDrillSheet (model comparison bottom sheet)
Single reusable component, parameterized by `statType`. Opens as a Modal with slide-up animation.
- Header: stat name + "Dismiss"
- Current value (large)
- 24H trend chart (react-native-svg, 5 labeled points)
- Model Comparison table: ASOS (highlighted) | GFS | ECMWF | HRRR | NBM | NAM
  - Bar scaled to value, delta vs. ASOS (lime if closer, amber if overshoots)
- Spread summary row: Model Low / Observed / Model High / Spread (±N)
- Backend endpoint for model comparison does NOT yet exist; use mock data shape, flag for backend

### Score placement
Score appears ONLY on the WallsButton row (as tier-colored pills) — nowhere else.

### Hooks
- `useLocation(id)` — existing ✅
- `useConditions(id)` — existing ✅ (only used for WallsButton score pills)
- `useAlerts(id)` — new (same hook as 7b)
- Weather obs data — same mocking approach as 7b

---

## File-by-file change list

### New files
- `apps/mobile/app/(tabs)/_layout.tsx` — tab layout + BottomNav
- `apps/mobile/app/(tabs)/index.tsx` — Home screen (move from app/index.tsx)
- `apps/mobile/app/(tabs)/locations.tsx` — stub
- `apps/mobile/app/(tabs)/trips.tsx` — stub
- `apps/mobile/app/(tabs)/radar.tsx` — stub
- `apps/mobile/src/components/BottomNav.tsx`
- `apps/mobile/src/components/TopBar.tsx`
- `apps/mobile/src/components/StatGrid.tsx`
- `apps/mobile/src/components/StatTile.tsx` (with long-press support)
- `apps/mobile/src/components/DaylightBar.tsx`
- `apps/mobile/src/components/EnsemblePrecipChart.tsx` (react-native-svg)
- `apps/mobile/src/components/HourlyStrip.tsx`
- `apps/mobile/src/components/NWSAlertBar.tsx`
- `apps/mobile/src/components/WallsButton.tsx`
- `apps/mobile/src/components/PrecipLineChart.tsx` (for Location Detail's dual-line chart)
- `apps/mobile/src/components/SevenDayTable.tsx`
- `apps/mobile/src/components/StatDrillSheet.tsx`
- `apps/mobile/src/hooks/useAlerts.ts`
- `apps/mobile/src/hooks/useCurrentLocation.ts`

### Modified files
- `apps/mobile/app/_layout.tsx` — add font loading, remove direct screen registrations (move to tab layout)
- `apps/mobile/app/location/[id].tsx` — full rewrite
- `packages/design/src/tokens.ts` — **create if missing** (do not overwrite if present)
- `packages/design/package.json` — **create if missing**
- `apps/mobile/package.json` — ensure `@weatherteam6/design` in dependencies
- `apps/mobile/tsconfig.json` — ensure `@weatherteam6/design/tokens` path maps

### Deleted files
- `apps/mobile/app/index.tsx` — replaced by `(tabs)/index.tsx`

---

## Token diff notes (actual file vs. earlier derivation)

`packages/design/src/tokens.ts` on branch `claude/modest-heisenberg-t5ed7o` is the authoritative source. Do NOT overwrite it. Only add values if genuinely missing.

**Confirmed differences from earlier radar.css derivation:**

| Key | Plan derived | Actual tokens.ts |
|---|---|---|
| `colors.radarTrace` | `rgba(144,205,244,0.40)` | `rgba(144,205,244,0.45)` |
| `colors.radarLight` | `rgba(99,179,237,0.60)` | `rgba(99,179,237,0.65)` |
| `colors.radarMod` → renamed | `radarMod` | **`radarModerate`** |
| `colors.radarModerate` value | `rgba(63,131,248,0.78)` | `rgba(63,131,248,0.75)` |
| `colors.radarHeavy` | `rgba(246,173,85,0.82)` | `rgba(246,173,85,0.80)` |
| `colors.radarSevere` | `rgba(252,129,129,0.92)` | `rgba(252,129,129,0.85)` |
| `shadow.goodGlow` | CSS string `'0 0 14px ...'` | **RN object** `{ shadowColor, shadowOffset, shadowOpacity, shadowRadius, elevation }` |

**Additional tokens in actual file (not in plan's derivation) — use these, don't redeclare:**
- `colors.goodTint = 'rgba(184,245,66,0.10)'`
- `colors.goodTintBorder = 'rgba(184,245,66,0.28)'`
- `colors.fairTint`, `colors.poorTint`, `colors.rainTint` tint variants
- `bottomNav` export: tabs array `["home","Home"], ["map-pin","Crags"], ...` — **override label in tab layout, do not change tokens.ts**

**Bottom nav label resolution**: tokens.ts says `'Crags'`; handoff v1 and Crag Detail HTML both show `'Locations'` as the active tab label. Use `'Locations'` in the tab `_layout.tsx` tab labels — do NOT edit tokens.ts for this.

---

## Confirmed HTML structure (from actual mockup reads)

### Home stat grid (lines 1620–1846)
- **Row 1** (3 cells): Wind `14 mph` / NW · Gusts 22 / has bar; Humidity `62%` / Dew pt 48°F / has bar; Pressure `29.92` inHg / Falling −0.04/h / has bar
- **Row 2** (4 cells): Visibility `10 mi` (no bar); UV Index `warn` badge + `4` / Moderate (no bar); Cloud Cover `45%` (no bar); Precip 1H `0.0"` (no bar)
- Bars render on row 1 cells only

### Home ensemble precip chart
- **Paired vertical bars** (not lines): outer bar = p10–p90 range (dim fill), inner bar = p50 median (bright)
- 8 time buckets: Now / Tue PM / Wed AM / Wed PM / Thu AM / Thu PM / Fri AM / Fri PM
- Legend row: "p50 median" | "p10–p90 range"

### Home hourly strip
- 8 cells scrollable horizontally: Now → …3AM
- Per cell: `hr-time`, `hr-temp`, `hr-detail` (wind dir/speed), `hr-prob` (rain%)

### Location Detail stat grid (lines 2179–2564)
- **Row 1** (4 cells): Wind / Humidity / Pressure / Visibility — first 3 have bars
- **Row 2** (4 cells): UV / Cloud Cover / Precip 1H / Daylight Remaining — no bars
- Long-press hint: right-aligned below grid, `opacity: 0.2` (extremely subtle)

### Location Detail precip chart
- **Dual-line SVG** (NOT bars): `viewBox="0 0 500 72"`
- Dashed line = probability% (y range 8–32), solid line = accumulation in inches (y range 44–66)
- Divider stroke at y=38
- Time labels: Now / +12h / +24h / +36h / +48h / +60h / +72h

### 7-day table
- Columns: day-of-week | rain amount | proportional bar (colored by intensity) | hi/lo
- Toggle row at bottom stub: Rain / Temp / Wind / Humid

### Walls button
- Mountain icon + "Walls" label + "3 defined · Tap to see climb conditions" meta
- Score pills inline: 91 (good), 82 (good), 61 (fair)
- Chevron right

### StatDrillSheet (humidity example)
- Sheet overlay with drag handle
- Header: stat name ("Humidity") + Dismiss button
- Sub-line: location name · "Now" · station id
- Current value large + unit
- Source attribution line: "Observed · KDVN ASOS · 1:39 PM CDT · Dew point 48°F"
- 24H Trend SVG: `viewBox="0 0 460 44"`, area fill + line, labels: 12A / 4A / 8A / 12P / Now
- Model comparison table: ASOS (lime highlight, "Live" badge) | GFS | ECMWF | HRRR | NBM | NAM
  - Each row: bar scaled to value + delta vs ASOS (lime if within ±2%, amber if overshoots)
- Spread row: Model Low / Observed / Model High / Spread (±N)

---

## Mock data shape for missing weather endpoint

```ts
interface WeatherObservation {
  tempF: number
  feelsLikeF: number
  dewPointF: number
  todayHighF: number
  todayLowF: number
  condition: string           // e.g. "Partly Cloudy"
  windSpeedMph: number
  windGustMph: number
  windDirectionDeg: number
  windDirectionLabel: string  // e.g. "NW"
  humidityPct: number
  pressureInHg: number
  pressureTrend: 'rising' | 'falling' | 'steady'
  visibilityMiles: number
  uvIndex: number
  cloudCoverPct: number
  precip1hIn: number
  stationId: string
  updatedMinutesAgo: number
}
```

---

## Pre-implementation checklist (execution order)
1. `git fetch origin claude/modest-heisenberg-t5ed7o && git checkout claude/modest-heisenberg-t5ed7o` — confirm packages/design already present
2. `npm install` at repo root (workspace hoisting picks up @weatherteam6/design)
3. `npm run build -w packages/design` — compiles tokens.ts → dist/
4. Confirm `expo-linear-gradient`, `react-native-svg`, `@tabler/icons-react-native`, `suncalc` installed in apps/mobile — install any missing
5. Check apps/mobile/package.json has `"@weatherteam6/design": "*"` and tsconfig has path alias
6. Restructure navigation: move app/index.tsx → app/(tabs)/index.tsx, create (tabs)/_layout.tsx
7. Load Barlow fonts in root app/_layout.tsx via `useFonts`
8. Build shared components in order: TopBar → StatTile → StatGrid → DaylightBar → HourlyStrip → EnsemblePrecipChart → NWSAlertBar
9. Build Home screen (7b): app/(tabs)/index.tsx
10. Typecheck — fix all errors before committing
11. Commit: `feat(mobile): phase 7b home screen`
12. Build Location Detail components: PrecipLineChart → SevenDayTable → WallsButton → StatDrillSheet
13. Rebuild app/location/[id].tsx (full rewrite)
14. Add useAlerts.ts and useCurrentLocation.ts hooks
15. Typecheck — fix all errors
16. Commit: `feat(mobile): phase 7c location detail screen`
17. Push branch and create draft PR

---

## Verification
- `npm run typecheck` passes with no errors
- `npm run lint` passes
- Both screens render in Expo Go / Expo dev build:
  - Home shows gradient background, stat grid, daylight bar, 72H chart, hourly strip
  - Location Detail shows same weather components + Walls button; score NOT visible except inside Walls button
  - Long-press on stat tile opens StatDrillSheet
  - Bottom tab nav switches between 4 tabs
  - Pull-to-refresh triggers React Query refetch
