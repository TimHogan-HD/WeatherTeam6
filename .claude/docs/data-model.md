# Data Model

**`apps/api/src/db/schema.ts` is the source of truth** for every column, type and constraint,
and its comments explain most of them. This file is the map: which tables exist, how they
hang together, and what the schema cannot show. Behaviour rules live in the scoped rule files
(`weather.md`, `trips.md`, `locations.md`).

## Tables (in dependency order)

```
users
invites                   -- owner-minted account links; POST /invites, /auth/redeem
login_attempts            -- the per-username sign-in cap; POST /auth/login
locations                 -- the hub: saved crags and weather spots
trips
trip_locations
trip_day_records          -- what the forecast said, per location; /api/cron/record-trips
trip_rain_records         -- trip totals for the trend, per trip; /api/cron/record-trips
trip_day_outcomes         -- how a day turned out; /api/cron/record-trips
trip_day_gauges           -- airport gauge per station and day (no FK); /api/cron/record-trips
trip_day_volunteer_gauges -- CoCoRaHS report per station (no FK); /api/cron/record-trips
feedback                  -- app feedback and forecast checks
route_ticks               -- logbook (OpenBeta ids, no FK)
route_todos               -- logbook (OpenBeta ids, no FK)
area_locations            -- recorded boulder positions, shared by every account
user_preferences
walls
weather_alerts            -- /api/cron/check-alerts
weather_runs              -- one fetch of one model at one place (point_key, no location_id); /api/cron/collect-runs
weather_run_hours         -- a deterministic run's hours, keyed off run_id
weather_ensemble_hours    -- an ensemble run's hours as percentiles, keyed off run_id
radar_rain_hours          -- observed rain per radar cell (no location_id); /api/cron/collect-radar
```

## Key relationships

- Everything a person owns traces back to `users.id`. The owner is the account
  `DEFAULT_USER_ID` names (`isOwner`).
- `locations` is the hub: trips, alerts, walls and the trip records all FK to it. No FK
  declares `onDelete`, so a new `location_id` FK goes on `DEPENDENT_TABLES`
  (`lib/locations/deleteLocation.ts`) and a new `trip_id` FK is cleared by `DELETE /trips/:tripId`.
- Weather storage hangs off a place, not a location row: `weather_runs.point_key`, and
  `radar_rain_hours.cell_key`. Deleting a location does not touch either.
- A user saves a crag by creating a `locations` row from the `/add` search (OpenBeta snapshots
  and Open-Meteo places).

## Notes the schema does not carry

- **`locations.cliff_angle` runs opposite to climbers:** 0 vertical, 90 flat slab, negative
  overhanging. The API speaks `wall_angle_deg = -cliff_angle` (`wallAngle.ts`).
- **`walls.angle_deg` is degrees from vertical**, and `aspect_deg` is the facing direction, 0-359.
- **`feedback.stops` is `ForecastStop[]`, the climber's word on each wall climbed**: area, wall,
  routes, hours, rock, sun, facing, angle and why it was shaded. It is the start of a per-wall
  record (#293, #398), read by nothing yet. `parseStops` validates it on write and on read, and
  `stopsGuidebookProblem` checks area, wall and route ids against the guidebook (no FK).
- **`feedback` is detached from a deleted location, and acted-on rows are resolved, not
  deleted**: a forecast check stays evidence for #143.
- **`trip_day_records` writes all or nothing per location, except the rewet pair**
  (`members_rewet`, `rewet_member_count`), which is null when its own read failed.
- **`trip_day_gauges` and `trip_day_volunteer_gauges` are written after the recorder's
  transaction**, so a failure loses the gauge line and never a trip record. Their readers find
  a row by computing the station again.
- **`login_attempts` holds one window at most**: each attempt prunes older rows and a success
  deletes its key's. **Nothing prunes `invites`**; it grows by a few rows a year.
- **`user_preferences`: only `temp_low_c`, `temp_high_c`, `default_tab` and the climbing hours
  are read.** The rest has no reader.

## Dropped tables

Migration 0040 (2026-11-03) dropped seven tables that nothing read or wrote, all empty on Neon:
`crags`, `rainfall_history`, `forecast_snapshots`, `crag_climbability_history`,
`conditions_reports`, `premium_pulls` and `location_normals`, with the `rainfall_source` enum.
Migration 0023 dropped `conditions_scores`. Forecasts and recent rain are computed live;
forecast checks live in `feedback`. Monthly normals or a climbable-days history would be a new
product decision and a new table, not a revival.
