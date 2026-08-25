# WeatherTeam6 Mini App — Design Spec
Version: v1
Date: 2026-08-24
Status: Phase B0 deliverable — agreed before scaffold
Supersedes for the Mini App: nothing. Extends `weatherteam6-ui-handoff-v1.md` §Design System.

## Purpose

This is the design contract for `apps/miniapp`. Crossover Tasks 5–7 build to this document. If a decision is not written here, it is not settled — come back and settle it rather than improvising in code.

Every decision the build handoff (`weatherteam6-miniapp-handoff-v1.md` §Phase B0) required is answered below. Its numbering and this document's section numbers do not correspond — the mapping is in §11.

---

## 0. Corrections to inherited assumptions

Three claims carried into B0 from earlier documents are wrong against the code as it stands at `1f3e9cf`. They are corrected here because each one changes a decision.

**a. `tokens.ts` is not framework-agnostic.** The build handoff describes it as "Framework-agnostic TypeScript … Import directly." Only part of it is. The file's own header says `Target: React Native (StyleSheet / inline styles)`.

| Export | Web-portable? | Why |
| --- | --- | --- |
| `colors`, `uvScale`, `units`, `spacing`, `radius` | Yes, directly | Plain strings and numbers |
| `fonts` | **No** | `'BarlowCondensed'` is an `expo-font` family name. The Google Fonts / CSS family is `"Barlow Condensed"` — with a space. Passing the token value straight into `font-family` matches nothing and silently falls back to the system font. The adapter maps `BarlowCondensed → "Barlow Condensed"`, `Barlow → "Barlow"` |
| `type` | Needs an adapter | RN text-style objects: unitless `fontSize`, `fontWeight: '700'` as string, `letterSpacing` in points not em |
| `shadow` | **No** | `shadowColor` / `shadowOffset` / `shadowOpacity` / `shadowRadius` / `elevation` are RN props with no CSS meaning. Must be re-expressed as `box-shadow` |
| `layout` | **No** | `flex: 1`, `paddingHorizontal` are RN-only |
| `components` | Audit per-entry | Mixed; treat as RN unless proven otherwise |
| `bottomNav` | **Do not import** | Declares four tabs (Home, Crags, Trips, Radar). Three are out of scope; the Mini App has no bottom nav |

**Consequence:** the Mini App needs a thin adapter module, `apps/miniapp/src/theme/tokens.css.ts`, that re-expresses `type`, `shadow`, and `layout` for the web. It **derives** from the imported tokens; it never restates a literal value. Deriving is not redefining — the architecture rule ("never redefine colors, spacing, or type scale in an app") is satisfied as long as every number traces back to an import.

**b. §Design System is not entirely client-agnostic.** Its banner says it is. Four of its subsections name React Native explicitly: the `LinearGradient` screen background, `react-native-svg`, `@tabler/icons-react-native`, and the instruction "Do not copy web-specific patterns (no CSS vars, no className)". Binding for the Mini App are the **token source rule, contrast rules, layout constants, and copy rules**. The library choices are RN implementation detail and are re-decided in §8 below. CSS custom properties are not only permitted in the Mini App, they are required — Telegram injects its own.

**c. The palette has no light variant.** `bgGradientTop/Mid/Bottom` are `#4a5568 → #1a202c → #0d1117`; `txt1` is `#f0f4f8`; cards are `rgba(255,255,255,0.07)`. Every contrast rule is expressed as a minimum opacity of a near-white on dark. There is no light-mode token set, and the contrast rules would invert nonsensically against one. This decides §1.

---

## 1. Theming

**Decision: keep the WeatherTeam6 dark palette, fixed, for all content. Use `themeParams` only for Telegram-owned chrome.**

The build handoff recommended hybrid — "take light/dark from Telegram, apply WeatherTeam6 tokens within it." **That is not implementable.** It presupposes a light token set that does not exist (§0c). Building one would mean authoring roughly forty new color values in the app, which the architecture rule forbids, and would invalidate every locked contrast rule in the same stroke.

So:

- **Content surface is always the WeatherTeam6 dark gradient.** A user on a light Telegram theme gets a dark app. This is a deliberate, legible choice — the app reads as its own surface inside Telegram, the way a photo or a map does.
- **Telegram chrome is harmonized, not ignored.** On `ready()`, call `WebApp.setHeaderColor(colors.bgGradientTop)` and `WebApp.setBackgroundColor(colors.bgGradientBottom)` so the header and the overscroll area match the app instead of flashing white.
  **The two have different version floors — do not gate them together.** `setBackgroundColor` accepts a hex from Bot API 6.1; `setHeaderColor` accepts an arbitrary hex only from 6.9, and before that takes just the `bg_color` / `secondary_bg_color` keywords. So:
  - `setBackgroundColor(colors.bgGradientBottom)` — call it whenever `isVersionAtLeast('6.1')`. Gating this at 6.9 needlessly gives up correct behavior on 6.1–6.8.
  - `setHeaderColor(colors.bgGradientTop)` — only when `isVersionAtLeast('6.9')`. **Do not fall back to the `bg_color` keyword:** that keyword resolves to the user's *own* theme background, which on a light theme is white — precisely the white header this bullet exists to prevent. On clients below 6.9, leave the header alone and accept Telegram's default; a themed header is not worth shipping a guaranteed-wrong color to get.
- **`themeParams` is read for exactly one purpose:** nothing in v1. Do not branch content styling on it. Do not read `--tg-color-scheme`.
- **Telegram CSS variables that *are* used:** `--tg-viewport-stable-height` for full-height layout and `--tg-safe-area-inset-*` for padding. These are geometry, not color, and must be honored or the layout will be wrong on some clients.
  **Every one needs a fallback value.** Not all clients inject them, and CSS drops the entire declaration when a `var()` resolves to nothing — so a bare `padding-top: var(--tg-safe-area-inset-top)` silently loses the padding. Always `var(--tg-safe-area-inset-top, 0px)`, and `var(--tg-viewport-stable-height, 100dvh)`.

**Why not honor Telegram fully:** the conditions colors are semantic, not decorative. `good` lime, `fair` amber, `poor` red carry meaning, and the locked rule "on lime fills, text must be `onGood` (`#0d1117`)" only holds against the known palette. Remapping them to `button_color` would destroy the semantics.

**Revisit trigger:** if a light token set is ever authored in `packages/design`, reopen this. Not before.

---

## 2. Navigation

**Decision: two routes, Telegram `BackButton` as the only back affordance.**

```
/                    location list   (root)
/location/:id        location detail
```

- Client-side routing, no server routes. The Vercel project rewrites all paths to `index.html`.
- **`BackButton`:** `show()` on detail, `hide()` on list. `onClick` → navigate to `/`. Never call `WebApp.close()` ourselves; from the list, Telegram's own chrome closes the app.
- **No in-app back arrow.** One back affordance, and it is Telegram's. A second one is a bug.
- **Deep link.** `startapp` surfaces two ways — `initDataUnsafe.start_param` and the `tgWebAppStartParam` GET parameter. Read `start_param`; fall back to the query parameter.
  - Format: `loc_<uuid>`, dashes intact. Telegram's `startapp` charset is `A-Z a-z 0-9 _ -`, which **includes the hyphen**, so a UUID passes through unchanged. Do not strip and reinsert dashes: reinsertion at fixed offsets turns a corrupted parameter into a *well-formed but wrong* UUID, which reaches the API and 404s instead of falling back to the list.
  - Validate the remainder against a UUID regex before routing. Anything that fails → land on `/` silently. Never render an error for a bad deep link.
- **Back stack on deep link.** Landing directly on detail must still leave the list reachable. On boot with a valid `start_param`, push `/` into history first, then `/location/:id`, so `BackButton` goes to the list rather than closing the app. This is the one case where the naive implementation is wrong, and it is the acceptance criterion for the deep-link work in Task 7.

---

## 3. Content hierarchy

Governed by the locked rule **"score is a derived signal, never the headline — weather leads on every screen."**

### Location list (`/`)

One card per location. Top to bottom inside a card:

1. **Location name** — `type.cardTitle` equivalent, `txt1`
2. **Weather line** — today's high, max wind, and humidity as plain values with units. This is the largest non-name element on the card. **Label them as maxima, not as current readings** — see the note at the end of this section.
3. **Alert pill** — only if an active alert exists. `poor` tint, event name only ("Extreme Heat Warning"). Tapping the card, not the pill, opens detail.
4. **Score chip** — bottom-right, small, labeled. Format: `Score 80 · high`. Never bare. Never the largest element. Subject to the suppression rule in §7.

Empty state, error state, and loading per §5. No search, no add-location, no sort controls in v1.

### Location detail (`/location/:id`)

One scroll, no internal tabs — carried from the mockup's Crag Detail treatment.

1. **Alert banner** — full-width, top, if any active alert. Event, severity, and the NWS headline. Above everything, always.
2. **Today** — the hero. Today's high, max wind, humidity, and hours since rain, as labeled values.
3. **7-day forecast** — one row per day: date, high, low, wind, precipitation. **Weather only — no per-day score chip.** See the constraint below.
4. **Score and breakdown** — last section, collapsed by default. Today's score only, with the five components and their weights. This is where a score is allowed to be prominent, because the user has scrolled to it deliberately.
5. **Sources footer** — required by the locked rule "always quote data sources by name." **Nothing in this list may be hardcoded**, because two of the three sources vary per request:

   - **Forecast model** — read it from the response. `ForecastSnapshot.model_sources` is returned by `/forecast/:id` and says what actually ran. `computeLiveForecast` prefers NBM and falls back to the ensemble; today NBM 400s on every request (issue #22), so live responses come back `["gfs_seamless","ecmwf_ifs025","icon_seamless_eps","gem_global"]`. Writing "Open-Meteo ensemble" as a constant is correct only by accident, and becomes false the moment #22 is fixed.
   - **Rainfall history** — ACIS via `fetchPrecipHistory` when the location has an `asos_station`, else Open-Meteo's archive via `fetchArchivePrecip`. The column is nullable, so branch on it.
   - **Alerts** — always NWS.

   Naming a source that never ran is a false attribution, which is the precise thing the locked rule exists to prevent.

**Note on maxima vs. current readings.** `temp_c_max` and `wind_kmh_max` are **daily maxima**, not present conditions — Red Rock's `39.5°C` is today's high, not the temperature right now. There is no current-observation field in any response. Label accordingly: *"High 103°F"*, *"Wind to 21 mph"*. Presenting a daily max as a live reading is a factual error, not a wording preference.

**Constraint: per-day scores do not exist over the API.** `computeLiveForecast` scores all seven days, but no endpoint returns them — `GET /conditions/:id` keeps only the row matching today (`routes/conditions.ts`) and `GET /forecast/:id` returns `snapshots`, which carry no score or confidence field. Verified against production: `/forecast/:id` returns 7 objects whose keys are `id, location_id, captured_at, forecast_date, precip_mm_p10/p50/p90, temp_c_min, temp_c_max, wind_kmh_max, humidity_pct, model_sources, created_at, window`.

This contradicts the build handoff's "no API changes needed." The resolution is to **need no API change**: forecast rows show weather, and the score appears exactly once, for today, in section 4. That is also the stricter reading of "score is a derived signal, never the headline." If per-day scores are ever wanted, that is an API change and its own task.

**Not on this screen:** walls, radar, trips, shade map, history, normals. `/history` and `/normals` return `[]` forever (issue #25) and must not be called.

---

## 4. Units

**Decision: pure conversion helpers in `packages/types`, consumed by both `apps/api` and `apps/miniapp`.**

New file `packages/types/src/units.ts`.

**Every input is nullable.** `ForecastSnapshot.temp_c_max`, `wind_kmh_max`, `humidity_pct`, and `precip_mm_p50` are all `number | null` in `packages/types` (the type is `ForecastSnapshot` — there is no `ForecastDay`). This is the trap: JavaScript coerces `null` to `0`, so a naive `cToF(null)` returns **32°F** and `kmhToMph(null)` returns **0 mph** — plausible-looking values for missing data, which is worse than a visible gap. The formatters take `number | null` and return an em dash.

```ts
const EM = '—'

export const cToF   = (c: number): number => c * 9 / 5 + 32
export const kmhToMph = (kmh: number): number => kmh * 0.621371
export const mmToIn = (mm: number): number => mm / 25.4

export const formatTempF = (c: number | null): string =>
  c === null ? EM : `${Math.round(cToF(c))}°F`
export const formatWindMph = (kmh: number | null): string =>
  kmh === null ? EM : `${Math.round(kmhToMph(kmh))} mph`
export const formatHumidity = (pct: number | null): string =>
  pct === null ? EM : `${Math.round(pct)}%`

/** Trace amounts must not render as "0.00 in" — see note below. */
export const formatPrecipIn = (mm: number | null): string => {
  if (mm === null) return EM
  if (mm === 0) return '0 in'
  const inches = mmToIn(mm)
  return inches < 0.01 ? 'trace' : `${inches.toFixed(2)} in`
}
```

**Why `trace` matters.** `formatPrecipIn(0.2)` rounds to `0.00 in`, but 0.2 mm of forecast rain already docks the rain component. A screen showing `0.00 in` next to a reduced score contradicts the rule that weather explains the score. Anything non-zero below 0.01 in reads as `trace`.

**Re-export from `index.ts`.** `packages/types/package.json` declares only a `"."` entry in its `exports` map and the repo uses NodeNext resolution, so `@weatherteam6/types/units` will not resolve. Add `export * from './units.js'` to `packages/types/src/index.ts`. Same for `conditionsCopy.ts` in §7.

**Why `packages/types` and not `packages/design`:** the bot needs these, and `apps/api` importing from a design package would be wrong on its face. `apps/api` already depends on `packages/types`, and that package already ships runtime code — `aspectToDegrees`, `parseNumeric`, `parseNumericRequired`, and `SCORE_COMPONENT_MAX` all live there today — so pure helpers are consistent with it, not an exception to it. The unit *labels* stay in `packages/design`'s `units` export, which is where a designer would look for them; the *math* lives with the shared contracts.

**This fixes a live bug for free.** The bot currently displays no units at all. Once these exist, `conditionsReply.ts` uses them (§7).

**Rounding is display-only.** Never round before scoring; the API's metric values stay canonical end to end.

---

## 5. States

Live scoring is slow. A measured `GET /api/v1/conditions/:id` against production took roughly four seconds, because `computeLiveForecast` makes three upstream fetches per request (NBM, which 400s per issue #22, the ensemble fallback, and rainfall history). A detail screen loading conditions and forecast together makes six.

| State | Treatment |
| --- | --- |
| **Loading** | Skeleton cards at the real final dimensions, `card` background, no spinner. Four seconds of spinner reads as broken; a skeleton reads as loading. Never a blocking full-screen loader. |
| **Empty** | No saved locations. **Do not write this copy yet.** The obvious wording — "add one with the bot" — points at a capability that does not exist: `/conditions <name>` only matches locations already saved, and the only other route in is `POST /api/v1/locations`, which has no client. Pointing users at a dead path is the same defect as §7 rule 7. Blocked on open question §10.1; until it is answered, render the neutral *"No locations yet."* and nothing more. |
| **Error** | Inline within the card or section that failed, not a whole-screen takeover. The list must still render locations whose conditions call failed. Copy: *"Couldn't load conditions. Tap to retry."* Never surface an HTTP status code or a raw error string. |
| **Stale / offline** | React Query serves cached data and shows a `txt4` timestamp line: *"Updated 12 min ago."* Do not blank the screen on a refetch failure. |
| **Partial** | A location with a score but no alert data renders the score. A section that failed shows its own error; siblings render normally. |

React Query configuration: `staleTime` 5 minutes, `gcTime` 30 minutes, `retry: 1`, no `refetchOnWindowFocus` — a Telegram webview fires focus events on every keyboard dismissal.

---

## 6. Forecast window labeling

The architecture rule states three windows:

```
>14 days out : climatological normals only, no conditions score
7-14 days    : low-confidence ensemble, score shown with low confidence label
<7 days      : full conditions score active, p10/p90 bands shown
```

**Only the third is reachable in the Mini App v1, and the spec says so rather than leaving a builder to discover it.** The detail screen shows 7 days (§3), so the 7–14 day row never renders. The `>14 day` row depends on `/normals`, which returns `[]` forever until issue #25 has a writer, and §9 forbids calling it. Building either branch in Task 6 means building against data that cannot arrive.

**Binding for v1:** render the `<7 days` treatment only. Leave the other two unimplemented — do not stub them with placeholder copy. When the forecast range extends or #25 gains a writer, this section is the spec for what to add.

Per the locked copy rule, **p10/p50/p90 never appear in prose.** Those terms are permitted only as chart legend or section labels. Confidence renders as plain language: *"models broadly agree"* / *"firms up inside a week"*.

---

## 7. The copy model (resolves issue #21)

### What is live today

`apps/api/src/lib/telegram/conditionsReply.ts` maps score to an opinion:

```ts
if (score >= 80) return 'looks great — go climb'
```

Queried against Red Rock on 2026-08-24, the API returned `score: 80`, `confidence: high`, `component_temp: 0`, `temp_c: 39.5` — **103°F** — while `GET /api/v1/alerts/:id` returned an active NWS **Extreme Heat Warning** running through August 28. The shipped bot reply for that state is:

> **Red Rock**
> looks great — go climb (score 80, confidence high)

This breaks four locked rules at once: it is a climbing opinion, the score is the headline, there is no weather in it, and no source is named. It also never mentions the heat warning.

### Root cause, so the copy fix is not mistaken for the whole fix

Scoring is purely additive with no component able to veto: drying 40 + rain 25 + wind 15 + temp 12 + humidity 8 (`SCORE_COMPONENT_MAX` in `packages/types`). Temperature is worth **12 points of 100** and saturates — `temp > 35°C → 0`, so 96°F and 130°F score identically.

The defect is not that heat forces a low score; it is that heat **costs at most 12 points**. Zeroing temperature caps the day at 88 rather than flooring it, and dry rock plus no rain in 72 hours is worth 65 unaided — so any settled dry spell lands in the 80s no matter how lethal the air temperature is. Red Rock at 103°F scored 80 for exactly this reason. The score is behaving as designed. The design is wrong.

**The copy model below makes the surface honest. It does not fix the score.** The scoring change is tracked in §10 and is out of scope for B0.

### Rules

1. **No score-to-opinion mapping anywhere.** `statusLabel()` is deleted, not reworded. No surface tells a user to climb or not climb.
2. **Weather leads.** Every surface that shows a score shows the weather that produced it, first, in imperial units.
3. **State labels describe conditions, never suitability.** The permitted ladder:

   | Score | Label |
   | --- | --- |
   | 80–100 | Dry, settled |
   | 60–79 | Mostly dry |
   | 40–59 | Mixed |
   | 0–39 | Wet or unsettled |
   | `null` | Too far out to score |

   These describe rock and weather. "Mixed" is a condition; "marginal — check the details" was advice.
4. **Score suppression.** *(This is the rule that makes today's 103°F case defensible.)* When **any component scores 0**, or **an active alert of severity `Severe` or higher exists**, the state label is not shown alone. The limiting factor is named instead:

   > Score 80 (high confidence) — limited by temperature

   The score is never presented as a summary of a day that has a zeroed component. This is implementable today, against the existing breakdown, with no scoring change.

   Three details the implementation must not improvise:

   - **Applies only when `score !== null`.** A day outside the scoring window has all five components at 0 and `score: null`. That is not a limited day, it is an unscored one — it takes the ladder's *"Too far out to score"* and suppression does not run.
   - **Never attribute the known degradation bug to weather.** When the forecast feed contains no row for today, `liveForecast.ts` falls back to `?? 0` and scores every day at 0 °C, which zeroes `component_temp` while leaving `score` non-null. Un-guarded, this rule would then print *"limited by temperature"* for every location on those days — explaining a data bug as if it were the weather, which is worse than saying nothing. Treat `component_temp === 0` **combined with** a `temp_c_max` that is absent or above 0 °C as the degradation signature, and fall back to the plain ladder label. This is the unfiled `computeLiveForecast` bug in the build handoff's "Known broken" table; the guard is a workaround, not a fix.
   - **Tie-break when several components are 0.** Name the one with the highest `SCORE_COMPONENT_MAX` — drying, then rain, then wind, then temp, then humidity — so the phrasing is deterministic. Never list two.
   - **A `Severe`+ alert names the alert, not a component:** `Score 80 (high confidence) — see heat warning above`.
5. **Alerts outrank everything.** An active NWS alert renders above the score on every surface, bot included. A `Severe`+ alert is never omitted for space.
6. **Sources named**, on detail and in the bot reply, built per the location-dependent rule in §3 — never a hardcoded list.
7. **No dead-client copy.** The bot's not-found reply currently says *"Save it in the app first"*, referring to the archived mobile app. Replace with wording that points at a surface that exists.

### The bot reply, rewritten

```
Red Rock
High 103°F · wind to 21 mph · humidity 17% · no rain in 72h

⚠️ Extreme Heat Warning (NWS) through Aug 28

Score 80 (high confidence) — see heat warning above
Sources: NWS · Open-Meteo ensemble · ACIS climatology
```

(Red Rock has `asos_station: KLAS`, so ACIS is the correct third source here. Note that **all three seeded locations have an `asos_station`** — Joshua Tree `KPSP`, Red Rock `KLAS`, Indian Creek `KCNY` — so the `Open-Meteo archive` branch is never exercised by seed data and will not show up in manual testing. It still has to be built; the column is nullable and any location added later may lack one.)

Weather first, alert second, score derived and qualified, sources named, imperial throughout, no opinion.

### The Mini App uses the same ladder and the same suppression rule

Task 6 imports the state-label and suppression logic rather than reimplementing it. Put it in `packages/types/src/conditionsCopy.ts` alongside the unit helpers, for the same reason: two surfaces, one implementation.

### HTML escaping is part of this change

`conditionsReply.ts` interpolates `` `<b>${location.name}</b>` `` under `parse_mode: 'HTML'`. A location named "Bear & Cub" makes the send fail with a 400 that the webhook swallows, so the bot silently goes dead. `formatAlertMessage` has the same defect with NWS headlines containing `&`. Both are issue #26. **Any change to reply text must escape, or it ships a live outage** — the new reply above interpolates an NWS headline, which is exactly the string that breaks.

---

## 8. Implementation choices replacing the RN-specific parts of §Design System

| §Design System says | Mini App uses |
| --- | --- |
| `LinearGradient` from `expo-linear-gradient` | CSS `linear-gradient(180deg, …)` on `body`, same three stops at `0 / 45% / 100%` |
| `react-native-svg` | Inline SVG. No v1 screen needs the complex geometry — sun arc, compass dial, and horizon ramp all belong to out-of-scope screens |
| `@tabler/icons-react-native` | `@tabler/icons-react`, same names. Only four are needed: `map-pin`, `droplet`, `temperature`, `wind`. **Not `chevron-left`** — back is Telegram's `BackButton` and a second affordance is a bug (§2). The alert banner uses a colored bar and the event name, not an icon: `alert-triangle` is outside the mockup's 1:1 `ICONS` map, and §Design System requires matching it exactly |
| "no CSS vars" | CSS custom properties, emitted once at `:root` from the imported tokens |
| Barlow via `expo-font` | Barlow and Barlow Condensed from Google Fonts, with a real fallback stack |

Contrast rules, layout constants (`screenH` 20, `topSafe` 48, `cardPad` 14, `bottomInset` 24), copy rules, and the token-source rule carry over **verbatim and binding**.

---

## 9. Non-goals (explicit)

Not in the Mini App, in v1 or later without a new spec:

- Radar, walls, trips, shade map — they exist in archived `apps/mobile` and stay out
- Location search or creation (see §10)
- History and normals views — no writer exists (issue #25)
- Any AI-generated commentary or per-hour analysis — removed once already for violating the copy rules; do not reintroduce
- Light theme (§1)
- Bottom navigation — two screens do not need it
- Offline write / mutation queue
- Push notifications outside Telegram's own

---

## 10. Open questions this spec does not close

1. **How does a user add a location?** The seeded three are the only ones that exist, and the bot's fallback copy points at a dead app. The API is further along than "no way in" suggests, but neither path is usable as-is:

   | Path | State |
   | --- | --- |
   | `GET /locations/search?q=` → `POST /locations {cragId}` | Endpoints exist and pair correctly. **But the `crags` table is empty** — `?q=rock` returns `[]` against production, so the picker would render nothing. Needs a crag import before it is a real flow. |
   | `POST /locations {name, lat, lon}` | Works today, but requires the user to type coordinates (geocoding is explicitly out of scope per `plan.md`) and forces `is_climbing_location: false`, which is wrong for a crag. |

   So the choice is: seed `crags` and build the search picker (a third screen, breaking the two-screen constraint), add a bot command, or ship v1 read-only and say so. **Needs a product call before Task 6 writes the empty state** — §5 is blocked on it.
2. **The scoring fix behind issue #21.** §7 makes the copy honest; the score itself still charges at most 12 points for any amount of heat, so a settled dry spell scores in the 80s at 103°F. Options: cap the total when any component is 0, apply a multiplicative safety factor, or re-weight temperature above 12. This is a scoring-math change with test implications and belongs in its own change, not in Task 6.
3. **Caching.** Six upstream fetches for one detail screen. Fine at one user. Fixing issue #22 removes one of three per request for free.

---

## 11. Acceptance

Someone else can build the Mini App from this document without asking a design question, **with one declared exception: the empty-state copy (§5), which is blocked on the product call in §10.1.** Every other decision required by the build handoff has a written answer. Task 6 can start on the location list and detail screens; only the no-locations case waits.

Mapping to the build handoff's own numbering:

| Required decision | §  | Answer |
| --- | --- | --- |
| Theming | 1 | WeatherTeam6 dark, fixed; Telegram chrome harmonized; hybrid rejected with reason |
| Navigation | 2 | Two routes, Telegram `BackButton`, deep-link back stack specified |
| Content hierarchy | 3 | Per screen, weather-first ordering |
| Units | 4 | Shared pure helpers in `packages/types` |
| States | 5 | Loading, empty, error, stale, partial |
| Non-goals | 9 | Written explicitly |
| Copy model (#21) | 7 | One ladder, suppression rule, applied to bot and Mini App together |

**Two constraints this spec discovered that Task 6 must not rediscover the hard way:**

1. **Per-day scores are not available over the API** (§3). The build handoff says "no API changes needed"; that holds only because this spec drops per-day score chips. Adding them later is an API change.
2. **`tokens.ts` is not directly importable for the web** (§0a). `shadow`, `layout`, and `fonts` need an adapter before a single component is written. Budget for it in the scaffold, not mid-screen.
