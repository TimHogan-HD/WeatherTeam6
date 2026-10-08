---
paths:
  - "apps/api/src/lib/{weather,runs,alerts}/**"
  - "apps/api/src/routes/{cron,forecast,recentPrecip,radar,geocode,alerts,hourly}.ts"
  - "apps/api/src/scripts/**"
  - "apps/api/src/db/schema.ts"
  - "apps/miniapp/src/components/charts/**"
  - "apps/miniapp/vercel.json"
---

# Weather fetches and stored runs

Upstream fetches, ensemble statistics, and how runs are stored, read and pruned. Part of the architecture rules, split out of `architecture.md` on 2026-10-08 so it
loads only when a matching file is read or edited. The global rules, and the index of every
scoped file, are in `architecture.md`. Reasoning behind a rule: grep
`.claude/docs/session-archive.md`.

## Weather fetches and stored runs

- **All four ensemble models are pooled, unweighted, and `model_sources` names only those
  that yielded arrays.** `ENSEMBLE_MODEL_SUFFIXES` maps model to key suffix — the suffix
  cannot be derived from the name, and a model added to `ENSEMBLE_MODELS` without it is
  silently ignored. A control run (no `_memberNN`) is a member.
- **`parseEnsemble` returns `by_model` beside the pooled days, through the same
  `computeDays`.** A model with precipitation but not all six variables goes in
  `partial_models`, never a row.
- **`temp_c_max`, `temp_c_min` and `wind_kmh_max` are the ensemble median of each member's
  own daily extreme — never a global `Math.max`.** Use `ensembleMedian` for anything read as
  a forecast. Humidity, dew point and shortwave stay means.
- **The chance of rain is `members_wet / member_count`, never `precipitation_probability`.**
  Wet is at or above `MEASURABLE_PRECIP_MM` (0.1 mm). `members_wet` null means unknown and
  withholds the probability.
- **A precipitation percentile may be drawn for one hour; it may never be added.**
  `precip_mm_mean` is the only precipitation figure that sums. p10/p90 shade one mark, never a
  step, day or header total; the mean often sits outside them, and that is not a fault.
- **Hourly precipitation is stamped at the end of its hour**, so a bar owns the hour before
  its timestamp; an instantaneous reading is centred. `Series.tsx` has `accumulationLeft` and
  `instantLeft` so the choice is explicit.
- **A deterministic multi-model response labels its columns only while more than one model
  has coverage.** `parseDeterministicHourly` trusts a bare column only when exactly one model
  was requested; otherwise it reports `ambiguous` and `fetchDeterministicHourly` re-asks one
  model at a time.
- **`precipitation_probability` may be shared between models; `markSharedProbability`
  derives which.** The flag reaches `weather_runs.precip_prob_is_shared`, where null means
  unknown. No surface renders the column; a renderer that does must have
  `probability_is_shared` false.
- **`shortwave_wm2` has three states: a number, 0 (night, a measurement) and null (no
  answer).** Never `?? 0` on this path. Not on the `/hourly` response yet.
- **`gem_seamless`'s shortwave is ~3× too high past day 4 — it never feeds irradiance**
  (#155). The other three may be pooled only on a measured gain (#212, `scoring.md`).
- **An hour with no values at all is not stored**; a stored row keeps its nulls. **"This
  model does not reach this day" is decided on values, not rows**, excluding
  `precip_prob_pct`.
- **Every Open-Meteo call sets `timezone=auto`; "today" is the location's local day** (#33).
  `computeLiveForecast` returns `todayStr` and every caller uses it; use
  `localDateString(now, offset)`. **The server marks `is_today`; the client never computes
  it** — a missing value is unknown, not `false`.
- **`fetchRecentHourlyPrecip` returns a forecast tail**; `GET /recent-precip/:locationId`
  cuts it with `trimToObservedHours` (`lib/weather/recentPrecipWindow.ts`). **A window's
  caption is measured, not requested** — derive the span from the timestamps received;
  `RecentPrecip.from_date` makes a miss read as "none in this window".
- **External APIs are proxied, never called from the client** — the fetch lives in
  `src/lib/weather/`, wrapped in `fetchWithRetry`, behind a thin route returning
  `{ data, error, status }` (`/geocode`, `/geocode/reverse`, `/radar/frames`).
- **Map tiles are the one exception** (owner decision 2026-10-02, Map tab).
  Public, keyless basemap tiles, glyphs and sprites (OpenFreeMap, `tiles.openfreemap.org`)
  and terrain tiles (AWS Open Data Terrarium, `s3.amazonaws.com`) load straight from the
  client; nothing but the viewport goes to them. `apps/miniapp/vercel.json`'s CSP names
  exactly those two hosts in `connect-src`, plus `blob:` for the map's workers and images.
  Any data source that is not a map tile — radar included, when it comes — still goes
  through the API.
- **There is no weather preview before saving** (owner decision 2026-09-30); `GET /preview`
  is deleted. `/add` picks a place, shows a save form, and Save opens the saved screen.
- **`GET /geocode/reverse` names a GPS fix** — Nominatim for the town (identifying
  User-Agent, two attempts, per its usage policy) and Open-Meteo for the terrain elevation,
  side by side. Either failing leaves its fields null; the client then falls back to
  "Current location" and no elevation. A known crag's name beats the town's. A phone's
  altitude is never used as elevation.
- **A stored run belongs to a place, not a location row.** `weather_runs.point_key` is
  `pointKeyForPlace` (`lib/runs/pointKey.ts`, the only spelling); `collectWeatherRuns` fetches
  each distinct place once. No `location_id` on `weather_runs`, so `deleteLocationCascade`
  does not touch runs.
- **`collect-runs` stores trailing hours for `THERMAL_MODEL` only**, and so does a panel
  that found nothing stored — both through `lib/runs/deterministicFetch.ts`, so a new crag
  is read with history at once (#176). `TRAILING_DAYS` (7) is measured by
  `compare:trailing-days`. They come from `past_days` in their own request that asks for all four global models so the rain median has
  history; the median rides on its hours as `rain_median_mm`. **Adding a model to the
  trailing fetch is a storage decision** — check `check:runs-storage` first. Those past hours
  are the model's analysis, not observations.
- **`collect-runs` fetches a model only when Open-Meteo published since our copy**
  (`lib/weather/modelMetadata.ts`, `MODEL_SOURCES`). Every doubt fetches, including a copy
  `REFETCH_BACKSTOP_MS` (6 h) old. Non-empty `staleMetadata` or `unreadableMetadata` means
  the mapping needs updating.
- **A panel reads the newest stored run per model, each with its own age** (#179).
  Freshness is `checked_at` (null reads as `fetched_at`). `lib/runs/latestRuns.ts` serves
  stored runs while any was checked inside `RUN_MAX_AGE_MINUTES`, keeps a model inside
  `STORED_MODEL_MAX_AGE_MINUTES`, and otherwise fetches live and writes back. Stored read and
  write-back are best effort. `HourlySeries.checked_at` is the freshness a screen prints.
- **The daily forecast is the stored ensemble run's own days** (`weather_runs.ensemble_daily`,
  read by `getEnsembleDaily`), not a second live fetch per request: `parseEnsemble`'s output
  from the request the hours came from, so the figures and the score cannot differ from a live
  fetch's. Under the rule above, **plus one: the run must start on the location's today** — a
  run fetched before local midnight reaches one day less far. A stored day with any gap fetches
  live; it never reaches the score as a number. Daily figures are **never rebuilt from
  `weather_ensemble_hours`** — the median of member maxima is not the max of hourly medians,
  and humidity is not stored there. `npm run check:forecast-stored` holds the round trip.
- **`weather_run_hours` and `weather_ensemble_hours` key off `run_id`**; `pruneWeatherRuns`
  and `deleteRunsForPoint` delete children first, driven by the parent rows. Never prune hours
  by their `valid_at`, which is a forecast time.
- **No run stores `raw`** (since 2026-09-29). **Retention is 2 days** (`pruneRuns.ts`) because
  Neon's free tier caps the project at 512 MB — a capacity limit, not a preference.
