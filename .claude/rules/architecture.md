# Architecture Rules

These decisions are final unless the user overrides them. Stack, structure and the
delivery gates are in `CLAUDE.md`; domain patterns are in the `miniapp-patterns`,
`drizzle-patterns`, `background-work` and `conditions-score` skills.

## Backend Patterns
- Express route handlers are thin. Business logic lives in `src/lib/` (weather fetches in
  `lib/weather/`, one file per source), not in route files.
- **`rockThermal.ts` is the v2 model's Layer 1.** **Irradiance comes from one deterministic
  model — `gfs_seamless` — never pooled**, per issue #155; a reading above 1400 W/m² is a gap,
  not a measurement. And
  **`T_surface` is null whenever an input was missing and never degrades to air temperature**
  — a defaulted surface temperature would look like a measurement on every screen, and the
  per-hour `qualified` flag must travel with the reading rather than being dropped at the
  surface (§ Unknown aspect).
- **The score on every screen is Crag A / Wall A (`lib/scoring/cragModel.ts`), owner
  decision 2026-09-24.** `score = 100 × dryness^0.55 × friction`. Crag A runs the drying
  clock on eight vertical walls and takes the median; Wall A runs it on the recorded wall
  with overhang rain shelter. Friction is condensation × heat × humidity × cold from air
  temperature, dew point and `T_mass` — no sun, so it answers when shortwave is missing. A
  day's score is the worst hour of its best 3-hour run between 08:00 and 18:00 local
  (`dayRepresentative`). It sits on top of `evaluateHourlyConditions`, which still supplies
  `T_mass`, `T_surface` and the drying rate; v2's own score and sweat-balance friction no
  longer reach a response. The port is checked hour-for-hour against
  `.claude/docs/crag-a-reference/model.ts`; a change that moves a result there needs an
  argument. **Every constant in it is a judgement call**, and nothing is validated against
  outcomes (#143).
- **`hourlyConditions.ts` and `sweatBalance.ts` are the v2 model's Layers 2-4**, now Crag A's
  Layer 1 inputs. **A weighted geometric mean has unbounded slope at zero**, so a factor reaching *exactly*
  zero collapses the score into it rather than arriving — measured at 12 points off a tenth
  of a degree, which is issue #148 in a model with no bands. Any new factor must approach
  zero rather than reach it, or be shown to do its collapsing inside one band. **The hand's
  vapour-pressure deficit is taken at skin temperature, never at `T_surface`** — the rock's
  deficit would read a 66 °C wall as ideal drying conditions for skin. And **`rock.qualified`
  is false for any drying window containing daylight**, because the clock runs off
  `T_surface`; that is honest, not a bug.
- **The magnitude fence still holds under Crag A**: its heat, humidity and cold penalties are
  unmeasured judgements, so words and ordering reach a screen and the 0-1 factor does not.
  The v2 history of the fence follows.
- **The friction reading rests on exactly one unvalidated step, and it is fenced.**
  Everything upstream of `sweatBalance.sweatFrictionFactor` is standard physics checked
  against published values; that one line — skin wettedness to a grip factor — is a guess
  nobody has measured, and no study relates the two. **Owner decision 2026-09-21: keep it
  and quarantine it.** The terms are that **words and ordering reach a screen and
  magnitudes do not** — `poor`/`fair`/`good`/`great`, never "friction 0.29" — and the copy
  says it is an estimate. The 0-1 factors live under `HourlyConditions.diagnostics` so a
  response built by spreading the object cannot leak one, and `hourlyConditions.test.ts`
  fails if a factor is promoted back to the top level. `t_surface_c` and
  `condensation_margin_c` stay renderable: they are derived measurements with named biases,
  not guesses about grip.
- **`GET /hourly/:locationId` carries the v2 readings, and they come from one model that
  is not necessarily the one heading the weather columns.** `HourlySeries.model` is chosen
  by measured coverage; `readings.model` is always `THERMAL_MODEL` (`gfs_seamless`),
  because irradiance may not be pooled (issue #155). **When they differ, a surface must not
  attribute one to the other.** If that model did not answer at this point there are no
  readings and `unavailable_reason` says `model_unavailable` — never another model's
  numbers.
- **The readings reach the response only because the route passed `scoring`**, exactly as
  a per-day score reaches `GET /forecast/:id` only because it passed a merge argument.
  There is no `is_climbing_location` check downstream to forget, and the model itself does
  not branch on the flag — it would score a city if asked. **The flag also decides whether
  the hourly run is fetched at all**: with `scoring: null` the whole output is a sentinel,
  so `GET /conditions/:id` skips the call rather than spending a round trip to produce one.
- **`GET /conditions/:locationId` carries the same readings, sliced by the same rule.**
  `toConditionsReadings` (`lib/runs/conditionsReadings.ts`) is shared by the route and
  `check:conditions`, and `readingNow` (`packages/types`) is shared with the client. This
  exists so **one crag cannot carry two different numbers on two screens** — the list card
  reads `/conditions` and the detail screen reads it too, and the five-component score and
  the v2 score disagree by around thirty points on a hot day. `ConditionsReadings` carries
  its own `utc_offset_seconds` for the same class of reason: a window's clock times must
  never be formatted against an offset borrowed from a query that has not settled (#33).
- **The words on a conditions surface are derived from the readings, never from the
  number.** `summarizeReadings` (`packages/types/src/readingsCopy.ts`) is the one
  implementation. `stateLabel` and `summarizeConditions` are **deleted**: a ladder that maps
  a score to a phrase can only ever be as right as the score, which is how 104 °F came to
  read *"Dry, settled"*.
- **A reading is a label and a value, never a sentence** — owner decision 2026-09-21.
  `Dryness: Dry`, `Friction: Great`, `Score: 100`, in that order, from `ReadingField`;
  the labels live in `readingsCopy.ts` so no two surfaces can name the same gauge
  differently, and `fieldLine` is how a text surface punctuates one. The first
  version wrote them as prose — *"Dry rock · Great friction"* over two caveat sentences —
  and it **read as fact**: a fluent sentence claims a confidence an estimate has not
  earned. The caveats are still required copy and are now fragments on one line. Which
  inputs a reading came from belongs in the measurements disclosure, not in the gauge.
- **The measurements disclosure names each group with the model that produced it**
  (`measurements()` in `readingsCopy.ts`, rendered by `Measurements.tsx` inside
  `ConditionsNow`). The *Air* figures are `HourlySeries.model`'s, chosen by coverage;
  the *Rock* figures are `ConditionsReadings.model`'s, always `THERMAL_MODEL`. They
  usually agree and must never be assumed to — `sharedSource` names one model only when
  every group came from it. Three more rules it carries: **a temperature interval goes
  through `cToFDelta`, never `formatTempF`** (a 2 °C dew-point margin is 4 °F, not 36);
  **rock figures and the caveats' mechanism appear only while the gauges they explain are
  on screen**, so nothing is explained ahead of the alerts gate; and **a group with some
  figures dashes its gaps while a group with none is omitted**. The mechanism sentences
  live there too, and `ROCK_TEMPERATURE_MECHANISM` is required wherever a modelled rock
  temperature prints — it is the most instrument-looking number on the screen and nothing
  measures it.
- **The number waits for the alerts query, and `summarizeReadings` is where it waits.**
  `severeAlertEvent: null` cannot tell "no alert" from "not answered yet", so
  `alertsPending` travels beside it and suppresses the score on its own. A surface that
  gated the score itself was one edit away from forgetting to (defect class 7); the
  readings are not suppressed and do not wait.
- **Severe+ suppression drops the *number* and keeps the readings** — the reverse of what
  the five-component rule did, and deliberately. The words are the same fact the warning is
  about and now come from physics that sees heat; the number is the part that reads as
  actionable, and *"safety stays out of the number"* is carried on a surface by removing it.
  A surface must not reach past `ReadingsSummary.score === null` for the raw figure.
- **Two sentinels, and they say different things.** `NOT_A_CRAG_READINGS`
  (`not_a_climbing_location`) is a choice the reader made; `READINGS_UNAVAILABLE`
  (`model_unavailable`) is a gap. Both live beside `toConditionsReadings` so no two callers
  can word them differently.
- **An absent `readings` field is not an unavailable reason.** `ConditionsScore.readings`
  is optional because the API and the client deploy separately; a client that turns its
  absence into `model_unavailable` blames the forecast model for our own release ordering.
  It renders nothing instead.
- **`collect-runs` stores trailing hours for `THERMAL_MODEL` only.** `T_mass` needs ~96 h
  of history that `weather_run_hours`' 2-day retention does not hold, so that one model is
  fetched with `past_days` in its own request and the other five without. Asking for all
  six was measured at **+71% on the largest table in a 512 MB database already at 239 MB**
  — the table whose growth caused the `could not extend file` outage. Adding a model to
  the trailing fetch is a storage decision, not a configuration one; check
  `check:runs-storage` first. **Those past hours are the model's own analysis, not
  observations**, and nothing may present them as measurements.
- **Every input to a per-day score must be read for that day, and the drying clock is one**
  **of them.** `computeLiveForecast` calls `dryingModel` inside the day loop, against the
  events `rainfallEventsThrough` says that day is entitled to see: measured history up to
  and including today, forecast rain after it, nothing dated later than the day being
  scored. Including a later day resets the clock from rain that has not fallen yet.
  `asOf` advances at the same local time of day, so **day 0 is exactly `now` and today
  never moves** — that is the property that made issue #108 safe to ship. Do not 'advance'
  the figure by adding hours: rain in the forecast resets it, and the 720-hour sentinel
  means *unmeasured*, so arithmetic on it manufactures a reading (issue #34).
  **Two inputs are still knowingly today-only** — `currentWindKmh` and
  `currentHumidityPct`, which stretch `maxDry` rather than fill it. They are one field
  away from the humidity *component*, so per-day is a `ScoreInput` split, not an edit.
- **The drying ramp curves upward and its exponent may never drop to 1 or below.**
  `RAMP_EXPONENT` (`conditionsScore.ts`) awards points *slowly at first*, because rock
  strength returns late rather than early — so `1` restores the bug issue #137 fixed and
  anything below `1` inverts it into something worse. The number itself is a **judgement
  call and is labelled as one**: nobody has measured a drying curve for any climbing rock,
  and changing it needs an argument, not a commit message. Its endpoints are fixed — 0 at 0
  hours, 40 at `maxDry` — and the `maxDry` ceiling is a **separate lever**, pinned to
  `dryingModel`'s `estimated_dry` by a cross-module test. Moving full marks later means
  moving `MAX_HOURS` in both modules, not bending the ramp past its end.
- **There is one drying table, `MIN_HOURS`/`MAX_HOURS` in `dryingModel.ts`, and everything
  imports it** — `conditionsScore`, `hourlyConditions`, `climbabilityHistory` and
  `compareScoring` each kept a hand-matched copy until the §7 taxonomy (27 rock types,
  2026-09-23) made that untenable. Do not reintroduce a copy. **Not-recorded kinds
  (`sandstone`, `limestone`, `basalt`) take their family's slowest window and `unknown`
  is the slowest row**; a new rock type that undercuts `unknown` breaks that rule.
- **A known crag's rock type is locked, and `resolveRockType`
  (`lib/locations/resolveRockType.ts`) is the only place it is applied** on save —
  `npm run locations:lock-known-crags` applies the same function to existing rows. It
  overrides whatever rock type the request sent, and never types a non-climbing location.
  `PATCH /locations/:id` goes through it (`planLocationUpdate`) and refuses a rock-type
  change on a row with `known_crag` set with a 409. **A `KNOWN_CRAGS` entry needs a `crag-facts.json` family
  that maps to exactly one §7 value, and a box no larger than ~30 km** —
  `knownCrags.test.ts` enforces both, and holds the neighbouring crags on other rock
  that set `KNOWN_CRAG_REACH_KM` at 2. **Run the lock script only after the API that knows
  the new types has deployed** — an older API has no window for them.
- **`PATCH /locations/:id` speaks climbers' wall angle; the column keeps its own.** The
  body's `wall_angle_deg` is degrees past vertical, positive overhanging
  (`climbing-terminology-research.md` §5); `cliff_angle` stays 0 vertical, 90 slab, and
  is extended past vertical with negatives. `wallAngle.ts` (`packages/types`) is the only
  place the sign flips. **An unknown body key is a 400, never ignored** — `cliff_angle`
  sent by mistake would otherwise be a 200 on an unchanged row. The rules are
  `lib/locations/updateLocation.ts`; `check:edit-location` runs them against Postgres.
- **The solar geometry runs only on a recorded wall.** `scoringLocationFor`
  (`lib/runs/scoringLocation.ts`) is the one place a row becomes `ScoringLocation`, and it
  builds `wall` only when **both** `aspect` (one of the 16 compass points) and
  `cliff_angle` were recorded. The 45° default feeds the drying window and is **never** a
  recorded wall; `aspectToDegrees`'s 180 fallback is never a recorded aspect. With a wall,
  `rockThermal.wallIrradianceWm2` replaces the unscaled horizontal value (sun position,
  Erbs beam/diffuse split, isotropic sky) and every computed hour is qualified; the sun is
  taken **mid-hour**, because Open-Meteo stamps shortwave at the end of the hour it averages.
  Terrain shading is not modelled and reads a shaded wall hotter — the safe direction.
  **An overhang dries on the vertical factor** (`dryingAngleFactor`), not faster.
- **Every component ramp reaches 0 at the edge of its own band — no component may step.**
  The temperature ramp paid 6 of 12 at `TEMP_BAND_C.max` and the out-of-band branch then
  dropped it to 0, so 95.0 °F and 95.2 °F differed by six points of the total (issue #148),
  from a fifth of a degree no forecast resolves. A step is worse than a wrong slope: two runs
  of the same model an hour apart move a location across a band with no change in the
  weather, and every mechanism that makes a zero matter more amplifies it — measured in
  `compare:scoring`, the same tenth cost 22 points under a geometric mean and 33 under a veto.
  `conditionsScore.test.ts` walks the temperature axis in tenths **past both edges** and
  asserts no tenth moves the component by more than the 1 point rounding forces; a new
  component, or a new band, gets the same walk. Widening a band instead of fixing a slope is
  the other lever and it is **not** free — `TEMP_BAND_C` also drives the client's
  temperature chart, and nobody has measured where the top of that band belongs
  (`scoring-findings.md` §4).
- **Every degradation path in the scorer inflates, and that is one defect wearing three
  hats** (issues #21, #32, #34). A missing rainfall fetch is full drying credit; a missing
  today-row is full wind and humidity credit; brutal heat maxes out four of five components.
  Any change to the score starts from *"what does this say when the inputs are missing"*,
  never from re-weighting a component. See `scoring-findings.md` §6c.
- **`insertGeneralLocation` (`lib/locations/createLocation.ts`) is the one write behind `POST /locations`.** The climbing flag (`is_climbing_location`) is always **explicit, never inferred** — see `miniapp-design-v1.md` §12. The `/add` picker's result subtitle is `placeSubtitle` (`packages/types/geocodeCopy.ts`), which has exactly one implementation so the issue #82 fix cannot drift into two.
- The credential must travel in `Authorization`. The CORS layer in `index.ts` allows only `Content-Type, Authorization`, so a custom header fails browser preflight.
- Route error/validation helpers live in `apps/api/src/lib/http.ts`. Handlers validate `uuid` route params with `isUuid` (return 404, not a Postgres 500) and funnel caught errors through `sendServerError` — never hand-roll `err.message` into the response, which leaks DB internals. `sendServerError` logs through `describeError`, which reads only known-safe fields; never widen it to serialise an error object wholesale, because driver errors can carry the connection string.
- **All four ensemble models are pooled, and `model_sources` names the ones actually read.** `parseEnsemble` collects members for every suffix in `ENSEMBLE_MODEL_SUFFIXES` — 143 members live (GFS 30, ECMWF 50, ICON 39, GEM 20, plus one control run each) against 30 when it filtered to GFS alone. Attribution is derived from the models that actually yielded arrays, so a partial upstream response drops a model rather than claiming it. Members are pooled **unweighted**, so a model counts in proportion to how many members it runs; equal-weighting the four would need a documented reason to override that.
- **A deterministic multi-model response only labels its columns while more than one model has coverage.** Measured 2026-08-31: `models=gfs_seamless,ncep_hrrr_conus` at a point HRRR does not reach answers **200** with a bare `temperature_2m` — HRRR silently dropped, the survivor unlabelled — while HRRR alone there is a 400. `parseDeterministicHourly` therefore trusts a bare column **only when exactly one model was requested**, and otherwise reports `ambiguous` so `fetchDeterministicHourly` re-asks one model at a time. Attributing that series by request order would name the wrong model on every column.
- **`precipitation_probability` is not necessarily the selected model's own field, and which models share it is derived, not listed.** `markSharedProbability` flags every model whose series is byte-identical to another's in the same response — live at Red Rock that is GFS, HRRR and NBM together. A column a renderer heads with a model name must have `probability_is_shared` false; the flag reaches the database as `weather_runs.precip_prob_is_shared`, where **null means the question does not apply** (an ensemble run), not "no". **No surface renders that column today** — the `members_wet / member_count` proportion answers the same question and needs no caveat. The field is still fetched, still stored and still flagged; the rule above governs the next renderer that wants it, and is not a description of one that exists.
- **`parseEnsemble` returns `by_model` as well as the pooled days**, both through the same `computeDays` reduction so the two can never drift. A model that yielded precipitation members but not all six variables is named in `partial_models` rather than given a row — `computeDays`'s 0/50 fallbacks are correct for the pooled case and would be a fabricated 0 °C high under one model's name.
- **`weather_run_hours` and `weather_ensemble_hours` key off `run_id`, not `location_id`.** They are unreachable by `DEPENDENT_TABLES` in `deleteLocation.ts` — the loop dereferences `table.location_id`, so adding them would not compile — and deleting `weather_runs` while they still reference it is a foreign-key violation surfacing as a generic 500. `deleteLocationCascade` therefore has a **bespoke step ordered before** the loop, and `pruneWeatherRuns` has the identical constraint: children first, driven by a subquery over the parent rows being pruned. The hours' own `valid_at` is a **forecast** time that runs into the future, so pruning them by it would delete tomorrow and keep last fortnight.
- **Only the ensemble run stores `raw`.** Every deterministic variable requested has a column on `weather_run_hours`, so its parsed rows are the whole payload, and one response covering six models would otherwise be stored six times to preserve nothing. Retention is **2 days parsed / 6h raw** (`pruneRuns.ts`), so there is effectively no run-to-run trend history — an accepted cost, not a bug, and nothing renders it. **Cut from 14 days on 2026-09-10 because 14 never fitted:** Neon's free tier caps a project at 512 MB and production hit it, at which point every write failed with `could not extend file` while `latestRuns` logged a warning and rendered anyway. Raising it again needs a paid plan or fewer stored hours per run — it is a capacity limit, not a preference. The arithmetic is in `pruneRuns.ts`.
- **`gem_seamless`'s shortwave is ~3× too high past day 4 — do not pool irradiance across
  models** (issue #155). 2847 W/m² against GFS's 946 at the same hour, measured 2026-09-21, where
  the physical surface maximum is near 1100. It tracks the model's own hourly-to-3-hourly output
  cadence, so **a short fetch looks perfectly normal** and only a multi-day one exposes it. GFS,
  ECMWF and ICON agree. A mean across the four carries the error at half weight; pick a model.
- **`shortwave_wm2` has three states and a reader must keep all three apart: a number, 0, and
  null.** 0 W/m² is night — a measurement — and null is an hour the model did not answer for.
  They are not interchangeable, and the gap is routine rather than theoretical: measured live at
  Red Rock on 2026-09-21, NBM returned 42 hours of shortwave against 48 of temperature, so the
  series runs out **mid-row on a model that answered everything else**. The v2 model's
  `T_surface` is fully defined for a night hour and **null** for an unmeasured one; a `?? 0`
  anywhere on this path reads an unmeasured wall as a wall in darkness. It is stored on
  `weather_run_hours` and carried on `HourlyPoint`/`RunHour`; it is deliberately **not** on the
  `/hourly` response yet, because no client reads it.
- **An hour with no values at all is not stored.** Open-Meteo pads every model's arrays to the longest horizon in the request, so a 54h HRRR run arrives with 330 empty trailing hours; an absent row and an all-null row mean the same thing to a reader. A row that *is* stored keeps its nulls as nulls — `0 mb` is what NBM's pressure would become otherwise, at every point measured.
- **"This model does not reach this day" is decided on the *values*, not on rows being absent.** The padding above means a model past its own horizon returns real rows full of nulls — measured live, `ncep_hrrr_conus` returns 168 hours of which 66 carry temperature. Whatever makes that call must **exclude `precip_prob_pct`**: that series runs past the horizon of the model it was requested with, so it cannot be the evidence that the model answered.
- **A precipitation percentile does not add up, and the ensemble stores a mean because of it.** `precip_mm_mean` on `weather_ensemble_hours` is the only precipitation figure that can be summed — the mean of the members' daily totals *is* the total of the hourly means, whereas a sum of hourly p50s is the median of nothing. A step or day total comes from that column. Printing summed percentiles as a step total would show three to twelve times the rain.
- **A precipitation percentile may be *drawn* for one hour; it may never be *added*.** `GET /hourly/:id` carries `precip_mm_p10`/`precip_mm_p90` beside the mean so a chart can shade how much the members disagree about a single hour. The no-summing rule above is unchanged and is what the two are for: a band or a whisker on one mark, never a step total, a day total or a header figure. `precip_mm_mean` remains the only precipitation figure that can be added up, and the mean routinely sits **outside** p10-p90 — nine members dry and one wet puts both percentiles at 0 with a non-zero mean, which is the disagreement worth drawing rather than a fault.
- **A client reads an absent column as a gap, and `=== null` does not do that.** The API and the client deploy separately, so every release that adds a field has a window where the client is new and the response is not: the column is simply missing, and `undefined` passes every `=== null` guard. Found in production on the rain whiskers, which stroked `y1="NaN"` — no thrown error, no browser warning, marks silently absent from a chart that believed it had drawn them. Normalise with `?? null` where a response is turned into marks (`apps/miniapp/src/components/charts/hourlySeries.ts`, `toDatum`), not at each of the guards downstream.

- **The chance of rain is `members_wet / member_count`, never `precipitation_probability`.** The wet count is members at or above `MEASURABLE_PRECIP_MM` (0.1 mm, Open-Meteo's own resolution), computed in `parseEnsembleHourly`. `members_wet` is **nullable in the database and null means unknown** — a row from before the column existed withholds the probability rather than reporting 0%.
- **Hourly precipitation is stamped at the end of the hour it fell in, so a mark owns the hour *before* its timestamp.** A rain bar at 02:00 describes 01:00-02:00. An instantaneous reading does not follow that rule and is centred on its timestamp instead; `Series.tsx` has one helper per convention (`accumulationLeft`, `instantLeft`) so the choice is made explicitly rather than inherited.
- **A panel reads a stored run when one is fresher than `RUN_MAX_AGE_MINUTES`, and prints its age.** `lib/runs/latestRuns.ts` fetches and writes back only when there is none — a six-model fetch per request would blow the function's `maxDuration`. The write-back is **best effort**: a response built from real upstream data must not fail because the row could not be stored.
- **`/api/cron/collect-runs` and `/api/cron/prune-runs`** carry the scheduled run work, gated on `CRON_SECRET` through the shared `cronGateFailed`, with `Promise.allSettled` across locations.
- **The model key suffix is not the model name and cannot be derived from it** (`gfs_seamless` → `_ncep_gefs_seamless`, `ecmwf_ifs025` → `_ecmwf_ifs025_ensemble`). `ENSEMBLE_MODEL_SUFFIXES` is the mapping; adding a model to `ENSEMBLE_MODELS` without adding it there means it is fetched and silently ignored — the exact failure that stood for months.
- **A control run is a member.** `precipitation_<model>` with no `_memberNN` is the model's unperturbed forecast. The old filter matched the literal `_member` prefix and dropped all four.
- **`temp_c_max`, `temp_c_min` and `wind_kmh_max` are the ensemble *median* of each member's own daily extreme — never a global `Math.max`.** A global max is the hottest hour of the hottest member: on 2026-08-26 it put **102 °F** on screen for Red Rock under the label "High" while the 143-member median said **99 °F**, and it can only get worse as members are added. Reach for `ensembleMedian`, not `Math.max`, for anything a user reads as a forecast. `humidity_pct`, `dewpoint_c` and `shortwave_wm2` stay means across all member-hours, which is already a central estimate.
- **`fetchRecentHourlyPrecip` returns a forecast tail, and anything that draws it must cut that off.** The call sets `forecast_days=1` deliberately, so the newest hours in the series have not happened. `GET /recent-precip/:locationId` passes the result through `trimToObservedHours` (`lib/weather/recentPrecipWindow.ts`) before answering, because a chart captioned "recent rain" drawing a prediction is an unbacked claim, not a rounding error. The cut is at the location's own clock, from the response's `utc_offset_seconds`; an hour stamped `T` covers `T-1h` to `T` and so is kept when `T` is now.
- **A window's caption is measured, not requested.** The route asks for five days; Open-Meteo returns what it has and the trim removes the future end. A surface saying "past 5 days" — or "no rain in the past 5 days" — must derive that span from the timestamps it received. `RecentPrecip.from_date` exists so a miss reads as "none in this window" rather than "none ever".

- **Every Open-Meteo call sets `timezone=auto`, and "today" is the *location's* local day** (issue #33). Daily buckets are the location's own calendar days and the response's `utc_offset_seconds` is carried out on `OpenMeteoResult`. `auto` rather than the stored `locations.timezone`: it needs no timezone database in-process and it is the only option that also works for `GET /preview`, which has no saved row.
- **`computeLiveForecast` returns `todayStr` and every caller uses it.** No route may derive its own date — `/forecast`, `/conditions` and `/preview` each used to compute `new Date().toISOString().slice(0, 10)` independently. Use `localDateString(now, offset)`, which shifts the epoch and reads the UTC date of the shifted instant, exactly as Open-Meteo bucketed the series. A non-finite offset degrades to UTC rather than producing `Invalid Date`.
- **The server marks the today row; the client never computes it.** `ForecastSnapshot.is_today` is set in `computeLiveForecast`. The old design had the API and the client each derive a UTC date and compare it to UTC buckets — **both wrong in the same direction, so they agreed with each other and nothing could detect it**, and in the Americas today's high became tomorrow's every afternoon. `is_today` is optional on the type only for a response cached from before the fix: **a missing value is unknown, not `false`**.
- **External APIs are proxied, never called from the client.** `GET /api/v1/geocode` (Open-Meteo place search) and `GET /api/v1/radar/frames` follow this: the fetch lives in `src/lib/weather/`, wrapped in the shared `fetchWithRetry`, and the route is a thin pass-through returning `{ data, error, status }`. A client calling a third-party API directly bypasses the retry policy and the response contract both.
- `GET /api/v1/preview?lat=&lon=&elevation=` serves weather for a location that has **no row and no UUID** — the add flow's pre-save step. It runs `computeLiveForecast` over a synthetic `LiveForecastLocation` and **persists nothing**; `location.id` is the placeholder `"preview"`, used only for log lines and synthesized snapshot ids. It deliberately returns no conditions score: nothing has been classified as a climbing location yet.

## Operator Scripts
- One-off and verification scripts live in `apps/api/src/scripts/`, are plain TypeScript run with `tsx`, and are exposed as npm scripts (`db:seed`, `check:add-location`). They are the only place `console` is used instead of the logger — their output *is* the result.
- **Acceptance scripts exist because the test suite cannot reach the database.** Vitest mocks `fetch` and never connects, so FK violations, values that fail to persist, and constraint errors never surface there. A flow whose failures only appear against real Postgres gets a `check:*` script; see `checkAddLocationApi.ts`.
- Such a script must be safe to run against production data: create rows under an obvious prefix, clean up in a `finally` block even when a step fails, and say so loudly if cleanup did not work.
- Defer runtime imports of `../db/index.js` inside the entry function. It throws at import time when `DATABASE_URL` is unset, which pre-empts any friendlier message with a stack trace.

## Auth Pattern
- **`/api/v1/*` is gated by `requireApiAuth`** (`middleware/apiAuth.ts`), which accepts two schemes on the one `Authorization` header and nothing else. Vercel's production alias is reachable without a Vercel login, so this gate is what holds the door shut — do not move it to Vercel. `/api/cron/*` keeps its own `CRON_SECRET` auth outside it.
- **`requireApiAuth` is the only setter of `req.userId` anywhere in the app**, from the presented credential: `Session <token>` → the token's subject; `Bearer <API_SHARED_SECRET>` → `DEFAULT_USER_ID`. It owns the `Request` type augmentation. An unset `API_SHARED_SECRET` or `AUTH_TOKEN_SECRET` is a 503 under both schemes.
- **A router mounted outside `/api/v1` reads `req.userId` as `undefined`** through a type that says it cannot be (defect class 8) — no type error, no test failure, just a route that finds nothing. Mount inside the gate or bring your own identity.
- Route handlers always use `req.userId`. Never reference `DEFAULT_USER_ID` directly in routes.
- **No Clerk and no self-serve signup.** `npm run user:add` is how an account comes to exist, and it is an operator action.
- **Two honest limits, and they are design rather than debt.** There is **no rate limiting** on `POST /api/v1/auth/login` — no Redis, no store for counters — so scrypt's cost plus a fixed failure delay is the whole defence and passphrase strength is the real control. There is **no token revocation** — no session table — so rotating `AUTH_TOKEN_SECRET` invalidates every token at once and is the only lever. Do not describe either as stronger than it is.
- **The token is not a JWT, deliberately**: HMAC-SHA256 over a base64url payload, one algorithm, no `alg` field to confuse and no `alg:none` to reject. `lib/auth/token.ts` is pure and returns a discriminated result; it signs and verifies over the raw payload *string*, never over re-serialised claims, because `JSON.stringify` of parsed claims does not reproduce the bytes that were signed.
- **An unknown username costs the same scrypt derivation as a known one** (`dummyPasswordHash`). Returning early on a miss is a username oracle worth tens of milliseconds over the network.
- **`POST /api/v1/auth/login` is mounted *above* the gate** — you cannot present a token in order to obtain one. Express matches in registration order, so the handler must *respond* rather than call `next()`; an unmatched path under `/api/v1/auth` then falls through to the gate and 401s, which is the behaviour you want.
- **CORS is an allowlist, not `*`** — `lib/cors.ts`, overridden outright by `CORS_ALLOWED_ORIGINS`. One `*` may stand for a single host label (`https://*.vercel.app`) so a preview deployment is reachable; the label is matched against `[a-z0-9-]+` rather than "anything but a dot", because a suffix match is satisfied by `https://evil.com/x.vercel.app`.

## Database Rules
- All queries go through Drizzle (`apps/api/src/db/schema.ts` is the single source of truth). No raw SQL unless Drizzle cannot express it.
- **No FK in the schema declares `onDelete`**, so Postgres refuses to delete any row another table still references. Deletes therefore clear their dependents explicitly, in one transaction: `DELETE /locations/:id` goes through `deleteLocationCascade` (`src/lib/locations/deleteLocation.ts`), which walks `DEPENDENT_TABLES`. **Adding a table with a `location_id` FK means adding it to that list** — omit it and delete becomes a foreign-key violation surfacing as a generic 500, and only once real data exists. Do not "fix" this by adding cascades to the schema without deciding what it means for every other delete.
- **`DELETE /trips/:tripId` clears `trip_locations` and deletes the trip in one transaction**, the same shape as `deleteLocationCascade`. Covered by `npm run check:delete-trip` — the failure is a Postgres constraint error and the vitest suite cannot see it.
- **A new table with a `trip_id` FK gets cleared in that handler too**, exactly as a `location_id` FK gets added to `DEPENDENT_TABLES`. `trip_locations` is currently the only one.
- **`weather_alerts.notified_at` is dormant.** Nothing writes it and null means *"never asked"*, not "not yet sent". The column is kept for whatever notification channel replaces the deleted bot; do not read it as live state.

## State Machine: Forecast Window
- `>14 days out`: climatological normals only, no conditions score
- `7-14 days out`: low-confidence ensemble, score shown with low confidence label
- `<7 days out`: full conditions score active, p10/p90 bands shown

## Background Jobs

Nothing runs on an in-process schedule. Scoring and recent rainfall are computed live per request (`computeLiveForecast`); scheduled work is `/api/cron/*` on cron-job.org. The patterns are in the `background-work` skill.

- **`/api/cron/check-alerts` collects and never delivers.** The product has **no notification channel**: NWS Severe+ warnings are stored, suppress scores, are visible in the app, and reach nobody. That is the owner's parked-alerts decision. **Keep the schedule registered** — a stale alert table is worse than a quiet one, because Severe+ rows suppress scores. Do not build a channel without asking.
- **Any per-location loop that makes an upstream call runs under `Promise.allSettled`, never sequentially.** `fetchWithRetry` sleeps 1s + 2s + 4s across its attempts, so a serial loop multiplies an upstream outage by the number of locations and walks straight into the function's `maxDuration: 60`.
- A handler that touches the DB across more than one operation must be safe to run concurrently and to retry — no duplicate data.

## Client — the web app

The client's own patterns are in the `miniapp-patterns` skill, which loads when you touch
`apps/miniapp/**` or `packages/design/**`. These constrain the **API**:

- **A score reaches a snapshot only because the route passed a merge argument, and that is
  the whole protection.** `GET /forecast/:id` hands `toWindowedForecast` a `ScoreMerge` only
  when `is_climbing_location`; `GET /preview` never does. There is no `is_climbing_location`
  check downstream to forget, because a city's rows simply have no score fields on them —
  drive off their absence, never off `score === null`. `computeLiveForecast` does not branch
  on the flag and will score Chicago if asked.
- **Three states, not two: scored, outside the window, and withheld.** `score: null` with no
  `unavailable_reason` means the date is beyond the scoring window. `score: null` **with**
  one means an input could not be measured and the day is deliberately unscored.
  `ScoreUnavailableReason` (`packages/types/conditionsCopy.ts`) is the single named union —
  it was a literal in seven places, which is how `liveForecast`'s generic catch came to
  return `scores: []` with no reason at all and render a thrown error as "nothing to say".
  `scoreUnavailableLine` switches exhaustively, so a new member will not compile without
  copy of its own.
- **The per-day score join is on `forecast_date`, never array position.** `scores` and
  `snapshots` are built by different paths in `computeLiveForecast`; positional alignment
  holds until the first day one side drops and then misattributes every score after it while
  still looking plausible.
- **An input that could not be measured withholds the score; it never scores as a favourable
  value** (issue #34). `computeLiveForecast` returns `scores: []` plus
  `scoreUnavailable: 'rainfall_unavailable'` when the rainfall lookup *failed*. A genuinely
  empty result still scores.
