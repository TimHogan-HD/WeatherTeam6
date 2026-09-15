# WeatherTeam6 Mini App: Hourly Data Visualisation Handoff
Version: v2
Date: 2026-09-10 (v1: 2026-09-04)
Status: **Phases 1, 1b and 2 shipped** · Phase 2's device check outstanding ·
Phases 3-5 specified

Phase 1 merged as `9ea6da8`, verified 13/13 by `npm run check:hourly` against real stored
runs and 12/12 against the deployed endpoint on 2026-09-14. Two of this document's own
estimates were wrong and are corrected in § Known Risks 9 with the measured values.

**Phase 1b's own verification is unit tests only so far** — an earlier draft of this line
claimed both phases were "verified in production" and cited Phase 1's evidence for it,
which says nothing about the per-day score merge. That is the attribution defect this repo
keeps shipping (class 3), caught in review of the change itself.

**Phase 1 also surfaced a production outage that had nothing to do with it:** Neon was at
its 512 MB cap, every write was failing with `could not extend file`, and `collect-runs`
had been reporting `200 OK` while storing nothing for roughly a day. Retention is now
2 days parsed / 6h raw (PRs #102, #105) and the database sits at 12 MB. The write failure
was logged at `warn` and swallowed by design — correct for a panel render, invisible for a
collection job. See § Open Questions 5.

**Revised in place rather than forked to a `-v2.md` file.** Two documents describing the
same unbuilt plan is the exact failure this doc's own Phase 5 exists to clean up
elsewhere. The version line above is the history; `git log` on this file is the rest.

## Context

The Mini App shows seven daily rows and nothing else. This document specifies exposing the
hourly forecast data the API already collects, and rebuilding the location detail screen
around a Daily tab and an Hourly tab with drill-down from a day into its hours.

Prompted by CragReport's forecast screens (screenshots reviewed 2026-09-04). The reference
is the *legibility* of a stacked chart column, not the feature list — see § Constraints.

## Decisions taken 2026-09-10

Three questions v1 left open are now answered by the owner. All three widen the work.

1. **Return all six deterministic models — but behind an opt-in parameter.** The literal
   ask was "six if it makes sense". It does not make sense as the default: see
   § Known Risks 9 for the measured reasoning. `GET /hourly/:id` returns one
   coverage-chosen model by default and every model that answered under
   `?models=all`. One endpoint, no second API change when the switcher is built, and
   the common screen does not pay for a control it is not showing.
2. **Per-day climbing scores are in.** `/forecast/:id` gains `score`, `confidence` and
   `unavailable_reason` per day. The server already computes all seven and discards six
   of them. This **reverses `miniapp-design-v1.md` §3**, which ruled per-day scores out
   on a design argument; Phase 5 rewrites that section.
3. **Selecting a wall re-scores the forecast** against that wall's own aspect and angle —
   not a filter. The owner's caveat ("which we may not have quite yet") is half right and
   the half that is wrong matters: see § Known Risks 10.

### Design direction settled over three mockup rounds

Recorded here because the mockup is a published artifact, not a repo file, and will not
survive as a reference. Binding for Phases 2-4:

- **Location identity leads.** Rock, aspect, wall angle, elevation, coordinates and the
  rainfall station — all existing `locations` columns the Mini App has never shown. The
  current temperature is one line, not a 36px hero.
- **A wall / area picker** sits under the identity block.
- **Switching to Hourly condenses identity and rain history to two lines.** Nothing is
  hidden behind a tap; it stops competing with the charts.
- **Daily rows carry a metric toggle** — temperature, rain, climbing score — and a range
  bar on a scale **shared by all seven rows**, so days are comparable to each other. An
  earlier draft normalised each row to its own min/max, which drew the identical curve on
  every row regardless of the values. Do not reintroduce a per-row scale.
- **Hourly is bars, one per hour**, coloured by value; the ensemble spread is a whisker on
  each bar rather than a shaded band.
- **Temperature colour is a diverging ramp centred on the location's ideal temperature**,
  not a decorative gradient. Neutral at ideal, cool below, warm above, one fixed scale so
  the same value is always the same colour. Colours are token hues
  (`radarLight` → ink neutral → `fair` → `poor`). Validated for colour-blind separation
  (ΔE 25.7 normal, 21.4 protan) and contrast; it fails the generic lightness band because
  the repo's palette is deliberately bright marks on a near-black ground, and the locked
  design system outranks a default band.
- **Absences are drawn, not omitted.** Rock temperature and sun/shade appear as explicit
  gaps.

## Current State

### What exists and works

- **The hourly data is already collected and stored.** `/api/cron/collect-runs` writes
  `weather_runs` + `weather_run_hours` (six deterministic models, ten fields per hour) and
  `weather_ensemble_hours` (p10/p50/p90 for temperature, wind and precipitation, plus
  `members_wet` / `member_count` across 143 pooled ensemble members). Confirmed running
  2026-09-03.
- **The read path exists.** `apps/api/src/lib/runs/latestRuns.ts` — `getDeterministicRuns`
  and `getEnsembleRuns` — serves a stored run when one is younger than
  `RUN_MAX_AGE_MINUTES` (60) and fetches + writes back only when there is none. The
  Telegram panels render from it today.
- **Day bucketing and coverage detection exist.** `localDays`, `buildRows` and `dayHasData`
  in `apps/api/src/lib/telegram/forecastTable.ts`; `localDateString` in
  `apps/api/src/lib/weather/openMeteo.ts`.
- **Past precipitation exists as a live fetch.** `fetchRecentHourlyPrecip` (Open-Meteo
  `past_days`, capped at 92 upstream).

### What is missing

- **No `/api/v1/*` route exposes any of it.** The mounted routers are locations,
  conditions, forecast, alerts, walls, trips, radar, geocode, preview. `GET /forecast/:id`
  returns seven daily `ForecastSnapshot` rows carrying no hourly series and no per-day
  score.
- **The Mini App therefore has no hourly data at all**, and no chart of any kind.
  `apps/miniapp/src/components/Weather.tsx` renders labelled values only.

### What is decided but not yet written down anywhere

- ~~`.claude/docs/STATE.md` records Mini App polish as **deliberately downgraded**
  ("the Mini App doesn't need to be super fancy"), and `.claude/skills/miniapp-patterns`
  says a CSS or motion architecture is "not authorised".~~ **Both corrected 2026-09-15**
  when Phase 2 shipped. The *chart* half is settled; a CSS or motion architecture is
  genuinely still unauthorised and stays for Phase 5.
- `docs/handoffs/miniapp-design-v1.md` §3 specifies location detail as **"one scroll, no
  internal tabs"**.

**Both are reversed by this document**, on the owner's decision of 2026-09-04. The bot
chat interface stays a first-class surface and is not being deprecated — the owner's words
were that chat "could get really clunky" for this kind of data and they want **both**
surfaces functioning. Phase 5 reconciles the two documents; until it lands, this file is
the newer authority.

## Objective

1. Expose the stored hourly forecast over `/api/v1`, in a shape that supports both a
   continuous multi-day chart and a single-day drill-down, without a schema migration.
2. Rebuild location detail as Daily / Hourly tabs, where tapping a day in Daily opens that
   day's hours.
3. Make ensemble spread visible. p10-p90 bands are data we hold and the reference app does
   not, and a band that visibly narrows as a date approaches is the product's stated core
   purpose drawn rather than described.

## Constraints / Non-Goals

**Hard constraints, inherited:**

- **No schema migration.** Everything below reads tables that already exist. Migrations
  cannot be run from the cloud dev environment (Neon is unreachable through the egress
  proxy), so a plan requiring one stalls on the owner's machine.
- **Inline SVG, no chart library.** `miniapp-design-v1.md` §8. The app is styled with
  inline styles; adding Recharts or D3 is a dependency and a rendering-model change, not a
  styling choice.
- **Design tokens only.** No hex, px size or font name written into a component. Colours
  come from `@weatherteam6/design/tokens`; `type`, `shadow` and `layout` come through
  `apps/miniapp/src/theme/tokens.css.ts`.
- **A null renders as a gap, never as a value.** Every hourly field is nullable and the
  padding is real: Open-Meteo pads a 54-hour HRRR run out to the longest horizon in the
  request, and NBM returns 384 nulls for `surface_pressure` at every point measured. A
  line drawn through a null at zero is defect class 1 in `.claude/rules/defect-patterns.md`.
- **The chance of rain is `members_wet / member_count`, never `precipitation_probability`.**
  Architecture rule. `precip_prob_pct` is a blended upstream field no single model owns and
  is **omitted from the response shape entirely** rather than exposed with a caveat.
- **The server owns "today" and the local day.** Precedent is issue #33: the client and
  the API each derived a UTC date, agreed with each other, and were both wrong.
- **`{ data, error, status }` on every response.** No deviation.

**Out of scope for this document:**

- **Per-hour conditions scores** — the coloured ribbon in the reference app. Nothing scores
  an hour, and doing so is a scoring-algorithm change, not a rendering one.
  (**Per-*day* scores are no longer a non-goal** — they are Decision 2 and Phase 1b.)
- **Rock surface temperature.** Nothing in the repo computes it. It needs a thermal model
  taking aspect, cliff angle and shortwave radiation; that is a scoring-layer change.
- **Sun position / shade strip.** No solar geometry exists in the repo.
- **Snowfall rate and snow depth panels.** Not collected, and the reference app renders
  them as flat zero lines with axis labels reading "1 in / 1 in / 0 in" at a Caribbean
  crag. Do not reproduce.
- **Model switching UI.** The `?models=all` parameter exists so it never needs an API
  change (§ Decisions taken 1); building the control itself is Phase 3's and optional.
- **Radar, walls, trips, history, normals.** Unchanged non-goals.
- **`apps/mobile`.** Archived. Do not add anything to it.

## Pre-Implementation Checklist

- [ ] `npm run build --workspace=packages/types --workspace=packages/design`
- [ ] Branch from current `main`. The v1 branch (`claude/mini-app-data-viz-kgmuse`) was
      squash-merged as `6e4baa1` and is gone
- [ ] **Verify a stored run exists for a seeded location before designing against it.**
      Run `check:weather-runs` against the real database. If `collect-runs` has not fired
      for the point, every request takes the cold path (six models plus 143 ensemble
      members) and the latency figures in Phase 1 do not apply.
- [ ] Confirm `getDeterministicRuns` / `getEnsembleRuns` signatures have not changed since
      this doc was written (`pointKey`, `locationId`, `now`)
- [ ] Confirm no existing route already serves hourly data (there is none as of `702f8e4`)
- [ ] Read `.claude/rules/defect-patterns.md` before reviewing any diff from this plan

## Phases

### Phase 0: Shared types

**Build:** `HourlySeries` and `HourlyPoint` in `packages/types/src/hourly.ts`, re-exported
from `index.ts` (the package declares only a `"."` export, so a deep import will not
resolve under NodeNext).

Name the DTO `HourlyPoint` only if it does not collide with the existing `HourlyPoint` in
`apps/api/src/lib/weather/openMeteo.ts`. It does. **Use `HourlySample`** for the shared
type to keep the API-internal parse type and the wire type distinguishable — they differ
(the wire type carries `local_date` and drops `precip_prob_pct`).

**Acceptance:** `npm run build --workspace=packages/types` clean; `apps/api` and
`apps/miniapp` both typecheck against the new export.

**Git checkpoint:** commit.

---

### Phase 1: `GET /api/v1/hourly/:locationId`  ← authorised now

**Build:** a new `apps/api/src/routes/hourly.ts`, mounted inside the existing
`requireApiAuth`-gated `/api/v1` group in `index.ts`. Business logic in
`apps/api/src/lib/runs/hourlySeries.ts`; the route stays thin.

Behaviour:

1. Validate `locationId` with `isUuid` — return 404, not a Postgres 500.
2. Load the location scoped to `req.userId` (same query shape as `routes/forecast.ts`).
   404 when absent.
3. `getDeterministicRuns` and `getEnsembleRuns` for the point, in parallel via
   `Promise.all`. Both are stored-first, so the common path makes no upstream call.
4. **Choose one deterministic model by measured coverage**, not by request order: the
   model with the most hours carrying a non-null value under `dayHasData`'s rule
   (`precip_prob_pct` excluded, because it runs past the horizon of the model it was
   requested with and so cannot be the evidence that the model answered). Ties break by
   `DETERMINISTIC_MODELS` order. Name the winner in `model`. When no model answered,
   `model` is `null` and the deterministic columns are all null — never a silent fallback
   to another model's numbers.

   **`?models=all` returns every model that answered**, each as its own entry in
   `models[]` carrying its own hours and its own `probability_is_shared` flag. `model`
   still names the coverage-chosen default so a client that ignores the parameter behaves
   identically. The switcher UI is Phase 3's and optional; the parameter exists now so
   building it never needs another API change. Anything other than `all` — including
   a comma-separated list — is **rejected with a 400 rather than silently ignored**, so a
   typo cannot look like a working request that quietly returns one model.
5. Carry `unavailable_models` through from `DeterministicRuns` unchanged. A model that
   returned nothing is named, never dropped.
6. Join deterministic and ensemble hours on the UTC instant into one array ordered by
   `valid_at`. An hour present in only one source keeps nulls on the other side.
7. Stamp each hour with `local_date` from `localDateString(valid_at, utc_offset_seconds)`.
8. Emit `days[]`: one entry per local date, in order, each carrying the date and a
   `has_deterministic` / `has_ensemble` flag derived from whether any hour in it carries a
   non-null value from that source. This is what lets the client's Daily tab offer a
   drill-down only for days there is actually data for.
9. Window the output to the local dates covered by `/forecast/:id` (seven days) plus the
   current local day, so the two tabs cannot disagree about which days exist.

**Deliberately not in the response:** `precip_prob_pct` (see Constraints), raw member
arrays, and any field the Mini App has no drawn use for.

**Acceptance criteria:**

- `curl` against production with `Authorization: Bearer $API_SHARED_SECRET` returns
  `{ data, error, status }` with `data.hours.length` between 100 and 200 and
  `data.model` naming a real model.
- Nulls survive as `null` in the JSON. Verified by finding at least one hour past the
  chosen model's horizon and confirming its `temp_c` is `null`, not `0`.
- `data.days` length matches the distinct `local_date` values in `data.hours`.
- An unknown UUID returns 404 with `data: null`. A malformed id returns 404, not 500.
- Unauthenticated returns 401 (this proves the gate, **not** that the route deployed —
  every `/api/v1/*` path 401s unauthenticated whether or not it exists. Check the
  deployment's commit SHA for that).
- **`npm run check:hourly`**, a new script under `apps/api/src/scripts/`, run against real
  Postgres. Vitest mocks `fetch` and never opens a connection, so the stored-run read, the
  instant join and the nulls-stay-null property are all invisible to it. Model it on
  `checkAddLocationApi.ts`: safe against production data, read-only here, and loud if it
  cannot complete. Being a root-level `check:*` script it is picked up by CI automatically.
- Unit tests for the pure parts — model selection by coverage, the instant join, local-day
  bucketing across a UTC midnight. **Each assertion must name the implementation line that
  would have to change for it to fail** (defect class 11); a fixture where every model
  emits the same hours does not test coverage-based selection.

**Watch:** measure the response size and the wall time on the stored path and record both
in the PR body. If either is bad, § Open Questions 2 is the lever.

**Git checkpoint:** commit, push, draft PR. **Review before Phase 2 begins.**

---

### Phase 1b: Per-day scores on `/forecast/:id`

Small, separate, and independent of Phase 1 — do it in the same PR only if Phase 1 lands
clean.

**Build:** `ForecastSnapshot` gains `score: number | null`, `confidence`,
`unavailable_reason`, **and the five `component_*` fields**. `computeLiveForecast` already
returns a scored row per day; `toWindowedForecast` currently drops all of it on the floor.
Carry it through.

**The components are not optional, and an earlier draft of this phase omitted them.**
`summarizeConditions` (`packages/types/src/conditionsCopy.ts:111`) takes
`components: ScoreComponents` and runs `limitingComponent(components)` to produce the
*"limited by drying time"* qualifier — that is how half of suppression works, and it is the
half that fires on a component scoring 0. Ship `score` alone and a client can only call
`summarizeConditions` with null components for days 2-7, so **the component trigger can
never fire** and only the alert half of suppression works. The server already computes the
breakdown for every day and discards it.

**Three rules it must not break:**

- **A non-climbing location still gets no score anywhere.** The client does not ask, and
  now the forecast route must not volunteer one either — `computeLiveForecast` does not
  branch on `is_climbing_location` and will happily score Chicago.
- **A withheld score and an absent one stay different answers.** `unavailable_reason:
  'rainfall_unavailable'` means the rainfall lookup *failed* and the day is deliberately
  unscored; `score: null` with no reason means the date is outside the scoring window.
  Both already exist on `ConditionsScore`; reuse them rather than inventing a third state.
- **Suppression still applies per day.** The ladder and the Severe-alert rule live in
  `packages/types/conditionsCopy.ts` and run unconditionally. Seven chips means seven
  chances to show an unsuppressed score under an active warning.

**Acceptance:**

- `/forecast/:id` for a climbing location returns seven rows each carrying a score or a
  stated reason for not having one; the same call for a city returns seven rows with no
  score field populated.
- A day inside an active Severe+ alert renders suppressed in the Mini App.
- **A day with a zeroed component renders *"limited by &lt;component&gt;"*.** This is the
  half of suppression that the missing breakdown would have silently disabled, so it needs
  its own case rather than riding on the alert test — a fixture where every component is
  non-zero exercises neither trigger (defect class 11).

---

### Phase 2: Chart primitives — **SHIPPED 2026-09-15 (`675ac89`, PR #110)**

**Shipped as specified, plus one thing the spec did not ask for and one it did not answer.**

- `geometry.ts` (pure), `hourlySeries.ts` (the adapter), `Series.tsx` (the marks),
  `HourlyChart.tsx` (one chart), `HourlySection.tsx` (both charts on the detail screen),
  `chartStyle.ts` (colours and mark geometry). Plus `useHourly`, `useNow`, `formatRunAge`,
  `formatWeekday`. 67 tests.
- **Added:** a rain bar chart alongside temperature. The spec listed "bars for
  precipitation" as a primitive, and a primitive with no call site is unverified.
- **Answered:** the spec says "an optional p10-p90 band behind the **p50** line", so the
  temperature line is the ensemble median, not the deterministic model. A line from one
  source inside a band from another agrees with it only by luck.
- **Deviated, deliberately:** no hover or tap readout, which the `dataviz` skill wants by
  default. There is no hover on a touch screen, inline styles cannot express one, and a
  value readout belongs with Phase 3's drill-down.
- **Deviated, deliberately:** no table view. The seven daily rows above the charts are the
  same forecast in a table, and a second one of 168 rows is not an accessibility win.
- **Not done:** the diverging temperature ramp from § Decisions taken. A ramp colours a
  *bar by value*; the temperature chart is a line, and the rain bars use the palette's own
  radar intensity ramp. It lands with Phase 3's per-day hourly bars.

**Verified** against the deployed `GET /hourly/:locationId` for Red Wing: 168 hours, 7
local days, 143 members throughout, rendered offline through the real components — 49-73°F,
peak rain hour 0.14 in, band widening 3.2°C to 8.0°C across the window, no `NaN` in the
markup. **Not verified on a device**, which is this phase's acceptance criterion below.

**Three defects found by review after the merge and fixed in `6b41709` (PR #112)**, all of
them the chart claiming more than the data supports: the accessible summary counted days it
had not drawn; `HourlySeries.fetched_at` named the deterministic run while the charts draw
the ensemble (now the **older** of the two runs — an API change, documented on the type);
and a whole-section "no hourly forecast" state fired on an empty ensemble over a response
that can still carry a deterministic one. Detail in the archive, 2026-09-15.

The original specification follows.

**Build:** `apps/miniapp/src/components/charts/` — one `<Series>` component in inline SVG,
`viewBox`-scaled and responsive, handling:

- A nullable series drawn as **separate path segments**, so a gap is a gap.
- An optional p10-p90 band behind the p50 line.
- A local-time x-axis reading `local_date` from the response.
- Colours from tokens, legible in the user's own Telegram theme.
- Bars for precipitation, lines/areas for everything else.

Load the `dataviz` skill before writing the first line of chart code.

**Acceptance:** the temperature chart with its band renders on the owner's phone inside
Telegram, in their own theme, for a real saved location. A day with no coverage shows a
gap and not a line to zero.

**Git checkpoint:** commit. Review on device before Phase 3.

---

### Phase 3: Daily / Hourly tabs — **SHIPPED 2026-09-14**

**Shipped as specified, plus the parts of § Decisions taken that bear on these two tabs.**

- `Segmented.tsx` (the tab bar and the metric toggle, one control with two ARIA
  personalities), `DailyList.tsx` (tappable rows, metric toggle, shared-scale range bars),
  `LocationIdentity.tsx` (full and condensed), `charts/DayCharts.tsx` (one day's hours),
  plus a `range` mark, an `hour` axis and a reference band on the Phase 2 primitives.
  45 new tests.
- **The diverging temperature ramp landed**, centred on `TEMP_BAND_C` — extracted from
  `conditionsScore.ts` into `packages/types` so the ramp's neutral zone and the scorer's
  full-points plateau are one definition. The scorer's arithmetic is unchanged; verified
  identical at every 0.001 °C from -50 to +60.
- **Deviated, deliberately: temperature is a floating range mark, not a bar from a
  baseline.** § Decisions taken says "Hourly is bars, one per hour, coloured by value; the
  ensemble spread is a whisker on each bar". Temperature has no meaningful zero — 0 °C is a
  different place on the scale from 0 °F — so a column measured from one encodes the unit
  as much as the weather, and a below-zero hour draws nothing at all. Truncating the axis
  instead is the classic bar-chart lie. The mark is a p10-p90 bar with the median ruled
  across it: one mark per hour, coloured by value, spread visible, and no origin to get
  wrong. Rain keeps real zero-baselined bars.
- **Superseded by the mockup-matching pass (`6302eab`).** The bullets that stood here —
  a fourth metric (wind), a shaded band compensating for the ΔE 13.0 gap, a documented
  cold-side asymmetry, and the today hero left undemoted — described the **first** build,
  which worked from this section’s prose rather than the mockup artifact. The owner
  compared the two and the screen was rebuilt. See § Phase 3 as built, below.

**Four defects found by review before the merge**, none of them visible to typecheck, lint
or the suite — the same pattern this repo keeps recording:

1. **The temperature mark was placed on the rain convention.** Rain covers the hour *before*
   its timestamp because it is an accumulation; a temperature is instantaneous and belongs
   centred on its own. The 16:00 reading was landing in the slot the axis heads "3 PM" — the
   day's peak an hour early, under a correct-looking axis. **A test asserted the wrong
   behaviour**, having been written from the same misunderstanding as the code (defect
   class 11). Now `accumulationLeft` / `instantLeft`, with the x-window widened to match.
2. **A loading state read as a fact about the weather.** `drawableDates` was derived from
   `days[]` unconditionally, so while `/hourly/:id` was in flight — the slowest query on the
   screen — every row was untappable and the list printed *"days without an hour-by-hour
   forecast can't be opened"*. After an error that state was permanent. Now the set is
   `undefined` until a response arrives, and an hourly error says so on the Daily tab.
3. **A null shared domain dropped the bar track**, contradicting the component's own
   "absences are drawn, not omitted" rule and collapsing the row layout.
4. **`ForecastList` was left orphaned**, carrying a duplicate copy of the daily-row rules.
   Deleted.

**Verified** by rendering the real components against the deployed `/forecast/:id` and
`/hourly/:locationId` for Finland, MN: 7 days, 168 hours, `utc_offset_seconds: -18000`, day
and hour axes, both tabs — no `NaN`, no `Invalid Date`, no `undefined` in the markup, and
the hour ticks at 12 AM / 6 AM / 12 PM / 6 PM on the crag's clock rather than UTC. The
placement fix was checked the same way: the day's 15:00 peak lands at 67.0% of the plot,
which is the 12 PM tick (55.8%) plus three hours at 3.74% each — an hour to the right of
where it sat before.

**Not verified on a device**, including `BackButton` — see the acceptance criterion below,
which a `node` test environment with no DOM cannot reach.


#### Phase 3 as built (`6302eab`) — after the mockup comparison

The first build (`03b6d00`) worked from § Decisions taken's prose and got the concepts
without the design. The owner compared it against the mockup artifact and it was rebuilt.
**This is what is on screen.**

- **Daily**: identity block (labelled 3-column fact grid — rock, aspect, angle "off vert",
  elevation, coordinates across two columns, rain station), a one-line current-conditions
  row carrying the day's **labelled** high/low and a score chip, the tab bar, a
  three-metric toggle (Temp / Rain / Climbing), seven weekday-only rows with gradient
  tracks on one shared scale, an axis note stating what that scale runs between, then the
  continuous seven-day strip.
- **Hourly**: the identity condensed to one line, the same now-line, a **day pager**
  (`‹ Wed, Sep 16 ›` with "tomorrow" / "3 days out"), then four charts — temperature,
  rain, **chance of rain**, **wind** — each on an hour axis read from the location's clock.
- **The seven-day strip is on Daily, not Hourly.** It is a chart about comparing days.

Corrections the rebuild made to the first build's own reasoning:

- **The ramp is continuous, not four discrete steps.** That dissolves the ΔE 13.0 problem
  rather than compensating for it with a shaded reference band, and removes the cold-side
  asymmetry at the same time. It lives in `packages/design` as `tempScale`, beside new
  `windScale` and `chanceScale` — every data ramp is a named scale there now.
- **The today hero is gone.** It led with `temp_c_max` — a daily *maximum* — as the largest
  element on the screen. `currentHour` reads the hour covering now from the hourly run, the
  first field in any response entitled to the word, and returns null past
  `CURRENT_HOUR_TOLERANCE_MS` rather than the nearest hour.
- **Wind left the daily toggle**, because the Hourly tab now has a wind chart with gusts.

Deviating from the mockup, deliberately:

- **The name is not repeated in the identity card.** `Screen` renders it as the page `h1`;
  the mockup's device frame only has Telegram's small title bar, so it shows it twice.
- **"Ideal temperature" is 16 °C, not the mockup's 50 °F.** The mockup calls it "a real
  config field" and no such column exists on `locations`. 50 °F is 10 °C —
  `TEMP_BAND_C.idealMin`, the *bottom* of the score's full-marks plateau — so centring
  there paints the whole range the scorer likes best as warm. `IDEAL_TEMP_C` is the single
  place a config field replaces if one is ever added.
- **Still not built:** the wall picker (Phase 4 — nothing populates `walls`) and the drying
  card with its recent-rain sparkline (Phase 5 — needs its own endpoint).

**Nine more defects found by review before that merge**, the GitHub reviewer having passed
it in 52 seconds over a 1,400-line diff. The two that mattered: the day's high and low
rendered as **two bare unlabelled numbers**, so with no current hour the screen showed
`103°F  79°F` alone with `temp_c_max` first — the same §3 error `NowLine` exists to
prevent, recreated inside it; and **the score chip rendered through a pending alerts
query**, where `severeAlertEvent` answers null exactly as it does for "no alert" and the
banner shows nothing. The rest: chance of rain coloured by a mm/h ramp (51% and 100%
identical), legend swatches naming colours no mark draws, hardcoded hex in the wind ramp,
clipped coordinates, a pager that could dead-end, a fabricated rain bound on a dry week,
and `ASPECT_WORDS` left dead by a refactor.

The original specification follows.

**Build:** location detail becomes two tabs.

- **Daily** — the existing seven rows, each now tappable, opening that day in Hourly.
  Alert banner, today hero, score section and sources footer keep their current order and
  stay outside the tabs; the alert banner in particular is above everything, always.
- **Hourly** — the chart column for the selected day, with the continuous multi-day series
  reachable by scrolling or paging.

**This revises `miniapp-design-v1.md` §3's "one scroll, no internal tabs".** Phase 5
rewrites that section rather than leaving two documents disagreeing.

**Acceptance:** tapping a day in Daily lands on that day in Hourly; Telegram's `BackButton`
returns to Daily rather than closing the Mini App; a day flagged without coverage in
`days[]` is not tappable.

**Git checkpoint:** commit.

---

### Phase 4: Wall-aware scoring (not authorised yet)

**Read § Known Risks 10 before writing a line of this.** The angle convention is inverted
between the two tables and getting it wrong produces a plausible, silently wrong score.

**Build:** selecting a wall re-scores the forecast against that wall's `aspect_deg` and
`angle_deg` instead of the location's `aspect` and `cliff_angle`.

**The plumbing is not as close as it looks, and an earlier draft of this section said it
was.** Two corrections, both load-bearing:

- **`aspectDegrees` is a dead field.** `liveForecast.ts:205,222` computes it and sets it on
  `ScoreInput`, and **neither `conditionsScore.ts` nor `dryingModel.ts` ever reads it** —
  only `cliffAngle` reaches the drying formula. This is defect class 10 in
  `.claude/rules/defect-patterns.md` (*"a dead field reasoned about as if it were live"*),
  the same trap `ScoreInput.currentTempC` set for three earlier documents. So the angle
  half of a wall is genuinely short work; **the aspect half does not exist yet.** Making a
  wall's aspect change its score means adding an aspect term to the drying model first —
  new scoring-algorithm work with its own tests, `.claude/docs/scoring-algorithm.md`
  updates, and a re-baselined mutation score.
- **`computeLiveForecast` has five callers, not two:** `routes/conditions.ts`,
  `routes/forecast.ts`, `routes/trips.ts`, `lib/telegram/conditionsReply.ts` and
  `lib/scoring/previewForecast.ts`. Three have no wall concept at all — the bot reply has
  no picker, `trips.ts` calls it per location inside a `.map()`, and `previewForecast.ts`
  runs against a synthetic location with no row and therefore no walls. Each needs an
  explicit decision about what to pass, not a mechanical thread-through.

**What does not exist:** anything that *populates* `walls`. There is full CRUD
(`GET /walls/:locationId`, `POST /walls`, `DELETE /walls/:wallId`) and no seed, no
importer, and no UI. The table is empty in practice. So this phase needs a way to create
a wall before it has anything to select, and that is a product decision — hand entry,
OpenBeta import, or derived from terrain — not a build task.

**Acceptance:** two walls at one location with different **angles** return different scores
for the same day, in the direction the drying model predicts, with the conversion from
§ Known Risks 10 applied; a location with no walls behaves exactly as it does today.

**Not an acceptance criterion until the drying model has an aspect term:** two walls with
different *aspects* returning different scores. As specified above that cannot pass, and an
earlier draft of this phase listed it as if it could.

---

### Phase 5: Recent rain + document reconciliation (not authorised yet)

**Build:**

- A recent-rain bar chart from `fetchRecentHourlyPrecip`, behind its **own** endpoint and
  its own React Query hook, so its upstream fetch cannot delay the rest of the screen.
  Sections fail independently — that rule is already in `DetailView.tsx`.
- Rewrite `miniapp-design-v1.md` §3 — for **three** reversals now, not one: internal tabs,
  per-day scores, and the location-identity header. Also §9 (non-goals).
- Rewrite the scope note in `.claude/skills/miniapp-patterns/SKILL.md` and the "Mini App
  polish — deliberately downgraded" item in `.claude/docs/STATE.md`, recording that the
  reversal is the owner's 2026-09-04 decision and that the bot remains first-class.
- `/session-end` protocol.

**Git checkpoint:** commit, PR, squash merge.

## Data Shapes / Schemas

No schema change. Read-only over `weather_runs`, `weather_run_hours`,
`weather_ensemble_hours`, `locations`.

```ts
// packages/types/src/hourly.ts

export type HourlySample = {
  /** UTC instant, ISO 8601. The join key between the two sources. */
  valid_at: string
  /**
   * The location's own calendar day this hour falls in (YYYY-MM-DD).
   *
   * Server-derived. A client cannot compute it — `utc_offset_seconds` is the
   * location's, not the viewer's, and issue #33 is what happens when both sides
   * derive a date and agree with each other while both being wrong.
   */
  local_date: string

  // ── deterministic: the one model named in `model` ────────────────────
  temp_c: number | null
  dewpoint_c: number | null
  humidity_pct: number | null
  precip_mm: number | null
  wind_kmh: number | null
  wind_gust_kmh: number | null
  wind_dir_deg: number | null
  cloud_pct: number | null
  pressure_hpa: number | null

  // ── ensemble: pooled across all four models' members ──────────────────
  temp_c_p10: number | null
  temp_c_p50: number | null
  temp_c_p90: number | null
  wind_kmh_p10: number | null
  wind_kmh_p50: number | null
  wind_kmh_p90: number | null
  /**
   * The ensemble mean hourly accumulation — the only precipitation figure here
   * that can be added up. A day or step total sums this. Summing a percentile
   * would be the median of nothing and reads three to twelve times high.
   */
  precip_mm_mean: number | null
  /**
   * Share of members at or above 0.1 mm this hour, 0-100.
   *
   * **Null means unknown, not 0%** — a row stored before `members_wet` existed
   * has no wet count. Derived here rather than client-side so `members_wet` and
   * `member_count` cannot be divided in two places with two rounding rules.
   */
  precip_chance_pct: number | null
  /** How many members reached this hour. The band's own sample size. */
  member_count: number | null
}

export type HourlyDay = {
  /** YYYY-MM-DD in the location's local calendar. */
  local_date: string
  /** Whether the named deterministic model said anything about this day. */
  has_deterministic: boolean
  /** Whether any ensemble member reached this day. */
  has_ensemble: boolean
}

export type HourlySeries = {
  location_id: string
  /** Seconds to add to a UTC instant for the location's wall clock. */
  utc_offset_seconds: number
  /** When the run was fetched upstream — **not** a model initialisation time. */
  fetched_at: string | null
  /**
   * The deterministic model the non-ensemble columns came from, chosen by
   * measured coverage. `null` when no model answered at this point — in which
   * case every deterministic column is null rather than borrowed.
   */
  model: string | null
  /** Requested models with nothing at this point. Named, never dropped. */
  unavailable_models: string[]
  /** Ordered by `valid_at`. The model named in `model`, joined with the ensemble. */
  hours: HourlySample[]
  /** Ordered by date. What the Daily tab may offer a drill-down for. */
  days: HourlyDay[]
  /**
   * Every deterministic model that answered — **only under `?models=all`**, absent
   * otherwise. `hours` above stays populated either way, so a client that ignores the
   * parameter needs no branch.
   *
   * Each entry carries its own coverage: the models do not span the same horizon
   * (HRRR ~48 h, NBM ~264 h, the globals further), so a switcher built on this must show
   * where each one stops rather than implying they are interchangeable.
   */
  models?: HourlyModel[]
}

export type HourlyModel = {
  model: string
  /**
   * **Null means unknown, not "no".** A stored row predating the flag cannot say whether
   * `precipitation_probability` was this model's own, and a renderer must then withhold
   * the model's name from that column rather than claim it.
   */
  probability_is_shared: boolean | null
  /** Same shape and same ordering as `hours`; ensemble columns are null throughout. */
  hours: HourlySample[]
}
```

### Per-day scores — the `ForecastSnapshot` additions (Phase 1b)

```ts
// packages/types/src/index.ts — added to the existing ForecastSnapshot

  /**
   * The day's conditions score, 0-100.
   *
   * `null` with no `unavailable_reason` means the date is outside the scoring window.
   * `null` *with* one means the day is deliberately unscored — see below. Never 0 for
   * either case: 0 is a real score meaning conditions are bad.
   *
   * Absent entirely for a non-climbing location. A rock-drying score for a city is
   * meaningless and must not be rendered anywhere.
   */
  score?: number | null
  confidence?: 'low' | 'medium' | 'high'
  /** Withheld, not missing (issue #34). Same values and meaning as on `ConditionsScore`. */
  unavailable_reason?: 'rainfall_unavailable' | null

  /**
   * The five components behind `score`, same names and scales as `ConditionsScore`.
   *
   * **Required for suppression, not a nicety.** `summarizeConditions` reads these to find
   * the limiting component; without them a client can only pass nulls and the
   * "any component is 0" trigger never fires. Null means not measured — and
   * `limitingComponent` skips nulls deliberately, so a component that was never measured
   * is never named as the cause.
   */
  component_drying_time?: number | null
  component_upcoming_rain?: number | null
  component_wind?: number | null
  component_temp?: number | null
  component_humidity?: number | null
```

## Known Risks / Watch Points

1. **Payload size.** ~168 hours x ~20 fields is roughly 50-60 KB of JSON uncompressed.
   Fine over gzip on Vercel, but measure it in Phase 1 rather than assuming. Lever: drop
   the fields no chart draws (`pressure_hpa`, `wind_dir_deg`) or halve the horizon.
2. **The cold path is slow and can time out.** With no stored run, the endpoint fetches six
   deterministic models plus 143 ensemble members inside the function's `maxDuration: 60`.
   That is the existing behaviour of `latestRuns.ts` and the panels live with it, but the
   Mini App will hit it for any location added since the last `collect-runs`. Phase 1 must
   not make it worse by fetching serially.
3. **`collect-runs` already sometimes reports "timeout" in cron-job.org's UI** at its 30 s
   job timeout while Vercel completes the work. Do not read a red job there as a broken
   endpoint without checking the per-location failure counts.
4. **Deterministic JSON-parse failures are unexplained.** Working theory is Open-Meteo
   rate-limiting Vercel's shared egress IP. Hobby-plan log retention is ~1 hour, so a
   `[openMeteo] deterministic response was not JSON` has to be caught right after a
   scheduled run. This endpoint adds request-time pressure on the same upstream.
5. **`panels.ts:578` says "Model switching is the Mini App's."** `?models=all` makes that
   true at the API (§ Decisions taken 1). The *control* still does not exist, so the
   comment describes an intention rather than a shipped feature until Phase 3 builds one.
6. **Two documents currently forbid this work** (§ Current State). Until Phase 5, anyone
   reading `STATE.md` or `miniapp-patterns` will believe Mini App investment is
   unauthorised.
7. **`.claude/settings.json` hooks are enforced.** The turn cannot end with uncommitted
   changes, unpushed commits, a pushed branch with no PR, or a green mergeable PR left
   open. `git commit` on `main` is blocked. Escape hatch for a deliberate pause:
   `touch .claude/.wip`.
8. **The working tree is CRLF.** Multi-line `sed`/`perl` replacements match nothing and
   report success. Use the Edit tool for anything spanning more than one line. Python is
   not installed.
9. **Why six models is opt-in and not the default — now measured, and weaker than first
   claimed.** Measured 2026-09-14 by `npm run check:hourly` against a real stored batch at
   Clarks Grove, Minnesota:

   | | |
   | --- | --- |
   | payload, default | **69.7 KB** |
   | payload, `?models=all` | **263.0 KB** (3.8x, not 6x) |
   | `gfs_seamless` / `ecmwf_ifs025` / `icon_seamless` / `gem_seamless` / `ncep_nbm_conus` | **168 of 168 hours** |
   | `ncep_hrrr_conus` | **56 of 168 hours** |

   **Two claims in earlier drafts of this item were wrong and are corrected here.** It said
   a switcher "greys out most of its own options past day two" — only HRRR stops early, one
   of six. And it said "past day three only the four global models answer", while NBM
   reaches the full window. A reviewer challenged both on PR #98 with nothing but internal
   arithmetic and was right; the measurement confirms it.

   `?models=all` is also cheaper than estimated: 3.8x rather than 6x, because the ensemble
   columns are shared and do not repeat per model.

   **What survives:** one model of six goes dead inside three days, a client cannot know
   which without asking, and a control with a silently expiring option is worse than none.
   That is a thinner argument than the original, and it is enough for *opt-in* — which
   costs nothing and forecloses nothing — but it would not carry a decision to hide the
   data outright.
10. **`cliff_angle` and `walls.angle_deg` share an origin and run in opposite directions.
    Both are "degrees from vertical", so the clash is invisible in every doc that
    describes them.**

    An earlier draft of this item claimed the two used *different origins* — that a
    climber's 90 (vertical) would be read as the scorer's 90 (slab). **That was wrong**,
    and wrong in the most dangerous way: an implementer who checked the cited docs would
    have found them agreeing, concluded no conversion was needed, and passed the value
    straight through. The real mismatch is a sign, not a remap.

    What the sources actually say:

    - `conditionsScore.ts:54` — `angleFactor = 1.0 + (input.cliffAngle / 90) * 0.3`, with
      the comment *"slab (90°) dries 30% slower than vertical wall (0°)"*. So `cliffAngle`
      counts **slab** as positive, and has no defined negative domain.
    - `.claude/docs/data-model.md:218` — `angle_deg int -- degrees from vertical`.
    - `weatherteam6-ui-handoff-v1.md:400` — `angleDeg: number // degrees past vertical;
      0 = vertical, 90 = cave`, with `angleBand: 'slab' | 'vertical' | 'steep' | 'roof'`.
      So `walls.angle_deg` counts **overhang** as positive.

    Same zero, opposite directions. Pass `walls.angle_deg` straight into `cliffAngle` and
    a **roof** (90, the most sheltered rock at the crag and the fastest to dry) is scored
    as a **slab** — 30% *slower* drying, on the heaviest component in the score. Exactly
    backwards, entirely plausible on screen, and nothing typechecks differently.

    **Before Phase 4 converts anything:** confirm against real rows what `walls.angle_deg`
    holds, decide whether `cliffAngle` gains a negative domain or walls are clamped, and
    put the conversion in one named helper with a test per quadrant. Do not do it inline.

## Open Questions

**Answered 2026-09-10 — see § Decisions taken:** model switching (opt-in `?models=all`),
per-day scores (in), wall selection (re-scores, does not filter).

1. **What convention does `walls.angle_deg` hold, and who fills the table?** Two questions
   with one owner. The convention clash is § Known Risks 10 and is a correctness issue.
   The population question is a product one: `walls` has full CRUD and no writer, so the
   picker has nothing to pick until walls can be created — by hand, by OpenBeta import, or
   derived from terrain. **Blocks Phase 4, nothing earlier.**
2. **How many days should the Hourly tab reach?** The ensemble runs to 384 h (16 days),
   the daily tab shows 7. Phase 1 windows to 7 for consistency. A trip-planning view would
   want the full 16.
3. **Does the recent-rain chart read the forecast API's `past_days` or the archive?** They
   disagree badly — 11.3 mm against 90.8 mm for the same day at the same point, and the
   archive visibly smeared one storm across two days. `hours_since_rain` feeds the
   conditions score, so this is the product decision already recorded as owed in
   `STATE.md`; the chart must not settle it by accident.
4. **Does the today hero survive the tab split, or fold into Daily?** Phase 3 assumes it
   stays outside the tabs.
5. **Should `collect-runs` fail loudly when it persists nothing?** It reported `200 OK` and
   green ticks on cron-job.org for roughly a day while every write was rejected, because
   `latestRuns` catches a storage failure and logs a warning — right for a panel render,
   which should still show data it could not cache, and wrong for a job whose entire
   purpose is persistence. Raised three times during Phase 1 and never answered; it is a
   behaviour change to a production cron, so it stays unmade.

   Related and worth doing with it: **Vercel's error level is unusable as a signal here.**
   Measured 2026-09-14 — 19 of 19 error-level lines in three hours were the same
   `DEP0169 url.parse()` deprecation warning, because Vercel files anything on stderr as an
   error. A real failure logged at `warn` sat below a floor already flooded with noise,
   which is the mechanism by which a day-long outage went unseen.
