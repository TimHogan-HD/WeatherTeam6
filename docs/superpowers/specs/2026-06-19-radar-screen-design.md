# Phase 12 — Radar Screen Design

> ## ⚠️ ARCHIVED — describes the React Native app, which is no longer being built
>
> Direction changed **2026-07-31**: WeatherTeam6 is now a Telegram bot + Telegram Mini App.
> `apps/mobile` is archived and out of the build. This document is retained as a historical
> record of the mobile-era design and **must not be used as a spec for new work**.
>
> Current direction: `docs/handoffs/telegram-crossover-v4.md`. Current roadmap:
> `.claude/docs/plan.md`.


**Date:** 2026-06-19
**Branch:** phase/12-radar
**Status:** Approved — ready for implementation planning

---

## Summary

Full-screen precipitation radar map (Variation A — Classic full-bleed) centered on the user's GPS location. RainViewer public API provides radar frames; MapLibre renders them as a raster tile overlay on a dark basemap. Saved crag pins appear on the map with condition-score color coding. A scrubber at the bottom lets the user step through the past ~2 hours and ~30 minutes of nowcast.

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Radar variation | A — Classic full-bleed | Simplest, most familiar; climbing-relevant data in the scrubber |
| Layer support | Precipitation only | Only layer with climbing value in RainViewer public tier; Lightning is the only other candidate, deferred |
| Map library | `@maplibre/maplibre-react-native` v10+ | Native, supports New Architecture, full tile source control |
| Basemap | CARTO Dark Matter raster tiles | Free, no API key, matches dark aesthetic |
| Map center on open | User GPS location | Most useful for "is rain coming to where I am?" |
| Cache TTL | 2 minutes (Redis) | RainViewer updates every ~10 min; 2 min catches new frames promptly |
| Manual refresh | Refresh button in TopBar | React Query `refetch()` — bypasses staleTime, hits backend fresh |

---

## Architecture

### Backend

**New file:** `apps/api/src/lib/weather/rainViewer.ts`
- `fetchRadarFrames()` — GETs `https://api.rainviewer.com/public/weather-maps.json`
- Returns past frames (~2h) + nowcast frames (~30 min) from the response
- Wrapped in try/catch with exponential backoff retry on 5xx

**New route:** `apps/api/src/routes/radar.ts` → `GET /radar/tiles`
- Calls `fetchRadarFrames()`
- Caches result in Redis under key `radar:frames` with 2-minute TTL
- Returns `ApiResponse<RadarFramesResponse>`:

```typescript
type RadarFramesResponse = {
  generated: number          // unix timestamp of RainViewer index
  tileBase: string           // "https://tilecache.rainviewer.com"
  frames: {
    timestamp: number        // unix seconds — used in tile URL
    path: string             // e.g. "/v2/radar/1750002000"
    isPast: boolean          // false = nowcast frame
  }[]
}
```

Mobile builds full tile URL as: `{tileBase}{path}/256/{z}/{x}/{y}/2/1_1.png`

**Registration:** `radarRouter` registered in `apps/api/src/index.ts`

**Type:** `RadarFramesResponse` added to `packages/types/src/index.ts`

### Mobile

**New hook:** `apps/mobile/src/hooks/useRadarFrames.ts`
- Calls `GET /radar/tiles`
- `staleTime: 2 * 60 * 1000` (2 minutes)
- Returns `{ frames, tileBase, generated, isLoading, error, refetch }`

**New screen:** `apps/mobile/app/(tabs)/radar.tsx`
- Full-screen MapLibre map, no ScrollView
- Navigation: Radar tab already in `PersistentTabBar` with `radar-2` icon — file creation is sufficient

---

## Screen Layout

```
┌─────────────────────────────┐
│  [≡]  Indian Creek    [↺]   │  TopBar: active location name + refresh icon
│                             │
│                             │
│      MapLibre full-bleed    │  Dark basemap, GPS centered, zoom 9 default
│      [● you are here]       │  Lime pulse ring
│      [◉ crag pin]           │  Score-colored dots
│      [◉ crag pin]           │
│                             │
│  ┌─────────────────────┐    │
│  │ [▶] ──●────────NOW──│    │  Scrubber card, docked at bottom
│  │  -2h        +30min  │    │
│  └─────────────────────┘    │
└─────────────────────────────┘
```

---

## Component Details

### Map

- **Library:** `@maplibre/maplibre-react-native` — config plugin added to `apps/mobile/app.json`
- **Basemap:** CARTO Dark Matter raster tiles
  - MapLibre `RasterSource` with tile array (subdomain load balancing):
    ```
    https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png
    https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png
    https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png
    https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png
    ```
  - No API key required
- **Initial camera:** user GPS coordinates, zoom 9
- **GPS:** `expo-location` foreground permission (already in `package.json` from Phase 10)
- **Fallback if permission denied:** center at lat 39, lon -98 (US geographic center), zoom 4; no "you are here" marker; no error shown

### Radar Tile Overlay

- MapLibre `RasterSource` + `RasterLayer`
- Tile URL template built from `frames[frameIndex]`: `{tileBase}{frames[frameIndex].path}/256/{z}/{x}/{y}/2/1_1.png`
- Opacity: 0.7
- Frame swap: updating `frameIndex` in state re-renders the `RasterSource` URL — MapLibre handles tile caching automatically
- Tile images are immutable once generated (keyed by timestamp) — no cache invalidation needed

### Crag Pins

- Source: `useLocations()` (already exists)
- One `MapLibre.MarkerView` per saved location
- Dot color by conditions score: lime (good ≥70), amber (fair 40–69), red (poor <40), grey (no score)
- Tap → `router.push('/location/${id}')`

### "You Are Here" Marker

- Lime filled circle + pulsing ring via `Animated.loop` on scale + opacity (2.6s, ease-out)
- Rendered as `MapLibre.MarkerView` at GPS coordinates
- Hidden if location permission denied

### TopBar

- Left: menu icon (stub — no drawer in Phase 12)
- Center: "Radar" screen title
- Right: refresh icon (`↺`) — calls `refetch()` from `useRadarFrames`

### Radar Toggle Chip

- Single chip labelled "Radar" rendered in the top-right map overlay (below TopBar)
- Active (lime tint) = overlay visible; tap to hide overlay, chip dims
- Controls `radarVisible` state — when false, the `RasterLayer` is not rendered but the `RasterSource` stays mounted so tiles don't need to be re-fetched on re-enable

### Scrubber Card

- Docked at bottom, above safe area inset, `rgba(10,14,20,0.85)` background, `borderRadius: 12`
- **Play/pause button:** 40px lime-tinted circle; toggles `isPlaying`
- **Track:** horizontal bar, past frames filled rain-blue (`rgba(144,205,244,0.6)`), nowcast frames dimmed, NOW marker at the boundary
- **Draggable handle:** `PanResponder` on track (same pattern as `AngleSlider` in Phase 8); maps x-position to `frameIndex`
- **Time labels:** `-2h` on left, `+30min` on right, `NOW` at boundary marker
- **Auto-advance:** `useEffect` + `setInterval(600ms)` when `isPlaying`; clears on pause or unmount

---

## State

All state local to `radar.tsx`:

```typescript
const [frameIndex, setFrameIndex] = useState(0)   // index into frames[]
const [isPlaying, setIsPlaying] = useState(false)
const [radarVisible, setRadarVisible] = useState(true)
```

`frames` comes from `useRadarFrames`. On load, `frameIndex` initialises to the last past frame (most recent real observation, not nowcast).

---

## Error & Loading States

| State | Behaviour |
|-------|-----------|
| `useRadarFrames` loading | Spinner overlay on scrubber card only; map renders |
| RainViewer fetch fails | Scrubber card shows "Radar unavailable" + retry button; map + pins still render |
| GPS permission denied | Map centers at US default; "you are here" marker hidden; no error message |
| No saved locations | Map renders without crag pins; no error |

---

## New Dependencies

| Package | Where | Purpose |
|---------|-------|---------|
| `@maplibre/maplibre-react-native` | `apps/mobile` | Map rendering |

Config plugin entry added to `apps/mobile/app.json` plugins array.

No new env vars required. No new API keys required.

---

## Out of Scope for Phase 12

- Layer toggles (Temp, Wind, Cloud, Lightning) — deferred; Lightning is the only candidate worth adding later
- MapTiler vector tiles (upgrade path if sharper basemap desired)
- Offline/cached radar frames
- Storm ETA readout (Variation C/D features)
- Range rings (Variation D)
