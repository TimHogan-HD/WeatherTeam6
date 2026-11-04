---
paths:
  - "apps/miniapp/src/**"
  - "packages/types/src/**"
  - "apps/api/src/lib/runs/**"
  - "apps/api/src/routes/{hourly,conditions,forecast}.ts"
---

# Readings on screen

What a reading may say, where it comes from, and what the client may assume of the API.

## Readings on screen

- **`GET /hourly/:locationId` and `GET /conditions/:locationId` carry the same readings,
  sliced by one rule** — `toConditionsReadings` (`lib/runs/conditionsReadings.ts`, shared with
  `check:conditions`) and `readingNow` (`packages/types`, shared with the client) — so one
  crag never shows two numbers on two screens. `ConditionsReadings` carries its own
  `utc_offset_seconds` (#33), and `checked_at` (the series' own, null in both sentinels),
  which the list's pull-to-refresh prints as the **oldest** across cards.
- **`readings.model` is always `THERMAL_MODEL`; `HourlySeries.model` is chosen by coverage.**
  When they differ a surface must not attribute one to the other. If the thermal model did
  not answer, there are no readings and `unavailable_reason` is `model_unavailable` — never
  another model's numbers.
- **`readings.rock_history`** is the rock's state for stored hours before the window, rock
  only. A history hour is published only once it no longer rests on the walk's "it just
  rained" start: wet or drying before real rain resets the clock goes out `null`; `dry`
  stands. `rockByStamp` (`apps/miniapp/src/lib/precipHistory.ts`) joins it by local stamp; an
  absent field draws no rock.
- **Readings reach a response only because the route passed `scoring`.** There is no
  `is_climbing_location` check downstream; the model would score a city if asked. With
  `scoring: null`, `GET /conditions/:id` skips the hourly fetch.
- **Words come from the readings, never from the number.** `summarizeReadings`
  (`packages/types/src/readingsCopy.ts`) is the one implementation; `stateLabel` and
  `summarizeConditions` are deleted.
- **A reading is a label and a value, never a sentence** (owner decision 2026-09-21):
  `Dryness: Dry`, then `Score: 100`, from `ReadingField`. Labels
  live in `readingsCopy.ts`; `fieldLine` punctuates one for text. Caveats are fragments on one
  line. Which inputs a reading came from belongs on the Overview's Right now source line.
- **The Overview's layout is `OverviewTab.tsx`'s** (Hero, Today, Next days, Right now; owner,
  2026-10-29). What it must not do: **Score breakdown never states a penalty's size.** Each
  cause row (`lib/scoreBreakdown.ts`) gives today's figure, the rule from
  `SCORE_MODEL_FACTS` or the reader's range, and `Eases ≈`; a gap in the readings, or their
  end, omits the line; the disclosure is absent with the score and when `held_back_by` is
  empty. A dew point or air figure prints only when `HourlySeries.model` is the readings'
  model. Condensation names no figure and says the rock temperature is modelled (#436).
- **The reader orders a tab's cards, on this device** (owner, 2026-11-03; `CardStack.tsx`,
  `lib/cardOrder.ts`, `wt6.cardOrder`). Overview, Hourly, Precip and Rock each keep one order
  for every crag. It is a mode with up and down arrows, never a drag on a card, because a drag
  on a chart reads an hour. The Overview's hero, the Rock tab's hero and its facts card stay
  put. A saved order only arranges: no card is hidden, and what a card says never depends on
  its place, so a note that speaks for several cards sits under the stack, not in one of them.
- **Next days' rain-split dots** (the count is `scoring.md`'s; mockup
  `docs/handoffs/design-mockups/rain-split.html`) show only through `rainSplitShown`: a day
  at `RAIN_SPLIT_MIN_SCORE` or more with at least two models wet. Never a sentence about
  the rock.
- **Sun is minutes of bright sunshine, from `THERMAL_MODEL`** (#469–#472;
  `lib/runs/skySeries.ts`, `packages/types/src/sky.ts`; layout in `sunDayLine` and Hourly's
  Sun card). "Forecasts differ" compares GFS, ECMWF and ICON (`SUN_DIFFER_MIN`,
  `compare:sky`), never GEM. **A gap is `Sun —` or a dashed mark, never "No sun" or an
  empty bar.** Flat ground only, said on the card. The Sources footer names the model only
  once an hour of sunshine was answered.
- **How the score works is on Profile only** (owner, 2026-10-29): `ScoreExplainer`, reached
  from the breakdown's `How the score works ›`. Every number it quotes comes from
  `SCORE_MODEL_FACTS`, pinned to the model by `cragModel.test.ts`. A temperature interval
  goes through `cToFDelta`, never `formatTempF`.
- **The Condensation card** (`RockReadings.tsx`, `lib/rockReadings.ts`): its headline's
  "until" names an hour read clear, never an unread or missing one, which ends the spell as
  a gap. A margin under 0 prints as `below`, here and in the Rock tab's slim header, never
  as a negative "above".
- **The Rock tab carries the friction note** (owner, 2026-10-29): `FRICTION_MECHANISM`,
  once, on the Condensation card (`RockReadings.tsx`) when any hour has a friction reading.
  **No modelled rock temperature prints** (owner, 2026-10-19), so `ROCK_TEMPERATURE_MECHANISM`
  stays required only wherever one does print. The drying clock (`DryingClock.tsx`) draws
  the hours since real rain against `MIN_HOURS`/`MAX_HOURS` and says so. It is display only,
  never the score's own drying.
- **`HourlyReading.rock_sun_shade` is the warmest and coolest of Crag A's eight compass
  walls' `T_surface`** (owner field report, Barn Bluff 2026-10-04: a south face too hot,
  a shaded one good, under one score). Display only — the score still reads air
  temperature. Null if any wall's is missing. **It renders nowhere** (owner, 2026-10-05):
  sun and shade belong only on crags the owner has confirmed on the ground — today only
  Red Wing. When a surface brings it back, gate it
  on a flag on the `KNOWN_CRAGS` entry, not on the data being present. It names no
  direction: Crag A does not know which way a crag's walls face (#293).
- **Sun and shade walls reach the Overview and the Crag tab** (owner, 2026-11-02, #445,
  overriding 2026-10-05's "never on the Overview") as Wall A per lidar wall, only through
  `HourlyReadings.walls`, never `rock_sun_shade`. Layout is `WallSunShade.tsx` and
  `lib/wallLine.ts` (the line under the hero, its sheet, the pin) and
  `guidebook/WallGrid.tsx` and `lib/wallGrid.ts` (walls × hours). A withheld group prints a
  gap, never another group's number; a wall missing an hour is a blank cell, never a
  neighbour's figure. The crag's score stays Crag A's everywhere.
- **Sun on the wall** (#415, Rock tab, `SunOnWallCard.tsx`) is the first such surface, gated
  on `KnownCrag.sun_confirmed` through `sunWallsFor` (`packages/types/src/sun.ts`). Each
  face is found in USGS 1 m lidar and named for the nearest OpenBeta wall (owner,
  2026-10-27: every detected face); its skyline is computed by `npm run sun:walls` into
  `sunWallsData.ts`, never at request time. Terrain only, said on the card; it never feeds
  the score.
- **A score over a span is its worst hour, never a mean or a best.** A day's is
  `dayRepresentative`; any block of hours is the
  same rule, and a block with any hour unread has no score — the worst of the
  rest could be better than the missing one. **An hour's score may headline only beside
  the hour it is** (owner, 2026-10-19, superseding 2026-10-05's "never"): the Overview hero
  prints the hour covering now as its one score, named `Score at <hour>`, with the Today
  chart below it, one hourly chart starting at now (owner, 2026-10-20: the score bars
  repeated it and were removed). **The day's score is only in Next days' Today column**
  (owner, 2026-10-29), never in the hero or Today's aside. Hourly's slim header follows
  the hour being read (`Today 7 PM`). **Hourly's header is the crag's name as its headline
  and that score, with no line of figures** (owner, 2026-10-20): each chart names the read
  hour's figures in its own chip.
- **A figure printed beside a chart is the series the chart draws.** The Hourly charts draw
  the ensemble medians (`temp_c_p50`, `wind_kmh_p50`; gusts as `max(wind_gust_kmh, p50)`),
  so each chart's read-hour chip, and a city's figure in Hourly's slim header, use those too. On
  2026-10-20 the header printed deterministic `temp_c` (47°) over a chart reading 50°.
  Before adding a figure near a chart, grep which field the chart plots.
- **An axis is checked on the screenshot, not the test.** `niceTicks` (`lib/chartTicks.ts`)
  once drew 20–80° for a 37–67° day. A tick change gets a test on the real range and a
  look at Hourly at 480×1000.
- **`ReadingsSummary.score === null` means only "no reading"**, and no surface reaches past
  it. Alerts never withhold it (`architecture.md` § Background jobs).
- **Two sentinels:** `NOT_A_CRAG_READINGS` (`not_a_climbing_location`, the reader's choice)
  and `READINGS_UNAVAILABLE` (`model_unavailable`, a gap), both beside `toConditionsReadings`.
  **An absent `readings` field is neither** — it is an older API during a deploy, and renders
  nothing.

## Client contract — constraints on the API

The client's own patterns are in the `miniapp-patterns` skill.

- **`GET /forecast/:id` carries weather only.** A snapshot has no score field; every score
  on screen is Crag A's, from the readings.
- **A day's score joins the forecast on its local date, never array position.**
