# Phase 14: Weather Completeness & UI Polish

**Date:** 2026-06-19  
**Branch base:** `main` at `47074f8`  
**Preceded by:** Phase 13 — Historical Climbability Patterns

---

## Goals

1. Replace every mocked data hook with real API-backed data
2. Fix the 72h precipitation chart (broken layout, wrong data fields)
3. Add past precipitation visualization (7-day look-back, last-rain callout)
4. Make the hourly strip data-complete and wired to the API
5. Polish loading states, section rhythm, and visual consistency throughout Location Detail
6. Polish the Home screen cards
7. Stub Phase 14c as a placeholder for shade map (pending Tim's shade session)

**What this is NOT:**  
Auth, trips screen changes, radar changes, OpenBeta-scale seeding, external links, notifications.

---

## Background: What Is Currently Mocked

Both `useWeatherObservations` and `useHourlyForecast` return hardcoded fixtures and never touch the network. This means **every current observation on screen is fake data**.

| Hook | Status | Gap |
|---|---|---|
| `useWeatherObservations` | 100% mocked | No `/weather` endpoint exists |
| `useHourlyForecast` | 100% mocked | No hourly endpoint exists |
| `useForecast` | Real | Returns daily `ForecastSnapshot[]` from DB |
| `useClimbabilityHistory` | Real | Returns monthly averages |
| `usePrecipHistory` | Doesn't exist | No endpoint, no component |

Additionally, `PrecipLineChart` uses `precip_mm_p50` for **both** its accumulation and probability lines — the same field, just mapped to different y-ranges — because no probability field exists in `ForecastSnapshot`. The SVG is also hardcoded at `W=320` but rendered at `width="100%"`, causing it to float rather than fill its container.

---

## Sub-Phase Summary

| Sub-phase | Name | What changes |
|---|---|---|
| **14a** | Weather API Foundation | New API endpoints, new lib functions, types promoted to `packages/types` |
| **14b** | Location Detail Overhaul | Precip chart rebuild, past precip component, hourly wired, skeletons, section polish |
| **14c** | Shade Map | Placeholder — pending shade session; own design doc to follow |
| **14d** | Home Screen Polish | Score cards, empty states, pull-to-refresh |

---

## Phase 14a — Weather API Foundation

### New Types (`packages/types/src/index.ts`)

Move `WeatherObservation` and `HourlySlot` out of the mobile-only `apps/mobile/src/types/weather.ts` and into `packages/types`, with the following expansions.

#### `WeatherObservation`

```typescript
export type WeatherObservation = {
  // From IEM ASOS (authoritative local obs)
  tempF: number
  feelsLikeF: number
  dewPointF: number
  windSpeedMph: number
  precip1hIn: number
  humidityPct: number
  stationId: string
  updatedMinutesAgo: number
  // From Open-Meteo current block (fills ASOS gaps)
  todayHighF: number
  todayLowF: number
  condition: string             // derived from WMO weathercode
  windGustMph: number
  windDirectionDeg: number
  windDirectionLabel: string    // "NW", "SE", etc.
  pressureInHg: number
  // pressureTrend omitted in v1: Open-Meteo current block provides a single point reading,
  // not a trend. Add in a future pass by comparing consecutive cached readings.
  visibilityMiles: number
  uvIndex: number
  cloudCoverPct: number
}
```

**Note on data blending:** IEM ASOS is authoritative for temp, dewpoint, wind speed, 1h precip, and humidity because it reflects the actual physical station reading. Open-Meteo `current` block fills in the fields ASOS doesn't provide: gust, direction, condition string, UV index, cloud cover, pressure, daily high/low, visibility.

#### `HourlyForecast`

Replaces `HourlySlot` in `apps/mobile/src/types/weather.ts` (that file is deleted; the type lives in `packages/types` going forward).

```typescript
export type HourlyForecast = {
  isoTime: string           // raw ISO-8601 from Open-Meteo
  label: string             // "Now", "3 PM", "6 PM", etc.
  tempF: number
  feelsLikeF: number
  dewPointF: number
  windSpeedMph: number
  windDirDeg: number
  windDirLabel: string      // cardinal from windDirDeg
  precipPct: number         // precipitation_probability 0–100
  precipInch: number        // precipitation mm → inches
  weatherCode: number       // WMO code
  cloudCoverPct: number
}
```

#### `DailyPrecipHistory` and `PrecipHistoryResponse`

```typescript
export type DailyPrecipHistory = {
  date: string        // YYYY-MM-DD, most-recent-first
  precip_mm: number
}

export type PrecipHistoryResponse = {
  days: DailyPrecipHistory[]    // past 7 days, index 0 = today
  last_rain: {
    date: string                // YYYY-MM-DD
    precip_mm: number
    hours_ago: number           // computed server-side as of request time
  } | null                      // null if no rain in the 7-day window
}
```

### New API Lib: `apps/api/src/lib/weather/openMeteo.ts` additions

#### `fetchCurrentConditions(location)`

Calls the Open-Meteo **standard forecast** API with:
```
current=temperature_2m,apparent_temperature,relative_humidity_2m,
        wind_speed_10m,wind_gusts_10m,wind_direction_10m,
        weather_code,cloud_cover,pressure_msl,visibility,uv_index,
        temperature_2m_max,temperature_2m_min
daily=temperature_2m_max,temperature_2m_min
timezone=auto
```

Returns a typed object covering all fields `WeatherObservation` needs from Open-Meteo. The route handler merges this with the IEM ASOS result.

#### `fetchHourlyForecast(location)`

Calls the Open-Meteo **standard forecast** API with:
```
hourly=temperature_2m,apparent_temperature,dewpoint_2m,
       windspeed_10m,winddirection_10m,precipitation,
       precipitation_probability,weathercode,cloud_cover
forecast_days=3
timezone=auto
```

Returns `HourlyForecast[]` — 48 slots starting from the current hour (truncate anything in the past). The label logic:
- Slot at current hour → `"Now"`
- All others → format as `"3 PM"`, `"12 AM"`, etc. in the location's local timezone

### New API Routes: `apps/api/src/routes/weather.ts`

New router registered at app level as `weatherRouter`.

#### `GET /weather/:locationId`

1. Validate `locationId` is a UUID; confirm location belongs to `req.userId`.
2. Fetch IEM ASOS obs via `fetchCurrentObs(station, network)` — returns null if station missing or obs stale (>90 min).
3. Fetch Open-Meteo current conditions via `fetchCurrentConditions(location)`.
4. Merge: ASOS fields take priority for temp/wind speed/dewpoint/humidity/precip. Open-Meteo fills the rest.
5. If ASOS returns null, fall back entirely to Open-Meteo current block for all fields; set `stationId = 'open-meteo'` and `updatedMinutesAgo = 0`.
6. Return `ApiResponse<WeatherObservation>`.

**Fallback matters:** General weather locations (non-climbing) won't have an ASOS station — they must still get real data. The fallback to Open-Meteo-only is the path for those.

#### `GET /weather/:locationId/hourly`

1. Validate locationId, confirm ownership.
2. Call `fetchHourlyForecast(location)`.
3. Return `ApiResponse<HourlyForecast[]>`.

No caching layer in 14a — React Query's `staleTime` on the client side handles re-fetch frequency. A Redis cache layer can be added later if API rate limits become a concern.

#### `GET /weather/:locationId/precip-history`

1. Validate locationId, confirm ownership.
2. Compute `toDate = today`, `fromDate = 7 days ago` (in location timezone).
3. Call `fetchGriddedPrecipHistory(lat, lon, fromDate, toDate)` from `acisNormals.ts` — this function already exists and is tested.
4. Compute `last_rain`: walk the days array (most recent first) to find the first day with `precip_mm > 1.0` (same threshold as drying model). Compute `hours_ago` from midnight of that day to now.
5. Return `ApiResponse<PrecipHistoryResponse>`.

### Mobile Hook Updates (`apps/mobile/src/hooks/`)

#### `useWeatherObservations.ts` — replace mock with real fetch

```typescript
export function useWeatherObservations(locationId: string | undefined) {
  return useQuery({
    queryKey: ['weather', locationId],
    queryFn: () => apiFetch<WeatherObservation>(`/weather/${locationId}`),
    enabled: !!locationId,
    staleTime: 5 * 60 * 1000,   // 5 min — ASOS obs update ~every 20 min
    retry: 2,
  })
}
```

#### `useHourlyForecast.ts` — replace mock with real fetch

```typescript
export function useHourlyForecast(locationId: string | undefined) {
  return useQuery({
    queryKey: ['hourly', locationId],
    queryFn: () => apiFetch<HourlyForecast[]>(`/weather/${locationId}/hourly`),
    enabled: !!locationId,
    staleTime: 30 * 60 * 1000,  // 30 min — hourly forecast doesn't change fast
  })
}
```

#### New `usePrecipHistory.ts`

```typescript
export function usePrecipHistory(locationId: string | undefined) {
  return useQuery({
    queryKey: ['precip-history', locationId],
    queryFn: () => apiFetch<PrecipHistoryResponse>(`/weather/${locationId}/precip-history`),
    enabled: !!locationId,
    staleTime: 60 * 60 * 1000,  // 1 hour — past precip doesn't change
  })
}
```

#### Delete `apps/mobile/src/types/weather.ts`

The types it defined (`WeatherObservation`, `HourlySlot`) are now in `packages/types`. All mobile imports update accordingly. `HourlySlot` is removed (replaced by `HourlyForecast`).

### Acceptance Criteria — 14a

- [ ] `GET /weather/:id` returns real data for a seeded location with an ASOS station
- [ ] `GET /weather/:id` returns real data for a general-weather location with no ASOS station (Open-Meteo fallback)
- [ ] `GET /weather/:id/hourly` returns ≥ 24 slots starting from the current hour
- [ ] `GET /weather/:id/precip-history` returns 7 days with correct `last_rain` or null
- [ ] `useWeatherObservations` no longer contains any hardcoded fixture data
- [ ] `useHourlyForecast` no longer contains any hardcoded fixture data
- [ ] `apps/mobile/src/types/weather.ts` does not exist
- [ ] `packages/types` exports `WeatherObservation`, `HourlyForecast`, `DailyPrecipHistory`, `PrecipHistoryResponse`
- [ ] `npm run typecheck` passes; `npm run test` passes

---

## Phase 14b — Location Detail Overhaul

**Prerequisite:** 14a complete and merged.

### 1. `PrecipLineChart` — Complete Rebuild

**What's broken today:**
- SVG hardcoded at `W=320` but rendered at `width="100%"` → floats in center with empty space on both sides
- Both lines plot `precip_mm_p50` (same field); "probability" line is meaningless
- No fill under the accumulation line; chart looks skeletal
- Chart is only 80px tall

**New design:**

The chart uses `onLayout` to measure the real container width before rendering the SVG. Width is never hardcoded.

**Data sources (post-14a):**
- **Accumulation line** (solid): derived from `useHourlyForecast` — sum `precipInch` for each 12h window → 7 points (Now, +12h, +24h, +36h, +48h, +60h, +72h). For the +60h and +72h range where hourly data may not reach, fall back to `precip_mm_p50` from daily `useForecast` snapshots converted to inches.
- **Probability dashed line**: average `precipPct` for each 12h window from `useHourlyForecast`.

**Visual spec:**
- Chart fills full container width (no horizontal padding — padding is on the section container, not the SVG)
- Height: 120px (taller than current 80px)
- Background: subtle horizontal grid lines at 0%, 25%, 50%, 75%, 100% for probability axis
- Accumulation line: solid blue (`colors.rain`), 2px, with a soft fill area below (10% opacity)
- Probability dashed line: same blue, 1.5px, `strokeDasharray="4 3"`
- Y-axis right: accumulation values in inches (0.0, max rounded up to nearest 0.1)
- Y-axis left: probability % (0, 50, 100) — subtle, small font
- X-axis bottom: Now, +12h, +24h, +36h, +48h, +60h, +72h
- Legend below: `— Accumulation (in)` · `- - Probability (%)`

If both lines are flat at zero (no rain expected), show a subtle "No precipitation expected" text overlay rather than an empty chart.

### 2. `PastPrecipChart` — New Component

**Location in screen:** Inserted directly after `PrecipLineChart`, before `HourlyStrip`. Both charts together form a "precipitation" section under one shared section header: `PRECIPITATION`.

**Collapsed view (inline in scroll):**
- 7 vertical bars (one per day), x-axis: So Far Today → 7 Days Ago (left to right = recent to oldest, matching ClimbItScore)
- Running total line: each point = cumulative precip from that day through today (i.e., the line answers "how much has it rained since X days ago?")
- "MOST RECENT" strip below: `"5 days ago · 0.09in"` using `last_rain` from `PrecipHistoryResponse`; if null, shows `"No rain in the past 7 days"`
- Chart height: 90px + the callout strip

**Data source:** `usePrecipHistory(locationId)`

**Skeleton:** Shown while loading — a bar group placeholder + callout placeholder.

### 3. `HourlyStrip` — Wire + Polish

**Changes:**
- Remove all mock data; wire to `useHourlyForecast` (which now hits the API)
- Add skeleton loading state (4 card outlines) shown while `isLoading`
- Show 24 slots (the current 8 is too few — user has to scroll to see anything meaningful; 24 gives a full day at 3h intervals if API returns hourly, or every-hour for the first 24h)
- Each card gains a **weather icon**: a small icon component mapping WMO `weatherCode` to one of ~10 icons (sun, partly cloudy, cloudy, rain, heavy rain, snow, storm, fog, windy). Use `@tabler/icons-react-native` icons rather than a custom icon set.
- **Wind direction arrow**: replace the plain `"NW 14"` text with a small directional arrow SVG (16×16) rotated by `windDirDeg`, followed by the speed number. The arrow makes direction scannable at a glance.
- Precip % stays in blue (`colors.rain`); hide if 0%

**WMO weather code mapping** (condensed, covers all cases):
```
0        → Clear sky       (IconSun)
1,2,3    → Partly cloudy   (IconCloud)
45,48    → Fog             (IconCloudFog)
51-57    → Drizzle         (IconCloudDrizzle)
61-65    → Rain            (IconCloudRain)
71-77    → Snow            (IconSnowflake)
80-82    → Showers         (IconCloudRain)
95-99    → Thunderstorm    (IconCloudStorm)
```

**Implementation note:** Verify exact icon names against `@tabler/icons-react-native` before coding — the package uses names like `IconCloudStorm`, not `IconBolt`. Run `grep -r "Icon" node_modules/@tabler/icons-react-native/dist/index.d.ts | grep -i "cloud\|sun\|snow\|storm"` during 14b to confirm available names.

### 4. `SevenDayTable` — Improvements

**Changes:**
- Add a small WMO weather icon per day row (same mapping as hourly strip)
- Add a subtle precipitation range indicator: a thin horizontal bar showing the p10–p90 range, with p50 as a tick mark. Rendered in the precip column as a small visual rather than three separate numbers.
- Temperature: show high/low in a tighter layout with the high in `colors.txt1` and low in `colors.txt3`
- Wind: show km/h value with a small directional indicator from `ForecastSnapshot.wind_kmh_max` (direction not available at daily level — show speed only, no arrow)

**Note:** `ForecastSnapshot` has no condition code at the daily level. To get a daily condition icon, `SevenDayTable` reads the cached hourly data from React Query (`useQueryClient().getQueryData(['hourly', locationId])`) and groups slots by date, taking the most severe `weatherCode` per day. This is a client-side read from the existing cache — no new hook, no new API call. Days beyond the 48h hourly window show no icon (omit the icon slot rather than showing a wrong one).

### 5. Skeleton / Loading States

Create `apps/mobile/src/components/SkeletonBlock.tsx` — a reusable animated shimmer block.

```typescript
// Usage: <SkeletonBlock width="100%" height={60} borderRadius={8} />
```

Uses `Animated.Value` pulsing opacity (1.0 → 0.4 → 1.0, 1200ms loop) on a `colors.card` background with `colors.line` border. No external animation libraries.

**Apply skeletons to:**
- `HeroSection` while `obsQ.isPending` (currently shows entire LocationDetail loading screen — replace with the hero area showing skeletons while the rest of the screen renders)
- `StatGrid` while `obsQ.isPending`
- `HourlyStrip` while `hourlyQ.isLoading`
- `PrecipLineChart` while `forecastQ.isPending`
- `PastPrecipChart` while `precipHistoryQ.isLoading`
- `SevenDayTable` while `forecastQ.isPending`

**The key UX change:** Instead of blocking the whole screen on a single loading state (`if (!obs) return <LoadingScreen />`), each section independently shows its own skeleton. The page structure renders immediately; data fills in section by section as it arrives. This is how ClimbItScore (and every polished weather app) works.

### 6. Section Consistency Audit

**Section header pattern** — one consistent style everywhere:

```typescript
// Shared section label: HOURLY / PRECIPITATION / 7-DAY / SEASONAL CLIMBABILITY
const styles = {
  sectionLabel: {
    fontFamily: fonts.display,
    fontSize: 11,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.35)',
    paddingHorizontal: spacing.screenH,
    marginBottom: 10,
    marginTop: spacing.sectionTop,
  }
}
```

Currently `sectionTitle` is used in `PrecipLineChart` and `HourlyStrip`, while `sectionLabel` is used in the history section. These will be unified using a shared `<SectionLabel>` component exported from a new `apps/mobile/src/components/SectionLabel.tsx`.

**Section grouping in `[id].tsx`:**

```
TopBar
HeroSection
StatGrid
DaylightBar

— PRECIPITATION —
PrecipLineChart (72h)
PastPrecipChart (7-day history)

— HOURLY —
HourlyStrip

— 7-DAY —
SevenDayTable

[climbing only] NWSAlertBar
[climbing only] WallsButton

— SEASONAL CLIMBABILITY —
BestMonthsCallout + ClimbabilityChart

drillHint
```

This grouping makes it clear to the user what each section is before they encounter a chart. No section should be unlabeled.

### 7. Error States

**Current state:** No error states anywhere. If an API call fails, the skeleton just sits there forever.

**Add to each section:**
- If a query returns `isError: true`, show a compact inline error message: `"Couldn't load [data] · Tap to retry"` with a retry `Pressable` that calls `refetch()`.
- Error styling: muted red text, same padding as the section content it replaces.
- Keep other sections visible — one failed section doesn't break the page.

### Acceptance Criteria — 14b

- [ ] `PrecipLineChart` fills its container width (no floating SVG on any screen size)
- [ ] Accumulation and probability lines use different data fields
- [ ] A flat/zero chart shows "No precipitation expected" text overlay
- [ ] `PastPrecipChart` appears below the 72h chart with 7 bars and a running total line
- [ ] `PastPrecipChart` shows "MOST RECENT" callout or "No rain in past 7 days"
- [ ] `HourlyStrip` shows real API data (not hardcoded fixtures)
- [ ] Each hourly card has a weather condition icon
- [ ] Each hourly card shows a directional wind arrow
- [ ] `SevenDayTable` shows a precip range bar and a daily condition icon
- [ ] All sections show skeleton loading states (no section blocks the page render)
- [ ] All sections show inline error + retry on failure
- [ ] All section labels use `<SectionLabel>` with consistent style
- [ ] `npm run typecheck` passes; `npm run test` passes

---

## Phase 14c — Shade Map (Placeholder)

**Status:** Design pending. Tim has a separate session exploring shade map implementation details.

**What is known:**
- `apps/api/src/lib/scoring/shadeCalc.ts` exists (from Phase 8 walls setup) and computes sun position via `suncalc`
- `apps/mobile/src/components/walls/SunArc.tsx` renders a sun arc SVG
- The shade map feature is expected to show when a specific wall or the general crag is in shade vs. sun throughout the day
- This is a major differentiator vs. generic weather apps

**What will be designed in the follow-up spec:**
- Where the shade visualization appears (Location Detail, Walls screen, or both)
- Whether shade windows integrate into the conditions score
- Data model for shade windows (computed client-side or server-side?)
- UI treatment (timeline strip? color overlay on DaylightBar?)

**Blocker:** Do not start 14c until the shade design doc exists and is approved.

---

## Phase 14d — Home Screen Polish

**Target file:** `apps/mobile/app/(tabs)/index.tsx`  
**Read current implementation before starting this phase.**

### Location Card Improvements

The home screen shows a list of saved locations. Each card currently shows the location name and (presumably) the conditions score. After 14a/14b, cards should show:

- **Location name** (prominent)
- **Current temp** from `WeatherObservation.tempF` — the most glanceable piece of weather info
- **Condition string** (e.g., "Partly Cloudy") — one line
- **Conditions score** (for climbing locations only) — shown as a color-coded bar or ring, not just a number
- **Last updated** — `updatedMinutesAgo` in a subtle style

### Empty State

When a user has no locations, the current behavior is unknown (read the file first). Target:
- A centered illustration (use a Tabler icon like `IconMapPin` or `IconMountain` at large size)
- Headline: "No locations yet"
- Sub-text: "Search for a crag or any city to get started"
- A large `+` button that navigates to Search

### Skeleton Loading

While `useLocations` is loading, show 3 skeleton card placeholders using `<SkeletonBlock>` (built in 14b).

### Pull-to-Refresh

Add `RefreshControl` to the home screen `ScrollView` or `FlatList`, wired to `refetch()` from `useLocations`. A pull should also invalidate the `weather` and `forecast` query caches for all visible locations so they refresh their cards on the next navigation.

### Acceptance Criteria — 14d

- [ ] Home screen location cards show current temp and condition string
- [ ] Conditions score is visually distinct (bar or ring) from surrounding text
- [ ] Empty state shows icon, headline, sub-text, and an add button
- [ ] Pull-to-refresh works and invalidates downstream caches
- [ ] Skeleton cards shown while locations load
- [ ] `npm run typecheck` passes

---

## Implementation Order and Dependencies

```
14a  (API foundation)
 └─ 14b  (Location Detail — requires 14a hooks to be real)
     └─ 14c  (Shade Map — pending separate design; requires walls data from Phase 8)
     └─ 14d  (Home Screen — can start in parallel with 14b or after; light 14a dependency)
```

14d has a soft dependency on 14a (for real `WeatherObservation` data in cards) but can be developed in parallel and wired at the end of 14a.

---

## Files Changed Summary

### New files
- `apps/api/src/routes/weather.ts`
- `apps/api/src/lib/weather/openMeteo.ts` (new exports `fetchCurrentConditions`, `fetchHourlyForecast`)
- `apps/mobile/src/hooks/usePrecipHistory.ts`
- `apps/mobile/src/components/PastPrecipChart.tsx`
- `apps/mobile/src/components/SkeletonBlock.tsx`
- `apps/mobile/src/components/SectionLabel.tsx`
- `docs/superpowers/specs/2026-06-19-phase14c-shade-design.md` ← to be written separately

### Modified files
- `packages/types/src/index.ts` — add `WeatherObservation`, `HourlyForecast`, `DailyPrecipHistory`, `PrecipHistoryResponse`
- `apps/api/src/index.ts` — add `weatherRouter` import and `app.use(weatherRouter)` alongside the existing routers
- `apps/mobile/src/hooks/useWeatherObservations.ts` — replace mock
- `apps/mobile/src/hooks/useHourlyForecast.ts` — replace mock
- `apps/mobile/src/components/PrecipLineChart.tsx` — rebuild
- `apps/mobile/src/components/HourlyStrip.tsx` — wire + polish
- `apps/mobile/src/components/SevenDayTable.tsx` — improvements
- `apps/mobile/app/location/[id].tsx` — section restructure, skeleton integration
- `apps/mobile/app/(tabs)/index.tsx` — home screen polish

### Deleted files
- `apps/mobile/src/types/weather.ts` — types moved to `packages/types`

---

## Out of Scope

- Auth / user accounts (`AUTH_ENABLED` stays false)
- Trips screen changes
- Radar screen changes
- OpenBeta crag database scaling (47k areas goal — separate initiative)
- External links to Mountain Project / OpenBeta
- Push notifications
- Shade map (14c — own design doc, own branch)
