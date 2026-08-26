# WeatherTeam6 Mini App — Design Spec
Version: v1
Date: 2026-08-24
Status: Phase B0 deliverable — agreed before scaffold. **Built as of 2026-08-26** (Tasks 5, 5a and 6); this document is now both the contract and the description of what exists.
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

> **Status: built.** Task 5 shipped it on 2026-08-25, along with `src/theme/fonts.ts`
> (the family-name mapping, derived by inserting the space rather than hard-coding
> `"Barlow Condensed"`) and `src/theme/cssVars.ts`, which renders the tokens as a
> `:root` block served through the `virtual:wt6-tokens.css` module. `components` is
> deliberately *not* pre-converted — the "audit per-entry" note above still stands, and
> exported `boxStyle` / `textStyle` helpers are there to convert the entries a screen
> actually uses. Verified in a real browser: `screenTitle` computes to 30px/700/-0.3px
> in Barlow Condensed and the gradient's custom properties resolve.

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

**Decision: three routes, Telegram `BackButton` as the only back affordance.** (Two until §12 added `/add`.)

```
/                    location list   (root)
/location/:id        location detail
/add                 search and add a location   (see §12)
```

- Client-side routing, no server routes. The Vercel project rewrites all paths to `index.html`.
- **`BackButton`:** `hide()` on the list only; `show()` on every other route. Never call `WebApp.close()` ourselves; from the list, Telegram's own chrome closes the app.

  **Where it goes is per-route — a blanket "navigate to `/`" is wrong.** An earlier draft said exactly that, which would have stranded the §12 flow: pressing back from a preview would jump to the list and silently discard the search the user had just run.

  | Route | `BackButton` target |
  | --- | --- |
  | `/` list | hidden |
  | `/location/:id` (saved) | `/` |
  | `/add` | `/` |
  | `/add` preview (unsaved detail) | back to `/add` **with the query and results intact** — treat preview as a step within `/add`, not a sibling of it |

- **After a successful save**, replace history rather than pushing: go to `/location/:id` for the newly created location, with `/` beneath it. Back from there lands on the list, not on the preview of a place already saved. The `POST /locations` response returns the created `Location` including its new `id` (`routes/locations.ts` returns `mapLocation(row)` with `201`), so no extra fetch is needed.
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

Empty state, error state, and loading per §5. No sort or filter controls in v1. **An add affordance does belong here** — a single action in the list header routing to `/add` (§12). An earlier draft of this line read "no search, no add-location", which §12 reversed; the list is the only place a user with saved locations can reach the add flow from, so without it §12 is unreachable except from the empty state.

### Location detail (`/location/:id`)

One scroll, no internal tabs — carried from the mockup's Crag Detail treatment.

1. **Alert banner** — full-width, top, if any active alert. Event, severity, and the NWS headline. Above everything, always.
2. **Today** — the hero. Today's high, max wind, humidity, and hours since rain, as labeled values. **Hours since rain is capped in display — see the rule below.**
3. **7-day forecast** — one row per day: date, high, low, wind, precipitation. **Weather only — no per-day score chip.** See the constraint below.
4. **Score and breakdown** — last section, collapsed by default. Today's score only, with the five components and their weights. This is where a score is allowed to be prominent, because the user has scrolled to it deliberately. **Omitted entirely when `is_climbing_location` is false — see the rule below.**
5. **Sources footer** — required by the locked rule "always quote data sources by name." **Nothing in this list may be hardcoded**, because two of the three sources vary per request:

   - **Forecast model** — read it from the response. `ForecastSnapshot.model_sources` is returned by `/forecast/:id` and says what actually ran. `computeLiveForecast` calls the ensemble only, as of 2026-08-26 — **issue #22 was diagnosed and the NBM call removed**: Open-Meteo does not define `precipitation_p10/p50/p90` as daily variables and exposes no NBM quantiles under any name, so that branch could never have returned data. Live responses come back `["gfs_seamless","ecmwf_ifs025","icon_seamless_eps","gem_global"]`. Reading the field is still right: writing "Open-Meteo ensemble" as a constant would become false the moment a second source is added.
   - **Rainfall history** — ACIS via `fetchPrecipHistory` when the location has an `asos_station`, else Open-Meteo's archive via `fetchArchivePrecip`. The column is nullable, so branch on it.
   - **Alerts** — always NWS.

   Naming a source that never ran is a false attribution, which is the precise thing the locked rule exists to prevent.

**Note on maxima vs. current readings.** `temp_c_max` and `wind_kmh_max` are **daily maxima**, not present conditions — Red Rock's `39.5°C` is today's high, not the temperature right now. There is no current-observation field in any response. Label accordingly: *"High 103°F"*, *"Wind to 21 mph"*. Presenting a daily max as a live reading is a factual error, not a wording preference.

**Rule: non-climbing locations never show a score, anywhere.** The app is a climbing tool *and* a general weather app (see §12), so a saved location may be a city. `computeLiveForecast` scores every location it is given — it does not branch on `is_climbing_location` — so `GET /conditions/:id` will happily return a conditions score for Chicago. **A rock-drying score for a city is meaningless, and presenting one is the same class of error as the copy rules in §7 exist to prevent.**

When `is_climbing_location` is false, on every surface including the bot:

- No score chip on the list card, no score section on detail, no breakdown, no drying time, no "hours since rain".
- Weather, the 7-day forecast, and alerts render exactly as they do for a crag. Alerts in particular are *more* relevant here, not less.
- Suppression (§7 rule 4) does not apply — there is no score to suppress.
- The client simply does not call `GET /conditions/:id` for these locations. Skipping it also removes two of the three upstream fetches per §5, so non-climbing locations load noticeably faster.

**Rule: hours since rain is capped at "30+ days" in display, everywhere.** `breakdown.drying.hours_since_rain` carries a sentinel. When the rainfall lookup returns nothing — because it genuinely has not rained, **or because the ACIS / Open-Meteo-archive fetch threw and `liveForecast.ts:96` swallowed it** — `dryingModel.ts:34,41` returns exactly `720`, flagged `estimated_dry: true` with `confidence: 'high'`. Both paths produce the identical value, so **no surface can tell a dry month from an upstream outage**, and neither may be rendered as a precise measurement.

Binding: any value at or above `720` renders as *"no rain in 30+ days"* — never *"no rain in 720h"*, never a computed day count. Below `720`, render the real figure. This is a display cap, not a data fix; the underlying ambiguity is filed as §10.6. It applies to the bot reply in §7 as much as to the detail screen, since both read the same field.

**Constraint: per-day scores do not exist over the API.** `computeLiveForecast` scores all seven days, but no endpoint returns them — `GET /conditions/:id` keeps only the row matching today (`routes/conditions.ts`) and `GET /forecast/:id` returns `snapshots`, which carry no score or confidence field. Verified against production: `/forecast/:id` returns 7 objects whose keys are `id, location_id, captured_at, forecast_date, precip_mm_p10/p50/p90, temp_c_min, temp_c_max, wind_kmh_max, humidity_pct, model_sources, created_at, window`.

This contradicts the build handoff's "no API changes needed." The resolution is to **need no API change here**: forecast rows show weather, and the score appears exactly once, for today, in section 4. That is also the stricter reading of "score is a derived signal, never the headline." If per-day scores are ever wanted, that is an API change and its own task.

(§12 later makes API changes for a different reason — the add-location flow. That does **not** reopen this one. Per-day score chips remain out; the argument above is a design argument, not a budget one.)

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

**Why `packages/types` and not `packages/design`:** the bot needs these, and `apps/api` importing from a design package would be wrong on its face. `apps/api` already depends on `packages/types`, and that package already ships runtime code — `aspectToDegrees`, `parseNumeric`, `parseNumericRequired`, and `SCORE_COMPONENT_MAX` all live there today — so pure helpers are consistent with it, not an exception to it.

**Where the unit labels live — the formatters own rendered text.** An earlier draft said the *labels* stay in `packages/design`'s `units` export while only the *math* moves to `packages/types`. That is not what the code above does, and the two cannot both be true: the formatters emit `°F`, `mph`, `%` and `in` as literals, `packages/design/src/tokens.ts:607` defines those same four strings, and `packages/types` **cannot import `packages/design`** — the paragraph above forbids exactly that. Left as written, the labels are defined twice in two packages, which is the duplication the architecture rule exists to stop.

Splitting them the other way is worse, not better. A formatter returning a bare `"72"` forces every call site to know that `°F` closes up (`72°F`) while `mph` takes a space (`21 mph`) — spacing rules restated at every call site are a far likelier source of drift than one shared literal.

**Decision: `packages/types/src/units.ts` is authoritative for any string a user reads.** `packages/design`'s `units` export is superseded for rendered text and must not be used to build one; it stays only as a reference for a designer reading the token file, and for axis or legend labels where no formatter is involved. If it drifts from the formatters, the formatters win.

**This fixes a live bug for free.** The bot currently displays no units at all. Once these exist, `conditionsReply.ts` uses them (§7).

**Rounding is display-only.** Never round before scoring; the API's metric values stay canonical end to end.

---

## 5. States

Live scoring is slow. A measured `GET /api/v1/conditions/:id` against production took roughly four seconds, because `computeLiveForecast` made three upstream fetches per request. **Two as of 2026-08-26** — the ensemble and rainfall history; the NBM call was removed with issue #22. A detail screen loading conditions and forecast together makes four. Treat the four-second figure as still roughly right until it is re-measured.

| State | Treatment |
| --- | --- |
| **Loading** | Skeleton cards at the real final dimensions, `card` background, no spinner. Four seconds of spinner reads as broken; a skeleton reads as loading. Never a blocking full-screen loader. |
| **Empty** | No saved locations. **Unblocked as of 2026-08-25 — §10.1 is answered and the flow is specified in §12.** Copy: *"No locations yet."* with a primary action **"Add a location"** routing to `/add`. This was previously left unwritten because every candidate wording pointed at a dead path; it now points at a real screen, so the §7 rule 7 objection no longer applies. `/add` shipped with Task 6 on 2026-08-26, so the action points somewhere real. |
| **Error** | Inline within the card or section that failed, not a whole-screen takeover. The list must still render locations whose conditions call failed. Copy: *"Couldn't load conditions. Tap to retry."* Never surface an HTTP status code or a raw error string. |
| **Stale / offline** | React Query serves cached data and shows a `txt4` timestamp line: *"Updated 12 min ago."* Do not blank the screen on a refetch failure. |
| **Partial** | A location with a score but no alert data renders the score. A section that failed shows its own error; siblings render normally. |
| **No score for today** | `GET /conditions/:id` returns **`200` with `data: null`** when no computed row matches today's date (`routes/conditions.ts:45`). This is a success response carrying nothing, not an error, and it is reachable whenever the forecast feed starts at tomorrow. Guard on `data === null` *before* reading `data.score` — the §7 ladder takes a null `score`, not a null response object, and a bare `label(data.score)` throws here. **Do not reuse the ladder's *"Too far out to score"* copy:** that describes a date beyond the scoring window, and this is today. Render *"No conditions for today yet."* and still show the 7-day weather, which is unaffected. |

**Silently degraded — a known blind spot, written down rather than papered over.**

When the forecast feed contains no row for today, `liveForecast.ts:126-130` substitutes current-condition proxies. The effect is the **opposite** of degrading the score:

| Fallback | Value | Effect |
| --- | --- | --- |
| `currentWindKmh ?? 0` → `maxWindKmh24h` | `0` | `conditionsScore.ts:69` awards **full 15/15** — 0 km/h is inside the `<= 15` band |
| `currentHumidityPct ?? 50` | `50` | `conditionsScore.ts:81` awards **full 8/8** — 50% is inside the `<= 50` band |
| `currentTempC` | `0` | Dead field, never read (§7 rule 4) |

So the score comes back **inflated, with every component non-zero** — invisible to a suppression rule that keys on zeros, and indistinguishable from a genuinely excellent day. The API exposes no flag for it; the only signal is a server-side `logger.warn`. **The client cannot detect this state in v1.** It is recorded here so the next person does not mistake it for a Mini App bug, and it is filed as §10.4. Do not invent a client-side heuristic for it.

A closely related case **is** partly visible: when the rainfall fetch fails, `liveForecast.ts:96` leaves the event list empty and `dryingModel.ts:39-46` returns the `720`-hour sentinel with `estimated_dry: true` and `confidence: 'high'`, which earns the full 40/40 drying component. A genuine month-long dry spell produces the same 720, so the two are not separable — but the display rule in §3 keeps either from rendering as a false precise fact.

React Query configuration: `staleTime` 5 minutes, `gcTime` 30 minutes, `retry: 1`, no `refetchOnWindowFocus` — a Telegram webview fires focus events on every keyboard dismissal.

---

## 6. Forecast window labeling

The architecture rule states three windows:

```
>14 days out : climatological normals only, no conditions score
7-14 days    : low-confidence ensemble, score shown with low confidence label
<7 days      : full conditions score active, p10/p90 bands shown
```

**Only the third is reachable in the Mini App v1, and the spec says so rather than leaving a builder to discover it.**

The reason is narrower than "the detail screen only shows 7 days", and an earlier draft got it wrong. `forecastDateDaysOut` is measured from **today**, not from the first row returned (`liveForecast.ts:134-137`). So when the feed starts at tomorrow, the seven rows run `daysOut` 1..7 and the last one does land in the `early` window at `confidence: 'low'` (`conditionsScore.ts:22,31`). The 7–14 day band is reachable in the data.

It is nonetheless unreachable **on screen**, because of where scores are allowed to appear: the 7-day list is weather-only (§3), and the single score shown is today's, which is `daysOut` 0 by construction. On the one path that produces an `early`-window row, `/conditions/:id` returns `data: null` anyway (§5, *No score for today*) and no score renders at all. The `>14 day` row depends on `/normals`, which returns `[]` forever until issue #25 has a writer, and §9 forbids calling it.

The conclusion holds; do not rely on the wrong reason for it, because it stops holding the moment a per-day score chip is added.

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
   - **No degradation guard. Suppression runs unconditionally whenever a component is 0.** An earlier draft of this rule carved out an exception, on the belief that `liveForecast.ts`'s missing-today-row fallback zeroes `component_temp` and would make every location read *"limited by temperature"*. **That belief is false, and the exception it produced was actively harmful.** The temperature component is computed from `input.forecastHighC` (`conditionsScore.ts:76`), which `liveForecast.ts:163` supplies as the real per-day `day.temp_c_max`. The `currentTempC` value built from the `?? 0` fallback (`liveForecast.ts:129`) is passed into `conditionsScore` and **never read** — it is a dead field on `ScoreInput`. So the fallback cannot zero the temp component under any input.

     The exception's stated signature — `component_temp === 0` together with a `temp_c_max` at or above 0 °C — is not a degradation signature at all. It is an exact description of **Red Rock at 39.5 °C**, where `component_temp` is 0 because `conditionsScore.ts:77` zeroes any `temp > 35`. A builder implementing that carve-out would suppress the suppression on the one case this whole section exists for, and ship *"Dry, settled"* against a 103 °F Extreme Heat Warning. Do not reintroduce it in any form.

     What the missing-today-row fallback actually does is the opposite of degrading the score — see §5, *Silently degraded*.
   - **Tie-break when several components are 0.** Name the one with the highest `SCORE_COMPONENT_MAX` — drying, then rain, then wind, then temp, then humidity — so the phrasing is deterministic. Never list two.
   - **A `Severe`+ alert names the alert, not a component:** `Score 80 (high confidence) — see heat warning above`.
5. **Alerts outrank everything.** An active NWS alert renders above the score on every surface, bot included. A `Severe`+ alert is never omitted for space.
6. **Sources named**, on detail and in the bot reply, built per the location-dependent rule in §3 — never a hardcoded list.
7. **No dead-client copy.** The bot's not-found reply currently says *"Save it in the app first"*, referring to the archived mobile app. Replace with wording that points at a surface that exists — once §12 ships, that is the Mini App's `/add` screen, reachable from the bot's own `web_app` button.
8. **The bot obeys §3's non-climbing rule too.** `buildConditionsReply` calls `computeLiveForecast` and reports a score for whatever it matched, with no check on `is_climbing_location`. Once general weather locations exist (§12), `/conditions Chicago` would answer with a rock-drying score. For a non-climbing location the reply is weather, alerts, and sources only — no score line, no drying, no state label. Its existing query (`conditionsReply.ts:17-30`) selects an explicit column list that does **not** include `is_climbing_location` — add it to that list rather than issuing a second query.

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
- ~~Location search or creation~~ — **no longer a non-goal.** Reversed 2026-08-25 on the product call recorded in §12: search, preview, save, and delete are in scope. Editing a saved location afterwards (rock type, aspect, cliff angle) stays out — see §12's deferred list
- History and normals views — no writer exists (issue #25)
- Any AI-generated commentary or per-hour analysis — removed once already for violating the copy rules; do not reintroduce
- Light theme (§1)
- Bottom navigation — still out with §12's third route. `/add` is a task you finish and leave, not a destination you switch between; a persistent tab bar would advertise it as a peer of the location list, which it is not. Reached from the list's empty state and from an add affordance in the list header
- Offline write / mutation queue
- Push notifications outside Telegram's own

---

## 10. Open questions this spec does not close

1. **How does a user add a location?** The seeded three are the only ones that exist, and the bot's fallback copy points at a dead app. The API is further along than "no way in" suggests, but neither path is usable as-is:

   | Path | State |
   | --- | --- |
   | `GET /locations/search?q=` → `POST /locations {cragId}` | Endpoints exist and pair correctly. **But the `crags` table is empty** — `?q=rock` returns `[]` against production, so the picker would render nothing. Needs a crag import before it is a real flow. |
   | `POST /locations {name, lat, lon}` | Works today, but requires the user to type coordinates (geocoding is explicitly out of scope per `plan.md`) and forces `is_climbing_location: false`, which is wrong for a crag. |

   ~~So the choice is: seed `crags` and build the search picker, add a bot command, or ship v1 read-only.~~ **ANSWERED 2026-08-25. Neither option above was taken.** The product call is that this behaves like an ordinary weather app: search any place by name, see its weather first, then choose to save it — with an explicit "is this a climbing area?" toggle rather than the flag being inferred. Full specification in **§12**. This closes the last blocker on §5's empty state, and it reverses the "location search or creation" non-goal in §9.
2. **The scoring fix behind issue #21.** §7 makes the copy honest; the score itself still charges at most 12 points for any amount of heat, so a settled dry spell scores in the 80s at 103°F. Options: cap the total when any component is 0, apply a multiplicative safety factor, or re-weight temperature above 12. This is a scoring-math change with test implications and belongs in its own change, not in Task 6.
3. **Caching.** Four upstream fetches for one detail screen, down from six — issue #22 removed one of three per request on 2026-08-26. Fine at one user; still unaddressed as a general concern.
4. **Degraded scores are invisible to any client.** When the forecast feed has no row for today, `liveForecast.ts` substitutes proxies that award full wind (15/15) and full humidity (8/8) marks, inflating the score with no component zeroed and nothing in the response to say so — only a server-side `logger.warn` (§5, *Silently degraded*). Every surface, bot included, will present that score as ordinary. Making it detectable means adding a field to the conditions response. That was previously ruled out for breaking the build handoff's "no API changes needed" — **but §12.3 breaks that anyway, so the objection is gone and the marginal cost is now small.** Strong candidate to ride along with Task 5a rather than wait for its own change. Either way it stays out of Task 6's UI work: **not a Mini App bug — do not let Task 6 invent a client-side heuristic for it.** Still needs filing as its own issue alongside #21.
5. **"Today" is a UTC date, not the location's local date.** `liveForecast.ts:47` computes `todayStr` as `now.toISOString().slice(0,10)`, and both Open-Meteo calls set `timezone=UTC` (`openMeteo.ts:333,428`), so every daily bucket is a UTC day. For anywhere in the Americas that means the day labelled "today" rolls over in the **late afternoon local time**: at 18:00 in Las Vegas it is already tomorrow in UTC, so "today's high" is drawn from a bucket spanning tonight and tomorrow afternoon. The `locations` table has a `timezone` column (`schema.ts:60`) and the API returns it, but **nothing reads it** — it is captured and ignored. This is pre-existing and not introduced by §12, but §12 makes it much more visible: a general weather app is checked in the evening far more often than a crag is, and "today's high" being tomorrow's is the kind of error a user notices immediately and cannot explain. Fixing it means passing the location's timezone to Open-Meteo and deriving `todayStr` in that zone. Sized like §10.2; needs its own issue.
6. **A dry month and a failed rainfall fetch are the same value.** `dryingModel` returns the `720`-hour sentinel with `estimated_dry: true` and `confidence: 'high'` for both a genuine 30-day dry spell and a swallowed ACIS / archive error (§3, display-cap rule). The full 40/40 drying component follows in both cases, so the largest single component in the score is, in the failure case, unearned and asserted confidently. §3's cap stops it rendering as a false precise fact; it does not stop it inflating the score. The fix is a distinguishable no-data result from `dryingModel` — a scoring-layer change with test implications, sized like §10.2 and out of scope here.

---

## 11. Acceptance

Someone else can build the Mini App from this document without asking a design question. ~~with one declared exception: the empty-state copy (§5)~~ — **that exception is closed.** §10.1 was answered on 2026-08-25 and §12 specifies the add flow, which unblocks §5's empty state. Every decision required by the build handoff now has a written answer, and so does the one the build handoff did not think to ask.

The remaining constraint is a sequencing one, not a design gap: §12 requires five API changes (§12.3), and the UI cannot be built honestly against endpoints that do not exist. See §12.5.

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
| *(not asked by the handoff)* | 12 | Adding a location — search, preview, save, delete; climbing as an explicit toggle |

**Two constraints this spec discovered that Task 6 must not rediscover the hard way:**

1. **Per-day scores are not available over the API** (§3). The build handoff says "no API changes needed"; that holds only because this spec drops per-day score chips. Adding them later is an API change.
2. ~~**`tokens.ts` is not directly importable for the web** (§0a). `shadow`, `layout`, and `fonts` need an adapter before a single component is written. Budget for it in the scaffold, not mid-screen.~~ **Done in Task 5** — the adapter is `apps/miniapp/src/theme/tokens.css.ts`. What Task 6 must not rediscover is the rule that survives it: import `type`, `shadow` and `layout` *from the adapter*, never from `@weatherteam6/design/tokens`. Importing `fonts.display` straight into a `font-family` matches nothing and falls back to the system font without erroring.
3. **"No API changes needed" is dead as of §12.** The add-location flow requires two new endpoints, one changed endpoint, and one new one for deletion. The API work is a prerequisite for the UI work, not a companion to it — sequencing in §12.5.

---

## 12. Adding a location (closes §10.1)

> **Status: built, both halves.** Task 5a shipped all five §12.3 changes on 2026-08-25
> (`a90613f`, PR #37); Task 6 shipped the UI on 2026-08-26 — `/add` with geocoder search
> and coordinate entry, the preview in unsaved mode, the save bar with the climbing
> toggle and rock-type picker, and the delete affordance on saved detail. §12.3 below is
> written in the future tense because it was a specification; read it now as a
> description of what exists, and verify with `npm run check:add-location`.
>
> **Two implementation notes worth keeping.** The preview is held in component state
> inside `/add`, **not a fourth route** — routing to a separate path and navigating back
> would discard the search, which is exactly what §2's back-target table forbids. And
> `/preview` has no alerts endpoint to call (alerts key on a saved location id), so an
> unsaved preview shows no alert banner and does not claim NWS as a source.

**Product call, 2026-08-25:** this works like saving a location in any ordinary weather app. Search a place by name, see its weather, decide whether to keep it. Climbing is a property of a saved location, not a precondition for saving one.

This is a deliberate widening of the product surface. WeatherTeam6's stated purpose in `CLAUDE.md` has always been "climbing conditions platform **+ general weather app**", but every flow built so far assumed the climbing half. This section is where the general half becomes real, and it is why §3 gains the "non-climbing locations never show a score" rule.

### 12.1 The flow

Three steps, but only one genuinely new screen.

1. **Search** — route `/add`. A text field and a result list. Results come from a geocoding lookup (§12.2), not from the `crags` table. Below the field, a secondary affordance: **"Enter coordinates instead"**, which swaps the input for a lat/lon pair plus a name field. This exists because a crag frequently has no searchable place name, and because the user asked for it explicitly.
2. **Preview** — tapping a result opens the **existing location detail screen in unsaved mode**. Real weather for those coordinates, fetched live. This is why `/add` is the only new screen: the preview is §3's detail screen with its chrome swapped, not a fourth design. In unsaved mode there is no score section regardless of type — nothing has been classified yet — and a **save bar** is pinned to the bottom.
3. **Save** — the save bar carries:
   - the resolved place name, editable, pre-filled from the geocoder;
   - a **"Climbing area"** toggle, default **off**;
   - when the toggle is on, an optional **rock type** picker — sandstone / limestone / granite / basalt / not sure — defaulting to *not sure*;
   - a **Save** button.

**Why rock type is offered at save time and not later.** It is the single largest lever on the score: `dryingModel`'s `MAX_HOURS` runs 72 h for sandstone against 12 h for granite, and the drying component is worth 40 of 100 points. Left unset it resolves to `unknown` → 48 h, which will be wrong by a wide margin for most real crags. And there is no edit screen (§12.4), so save is the only chance to capture it. One optional picker behind a toggle is cheap; a silently wrong drying score is not.

### 12.2 Geocoding — reversing a documented non-goal

`plan.md` decision 10 reads *"Geocoding — out of scope. Climbing search via `crags` table only."* **That decision is reversed by this section**, and `plan.md` must be updated rather than left to contradict this spec.

Use **Open-Meteo's geocoding API** (`geocoding-api.open-meteo.com/v1/search`). Reasons it is the right pick and not merely an available one:

- No API key, so no new secret, no new entry in `.env.example`, nothing to leak.
- Same vendor as the forecast, already trusted and already wrapped in this codebase's retry helper.
- It returns **`elevation`** alongside lat/lon, which `applyLapseRate` in `openMeteo.ts` needs and which a bare coordinate entry cannot supply.
- `build-prompt-v8.md:761` already named this exact API as the intended path — this is executing a deferred plan, not inventing one.

The endpoint is proxied server-side as `GET /api/v1/geocode?q=`, not called from the client, so it obeys the same retry/backoff and `{ data, error, status }` rules as every other external call.

**Result rows must be disambiguated, and this is not optional.** Verified live on 2026-08-25: `?name=Red Rock Canyon` returns **three** different places — a state park in Oklahoma (elev 480 m), another in California (738 m), and the National Conservation Area in Nevada (1200 m, the one a Vegas climber means). Their names are near-identical. A result list showing only `name` makes the choice a coin flip, and picking wrong is silent — you get a real forecast for the wrong state.

Each row renders `name`, then `admin1` and `country` as secondary text ("Nevada, United States"). The response also carries `elevation` and `timezone`; both are captured and passed through to save (§12.3 change 5). Nothing reads `timezone` today — see §10.5 — but it is free here and the column already exists.

**The `crags` table stays out of v1 search.** It is empty, and populating it from OpenBeta is its own project. Nothing here forecloses merging crag results into the same result list later; the result shape should simply not assume a geocoder is the only possible source.

### 12.3 The five API changes this requires

| # | Change | Why it cannot be skipped |
| --- | --- | --- |
| 1 | **`GET /geocode?q=`** — new | Nothing today turns a place name into coordinates |
| 2 | **`GET /preview?lat=&lon=&elevation=`** — new | Step 2 shows weather for a location that has no row and no UUID yet. `/conditions/:id` and `/forecast/:id` both key on a saved id. Internally this is `computeLiveForecast` over a synthetic `LiveForecastLocation` — it only uses `location.id` for log lines and snapshot ids, so a placeholder is safe. **Nothing is persisted.** |
| 3 | **`POST /locations`** — changed | `routes/locations.ts:174` hardcodes `is_climbing_location: false` on the `{name, lat, lon}` branch, so a manually added crag can never be a crag. Must accept `is_climbing_location` and optional `rock_type`. `CreateLocationInput` in `packages/types` changes with it. |
| 4 | **`DELETE /locations/:id`** — new | **There is no delete endpoint at all.** A save flow without an unsave is a trap: one mistyped search result is permanent. This is table stakes for the flow, not a nice-to-have. |
| 5 | **`POST /locations` must persist `elevation_m`** — changed | **Caught in review; without it the flow is visibly broken.** Neither insert branch sets `elevation_m`, though the column exists (`schema.ts:50`) and the seed populates it. `applyLapseRate` (`openMeteo.ts:271-283`) returns early when it is null, so **preview would show elevation-corrected temperatures and the saved location would not** — the same place, different numbers, before and after tapping Save. At the standard lapse rate that is roughly 6.5 °C per 1000 m of difference from the model grid elevation; for a mountain crag, comfortably 10 °F. Persist the geocoder's `elevation` on save, and on the manual-coordinates path accept a null and let the correction be skipped consistently in both preview and detail. |

Note that change 2 finally exercises the `fetchArchivePrecip` branch of `liveForecast.ts`. All three seeded locations have an `asos_station`, so the archive fallback has never run in manual testing — a previewed location will have no station and will take it every time. Expect that path to be where the first bug appears.

### 12.4 Deliberately deferred

- **Editing a saved location.** No `PATCH /locations/:id` exists and none is added here. Rock type, aspect, and cliff angle are captured at save or not at all. Aspect and cliff angle are *not* asked for at save — they need a compass and an estimate, which is too much friction for an add flow, and they modify the drying score far less than rock type does. Both fall back to their existing defaults (aspect South, angle 45°). Revisit when there is evidence the defaults are hurting.
- **Merging `crags` results into search** (§12.2).
- **Reordering or grouping the saved list.** §9 still holds.

### 12.5 Sequencing — this changes the task order

The API work in §12.3 is a **prerequisite** for the UI, not a companion to it. It is also entirely independent of the `initData` auth work that Task 6 is blocked on, so it can proceed in parallel rather than waiting.

Recommended: take §12.3 as its own backend task — **Task 5a** — landing before or alongside Task 5's shell work. Task 6 then builds `/add`, the detail screen's unsaved mode, the save bar, and the delete affordance against endpoints that already exist. Building the UI first would mean mocking the whole surface, and `.claude/rules/architecture.md` forbids leaving mock data in a finished feature.
