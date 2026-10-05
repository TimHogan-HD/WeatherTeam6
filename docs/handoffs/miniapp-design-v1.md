# WeatherTeam6 Web App — Design Spec
Version: v1
Date: 2026-08-24
Status: **The current design, open to change** — build to it, and propose changes to the owner as options (owner, 2026-10-01: *"I am not hard set on anything design wise"*). The copy and attribution rules it applies are honesty rules, not taste (`design-system-v1.md`). Built 2026-08-26; §1 and §2 rewritten 2026-09-23 when the Telegram platform was removed. This document is both the contract and the description of what exists.
Extends `docs/handoffs/design-system-v1.md`, which it does not replace.

## Purpose

This is the design contract for `apps/miniapp`. If a decision is not written here, it is not settled — come back and settle it rather than improvising in code.

This document is self-contained: it settles theming, navigation, content hierarchy, units, states, copy and non-goals. The §11 table records which of those the build handoff that commissioned it asked for.

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
| `bottomNav` | Yes, directly | The bottom bar's five tabs, their order and the pill's sizes (§2). Rewritten 2026-09-30; it used to declare the deleted RN app's four tabs |

**Consequence:** the Mini App needs a thin adapter module, `apps/miniapp/src/theme/tokens.css.ts`, that re-expresses `type`, `shadow`, and `layout` for the web. It **derives** from the imported tokens; it never restates a literal value. Deriving is not redefining — the architecture rule ("never redefine colors, spacing, or type scale in an app") is satisfied as long as every number traces back to an import.

> **Status: built.** Task 5 shipped it on 2026-08-25, along with `src/theme/fonts.ts`
> (the family-name mapping, derived by inserting the space rather than hard-coding
> `"Barlow Condensed"`) and `src/theme/cssVars.ts`, which renders the tokens as a
> `:root` block served through the `virtual:wt6-tokens.css` module. `components` is
> deliberately *not* pre-converted — the "audit per-entry" note above still stands, and
> exported `boxStyle` / `textStyle` helpers are there to convert the entries a screen
> actually uses. Verified in a real browser: `screenTitle` computes to 30px/700/-0.3px
> in Barlow Condensed and the gradient's custom properties resolve.

**b. §Design System is not entirely client-agnostic.** Its banner says it is. Four of its subsections name React Native explicitly: the `LinearGradient` screen background, `react-native-svg`, `@tabler/icons-react-native`, and the instruction "Do not copy web-specific patterns (no CSS vars, no className)". Binding for the client are the **token source rule, contrast rules, layout constants, and copy rules**. The library choices are RN implementation detail and are re-decided in §8 below. CSS custom properties are not only permitted in the client, they are required — `src/theme/cssVars.ts` renders the whole token set as a `:root` block.

**c. The palette has no light variant.** `bgGradientTop/Mid/Bottom` are `#4a5568 → #1a202c → #0d1117`; `txt1` is `#f0f4f8`; cards are `rgba(255,255,255,0.07)`. Every contrast rule is expressed as a minimum opacity of a near-white on dark. There is no light-mode token set, and the contrast rules would invert nonsensically against one. This decides §1.

---

## 1. Theming

**Decision: the WeatherTeam6 dark palette, fixed, for all content.**

There is no light token set in `packages/design` — `bgGradientTop/Mid/Bottom` are
`#4a5568 → #1a202c → #0d1117`, `txt1` is `#f0f4f8`, cards are `rgba(255,255,255,0.07)`, and
every contrast rule is expressed as a minimum opacity of a near-white on dark. Authoring a
light set would mean roughly forty new colour values in the app, which the architecture rule
forbids, and would invalidate every locked contrast rule in the same stroke.

- **Content surface is always the dark gradient.** The app does not follow the OS colour
  scheme, and `prefers-color-scheme` is not read.
- **The browser chrome is harmonised** through `<meta name="theme-color">`, generated from
  `colors.bgGradientTop` by `src/theme/webManifest.ts`. It is never a literal hex.
- **The conditions colours are semantic, not decorative.** `good` lime, `fair` amber and
  `poor` red carry meaning, and the locked rule "on lime fills, text must be `onGood`
  (`#0d1117`)" only holds against the known palette.
- **Geometry comes from the platform**: `100dvh` for full-height layout and
  `env(safe-area-inset-*)` for padding. **Every inset reference needs its `0px` fallback** —
  CSS drops the entire declaration when a `var()`/`env()` resolves to nothing, so a bare
  `padding-top: env(safe-area-inset-top)` silently loses the padding. `index.html` must also
  keep `viewport-fit=cover`, without which every inset computes to 0 on a notched phone.

> **Rewritten 2026-09-23.** This section specified Telegram theming — `themeParams`, the
> `setHeaderColor`/`setBackgroundColor` version floors, and the `--tg-*` custom properties.
> All of it went with the platform in migration Phase 2. Nothing here is a change of
> intent; the palette decision is the original one.

**Revisit trigger:** if a light token set is ever authored in `packages/design`, reopen
this. Not before.

---

## 2. Navigation

**Decision: client-side routes, an in-app back control, and a bottom bar.**

```
/login               sign in with a passphrase
/                    location list — the Conditions section   (root, behind the gate)
/location/:id        location detail   (plus the guidebook's wall and route screens)
/add                 search and add a location   (see §12; `?lat=&lon=` opens the form on a map point)
/feedback            app feedback and forecast checks
/map                 saved locations as score pins on a relief map; hold to add a spot
/trips              trips: the list, /trips/new, /trips/:tripId and /trips/:tripId/crag/:locationId (§13)
/crags               bottom-bar section, not built yet
/profile             Feedback and Sign out
```

- Client-side routing, no server routes. The Vercel project rewrites all paths to `index.html`.
- **Everything but `/login` is wrapped in `RequireAuth`.** It redirects on the token being
  gone, never on a status it saw; `api.ts` is the one place a 401 clears the token.
- **Back is an in-app control, and where it goes is per-route** — a blanket
  "navigate to `/`" is wrong, and would strand the §12 flow: pressing back from a preview
  would jump to the list and silently discard the search the user had just run.

  | Route | Back target |
  | --- | --- |
  | `/` list | no control — nothing to go back to |
  | `/location/:id` (saved), any tab | no control — the bottom bar's Conditions tab returns to `/` |
  | `/location/:id/wall/…` and `…/route/…` | the Crag tab, then the wall |
  | `/add` | `/` |
  | `/add` save form | back to the search **with the query and results intact** — the form is a step within `/add`, not a sibling of it |
  | `/trips/new`, `/trips/:tripId` | `/trips` |
  | `/trips/:tripId/crag/:locationId` | the trip's grid |

  This table is implemented by `src/lib/backTarget.ts`, which is pure and **overloaded per
  route**, so each caller is handed only the actions it can receive and a new action is a
  type error rather than a control that silently does nothing. `Screen` renders the control
  when given `onBack`; the list passes none.
- **The bottom bar** (owner, 2026-09-30; reordered 2026-10-01) holds five sections, left to
  right: **Conditions · Trips · Map · Crags · Profile** (`bottomNav` in `packages/design`). Conditions is `/`
  and owns `/location/*`; Crags is a placeholder that says it is not built; Map and Trips (§13) are built;
  Profile holds Feedback and Sign out, which left the list, and the reader's settings (scoring
  Phase 5, 2026-10-01): the temperature range friction is judged against and the tab a crag
  opens on (`Settings.tsx`; a `?tab=` link still wins). Unlit tabs are icons, and the lit
  one carries its name in a lime pill that slides from tab to tab (`TabBar.tsx`). Tapping a
  tab goes to its section's first screen, so a lit Conditions is the way out of a location —
  which is why a saved location lost its back link. A section's first screen keeps its scroll
  position however you return to it, and tapping its lit tab there scrolls it to the top
  (`arrivalScrollY` in `lib/bottomNav.ts`). `/add` and `/feedback` are tasks you
  finish and leave: no bar, their own back control. A location keeps its own tab row at the
  top; the bar does not replace it.
- **After a successful save**, replace history rather than pushing: go to `/location/:id` for
  the newly created location, with `/` beneath it. Back from there lands on the list, not on
  the preview of a place already saved. The `POST /locations` response returns the created
  `Location` including its new `id` (`routes/locations.ts` returns `mapLocation(row)` with
  `201`), so no extra fetch is needed.

> **Rewritten 2026-09-23.** This section specified three routes, Telegram's `BackButton` as
> the only back affordance, a ban on any in-app back arrow, and the `startapp` deep link.
> Migration Phase 2 deleted the SDK, so there is no `BackButton` and no `start_param`; the
> in-app control is now the only one, and `chevron-left` is in `Icons.tsx` (§8's ban on it
> is void). **The per-route targets above are the original ones, unchanged** — they were
> right for a reason that had nothing to do with the platform.

---

## 3. Content hierarchy

Governed by the locked rule **"score is a derived signal, never the headline — weather leads on every screen."**

### Location list (`/`)

**Superseded 2026-09-28 by the WT6 Figma file's "V2" page (`v2 Dark - Locations`, node
`129:5`), on the owner's instruction to rebuild the list to it.** Dark only for now. What
changed, deliberately:

- **The score sits on the name row** as a tinted `Score 87` badge, and is visually larger
  than the weather chips. This reverses "never the largest element" for the list card. It
  is still labelled, still never bare, and still absent under a Severe+ alert or while
  alerts load — `cardSummary` (`lib/locationList.ts`) is `summarizeReadings`, unchanged.
- **Today's weather is four figure chips** — low–high, rain amount, humidity, peak wind —
  keyed once by a legend above the cards rather than labelled on each. The legend says
  *Low–high* and *Peak wind*, so the maxima note below is carried there.
- **The two readings are tinted pills that print their value** (`Dryness Dry`). The Figma
  draws the label alone and leaves the reading to the colour; that was not taken, because a
  reading is a label and a value (owner decision 2026-09-21) and a colour cannot be read aloud.
- **The Figma's rain chip reads `0% · 0.0 in`; the percentage was dropped.** The daily row
  carries no chance of rain — only the hourly series does — so there is nothing honest to
  put there. The amount is `precip_mm_p50`, a daily figure.
- **A sort control** — Score (default), Name, Added — reverses "no sort or filter controls
  in v1". Score order uses the same suppressed number the card prints, puts unscored
  locations last in added order, and waits until every card has settled.
- **The alert pill leads the card**, because the score it must sit above is now on the
  first row.

Everything else below still holds: non-climbing locations never ask for or show a score,
the Add affordance stays in the header, and a failed alerts load is stated.

The v1 list card, for reference — top to bottom inside a card:

1. **Location name** — `type.cardTitle` equivalent, `txt1`
2. **Weather line** — today's high, max wind, and humidity as plain values with units. This is the largest non-name element on the card. **Label them as maxima, not as current readings** — see the note at the end of this section.
3. **Alert pill** — only if an active alert exists. `poor` tint, event name only ("Extreme Heat Warning"). Tapping the card, not the pill, opens detail.
4. **Score chip** — bottom-right, small, labeled. Format: `Score 80 · high`. Never bare. Never the largest element. Subject to the suppression rule in §7.

Empty state, error state, and loading per §5. No sort or filter controls in v1. **An add affordance does belong here** — a single action in the list header routing to `/add` (§12). An earlier draft of this line read "no search, no add-location", which §12 reversed; the list is the only place a user with saved locations can reach the add flow from, so without it §12 is unreachable except from the empty state.

### Location detail (`/location/:id`)

**Overview tab — superseded 2026-09-28 by the WT6 Figma file's "V2" page (`v2 Dark -
Overview`, node `129:256`).** The screen is a header band (back, rock type · elevation,
name, coordinates · forecast age) over six tabs — **Overview, Daily, Hourly, Precip,
Rock, Crag** — and opens on Overview: the Conditions now hero, **Today** (09-21 every three
hours, temperature and the friction word), **Next 3 days** (each day's Crag A score as a
tinted pill), and **Rain** (last rain, next likely rain). Rock holds the drying card and
the identity block until its own V2 frame is built; Crag is the guidebook (below). A city
gets Overview, Daily, Hourly and Precip. Daily and Hourly are built to their own frames
(below). Deliberate
departures from the frame:

- **The hero's score is never the hour's alone** (owner, 2026-10-05, after Sandstone on
  10-03 read 100 at 9am on a day rain arrived at 1pm and scored 48). The third gauge is
  **Today**, the day's score; under it, the next nine hours as three three-hour blocks
  (`lib/conditionsBlocks.ts`), each its worst hour's score, the one holding now outlined,
  a block with any hour unread dashed. The band names rain likely inside the blocks in
  the rain colour (`Rain likely from 1pm · 85%`), and otherwise the day's good hours. The
  card wears the now block's rung. Under a Severe+ alert no score of any span renders.
- **The day pills are the Crag A day score** (`readings.days[].best`), joined on date and
  suppressed through `summarizeReadings` — never the forecast row's `score`, which is the
  five-component scorer that renders nowhere.
- **The pills' colours are `SCORE_BANDS`**, the rungs the list badge and daily bars use.
  The Figma draws 82 amber and 73 red, which those rungs do not; one number must not wear
  two colours on two screens.
- **The hero wears the score's rung** (the Figma's green is the `good` rung) and is the
  plain card whenever no score is on screen — under a Severe+ alert, while alerts load,
  and for a city.
- **"Next likely rain" is the first coming hour where at least half the ensemble members
  are wet**, and prints that day's peak hourly share. With none, it says *None through
  <last day reached>*; with no chance data, the row is omitted.
- **The high and low read `High 66°`**, as drawn, beside the `°F` of the large figure.

**Daily tab — superseded 2026-09-28 by the same page's `v2 Dark - Daily` frame (node
`129:363`).** One card, **Next N days** (N is the rows actually shown), holding a row per
day: the date and the day's Crag A score as a pill, over three chips — the low and high,
the rain chance and amount, the peak wind. Rows are tinted by the score's rung and open
that day's hours when the charts can draw it. **The metric toggle and the shared-scale
range bars are gone**, and so is the seven-day hourly strip that sat under them (owner,
2026-09-28: not needed now). The ensemble's spread is drawn only on the Hourly tab's
day charts. Deliberate departures from the frame:

- **The pill is the Overview's**: the Crag A day score through `summarizeReadings`, so it
  is dropped under a Severe+ alert and while alerts load, and wears `SCORE_BANDS` rather
  than the frame's amber/red.
- **The rain chance is the likeliest hour's share of wet members**, labelled as such in the
  key under the rows; with no wet count it is left off rather than printed as `0%`. The
  amount is `precip_mm_p50` through `formatPrecipIn`, so a dry day reads `0 in`.
- **The frame's `1 scale · 7 days` caption is dropped** — nothing on the card is drawn to a
  scale now. A key under the rows says what each chip is.
- **Chips have 6px sides, not 8**, so a 375px phone fits all three on one line; at 360px
  they wrap to a second line.

**Hourly tab — superseded 2026-09-28 by the same page's `v2 Dark - Hourly` frame (node
`129:529`).** A chip per day in the window (`Today`, then weekdays) replaces the ‹ › pager;
a day the ensemble never reached keeps its chip, disabled, so counting from Today lands on
the right one. Under it, the open day's card — date, how far out (`in 3 days`), the
**Dryness / Friction / Score tiles**, the good hours band, a caption, and **friction by
hour** as a strip of coloured cells — then one card of charts: **Temperature** (air, dew
point, the 8-in-10 band, the good hours shaded), **Rain**, **Chance of rain**, **Wind**
and **Humidity**. Dew point and humidity are new on screen (the owner's product list, item
1). Deliberate departures from the frame:

- **The caption says `Readings at 10:00`, not `Best hour 23:00`.** The readings are the
  server's representative hour — the worst hour of the best three-hour run between 08:00
  and 18:00 — which is not the best hour. It is followed by the required caveats.
- **The friction strip has a key naming its four levels**, and reads aloud as runs of
  words (`00–02 Fair, 03–23 Great`). The frame has none; a colour cannot be read aloud.
  An hour the model did not read is an empty well, not a level.
- **The good hours band wears the day score's rung**, as the hero's does, and is the plain
  well when no score is on screen. The frame's lime would put a verdict on a poor day.
- **Air is `sun`, not the frame's amber, and gusts are a dashed line in the primary ink,
  not red** — `fair` and `poor` are the conditions ladder and not available for data
  marks. The frame's green and red threshold rules on the charts are not drawn: nothing
  names them and nobody has measured where they belong.
- **Dew point and humidity are the deterministic model's columns**, not the ensemble's,
  and a caption under the charts names that model from the response.
- **Rain's scale runs to at least 0.02 in**, so a trace day draws as a flat line under
  readable ticks rather than a trace stretched to full height.
- **The hour axis labels 00, 06, 12, 18**; the frame's closing `23` is not drawn. The
  friction strip, which has room, does label it.

**Precip tab — redesigned 2026-09-29 from the owner's pick of the round-2 Figma mocks**
(V2 page, "Precip tab — round 2", nodes `167:782` headline and `167:386` grid), between
Hourly and Rock, on every saved location. It replaces the first build from the
`Precipitation history` frame (`129:884`), whose tiles, event list and daily bars the owner
found hard to look at — pale blue on blue, and the answer left for the reader to assemble.
Two cards and a caveat:

- **Headline: how long since the last real rain.** "Real rain" is an hour at or above
  `REWETTING_PRECIP_MM` (0.5 mm, 0.02 in) — the line at which the drying clock restarts —
  so this and Dryness never disagree about when it last rained. The figure is `heroTemp`
  with "hours ago" (days and hours past 48), then the stamp and the storm it ended
  ("Sun 7pm · 0.62 in over 20 h"), then a 0–72 h track. Lighter showers since are
  named under it ("Light showers since: trace, last today 6am") and do not reset it: the first build read a noon trace as "last precip
  4h" on rock the clock had been drying for a day. The kind is named from the storm's
  hours (rain, snow, rain and snow) and is "precipitation" when any hour's kind is unknown.
  With no hour over the line the headline reads **None** ("in the past 7 days", plus
  "light showers only" when any fell), never a count. Real rain in the window's newest hour
  reads **Raining now** with the storm's total "so far" and no track — the first version
  said "ended 0 hours ago". Labels say "Last rain", not "Last real rain"; the threshold is
  defined once, in the footer.
- **Today, this week, and wet hours this week** under the headline (owner, 2026-09-29).
  Today is the location's own date; a window that has not reached it shows a dash.
- **Running total** (round-2 concept 1, added at the owner's request so the tab reads as
  a page, not a drop-down): the window's cumulative precipitation, one day per column
  lined up with the grid below. The largest three storms that reached the real-rain line
  carry their total where they ended; the run since the last real rain is shaded and
  labelled "no rain · N h" under the line, so it cannot collide with a storm label.
  A skipped hour is bridged with a dashed line, never a solid flat one. Touch or hover
  reads out the hour and the total so far.
- **Rock under the rain** (owner, 2026-09-29: a total that only climbs read as rock that
  only got wetter). The running total is now a quiet **dotted** line with no fill, and a
  solid **Rock** strip under it shows the drying model's state per hour on the same axis,
  in the tones every surface gives the three words (dry `good`, drying `fair`, wet
  `poor`); an hour with no reading is the bare track. Two strips, not two lines on one
  plot — inches and a three-word state share no scale. The hour table's readout carries a
  **Dryness** field (`DRYNESS_LABEL`, `ROCK_LABELS`), and the caveat adds
  `UNRECORDED_ASPECT_NOTE` once when any hour shown is unqualified. A city, or an API
  without `rock_history`, shows no rock at all.
- **Every hour:** a row per local day, **today on top** (owner, 2026-09-29), 24 cells from
  00 to 23, each day's total at the
  end. Cells are 26 px tall so an hour can be hit (owner, 2026-09-29: "every hour needs to
  be a bit big"); a days-across version was built and read as strange, so the rows stay.
  Every cell is a button: tapping one, dragging a finger along a day (the Hourly charts'
  scrub), hovering, or arrowing to it — the grid is one tab stop — fills the readout
  above with that hour's labelled values: its span (stamp `00:00` names both days),
  Precip, Type, Snow, Real rain yes/no, and the week so far. The readout opens on the most
  recent wet hour. A cell's fill is its amount on `precipStep1`–`5`, one blue in five lightness steps
  (the dataviz reference ramp, validated on `card`), the second step starting at the
  real-rain line; a dry hour is `grid`. Snow and rain-and-snow add a 2 px ring in
  `precipSnow`/`precipMix` rather than repainting the step, and an unknown kind adds
  none. The first version stepped one colour by opacity and the owner could not tell more
  rain from less. An hour still to come and an hour the response skipped are outlines,
  never dry cells, and a skipped day totals a dash.
- **Colour marks precipitation only.** Text, figures and chrome are the neutral ramp.
- **No gauge, radar, uncertainty or storm track** (the original frame's "Gauge conf.",
  "±" and "W→E"): the figures are the four global models' median estimate. The caveat names
  them, says "Model estimates, not gauge readings", defines real rain, and at a crag ties
  it to Dryness and adds the route-by-route sentence.

**Rock tab — added 2026-09-29 at the owner's request, no Figma frame.** A field guide to
the location's rock type (`RockTab.tsx`, words in `packages/types/src/rockGuide.ts`): a
textured header in the rock's colours (`rockSwatchV2`, decoration only), two three-step
gauges (*Drying after rain*, *Strength when wet*), *How it formed and climbs* (how the
rock formed, where its holds come from, and the style chips), rain and sun, and do/don't
care. The identity block comes last. **Owner, 2026-09-30:** the fun-fact card and the
*Precipitation & drying* card were removed; the formation copy replaced the fact, and each
sentence is sourced in `rock-drying-research.md` beside §7. It describes the **rock type, not this crag**, and says so. The drying
gauge is a band of `MAX_HOURS`, held to it by `dryingModel.test.ts`, and `unknown` has no
guide. Care advice is general rock knowledge the owner asked for, not a go/no-go on the
forecast, so the no-opinions rule is not in play.

**Crag tab, wall and route screens — added 2026-09-29 from the WT6 Figma restyle page's
"03 · Guidebook Flow" and "04 · Route Detail" sections (`v2 Dark — Crag` 63:2, `— Wall`
63:224, `— Route` 64:2).** The Crag tab is the OpenBeta crag the location sits on: the
area and its counts, the crag's readings now (`NowStrip`, the list card's path), routes by
grade, and the walls listed A–Z. A wall opens `/location/:id/wall/:wallId` (the crag's
readings now, *Climb it this week*, grades, kind filter, the routes); a route opens
`…/route/:routeId` (grade, Mountain Project and OpenBeta links, the recorded facts, beta,
and its neighbours). Data is `GET /guidebook/:locationId` (`api-sources.md` § OpenBeta
Routes). The identity block moved to the Rock tab. Deliberate departures from the frames:

- **Grades use the frames' own colours** — blue, teal, lime, amber, red, violet for
  boulders — by **owner decision 2026-09-29**, overriding the rule that keeps the status
  hues for the ladder. The exception is for grade marks only, each beside its printed
  grade or count (`gradeScale`/`gradeBoulder` in `packages/design`). A violet single-hue
  ramp shipped first and was replaced.
- **No wall map, and walls are A–Z, not west to east** (owner, 2026-09-29). OpenBeta's
  wall coordinates put Barn Bluff's walls where they are not, and an order read off the
  same points repeats the error as a list. No "Wall n of m" either. A map needs wall
  positions someone has checked on the ground.
- ***Climb it this week* is on the wall screen, not the route** (owner, 2026-09-29): it is
  the crag's reading, and a wall is the smallest thing it could honestly describe.
- **"Left → right" and "On the wall" appear only on a wall OpenBeta orders** (every route
  its own position). Elsewhere the list is by grade and there are no neighbours.
- **Readings are labelled pills** (`Dryness: Wet`), not the frames' bare words, and the
  score drops under the alerts gate like everywhere else.
- **The route hero is a plain card**, not the frame's green one — green is the `good`
  rung, and a grade is not a condition.
- **Mountain Project is linked only with OpenBeta's own MP id**, never a name search. On
  Android the link is an `intent:` URL naming MP's app, with the web page as fallback
  (`mountainProjectHref`): a plain link opened in Brave's in-app tab and never reached the
  installed app. iOS keeps the web link — MP publishes no iOS app links.
  Length and bolts read "Not recorded" because OpenBeta records neither for any Minnesota
  route; the beta empty state says an OpenBeta edit reaches the app at the next snapshot,
  not immediately.
- **A location with no crag within 2 km says so** in a card; outside Minnesota that is
  every location today.

~~One scroll, no internal tabs~~ — **superseded 2026-09-14 and shipped.** The screen now
carries **Daily and Hourly tabs**, and the daily rows carry per-day scores, both reversed
on the owner's 2026-09-04 decision. The authority is
`docs/handoffs/miniapp-hourly-dataviz-handoff-v1.md` (§ Decisions taken, § Phase 3); this
section is rewritten wholesale in its Phase 5, not here.

What the list below still governs, unchanged: **the order, and what sits outside the
tabs.** The alert banner is above everything always, the today hero follows it, and the
score and sources footer stay below the tabs where switching cannot hide them. A location
identity block (rock, aspect, wall angle, elevation, coordinates, rainfall station) is new
and sits between the banner and the hero. Item 3 below now reads "the Daily tab", and its
"no per-day score chip" constraint is the part Decision 2 reversed.

1. **Alert banner** — full-width, top, if any active alert. Event, severity, and the NWS headline. Above everything, always.
2. **Today** — the hero. Today's high, max wind, humidity, and hours since rain, as labeled values. **Hours since rain is capped in display — see the rule below.**
3. **7-day forecast** — now **the Daily tab**: one row per day, each tappable into that day's hours. ~~With a metric toggle and a range bar on a scale shared by all seven rows~~ — **replaced 2026-09-28** by the V2 Daily card above: tinted rows with a score pill and three figure chips. ~~**Weather only — no per-day score chip.**~~ **Reversed 2026-09-14** by Decision 2 of the dataviz handoff: `/forecast/:id` now returns per-day scores and the Daily rows render them. The constraint below explains why it *used* to say that; the reason it gave — that no endpoint returned them — is no longer true.
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

> **SUPERSEDED 2026-09-14.** Per-day scores **do** exist over the API now: `GET /forecast/:id`
> carries `score`, `confidence`, `unavailable_reason` and five `component_*` fields per day
> (PR #107). The owner reversed this on 2026-09-04 and asked for a score toggle on the Daily
> tab. The paragraph below is kept because its *reasoning* is still the record of why it was
> ruled out, and because the sentence it ends on — "if per-day scores are ever wanted, that
> is an API change and its own task" — is exactly what happened. Do not act on its
> conclusion. See `docs/handoffs/miniapp-hourly-dataviz-handoff-v1.md` § Decisions taken 2.

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

React Query configuration: `staleTime` 5 minutes, `gcTime` 30 minutes, `retry: 1`, no `refetchOnWindowFocus` — live scoring costs several seconds and six upstream fetches per detail screen.

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

> **SUPERSEDED IN PART — 2026-09-21, scoring model v2 Phase 3b.** The **rules** in this
> section are still in force: no climbing opinions, weather leads, the score is never the
> headline, alerts outrank everything, a named source is computed rather than written down,
> and a city never gets a rock reading. What changed is the **mechanism** underneath them.
>
> - **The ladder is gone.** `stateLabel` mapped the five-component number to a phrase, so
>   the words could only ever be as right as the number — which is how 103 °F came to read
>   *"Dry, settled"* even after this section shipped. What is on screen is now the v2
>   model's two readings themselves, as labelled gauges — `Dryness: Dry`,
>   `Friction: Poor`, `Score: 58` — and `summarizeConditions` and `limitingComponent`
>   are deleted with it. **They are not written as sentences**: the first version was, and
>   the owner's verdict on 2026-09-21 was that prose readings read as fact.
> - **Suppression reversed direction.** Under a Severe+ alert this section dropped the
>   *word* and kept the number. It now drops the **number** and keeps the readings: the
>   words come from physics that sees heat, and the number is the part that reads as
>   actionable.
> - **Two sentences are now required copy**, neither of which this section anticipated: the
>   friction reading is an estimate, and a crag with no recorded aspect has its sunlit hours
>   estimated.
>
> `packages/types/src/readingsCopy.ts` is the implementation and
> `docs/handoffs/weatherteam6-scoring-model-handoff-v1.md` § Phase 3 is the spec. Read them
> before treating anything below as a description of what ships.

### What is live today

The bot mapped score to an opinion (`lib/telegram/conditionsReply.ts`, deleted 2026-09-23):

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
| `@tabler/icons-react-native` | `@tabler/icons-react`, same names. Five are needed: `map-pin`, `droplet`, `temperature`, `wind`, `chevron-left`. `chevron-left` **is** needed as of 2026-09-22 — the in-app back control is the only one (§2). This row originally banned it. The alert banner uses a colored bar and the event name, not an icon: `alert-triangle` is outside the mockup's 1:1 `ICONS` map, and §Design System requires matching it exactly |
| "no CSS vars" | CSS custom properties, emitted once at `:root` from the imported tokens |
| Barlow via `expo-font` | Barlow and Barlow Condensed from Google Fonts, with a real fallback stack |

Contrast rules, layout constants (`screenH` 20, `topSafe` 48, `cardPad` 14, `bottomInset` 24), copy rules, and the token-source rule carry over **verbatim and binding** — except `topSafe`, which the web app replaces with `topWeb` 16 over the safe-area inset (owner, 2026-09-29).

---

## 9. Non-goals (explicit)

Not in the Mini App, in v1 or later without a new spec:

- Radar, walls, shade map — designed for the deleted React Native app and out of scope here. ~~Trips~~ — **built 2026-10-02**, from a new design; see §13
- ~~Location search or creation~~ — **no longer a non-goal.** Reversed 2026-08-25 on the product call recorded in §12: search, preview, save, and delete are in scope. Editing a saved location's rock type, aspect and wall angle followed on 2026-10-01 — see §12.4
- History and normals views — no writer exists (issue #25)
- Any AI-generated commentary or per-hour analysis — removed once already for violating the copy rules; do not reintroduce
- Light theme (§1)
- ~~Bottom navigation~~ — **no longer a non-goal.** Reversed 2026-09-30 on the owner's call; see §2. The reasoning about `/add` still holds: it is not a tab, and the bar hides on it
- Offline write / mutation queue
- Push notifications. **The product has no notification channel at all** since the bot was deleted — alerts are collected and reach nobody. Reinstating one is a product decision, not a UI task

---

## 10. Open questions this spec does not close

1. **How does a user add a location?** The seeded three are the only ones that exist, and the bot's fallback copy points at a dead app. The API is further along than "no way in" suggests, but neither path is usable as-is:

   | Path | State |
   | --- | --- |
   | `GET /locations/search?q=` → `POST /locations {cragId}` | Endpoints exist and pair correctly. **But the `crags` table is empty** — `?q=rock` returns `[]` against production, so the picker would render nothing. Needs a crag import before it is a real flow. |
   | `POST /locations {name, lat, lon}` | Works today, but requires the user to type coordinates (geocoding was out of scope until this section reversed it) and forces `is_climbing_location: false`, which is wrong for a crag. |

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
| Theming | 1 | WeatherTeam6 dark, fixed; no light variant; rewritten 2026-09-23 |
| Navigation | 2 | Four routes, in-app back control, per-route back targets; rewritten 2026-09-23 |
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

1. **Search** — route `/add`. A text field and a result list. Results come from a geocoding lookup (§12.2), not from the `crags` table. Below the field, a secondary affordance: **"Enter coordinates instead"**, which swaps the input for a lat/lon pair plus a name field. This exists because a crag frequently has no searchable place name, and because the user asked for it explicitly. Above the field, **"Use my current location"** (added 2026-09-30) reads the phone's GPS through the browser Geolocation API — the prompt follows the tap, never the screen opening — and the fix is named through `GET /geocode/reverse`: after the known crag it falls inside, else the town OpenStreetMap puts it in, else "Current location". The same call supplies the terrain elevation (a phone's altitude is ellipsoidal and often absent, so it is never used). The subtitle carries the fix's accuracy, the state and an OpenStreetMap credit. A refused or failed fix says why, with Try again and Cancel.
   **Browse climbing areas** (added 2026-10-02, owner's pick of variant A) sits below the field while it is empty: the states that have an OpenBeta snapshot, each opening into its areas, most climbs first (`GET /climbing-areas/:state[/:areaId]`), as deep as OpenBeta goes. An area that holds others opens; one that holds none is picked at once. An opened area carries **Add <name>** and crumbs back up; Back steps up one level, and the save form closes onto the level it came from. Levels are state inside `/add`, like the save form. The variant's **List/Map toggle and a search scoped to the state are not built yet** — the map waits on a map library and a tile source.
2. ~~**Preview**~~ — **removed 2026-09-30 (owner decision).** Picking a place used to open the detail screen in an unsaved mode; it could show no readings, so it read as broken. Picking a place now opens the save form directly (step 3), and Save opens the saved location's own screen. `GET /preview` is deleted.
3. **Save** — the save bar carries:
   - the resolved place name, editable, pre-filled from the geocoder;
   - a **"Climbing area"** toggle, default **off**;
   - when the toggle is on, an optional **rock type** picker — sandstone / limestone / granite / basalt / not sure — defaulting to *not sure*;
   - a **Save** button.

**Why rock type is offered at save time and not later.** It is the single largest lever on the score: `dryingModel`'s `MAX_HOURS` runs from 4 h for slate to 120 h for soft sandstone (the §7 taxonomy, 2026-09-23), and the drying component is worth 40 of 100 points. Left unset it resolves to `unknown` → 120 h, the most conservative row, which will be wrong by a wide margin for most real crags. **On a known crag the picker is replaced by the research's rock type, locked** (`knownCrags.ts`). The picker is a grouped `<select>` rather than chips: twenty-seven values do not fit as chips. The editor (§12.4) can change it later, but save is where most crags get it. One optional picker behind a toggle is cheap; a silently wrong drying score is not.

### 12.2 Geocoding — reversing a documented non-goal

Geocoding was ruled out of scope in the original build plan (*"climbing search via `crags` table only"*). **That decision is reversed by this section.** The plan document was deleted on 2026-09-23; this spec is now the only statement on it.

Use **Open-Meteo's geocoding API** (`geocoding-api.open-meteo.com/v1/search`). Reasons it is the right pick and not merely an available one:

- No API key, so no new secret, no new entry in `.env.example`, nothing to leak.
- Same vendor as the forecast, already trusted and already wrapped in this codebase's retry helper.
- It returns **`elevation`** alongside lat/lon, which `applyLapseRate` in `openMeteo.ts` needs and which a bare coordinate entry cannot supply.
- The original v8 build prompt already named this exact API as the intended path — this is executing a deferred plan, not inventing one.

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

- ~~**Editing a saved location.**~~ *Shipped 2026-10-01 (scoring Phase 4b).* `/location/:id/edit`, opened by "Edit crag" on a climbing location's screen, edits an unlocked rock type, the way the wall faces (a 16-point compass rose) and the wall angle in climbers' degrees (presets, then a slider). It is a task you finish and leave: no bottom bar, back to the location, Save to its Rock tab. Only what changed is sent (`lib/editLocation.ts`). **Aspect and angle are saved but score nothing** — Crag A reads every crag from all sides — and the screen says so beside each. Aspect and angle are still not asked for at save: they need a compass and an estimate, which is too much friction for an add flow.
- **Merging `crags` results into search** (§12.2). *Partly done 2026-09-23 without the table: OpenBeta's Minnesota areas are a generated module (`lib/weather/climbingAreasMn.ts`) and lead `/geocode` results, owner-scoped to Minnesota for now. Another state is another generated file.*
- **Reordering or grouping the saved list.** §9 still holds.

### 12.5 Sequencing — this changes the task order

The API work in §12.3 is a **prerequisite** for the UI, not a companion to it. It is also entirely independent of the `initData` auth work that Task 6 is blocked on, so it can proceed in parallel rather than waiting.

Recommended: take §12.3 as its own backend task — **Task 5a** — landing before or alongside Task 5's shell work. Task 6 then builds `/add`, the detail screen's unsaved mode, the save bar, and the delete affordance against endpoints that already exist. Building the UI first would mean mocking the whole surface, and `.claude/rules/architecture.md` forbids leaving mock data in a finished feature.

---

## 13. Trips (`/trips`, built 2026-10-02)

Owner-approved design (2026-10-02, "build, we can tweak later"), from the round-3 mock: one
crag days first, several crags as a grid. Open to change like every other screen.

**Screens.**

- **`/trips`** lists every trip, soonest first: name, dates, how far off ("in 6 days",
  "underway"), crag count, and "Forecast opens 27 Oct" while the first day is past the
  16-day horizon. "New trip" in the header.
- **`/trips/new`** is a task you finish and leave (no bottom bar, back to `/trips`): a name,
  first and last day (native date inputs), and one or more saved climbing locations.
  Problems are one line under the form; Create replaces history with the new trip.
- **`/trips/:tripId`** with one crag opens straight on that crag's view. The header's
  eyebrow is the crag, the title the trip, the meta its dates, timing and rock.
  - A tile per trip day, three to a row. A scored tile is the score in its rung's colour,
    `Dryness · Friction`, then high, chance and amount. A day not scored yet is dashed, "—",
    "scored from 3 Oct" (its date six days ahead), and the weather.
  - Tapping a tile opens its card: Dryness, Friction and Score pills, good hours, high and
    low, rain chance and amount, "Hourly ›" (that day on the crag's Hourly tab, `?date=`),
    and a small **Agreement** chip.
  - **Rain over the trip**: the likely total, its range as a bar, each day's amount, and
    "All 3 days" or "2 of 3 days" from `days_covered`.
  - **Forecast trend**: the trip total per recording as bars with range whiskers on a left
    axis in inches, the warmest high as a line on a right axis in °F, each axis in its
    series' colour, x the recording time; chips "Rain: down 0.16 in", "High: up 5°". No score.
    Before the first recording: "Trend starts after the next forecast update."
  - "Edit trip" beside it, as "Edit crag" sits on a crag (owner asked, 2026-10-02):
    `/trips/:tripId/edit`, the new-trip form filled in, no bottom bar, back to the trip. A
    moved date shows "Changing the dates restarts the forecast trend." before Save; Save
    sends only what changed.
  - "Delete trip", then "Tap again to delete" (no `confirm()`), back to `/trips`.
- **With several crags**, `/trips/:tripId` is a crag-by-day grid (a scored cell: score,
  dryness word, amount; a dashed one: high, chance, amount), each crag's likely total and
  range, and Delete. Tapping a crag opens `/trips/:tripId/crag/:locationId`, the one-crag
  view, back to the grid. The grid scrolls sideways inside its card on a long trip.

**Data rules.**

- A tile's score and words are the crag's `/hourly` readings through `summarizeReadings`,
  joined on `local_date`, with `alertsPending` and Severe+ suppression. Its high, low,
  chance and amount are the trip outlook's for every day, so a tile never mixes sources for
  one figure. A city on a trip gets weather only; its readings are never asked for.
- `days: null` from `GET /trips/:tripId/forecast` reads "Couldn't load the forecast for this
  crag"; `[]` reads "Forecast opens <date>".
- Agreement is `agreementShare` (`packages/types`), withheld when `members_wet` is null or
  no member reached the day. Its meaning is said once, at the foot of the crag view
  (`AGREEMENT_MEANING`), beside the models named from the response.
- A trend point over part of the trip (`days_covered < trip_days`) is a **hollow bar**, with
  a legend key; a change chip compares only points that covered the same days.

**Deliberate choices for the owner to see.**

- The range is labelled **Range**, not the mock's "8 in 10 runs": the copy rule of
  2026-10-02 ("Range", not "8 in 10 runs") was written after the mock.
- The one-crag header keeps the **trip's name as the title** and the crag as the eyebrow;
  the mock titled it with the crag. A trip's name is what its owner typed.
- Trip-level dates ("in 6 days", "Forecast opens", "scored from") use the **device's date**:
  a future trip's outlook carries no `is_today` row. A crag a time zone away can be off by a
  day around midnight.
- The high line is `colors.sun`, not the mock's amber: amber is the `fair` rung and not
  available for a data mark.
- Tiles wrap three to a row; a week-long trip is three rows, not a sideways strip.
