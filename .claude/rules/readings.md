---
paths:
  - "apps/miniapp/src/**"
  - "packages/types/src/**"
  - "apps/api/src/lib/runs/**"
  - "apps/api/src/routes/{hourly,conditions,forecast}.ts"
---

# Readings on screen

What a reading may say, where it comes from, and what the client may assume of the API. Part of the architecture rules, split out of `architecture.md` on 2026-10-08 so it
loads only when a matching file is read or edited. The global rules, and the index of every
scoped file, are in `architecture.md`. Reasoning behind a rule: grep
`.claude/docs/session-archive.md`.

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
  line. Which inputs a reading came from belongs on the Overview's Air and Rock cards.
- **The Overview is the hybrid mockup's cards** (owner, 2026-10-19; `OverviewTab.tsx`) — the
  measurements disclosure and `Measurements.tsx` are gone. *Air* names `HourlySeries.model`;
  *Rock* carries `measurements()`'s mechanism notes, `FRICTION_MECHANISM` among them, so the
  Overview says friction is an estimate once. **No modelled rock temperature prints**
  (owner, 2026-10-19), so the Rock card drops `ROCK_TEMPERATURE_MECHANISM`; it stays
  required wherever one does print. The drying clock (`DryingClock.tsx`) draws the hours
  since real rain against `MIN_HOURS`/`MAX_HOURS` and says so — display only, never the
  score's own drying. How the score works is `ScoreExplainerParts`, the Overview's last
  card and Profile's; every number it quotes comes from `SCORE_MODEL_FACTS`, pinned to the
  model by `cragModel.test.ts`. A temperature interval goes through `cToFDelta`, never
  `formatTempF`.
- **`HourlyReading.rock_sun_shade` is the warmest and coolest of Crag A's eight compass
  walls' `T_surface`** (owner field report, Barn Bluff 2026-10-04: a south face too hot,
  a shaded one good, under one score). Display only — the score still reads air
  temperature. Null if any wall's is missing. **It renders nowhere** (owner, 2026-10-05):
  sun and shade belong only on crags the owner has confirmed on the ground — today only
  Red Wing — and never on the Overview. When a surface brings it back, gate it
  on a flag on the `KNOWN_CRAGS` entry, not on the data being present. It names no
  direction: Crag A does not know which way a crag's walls face (#293).
- **A score over a span is its worst hour, never a mean or a best.** A day's is
  `dayRepresentative`; the score bars and any block of hours are the
  same rule, and a block with any hour unread or suppressed has no score — the worst of the
  rest could be better than the missing one. **An hour's score may headline only beside
  the hour it is** (owner, 2026-10-19, superseding 2026-10-05's "never"): the Overview's
  score bars print the hour covering now as `Now` beside the day's good hours; Hourly's
  slim header follows the hour being read (`Today 7 PM`). **The Overview hero is the
  crag's name alone** (owner, 2026-10-20): no figure, only the notes that stop a reading
  being read (a failed or empty call, the qualifier, the Severe+ notice).
- **The number waits for the alerts query, inside `summarizeReadings`** — `alertsPending`
  suppresses the score on its own (defect class 7). **Severe+ suppression drops the number
  and keeps the readings.** A surface must not reach past `ReadingsSummary.score === null`.
- **Two sentinels:** `NOT_A_CRAG_READINGS` (`not_a_climbing_location`, the reader's choice)
  and `READINGS_UNAVAILABLE` (`model_unavailable`, a gap), both beside `toConditionsReadings`.
  **An absent `readings` field is neither** — it is an older API during a deploy, and renders
  nothing.

## Client contract — constraints on the API

The client's own patterns are in the `miniapp-patterns` skill.

- **`GET /forecast/:id` carries weather only.** A snapshot has no score field; every score
  on screen is Crag A's, from the readings.
- **A day's score joins the forecast on its local date, never array position.**
