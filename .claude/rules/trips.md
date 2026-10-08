---
paths:
  - "apps/api/src/lib/trips/**"
  - "apps/api/src/lib/weather/ensembleOutlook.ts"
  - "apps/api/src/routes/{trips,cron}.ts"
  - "packages/types/src/trip*.ts"
  - "apps/miniapp/src/**/*{Trip,trip}*"
---

# Trips

Trip outlooks, recorded trends, editing, and the ended-trip summary. Part of the architecture rules, split out of `architecture.md` on 2026-10-08 so it
loads only when a matching file is read or edited. The global rules, and the index of every
scoped file, are in `architecture.md`. Reasoning behind a rule: grep
`.claude/docs/session-archive.md`.

## Trips

- **Past the readings a trip day is weather only, from the 16-day outlook**
  (`lib/weather/ensembleOutlook.ts`): the ensemble API's per-member *daily* keys for the
  four `ENSEMBLE_MODELS`, fetched live per request and never stored. The ensemble rules
  in `weather.md` hold: highs and lows are `ensembleMedian` of each member's own extreme, the rain
  chance is `members_wet / member_count`, and every figure is over the members that
  reached that day, so `member_count` falls with distance and a day nobody reached is
  absent. **Days 0-6 on a trip screen come from `/hourly` readings, not the outlook**,
  which carries no score.
- **A trip's rain total sums each member's own days, then takes the spread**
  (`tripRainTotal`, `lib/trips/tripOutlook.ts`). A member counts only if it reached every
  covered day, and `days_covered` beside `trip_days` says when the total is not the whole
  trip. `GET /trips/:tripId/forecast` answers `days: null` for a location whose outlook
  failed, never `[]`.
- **`trip_day_records` is keyed per location, not per trip**: `(location_id, local_date,
  recorded_at)`, with `recorded_at` the cron firing's hour. Two trips to one crag share a
  record, a trip's dates can change without losing it, and a rerun inside the hour
  replaces its row. `POST /api/cron/record-trips` (`recordTripDays`) writes from the
  location's local today to the horizon; scores come from `getHourlySeries` under the
  location owner's range, with `scored_run_fetched_at` naming the stored run, and a
  non-crag records weather only. **A location writes nothing unless every source it needs
  answered**: nulls over a good hour would read as "no rain".
- **`trip_rain_records` is keyed per trip**: `(trip_id, location_id, recorded_at)`, because a
  rain total is summed over one trip's dates. The recorder builds it with `tripRainRows`
  from the same `summarizeTripOutlook` the forecast route answers with, in one transaction
  with the day records; a trip with no day in the horizon writes no point. `DELETE
  /trips/:tripId` clears it by `trip_id`; `location_id` is on `DEPENDENT_TABLES`. `GET
  /trips/:tripId/trend` returns its points per trip location, oldest first, 404 for another
  account's trip.
- **Editing a trip keeps its trend honest** (`PATCH /trips/:tripId`, `lib/trips/updateTrip.ts`,
  `check:edit-trip`). A change of either date deletes every `trip_rain_records` point for the
  trip, because each totalled other days; a removed crag takes only its own points. A rename
  keeps them, and the client sends only changed fields so a rename never resets anything.
  `trip_day_records` is per location and never touched. An unknown body key is a 400; another
  account's trip or crag is a 404.
- **An ended trip is read from storage, never forecast.** Once a trip's last day is behind
  the device's today (`tripIsOver`), its screen asks for no outlook, `/hourly` or alerts and
  reads `GET /trips/:tripId/summary`: per day, `trip_day_outcomes` (how it turned out) beside
  the first and last `trip_day_records` that carried a score (`tripDayLookBacks`). The
  recorder writes an outcome for each trip day 1 to `OUTCOME_DAYS` (3) local days behind,
  from `HourlyReadings.past_days`, and reads no trip that ended longer ago. "Turned out" is
  the model's analysis, not observations, and the screen says so once
  (`LOOK_BACK_SOURCE`). A past day's score is withheld unless every daytime hour's rock is
  known by the `rock_history` rule, so the walk's starting guess never scores a day.
- **The trip screen joins two sources on `local_date`, one per figure** (`lib/trips.ts`,
  `tripDayTiles`): score, Dryness and Friction from the crag's `/hourly` readings through
  `summarizeReadings` (alerts pending and Severe+ suppress the number, as everywhere);
  high, low, chance and amount from the trip outlook for every day, so no tile mixes two
  sources for one figure. **Agreement** is `agreementShare` (`packages/types/tripCopy.ts`),
  the majority side of `members_wet` against the rest, withheld when either is unknown, and
  never called confidence. A trend point with `days_covered < trip_days` is drawn hollow, and
  a change chip compares only points that covered the same days.
