# API Sources & Quirks

Read this before any weather fetch work. Every source has gotchas that will waste hours if not known upfront.

## Open-Meteo Ensemble
- **Endpoint:** `https://ensemble-api.open-meteo.com/v1/ensemble`
- **Models param:** `models=gfs_seamless,ecmwf_ifs025,icon_seamless_eps,gem_global`
- **Member key format:** `temperature_2m_member01_ncep_gefs_seamless`. The suffix varies by model and is **not the model name** — it cannot be derived from the `models` param. Verified live 2026-08-26: `gfs_seamless` → `_ncep_gefs_seamless`, `ecmwf_ifs025` → `_ecmwf_ifs025_ensemble`, `icon_seamless_eps` → `_icon_seamless_eps`, `gem_global` → `_gem_global_ensemble`. The mapping is `ENSEMBLE_MODEL_SUFFIXES` in `openMeteo.ts`; a model missing from it is fetched and silently ignored.
- **A control run has no `_memberNN`** — `temperature_2m_ncep_gefs_seamless` is the model's unperturbed forecast and counts as a member.
- ~~**31-member GFS** is the primary ensemble. ECMWF and ICON add spread context.~~ **Corrected 2026-08-26.** All four models are pooled unweighted: **143 members live** (GFS 30, ECMWF 50, ICON 39, GEM 20, plus one control each). Until that date the parser filtered every array to GFS, so the other three contributed nothing while being named as sources.
- **p10/p50/p90** must be computed from raw member arrays — the API does not return percentiles directly
- **A daily high is not `Math.max` over the payload.** That returns the hottest hour of the hottest member — 102 °F against a 143-member median of 99 °F on real data. Take each member's own daily extreme, then the median across members (`ensembleMedian`).
- **Defaults to `timezone=GMT` when the param is omitted.** Every call sets `timezone=auto`, so buckets are the location's own calendar days and the response carries `utc_offset_seconds` (issue #33). Requesting UTC — or relying on the default — made "today" roll over in the late afternoon anywhere in the Americas.
- **Without `forecast_days` the hourly response stops at 7 days** (168 hours, measured 2026-10-02). The stored run omits it, so nothing stored reaches past day 7.
- **The 16-day trip outlook is a separate daily call** (`lib/weather/ensembleOutlook.ts`, 2026-10-02): `daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=16`, same four models, same member-key suffixes and control-run naming as hourly. Members fall with distance as models run out: 143 for days 0–6, 103 from day 7 (ICON gone), 52 by day 15 (GFS and GEM only), measured at Red Wing. A model that only partly reaches a day returns null for it. Read live by `GET /trips/:tripId/forecast` and `/api/cron/record-trips`, never stored as hours.
- **Free tier:** 10,000 calls/day. ~~Do not poll per-user on demand — use the background job.~~ **There is no background job** — forecasts are computed live per request (`liveForecast.ts`). Since scoring Phase 5b only `GET /forecast/:id` runs `computeLiveForecast`; `GET /conditions/:id` reads the stored hourly runs, so one detail view is one ensemble call at most.
- **Rate limit:** No hard limit stated, but batch locations into a single call using `&latitude=x,y&longitude=a,b`

## Open-Meteo Forecast (Deterministic)
- **Endpoint:** `https://api.open-meteo.com/v1/forecast`
- **The models and variables actually requested are `DETERMINISTIC_MODELS` and
  `DETERMINISTIC_HOURLY_VARS` in `lib/weather/openMeteo.ts`** — six models in one call, not a
  separate call per model. This list used to be copied here and had drifted to naming models the
  code has never requested (`gfs_hrrr`, `ncep_nam_conus`), which is why it is now a pointer.
- **What each model actually carries, per point, is measured** — `.claude/docs/model-matrix.md`,
  regenerated with `npm run probe:models --workspace=apps/api`. Read it rather than the upstream
  docs: a variable a model does not define fails the **whole** request, not that column.
- **`shortwave_radiation` was added 2026-09-21** for the v2 scoring model's `T_surface`. All six
  models define it. **Its horizon is shorter than the model's**: NBM answered 42 hours of it
  against 48 of temperature at Red Rock, so nulls appear mid-series. 0 W/m² is night and null is
  unmeasured — they are different rows to the model that consumes them.
- **`sunshine_duration` was added 2026-11-03** for the Sun card and Daily's sun line: seconds of
  the preceding hour with direct sun ≥ 120 W/m². Probed at Taylors Falls that day: all six
  models answer it, with the shortwave horizon (NBM 52 h, HRRR 61 h of 192), and the ensemble
  endpoint defines it per member (not fetched). `compare:sky` scores it against USCRN.
- **`gem_seamless`'s shortwave is ~3× too high past day 4 and must not be trusted** — issue #155.
  Measured at San Juan on 2026-09-21: 2847 W/m² where GFS said 946 at the same hour, against a
  physical surface maximum near 1100. Days 1–3 are in family with the other models, day 4 is the
  transition, days 5–7 are a steady 3× — the signature of the model's own hourly-to-3-hourly
  output cadence. **A 2-day fetch looks perfectly normal**, which is why the first probe missed
  it. GFS, ECMWF and ICON agree with each other throughout. Anything deriving a surface
  temperature from irradiance picks a model rather than pooling, and treats a value above
  ~1400 W/m² as a gap rather than a reading. **The model picked is `gfs_seamless`** (v2
  Phase 1, 2026-09-21): global, in family with ECMWF and ICON throughout, and the longest
  shortwave horizon measured — 384 h at both probe points, against NBM's 42 h. The 1400 W/m²
  ceiling is enforced in `lib/scoring/rockThermal.ts`.
- **HRRR** only covers CONUS. Outside it, HRRR answers a 400 and **NBM answers a 200 whose body
  is not valid JSON** (`{"latitude":nan,…}`) — see the comment on `CONUS_DETERMINISTIC_MODELS`.

## Open-Meteo Historical
- **Endpoint:** `https://archive-api.open-meteo.com/v1/archive`
- Data lags ~5 days for full QC. For yesterday use IEM ASOS obs instead.
- **No runtime caller.** Only `compareDryness.ts` (an operator script) builds an archive URL;
  the app's `fetchArchivePrecip` had none and was deleted (#483).

## Nominatim (Reverse Geocoding a GPS Fix)
- **Endpoint:** `https://nominatim.openstreetmap.org/reverse?lat=&lon=&format=jsonv2&zoom=14&addressdetails=1`
- **Client:** `apps/api/src/lib/weather/reverseGeocode.ts`, proxied as `GET /api/v1/geocode/reverse?lat=&lon=`
- **No API key.** The usage policy requires an identifying `User-Agent`, at most 1 request/s,
  and no bulk use — one lookup per tap is well inside it. Two attempts, not four.
- **ODbL data: credit "© OpenStreetMap contributors" wherever anything it returned is shown** (the save form does) — and never as "place name" when the title is a known crag's.
- The name is the first of `address.city/town/village/hamlet/municipality`, then `name`.
  Measured 2026-09-30: downtown Minneapolis answers `name: "Downtown West"` with
  `address.city: "Minneapolis"`. Open water is a 200 with `{ error: "Unable to geocode" }`.

## Open-Meteo Elevation
- **Endpoint:** `https://api.open-meteo.com/v1/elevation?latitude=&longitude=` → `{ elevation: [m] }`
- Called beside Nominatim for a GPS fix, so the saved location gets the lapse-rate
  correction a geocoder result would. 211 m at Taylors Falls (2026-09-30).

## Open-Meteo Geocoding (Place-Name Search)
- **Endpoint:** `https://geocoding-api.open-meteo.com/v1/search?name=&count=&language=en&format=json`
- **Client:** `apps/api/src/lib/weather/geocode.ts`, proxied as `GET /api/v1/geocode?q=`
- **No API key.** Adds nothing to `.env.example`.
- Returns `elevation` alongside lat/lon — required, because `applyLapseRate` needs it and
  a bare coordinate entry cannot supply it. Persist it on save, or every reading misses
  the full lapse-rate correction.
- Also returns `timezone`, `admin1`, `country`. **`admin1` + `country` are not optional
  decoration:** `?name=Red Rock Canyon` returns three real places — a state park in
  Oklahoma (480 m), another in California (738 m), and the National Conservation Area in
  Nevada (1200 m). Rendering `name` alone makes the choice a coin flip, and picking wrong
  is silent: a real forecast for the wrong state.
- A no-match search is a **200 with the `results` key absent entirely**, not an empty
  array. A query under 2 characters always returns nothing, so it is short-circuited
  client-side before a request is spent.

## Open-Meteo Air Quality
**Not called.** Nothing in the code fetches air quality; smoke is an idea (#224). If it is
built: `https://air-quality-api.open-meteo.com/v1/air-quality`, variables `us_aqi,pm2_5,pm10`,
US AQI 0-50 Good, 51-100 Moderate, 101-150 Unhealthy for Sensitive Groups.

## IEM ASOS (Current Observations)
**Not called** (checked 2026-11-03): `fetchCurrentObs` in `lib/weather/iemAsos.ts` has no
caller. The notes below stand for whoever revives it.
- **Endpoint:** `https://mesonet.agron.iastate.edu/json/current.py?station={ID}&network={NETWORK}`
- **Staleness check:** Reject obs older than 90 minutes. Field: `utc_valid`
- **Station IDs matter:** Use `KMSN` not `MSN`. Always K-prefix for US ASOS.
- **Network format:** `WI_ASOS`, `MN_ASOS`, `IL_ASOS` — state code + `_ASOS`
- **Minnesota quirk:** Twin Cities metro uses `KSTP` (St Paul) for climbing areas, not `KMSP` (airport is too far from the bluffs)
- **Fields:** `tmpf` (temp F), `dwpf` (dewpoint F), `sknt` (wind knots), `p01i` (1h precip inches), `mslp` (sea level pressure mb), `relh` (relative humidity %)
- Convert wind knots → km/h: multiply by 1.852

## IEM ASOS archive (trip gauge days)
- **Endpoint:** `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station={ID}&data=p01i&...&tz=Etc/UTC&format=onlycomma&missing=M&trace=T&report_type=3` (`gaugeUrl`, `lib/weather/asosGauge.ts`). Keyless.
- **IDs here are bare** (`DLL`, not `KDLL`), unlike `current.py` above.
- **Routine reports only** (`report_type=3`): one at :5x each hour, covering the hour ending at the next :00. Specials would double-count.
- `M` is missing and leaves the hour unreported; `T` is a trace and adds nothing. A day with any hour unreported has no total.
- **Stations:** `npm run gauges:pull` regenerates `asosStations.ts` from `geojson/network/{ST}_ASOS.geojson`, keeping stations that are `online`, have no `archive_end`, and have `HAS_PHOUR`. 2,489 on 2026-11-03.
- **Stuck gauges:** RGK (Red Wing), TWM (Two Harbors) and BJC (Broomfield) read zero through real rain (`compare:rain-spread`); `STUCK_GAUGES` keeps them from standing for a crag. Red Wing has no other station within 25 km (SYN is 40).

## IEM CoCoRaHS archive (volunteer gauge reports, #463)
- **Endpoint:** `https://mesonet.agron.iastate.edu/api/1/daily.json?station={ID}&network={ST}_COCORAHS&year={Y}&month={M}` (`reportUrl`, `lib/weather/cocorahsGauge.ts`). Keyless. The network is the id's state prefix: `WI-PC-38` is `WI_COCORAHS`.
- **One report a day:** `date` is the day the gauge was read, `temp_hour` the local hour (7 for most; 2026-11-01 in Minnesota ranged 0-23), `precip` inches over the 24 hours before. A trace is `0.0001`, kept above zero (unlike an ASOS hour's `T`) since it is the day's one figure. A day not reported has `precip` null or no row.
- **Network-wide:** `?network={ST}_COCORAHS&date={YYYY-MM-DD}` returns every station's report for one day (~400 kB for Minnesota); the pull script uses it.
- **Stations:** `npm run volunteer-gauges:pull` regenerates `cocorahsStations.ts`: stations in `geojson/network/{ST}_COCORAHS.geojson` that reported on any of three sample days. IEM lists about five times as many as report (6,006 in Minnesota, ~1,050 reporting on 2026-11-01). 18,487 on 2026-11-03, 576 kB.
- **Read by:** the trip recorder (`trip_day_volunteer_gauges`), `compare:trip-lead` from what it stored, and `compare:dryness`'s volunteer table, live, at the three crags whose airport gauge is stuck (`-- VOLUNTEER`).

## NOAA ACIS
No longer called (deleted 2026-10-01 and 2026-11-03). A source line naming it is defect class 3.

## NWS Alerts
- **Endpoint:** `https://api.weather.gov/alerts/active?point={lat},{lon}`
- **Required header:** `User-Agent: weatherteam6/1.0 your@email.com` — requests without this get blocked
- **No API key required**
- **Response:** GeoJSON FeatureCollection. Each feature has `properties.event`, `properties.severity`, `properties.certainty`
- **Kept** (`nwsAlerts.ts`, `weather_alerts`): `headline`, `description`, `instruction`, `effective`, `expires`, `ends` (#482). `expires` is when the message lapses, often before the hazard does; `ends` is the hazard's end and null when NWS gives none. Only `ends` is ever printed as "until". `onset` is still dropped.
- **Alert tiers for climbing:** Watch → Advisory → Warning → Active, based on CAPE value in `properties.description` + `properties.event` string

## IEM NEXRAD radar (Map tab)
- **Newest frame:** `https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.json` — `meta.valid` is the US composite's valid time (5-minute steps). Fetched by the API (`lib/weather/iemRadar.ts`, `GET /radar/latest`).
- **Tiles for one frame:** `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-{YYYYMMDDHHMM}/{z}/{x}/{y}.png` (UTC stamp). Loaded straight from the browser (owner decision 2026-10-26); CORS `*`, cached 5 minutes. A frame not yet built answers 503.
- **Recent frames without a stamp:** `nexrad-n0q-900913` (latest) and `nexrad-n0q-900913-m05m` … `-m50m`. Their content moves under a fixed URL, so a label cannot be tied to them — use the stamped form.
- **Last hour of frames:** `https://mesonet.agron.iastate.edu/json/radar.py?operation=list&product=N0Q&radar=USCOMP&start={ISO}Z&end={ISO}Z` — `scans[].ts`, the frames IEM actually built. `GET /radar/layers` lists them from 55 minutes before the newest frame, never past it.
- **HRRR forecast reflectivity:** run from `/data/gis/images/4326/hrrr/refd_1080.json` (`model_init_utc`; read at 18 h, because IEM rewrites each frame's file as it draws it, so `refd_0000` can name a run not yet finished, and `refd_1440` and later come from an older 48 h run). Tiles `hrrr::REFD-F{minutes, 4 digits}-{run YYYYMMDDHHMM}`, every 15 minutes to 18 h; the app takes every 30 for six hours. Same colour ramp as N0Q (sampled 2026-11-10).
- **MRMS rain totals:** `/data/gis/images/4326/mrms/p24h.json` and `p72h.json` (`meta.start_valid`, `meta.end_valid`, hourly). Tiles `mrms::p24h-{end YYYYMMDDHHMM}` and `mrms::p72h-…`. **Radar only** (`RadarOnly_QPE_24H`, IEM `scripts/mrms/make_mrms_rasters.py`), not gauge-corrected. Index 255 is IEM's grey for no coverage, and no tile layer leaves it out; the colours per inch are pyIEM `mrms.make_colorramp()` through that script's mm-to-index encoding (`radarRainIn`).
- No key. US only. N0Q is ~1 km, so it holds up to about zoom 9–10 and upscales past that. Replaced RainViewer (whose free mosaic stops at zoom 7) on 2026-10-26.

## USGS Water Data (river gage height, 2026-11-09)
- **Endpoint:** `https://api.waterdata.usgs.gov/ogcapi/v0/collections/continuous/items` with `monitoring_location_id=USGS-<site>`, `parameter_code=00065` (gage height, ft), `time=<from>/<to>` (ISO interval), `properties=time,value,unit_of_measure`, `skipGeometry=true`. Values arrive as strings. Fetched by the API (`lib/weather/usgsRiver.ts`, `GET /river-gauges/:locationId`), live per request, 15 s budget.
- **Which gauges:** `RIVER_GAUGES` in `packages/types/src/riverGauges.ts`, keyed by known crag, each with the owner's line for one spot (Kettle River below Sandstone, `USGS-05336700`, Beach boulder at or below 4.95 ft). Display only, never the score.
- 15-minute observations posted with a lag of 1–2 h; past `RIVER_STALE_MS` (6 h) the reading is shown as stale, and no answer is a gap, never a low river. Provisional data.
- **Not the legacy `waterservices.usgs.gov`**: USGS retires it on 2027-02-22, with degradation from November 2026. No key; the keyless rate limit is per IP and a crag screen makes one call per gauge.

## MRMS radar rain rate ("Raining now", #313)
- **Product:** `CONUS/PrecipRate_00.00` on AWS Open Data (`https://noaa-mrms-pds.s3.amazonaws.com`), mm/hr, 1 km, a frame every 2 minutes landing ~3 minutes after its valid time, ~625 kB gzipped GRIB2 (PNG packing). Negatives mean no coverage.
- **Newest frame:** an S3 `list-type=2` listing with `prefix` = the day of now−20 min and `start-after` = that minute's key; the valid time is in the file name. Fetched by the API (`lib/weather/mrmsRate.ts`, `GET /rain-now`), one frame per instance reused for 2 minutes, read at every saved place at once (`lib/weather/mrmsGrib.ts`: unfilters only the rows down to the southernmost point, ~0.2–0.6 s; the whole grid took 7.5 s).
- **Withholds:** no frame younger than 15 minutes (`RAIN_NOW_MAX_AGE_MS`) is `data: null`; the client also hides a frame that has aged on screen.
- Off the `check:ui` tape (`upstreamTape.ts` `OFF_TAPE`): binary, minute-keyed, and a replayed frame is always stale. No key, no allowance.

## MRMS hourly rain (the drying clock, 2026-11-02)
- **Product:** `CONUS/MultiSensor_QPE_01H_Pass2_00.00`, same bucket: gauge-corrected rain for the hour ending at the file's stamp, 1 km, landing ~57 minutes after the hour, ~0.9 MB. Pass1 (~16 min) and radar-only (~3 min) exist; Pass2 was the one `compare:mrms` measured.
- **Collected, not read live:** `POST /api/cron/collect-radar` (`lib/runs/radarRain.ts`, `lib/weather/mrmsQpe.ts`), hourly at :15, lists each UTC day it needs and fetches up to `RADAR_FILES_PER_RUN` (12) missing hours, newest first, reading every saved US crag from each file (~1 s per file, measured). Rows in `radar_rain_hours`, pruned past 8 days. A crag outside `MRMS_CONUS` gets none.
- **Read by** `loadRadarRain` in `getHourlySeries` and `GET /recent-precip` (#468), into `radarChecked` (`rainMedian.ts`; the Precip tab through `radarCheckedRecent`). A failed listing or file is a gap, never zeros; a failed read is the models' median alone.

## OpenBeta Climbing Areas
- **What uses it:** the `/add` search. `lib/weather/climbingAreas<Xx>.ts` are **generated snapshots**, one per state, of every area with a climb and a coordinate — Minnesota (313, fetched 2026-09-23 by hand) and Colorado (6,035, pulled 2026-10-01). `searchClimbingAreas` puts up to 5 matches above Open-Meteo's places, each labelled with its own state, and `climbingAreaLevel` serves the browse list one level at a time by OpenBeta id (`parent_id`, from `ancestors`; names repeat). An area whose parent was filtered out is listed at its state's top level, so every area stays reachable. States are added when the owner's trips need them; a new one is `npm run climbing:pull --workspace=apps/api -- <State> <XX>` and a line in `STATES`. Nothing calls OpenBeta at runtime. Licence CC0; the subtitle names it anyway.
- **The route guidebook (Crag tab) is still Minnesota only** — a crag found in another state's search gets a score and no Crag tab.
- **Why a snapshot, measured 2026-09-23:** the GraphQL API at `https://api.openbeta.io/` took 4-13 s per name search and returned 502 on two of seven — unusable as type-ahead. There is **no public area export**: `OpenBeta/openbeta-export` is private and `climbing-data` holds only 2020 route records.
- **How a snapshot is pulled:** `areas(filter:{path_tokens:{tokens:["USA","<State>"]}},limit:200,offset:n)` until a short page (`pullClimbingAreas.ts`; the Minnesota file predates the script and split parents and leaves by hand). The state's own root area is dropped. The default `limit` is **50 and silent** — Red Wing was missing until pagination. `bulkAreas` returned 502 or []. Retry 502s and connection resets; they are routine.
- **Coverage:** 206k of OpenBeta's 231k climbs are in the USA; France has 71. It fixes US search and adds little in Europe. No elevation, no rock type, no aspect.
- **The `crags` table is unused** by this — it predates it. Its importer, its search route and the `{ cragId }` save were deleted 2026-11-03; the table stays until the owner decides to drop it.

## OpenBeta Routes (the guidebook)
- **What uses it:** `GET /api/v1/guidebook/:locationId` — the Crag tab, its walls and its routes. `lib/guidebook/guidebookMn.ts` is a **generated snapshot** of every Minnesota area and route (384 areas, 1,861 routes, ~513 KB), regenerated with `npm run guidebook:pull --workspace=apps/api` and committed. Nothing calls OpenBeta at runtime, for the reasons in the section above.
- **How a saved location finds its crag** (`guidebookFor`): the area with the most routes whose points sit within 2 km (`GUIDEBOOK_REACH_KM`, matching `KNOWN_CRAG_REACH_KM`), skipping any area whose points spread wider than 5 km (`CRAG_MAX_SPAN_KM`) — those are regions, e.g. "Duluth Area" at 40 km. Nothing is stored on `locations`; the link is recomputed per request. The crag's direct sub-areas are its walls, sorted by name. **Wall coordinates are not reliable** — at Barn Bluff they misplace the walls (owner, 2026-09-29) — so they only feed the 2 km reach test, never a map or an order.
- **Two API quirks the generator works around, measured 2026-09-28/29:** `areas(filter:)` returns every **climb's** `metadata.mp_id` as null while `area(uuid:)` returns the real one, so the script makes a second narrow pass per area (1,848 of 1,861 routes have one); and `leftRightIndex` is `999999` for "not placed", which the script stores as null. 82 of 250 walls with routes have ties or no positions, so a wall is `ordered` only when every route has its own position — the UI offers "left to right" only then.
- **Coverage:** no length and no bolt count on any Minnesota route, a description on 5, a protection rating on a handful. The screens say "Not recorded" rather than leaving a blank.

## Sun position and terrain skylines (Sun on the wall, #415)
- **Sun position is our own code, not a package:** `solarPosition` (NOAA's equations) in `packages/types/src/sun.ts`, shared by the Rock tab's card and `rockThermal`'s wall irradiance. `suncalc` was planned here once and never installed.
- **The skylines are computed once by `npm run sun:walls --workspace=apps/api`** (`src/scripts/buildSunWalls.ts`) and committed as `packages/types/src/sunWallsData.ts`. Nothing below is called at request time or from the client; re-run it when a `KNOWN_CRAGS` entry gains `sun_confirmed`.
- **USGS 3DEP 1 m lidar** (public domain), listed by the National Map products API: `https://tnmaccess.nationalmap.gov/api/v1/products?datasets=Digital Elevation Model (DEM) 1 meter&bbox=w,s,e,n&outputFormat=JSON`, each tile a cloud-optimised GeoTIFF read in windows through `geotiff`'s `fromUrl` (a dev dependency of the API, used by this script only). **Read every file listed and merge them newest first:** the first file listed can be blank over the crag (Sandstone's was, 2026-10-27), and Red Wing needed both WI_Statewide_2021 and MN_GoodhueCounty_2020. Tiles are in UTM metres on NAD83; the script converts in-line.
- **AWS Open Data Terrarium tiles** (`s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, the Map tab's terrain source) carry the skyline past the lidar window out to 20 km. Elevation is `R×256 + G + B/256 − 32768` metres; the PNG is decoded in the script with `zlib`, no image package.
- **The crag's time zone comes from Open-Meteo** (`/v1/forecast?timezone=auto&daily=sunrise`), stored as an IANA zone so the client gets clock changes right.
- **ShadeMap is not used.** A link out to it for tree shade is still an idea on #415; its SDK needs a key and would be a client call, which the map-tile exception in `architecture.md` does not cover.
