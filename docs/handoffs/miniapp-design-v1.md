# WeatherTeam6 Web App — Design Spec
Version: v1, rewritten 2026-11-04 as the app stands
Status: **The current design, open to change** — build to it, and propose changes to the owner as options (owner, 2026-10-01: *"I am not hard set on anything design wise"*). The copy and attribution rules are honesty rules, not taste (`design-system-v1.md`).
Extends `docs/handoffs/design-system-v1.md`, which it does not replace.

## Purpose

The screen spec for `apps/miniapp`: theming, navigation, what each screen holds, units,
states, copy and non-goals. If a decision is not written here or in the documents §11
lists, it is not settled — settle it with the owner rather than improvising in code.

This file says what the app is now. The history of how each screen got here is in git and
in `.claude/docs/session-archive.md`; grep there for the reasoning behind one decision.

**Who wins where:**

- **Look and layout:** `miniapp-hybrid-transition-v1.md` and its mockup
  (`docs/handoffs/design-mockups/weatherteam6-hybrid.html`) win for the items they list.
- **What a reading may say:** `.claude/rules/readings.md`. This file points there rather
  than restating it.
- **Each screen's layout:** the header comment of the component named for it. Read it
  before changing the screen.

---

## 0. Tokens on the web

### 0a. `packages/design` is shaped for React Native

The token file was written for the deleted Expo app (`Target: React Native`). Only part of
it can be used on the web as it is.

| Export | On the web | Why |
| --- | --- | --- |
| `colors`, `colorsV2`, `uvScale`, `units`, `spacing`, `radius`, `bottomNav` | Directly | Plain strings and numbers |
| `fonts` | Through `src/theme/fonts.ts` | `'BarlowCondensed'` is an `expo-font` name; the CSS family is `"Barlow Condensed"`. The raw value matches nothing and falls back to the system font without an error |
| `type` | Through `src/theme/tokens.css.ts` | Unitless `fontSize`, string `fontWeight`, `letterSpacing` in points |
| `shadow` | Through `src/theme/tokens.css.ts` | RN shadow props have no CSS meaning; re-expressed as `box-shadow` |
| `layout` | Through `src/theme/tokens.css.ts` | `flex: 1`, `paddingHorizontal` are RN-only |
| `components` | Per entry, with `boxStyle` / `textStyle` | Entries mix text and box properties |

**The adapter derives and never restates a literal.** Deriving is not redefining, which is
what keeps it inside the token-source rule. `src/theme/cssVars.ts` renders the tokens as a
`:root` block, served through `virtual:wt6-tokens.css` so it lands in the bundled
stylesheet. The rule a component has to keep is in `apps/miniapp/README.md` § The token
rule.

---

## 1. Theming

**The WeatherTeam6 dark palette, fixed, for all content.**

`packages/design` has no light token set, and every contrast rule is a minimum opacity of
a near-white on dark. A light theme means authoring a light set in `packages/design` and
rewriting the contrast rules with it; reopen this only then.

- **The content surface is always dark.** `prefers-color-scheme` is not read.
- **The browser chrome** follows `<meta name="theme-color">`, generated from the tokens by
  `src/theme/webManifest.ts`, never a literal hex.
- **The conditions colours are semantic.** The score rungs (`SCORE_BANDS`) and the
  `good`/`fair`/`poor` hues carry meaning and are never used for a data mark; a chart that
  needs a colour takes a data hue (`sun`, the precipitation steps, the grade scale).
- **Geometry comes from the platform:** `100dvh`, and `env(safe-area-inset-*)` with a
  `0px` fallback on every reference (a bare `env()` that resolves to nothing drops the
  whole declaration). `index.html` keeps `viewport-fit=cover`, without which every inset
  is 0 on a notched phone.

---

## 2. Navigation

**Client-side routes, an in-app back control, a bottom bar, and a dock on a crag.** The
route list is `App.tsx`; `vercel.json` rewrites every path to `index.html`.

```
/login, /join          sign in; redeem an invite (outside the gate)
/                      the Conditions list
/location/:id          a location's tabs; /edit, /wall/:wallId, /wall/:wallId/route/:routeId
/add                   search and save a location (§12); ?lat=&lon= opens the form on a map point
/feedback              app feedback and forecast checks
/map                   saved locations as score pins on a relief map; hold to add a spot
/trips                 the list, /trips/new, /trips/:tripId, its /edit and /crag/:locationId (§13)
/crags                 bottom-bar section, "Not built yet."
/profile               settings, everyone's feedback, invites, How the score works, Sign out
```

- **Everything but `/login` and `/join` is inside `RequireAuth`.** It redirects on the
  token being gone, never on a status it saw; `api.ts` is the one place a 401 clears it.
- **Back is per route** (`src/lib/backTarget.ts`, a pure function overloaded per route, so
  a new action is a type error rather than a control that does nothing). A blanket "go to
  `/`" is wrong: the save form and browse steps are state inside `/add`, not navigations.

  | Route | Back goes to |
  | --- | --- |
  | `/` | no control |
  | `/location/:id`, any tab, its walls and routes | `/`, or `/map` when a pin opened it. A wall or route's crumb steps up a level |
  | `/location/:id/edit` | the location |
  | `/add` search | `/`, or the trip form it was opened from |
  | `/add` save form | the search or browse level it was picked from, **intact** — the form is a step inside `/add` |
  | `/add` save form from a map long-press | `/map` |
  | `/add` browsing a state | one level up; the state list returns to the search |
  | `/feedback` | the trip it was opened from, else the location, else `/` |
  | `/trips/new`, `/trips/:tripId` | `/trips` |
  | `/trips/:tripId/edit`, `/trips/:tripId/crag/:locationId` | the trip |

  A swipe in from the left edge is back too (`lib/edgeSwipe.ts`).
- **The bottom bar** holds **Conditions · Trips · Map · Crags · Profile** (`bottomNav` in
  `packages/design`; `TabBar.tsx`). The lit tab carries its name in a sliding aqua pill.
  Tapping a tab goes to its section's first screen; a section's first screen keeps its
  scroll position, and tapping its lit tab there scrolls to the top (`lib/bottomNav.ts`).
- **A crag replaces the bar with a dock** (`Dock.tsx`, hybrid look): opening a location
  slides the bar away and brings up its tabs within thumb reach. Back brings the bar back.
- **Tasks you finish and leave** — `/add`, `/feedback`, a location's editor, the trip
  forms — have no bar and carry their own back control.
- **After a save, replace history**: a new location opens `/location/:id` with `/`
  beneath it; a new trip opens the trip with `/trips` beneath it.

---

## 3. Screens

**Weather leads; the score is a labelled, derived figure, never bare.** What a reading may
say, where each score comes from and how a span is scored are in `readings.md`. Below is
what each screen holds, the file that lays it out, and the decisions that file's comment
does not carry.

### The Conditions list (`/`)

`routes/LocationList.tsx`, one `LocationCard.tsx` per location (hybrid mockup,
`listScreen`).

- A crag's row: the name, Dryness and the rock, today's good hours and score, and the hour's
  score large on the right with "now" under it. A city's row carries today's low and high
  and **never asks for conditions** (below, *A city never gets a score*).
- Active alerts lead the card (`AlertBanner`); a failed alerts load is stated, never read
  as "no alerts".
- **Sort: Score (default), Name, Added**, remembered on the device. Score order puts
  unscored locations last in added order and waits until every card has settled.
- Radar's "Raining" pill closes a row's text when NOAA radar sees rain there (#313).
- **Remembered cards**: on the same day, the weather each card last showed draws while the
  live answers load, and the header says how old (`lib/rememberedCards.ts`).
- The Add affordance is in the header. Pull to refresh prints the **oldest** `checked_at`
  across the cards.

### A location (`/location/:id`)

`DetailView.tsx`, header `DetailHeader.tsx`, slim header `SlimHeader.tsx`.

- **Tabs: Overview, Daily, Hourly, Precip, Rock, Crag.** A city gets the first four: it has
  no rock and no walls. The tab it opens on is the reader's (Profile → settings), and a
  `?tab=` link wins.
- **The alert banner and the Sources footer stay outside the tabs** (§7 rule 5): a tab is a
  place a reader can be standing when a warning arrives, and the footer describes the
  location, not one view of it.
- The large Overview score shrinks into a slim sticky header off the Overview, and the header
  follows the tab: the best day on Daily, the hour being read on Hourly, today's chance of
  rain on Precip, the margin above dew point on Rock.
- **The reader orders each tab's cards** on this device (`CardStack.tsx`; rules in
  `readings.md`).

**Overview** (`OverviewTab.tsx`): Hero, Today, Next days, Right now. Every rule for it is
in `readings.md`: the hero's one score is the hour covering now; the day's score is only in
Next days' Today column; Score breakdown never states a penalty's size; the rain-split
dots; sun and shade walls under the hero (#445).

**Daily** (`DailyList.tsx`, mockup `dailyTab`): one card, **Seven days**, a row per day —
sky, day, score, the low and high on a bar shared by the week, the chance of rain — with
good hours, Dryness, rain amount and peak wind under it.

- The score is Crag A's day score, joined on local date, in `SCORE_BANDS`' colours, the
  rungs every other surface uses.
- **The chance is the likeliest hour's share of wet members**, said so, never a daily
  probability nothing computes; with no wet count it is left off rather than printed `0%`.
- A row opens that day on Hourly; a day the hourly response cannot draw is not tappable.

**Hourly** (`charts/DayCharts.tsx`, mockup `hourlyCharts`): a week strip of days, then
cards that read one hour together under one scrub — temperature and humidity, sun, rain,
wind. The hybrid transition doc holds the chart decisions (scales, the read-hour chip, "Dry
all day"); `readings.md` and `weather.md` hold which series a figure may come from and how
rain is blocked. There is no seven-day chart here.

**Precip** (`PrecipTab.tsx`, mockup `precipTab`): the drying clock beside the last rain,
today, this week and when the rock is dry again; every hour of the past week as a grid;
the next 48 hours; each day's wettest hour.

- The headline is the last rain of any size; the last **real** rain (`REWETTING_PRECIP_MM`,
  what the drying clock counts from) is named under it when a lighter shower fell since.
  What the past and future figures are and when radar is named: `scoring.md`.
- **Colour marks precipitation only**; text, figures and chrome are the neutral ramp. A
  grid cell's fill is its amount on `precipStep1`–`5`, one blue in five lightness steps,
  the second step starting at real rain; snow and mixed add a ring rather than repainting.
  **An hour still to come or one the response skipped is an outline, never a dry cell**, and
  a skipped day totals a dash.
- The grid is one tab stop; a cell is a button, and tapping, dragging along a day, hovering
  or arrowing fills the readout with that hour's labelled values.
- The figures are model estimates, and the footnote says so; no gauge, uncertainty or
  storm track is drawn.

**Rock** (`RockTab.tsx`; crags only): the crag's live readings — the drying clock and the
Condensation card (`RockReadings.tsx`) — then *Sun on the wall* where confirmed
(`SunOnWallCard.tsx`), then a field guide to the **rock type, not this crag**, which its
last line says (`rockGuide` in `packages/types`), and the crag's facts. The drying gauge is a band of `MAX_HOURS`, held to it by `dryingModel.test.ts`;
`unknown` has no guide. **No modelled rock temperature prints** (`readings.md`). Care advice
is general rock knowledge the owner asked for, not a go/no-go.

**Crag, wall and route** (`guidebook/`): the OpenBeta crag the location sits on — the area
and its counts, the crag's readings now, routes by grade, the walls A–Z, and (#445) the
walls × hours grid. A wall opens its readings, *Climb it this week*, grades, a kind filter
and its routes; a route its grade, links, recorded facts, beta, neighbours and the logbook.
Data is `GET /guidebook/:locationId` (`api-sources.md` § OpenBeta Routes). Decided by the
owner, and not visible in the code's shape:

- **Grade marks use their own colours** — blue, teal, lime, amber, red, violet for boulders
  (`gradeScale`/`gradeBoulder`, owner 2026-09-29), the one exception to keeping status hues
  for the ladder, and only beside a printed grade or count.
- **No wall map, and walls are A–Z, not west to east.** OpenBeta's wall coordinates put
  Barn Bluff's walls where they are not; a map needs positions checked on the ground.
- ***Climb it this week* is on the wall, not the route**: it is the crag's reading, and a
  wall is the smallest thing it can honestly describe.
- **"Left → right" and "On the wall" appear only on a wall OpenBeta orders.** Elsewhere the
  list is by grade and there are no neighbours.
- **The route hero is a plain card**: green is the `good` rung, and a grade is not a
  condition.
- **Mountain Project is linked only with OpenBeta's own MP id**, never a name search; on
  Android through an `intent:` URL with the web page as fallback (`mountainProjectHref`).
  Unrecorded length and bolts read "Not recorded".
- **A location with no crag within 2 km says so** in a card.

### Map (`/map`)

`routes/MapScreen.tsx`, its own lazy chunk. Every saved location as a pin carrying its
score alone (warnings stay on the list and the crag); the pins are the list's own cached
answers. Hold a finger (right-click on a desktop) to add that spot; locate-me shows the
phone. Tiles and radar load straight from the hosts `architecture.md` names, and the radar
frame's time comes from `/radar/latest`.

### Profile (`/profile`)

`routes/Sections.tsx`: Settings (the temperature range friction is judged against, the
climbing hours, the tab a crag opens on), everyone's feedback, invites, How the score works
(`ScoreExplainer`), Sign out. Feedback is the corner button on every signed-in screen.

### A city never gets a score

The app is also a general weather app, so a saved location may be a city. The model would
score one if asked, so **the client never asks**: no conditions call, no score, no Dryness,
no drying clock, no Rock or Crag tab, on any surface. Weather, the forecast and alerts
render as they do for a crag. `readings.md` covers the server side.

---

## 4. Units

**`packages/types/src/units.ts` is the one place a unit becomes text**, shared by both apps.

- **Every formatter takes `number | null` and returns an em dash for null.** `cToF(null)`
  would be 32 °F (defect class 1).
- **`formatPrecipIn` prints `trace` for anything under 0.01 in but above 0**, and `0 in` for
  zero. `0.00 in` beside a reduced score would contradict the weather that explains it.
- **The formatters own the unit strings** (`°F`, `mph`, `%`, `in`, `ft`). `packages/design`'s
  `units` export is for axis and legend labels only; if the two drift, the formatters win.
- **A temperature interval goes through `cToFDelta`**, never `formatTempF`.
- **Rounding is display only.** The API's metric values stay canonical end to end.

---

## 5. States

| State | Treatment |
| --- | --- |
| **Loading** | Skeleton cards at the real final size (`States.tsx`). No spinner, never a blocking full-screen loader. A remembered card or the cached shell may draw first (§3, `README.md` § Installing it) |
| **Empty** | *"No locations yet."* with **Add a location** routing to `/add` |
| **Error** | Inline in the card or section that failed, never a whole-screen takeover: *"Couldn't load conditions. Tap to retry."* Never an HTTP status or a raw error string. The list still renders locations whose conditions failed |
| **Stale** | React Query serves cached data with an age line (`Updated 12 min ago`, `lib/format.ts`). A refetch failure never blanks the screen |
| **Partial** | Each section fails on its own; siblings render normally |
| **No reading** | The readings' own `unavailableLine`, else *"No conditions for today yet."* The weather still shows. An absent `readings` field (an older API mid-deploy) renders nothing (`readings.md`) |

React Query defaults (`lib/queryClient.ts`): `staleTime` 5 min, `gcTime` 30 min, `retry: 1`,
no `refetchOnWindowFocus` — a read costs upstream fetches, and refetching on every return
to the tab is how rate limiting is found.

---

## 6. Forecast window

The windows are `scoring.md` § State machine: days 0–6 scored from the readings, 7–15
weather only from the outlook (Trips), nothing beyond. There are no climate normals.

**p10/p50/p90 never appear in prose.** A spread is labelled **Range**, not "8 in 10 runs"
(owner, 2026-10-02); agreement is said in plain words (`AGREEMENT_MEANING`).

---

## 7. Copy rules

These hold on every surface. The mechanism is `packages/types/src/readingsCopy.ts`, and its
rules are in `readings.md`.

1. **No opinions.** Nothing tells a reader to climb or not to climb. No word is mapped from
   the score.
2. **Weather leads.** A surface that shows a score shows the weather beside it, in imperial
   units.
3. **A reading is a label and a value, never a sentence** (`Dryness: Dry`). Words come
   from the readings, never from the number.
4. **The score is labelled, never bare, and never states a penalty's size.** No alert
   withholds it (`architecture.md` § Background jobs).
5. **Alerts outrank everything.** An active NWS alert renders above everything else on
   every screen that shows its crag, and a Severe or worse alert is never dropped for space.
6. **Sources are named, and computed.** The Sources footer (`SourcesFooter.tsx`) names only
   what the response says ran (`model_sources`, `rain_models`, `rain_radar`); a source that
   did not answer is omitted, never guessed (defect class 3).
7. **No copy points at a surface that does not exist.**
8. **A city never gets a rock reading** (§3).

Two notes are required, each **once**: friction is an estimate (`FRICTION_MECHANISM`, on
the Rock tab's Condensation card and How the score works), and where a modelled rock
temperature prints, that it is modelled (`ROCK_TEMPERATURE_MECHANISM`). No AI-written
commentary.

---

## 8. Implementation choices on the web

`design-system-v1.md`'s binding parts are the token-source rule, contrast rules, layout
constants and copy rules. Its React Native library choices are replaced:

| `design-system-v1.md` says | The web app uses |
| --- | --- |
| `LinearGradient` | CSS gradients from the tokens; the hybrid look is a still background with frosted glass cards |
| `react-native-svg` | Inline SVG, no chart library |
| `@tabler/icons-react-native` | `@tabler/icons-react`, same names (`Icons.tsx`) |
| "no CSS vars, no className" | CSS custom properties at `:root` from the tokens (§0a) |
| Barlow via `expo-font` | Barlow and Barlow Condensed from Google Fonts with a fallback stack |

- **The alert banner is a coloured bar and the event name, with no icon**: `alert-triangle`
  is outside the mockup's icon map. Its tint derives from `colors.poor` (`theme/styles.ts`).
- **Layout constants** carry over (`screenH` 20, `cardPad` 14, `bottomInset` 24), except
  `topSafe`, which the web replaces with `topWeb` 16 over the safe-area inset.
- **CSS, transitions and motion are allowed** on tokens with `prefers-reduced-motion`
  (`design-system-v1.md` § CSS and motion; the `motion` skill).

---

## 9. Non-goals

Not in the app without a new decision from the owner:

- A light theme (§1).
- AI-generated commentary or per-hour analysis — removed once for breaking the copy rules.
- Climate normals and history views — nothing stores them.
- Offline writes or a mutation queue.
- **Push notifications or any alert channel.** Alerts are collected and shown in the app,
  and reach nobody outside it (`architecture.md` § Background jobs).
- Self-serve signup (`README.md` § Auth).

---

## 10. Open questions

Open design questions and ideas are GitHub issues (`gh issue list`), not a list here. The
Crags tab is the one unbuilt bottom-bar section.

---

## 11. Where the rest of the design lives

| Question | Read |
| --- | --- |
| Tokens, contrast floors, copy rules, CSS and motion | `docs/handoffs/design-system-v1.md` |
| The current look, and the screens it reshaped | `docs/handoffs/miniapp-hybrid-transition-v1.md`, then its mockup in a browser |
| What a reading may say | `.claude/rules/readings.md` |
| Client patterns (token adapter, session token, React Query, null-safe formatting, chart placement) | the `miniapp-patterns` skill |
| Placement, motion numbers, platform features | `.claude/docs/ui-craft.md` |
| Sun and shade walls (#445) | `docs/handoffs/wall-a-sun-shade-v1.md` |
| The rain-split dots | `docs/handoffs/design-mockups/rain-split.html` |
| Building, deploying, installing | `apps/miniapp/README.md` |

---

## 12. Adding a location

**Saving a place works as in any weather app:** search it, then decide to keep it. Climbing
is a property of a saved location, not a precondition for saving one.

### 12.1 The flow

1. **Find the place** on `/add` (`routes/AddLocation.tsx`):
   - **Search** by name (§12.2).
   - **Enter coordinates instead**, with a name, because a crag often has no searchable
     place name.
   - **Use my current location**: the browser's Geolocation, asked on the tap and never
     when the screen opens; `GET /geocode/reverse` names the fix (the known crag it falls
     in, else the town, else "Current location") and supplies the terrain elevation. A
     phone's altitude is never used. A refused or failed fix says why, with Try again.
   - **Browse climbing areas** while the field is empty: the states with an OpenBeta
     snapshot, then their areas, most climbs first, as deep as OpenBeta goes
     (`BrowseAreas.tsx`, `GET /climbing-areas/:state[/:areaId]`). Levels are state inside
     `/add`; Back steps up one.
   - A long-press on the map arrives here as `?lat=&lon=`.
2. **Save** (`SaveBar.tsx`): the name, editable, pre-filled; a **Climbing area** toggle,
   default **off**; behind it a **rock type** picker grouped by family, defaulting to *not
   sure*; Save. Save opens the location's own screen (§2). There is no preview: it could
   show no readings, so it read as broken (owner, 2026-09-30).

**Rock type is asked at save** because it is the largest lever on the score: `MAX_HOURS`
runs from a few hours to days by rock, and unset it is `unknown`, the slowest row. **On a
known crag the research's rock type is shown, locked, and there is no picker**
(`knownCrags.ts`): the API would overrule a pick.

### 12.2 Geocoding

`GET /api/v1/geocode?q=` proxies Open-Meteo's geocoding API (keyless, already wrapped in
the retry helper, and it returns elevation). OpenBeta's areas for the owner's states lead
the results (`lib/weather/climbingAreasMn.ts`).

**Result rows are disambiguated, always:** `name`, then `admin1` and `country`. "Red Rock
Canyon" is three places in three states with near-identical names, and picking the wrong
one is silent — a real forecast for the wrong place.

### 12.3 The API behind it

- `GET /geocode`, `GET /geocode/reverse`, `GET /climbing-areas/…` — find a place.
- `POST /locations` — takes `is_climbing_location` and an optional `rock_type`, and
  persists `elevation_m`; without it the lapse-rate correction is skipped and the same place
  would read different temperatures before and after saving. One write,
  `insertGeneralLocation` (`locations.md`).
- `DELETE /locations/:id` — through `deleteLocationCascade` (`architecture.md` § Database
  rules). A save flow without a delete is a trap.

`npm run check:add-location` exercises them against the real database.

### 12.4 Editing a location

`/location/:id/edit` (`routes/EditLocation.tsx`), opened by "Edit crag" on a climbing
location: an unlocked rock type, the way the wall faces (a 16-point rose) and the wall
angle in climbers' degrees. A task you finish and leave; Save returns to the Rock tab; only
what changed is sent (`lib/editLocation.ts`). **Aspect and angle are saved but score
nothing** — Crag A reads every crag from all sides — and the screen says so beside each.
They are not asked at save: they need a compass and an estimate.

---

## 13. Trips (`/trips`)

Owner-approved design (2026-10-02, from the round-3 mock): one crag days first, several
crags as a grid. The data rules are `trips.md`; this is the screen.

**Screens.**

- **`/trips`** lists trips soonest first: name, dates, how far off ("in 6 days",
  "underway"), crag count, and "Forecast opens 27 Oct" while the first day is past the
  16-day horizon. "New trip" in the header. **Ended trips fold under a closed `Past trips
  (n)`**, most recently ended first; with nothing coming up the list says "No trips coming
  up." above the fold.
- **`/trips/new`** and **`/trips/:tripId/edit`** are tasks you finish and leave: a name,
  first and last day (native date inputs), one or more saved climbing locations, and the
  trip's own climbing hours. Problems are one line under the form. On edit, a moved date
  shows "Changing the dates restarts the whole-trip trend." before Save, and Save sends only
  what changed.
- **`/trips/:tripId` with one crag** opens on that crag (`TripCragView.tsx`). The eyebrow is
  the crag, the title the trip, the meta its dates, timing and rock.
  - A tile per trip day, three to a row. A scored tile is the score in its rung's colour,
    Dryness, then high, chance and amount. A day not scored yet is dashed, "—", "scored
    from 3 Oct", and the weather.
  - A tile opens its card: Dryness and Score pills, good hours, high and low, rain chance and
    amount, "Hourly ›" (that day on the crag's Hourly tab), and a small **Agreement** chip.
  - **Rain over the trip**: the likely total, its **Range** as a bar, each day's amount, and
    "All 3 days" or "2 of 3 days".
  - **Forecast trend**, behind "By day" / "Whole trip" chips (owner, 2026-10-13), each
    opening with a line saying what it compares, no score in either. *By day*: per trip day,
    the first recorded forecast as a dashed bar and the latest as a solid one (rain, inches,
    left), a hollow and a filled dot for the high (°F, right), and the change under the day.
    *Whole trip*: the trip total per recording as bars with range whiskers, the warmest high
    as a line, x the recording time ("Forecast made on →"), with change chips. Before any
    recording: "Trend starts after the next forecast update."
  - "Edit trip"; "Delete trip", then "Tap again to delete" (no `confirm()`).
- **With several crags**, a crag-by-day grid (`TripCragGrid.tsx`; a scored cell: score,
  Dryness, amount; a dashed one: high, chance, amount), each crag's likely total and range,
  and Delete. A crag opens `/trips/:tripId/crag/:locationId`. The grid scrolls sideways
  inside its card on a long trip.
- **An ended trip is a look back** (`TripLookBack.tsx`): per day, how it turned out beside
  what was forecast, the nearest gauges' rain, a quiet **How was it?**, and **Plan again**.
  Ended trips are kept, never nudged toward deletion (`trips.md`).

**Choices for the owner to see.**

- The one-crag header keeps the **trip's name as the title**; the mock titled it with the
  crag. A trip's name is what its owner typed.
- Trip-level dates ("in 6 days", "Forecast opens", "scored from") use the **device's date**:
  a future trip's outlook carries no `is_today`. A crag a time zone away can be off by a day
  around midnight.
- The high line is `colors.sun`, not the mock's amber: amber is the `fair` rung.
- Tiles wrap three to a row; a week-long trip is three rows, not a sideways strip.
- The crags' warnings show above the days; no alert withholds a tile's score.
