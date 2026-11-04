---
paths:
  - "apps/api/src/lib/trips/**"
  - "apps/api/src/lib/weather/ensembleOutlook.ts"
  - "apps/api/src/routes/{trips,cron}.ts"
  - "packages/types/src/trip*.ts"
  - "apps/api/src/scripts/check{EditTrip,RecordTrips,DeleteTrip}.ts"
  - "apps/api/src/db/schema.ts"
  - "apps/miniapp/src/**/*{Trip,trip}*"
---

# Trips

Trip outlooks, recorded trends, editing, and the ended-trip summary.

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
  answered**: nulls over a good hour would read as "no rain". The one exception is
  `members_rewet`/`rewet_member_count`, a stricter rain chance read from the stored
  ensemble run after the other sources and shown on no screen: its failure nulls only its
  pair. **Before any screen reads it**, it needs the outcome comparison in
  `scoring-findings.md` §6e, and its nulls must then withhold, never read as dry.
- **A trip's own climbing hours** (`trips.climb_first_hour`/`climb_last_hour`, both null or
  both set, `lib/trips/tripClimbHours.ts`, #401) replace the owner's Profile hours for that
  trip only. The trip screen sends them to `/hourly` as `climbFirst`/`climbLast`; the
  temperature range stays Profile's. The recorder scores each trip date under the hours of
  the trip covering it, or under Profile hours when two trips covering one date disagree,
  since the record is per location and day. Changing them keeps `trip_rain_records`.
- **`trip_rain_records` is keyed per trip**: `(trip_id, location_id, recorded_at)`, because a
  rain total is summed over one trip's dates. The recorder builds it with `tripRainRows`
  from the same `summarizeTripOutlook` the forecast route answers with, in one transaction
  with the day records; a trip with no day in the horizon writes no point. `DELETE
  /trips/:tripId` clears it by `trip_id`; `location_id` is on `DEPENDENT_TABLES`. `GET
  /trips/:tripId/trend` returns its points per trip location, oldest first, 404 for another
  account's trip.
- **The trend's `days` are each trip date's first and latest `trip_day_records` that carried
  weather** (`tripDayTrends`, `lib/trips/tripSummary.ts`), not the scored pair the summary
  takes: the by-day view compares weather, and weather reaches 16 days. Optional on
  `TripTrend`, so a client reads its absence as an older API and withholds the view. **A
  first figure is drawn only beside a latest one** (`dayTrendMarks`), and one recording is
  one figure, never "no change".
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
- **A looked-back day carries the nearest airport gauge's rain** (`trip_day_gauges`,
  `lib/weather/asosGauge.ts`), one of two observations on an ended trip. `nearestGauge` picks
  from the committed `asosStations.ts` within `GAUGE_MAX_KM` (25 km), never a
  `STUCK_GAUGES` station, so Red Wing and every crag outside the US have none. The recorder
  writes it for each outcome day, **after its transaction and outside the
  every-source-answered rule**: a failure is logged and writes nothing, never a dry day. A
  day is summed in the station's own zone, and **any hour unreported withholds the total**
  (`rain_mm` null, counts kept); the screen then says "not every hour reported". The table
  is keyed by station with no FK, so the summary finds a crag's row by computing its station
  again, reads it in its own query, and treats a failure as no gauge. `TripDayLookBack.gauge`
  is optional; absent reads as null.
- **A looked-back day also carries the nearest volunteer gauge that reported**
  (`trip_day_volunteer_gauges`, `lib/weather/cocorahsGauge.ts`, #463), for crags whose airport
  gauge is far or stuck (Red Wing's is WI-PC-38, 6 km). The recorder reads the
  `VOLUNTEER_CANDIDATES` (3) nearest stations of the committed `cocorahsStations.ts`, picked
  by recent reports rather than listing, under the same after-the-transaction rule; the
  summary takes per day the nearest whose report stands for it (`reportForDay`), so two days
  can name two stations. **A report is one reading over the 24 hours before it, not a
  calendar day**: the screen prints its window (`7 am 29 Oct – 7 am 30 Oct`) and it never
  drives the drying clock. A skipped day is no line, never a dry one.
  `TripDayLookBack.volunteer_gauge` is optional; absent reads as null.
- **An ended trip's "How was it?" is a `feedback` row like any other** (2026-11-03;
  `checkInState`, `checkInPath`), with no trip id: the analysis joins it to the trip's
  records on crag and local date (`localDateAt`). The form attaches no app reading for a
  past day (`feedbackSnapshotFor`), and an earlier day's start time is blank, never a
  guessed hour saved as an observation (`firstStopTime`). `checked_in` counts the caller's
  checks resolved or not. Never offered for a city: the form lists crags only and would
  fall back to another.
- **`compare:trip-lead` reads what trips stored** (`apps/api`, read-only; its header says
  what it compares). Change a tile or a claim about lead time only on its gauge rows
  (airport or volunteer), with their `n` beside the number.
- **Ended trips are kept, folded away, never nudged toward deletion** (owner, 2026-11-03;
  `splitTrips`, `planAgainDraft` in `lib/trips.ts`): deleting a trip loses its look-back.
  Plan again leaves the dates empty, so a past pair is never reused by default.
- **The trip screen joins two sources on `local_date`, one per figure** (`lib/trips.ts`,
  `tripDayTiles`): score, Dryness and Friction from the crag's `/hourly` readings through
  `summarizeReadings`, as everywhere;
  high, low, chance and amount from the trip outlook for every day, so no tile mixes two
  sources for one figure. **Agreement** is `agreementShare` (`packages/types/tripCopy.ts`),
  the majority side of `members_wet` against the rest, withheld when either is unknown, and
  never called confidence. A trend point with `days_covered < trip_days` is drawn hollow, and
  a change chip compares only points that covered the same days.
