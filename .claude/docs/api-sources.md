# API Sources & Quirks

Read this before any weather fetch work. Every source has gotchas that will waste hours if not known upfront.

## Open-Meteo Ensemble
- **Endpoint:** `https://ensemble-api.open-meteo.com/v1/ensemble`
- **Models param:** `models=gfs_seamless,ecmwf_ifs025,icon_seamless_eps,gem_global`
- **Member key format:** `temperature_2m_member01_ncep_gefs_seamless` — suffix varies by model
- **31-member GFS** is the primary ensemble. ECMWF and ICON add spread context.
- **p10/p50/p90** must be computed from raw member arrays — the API does not return percentiles directly
- **Free tier:** 10,000 calls/day. Do not poll per-user on demand — use the background job.
- **Rate limit:** No hard limit stated, but batch locations into a single call using `&latitude=x,y&longitude=a,b`

## Open-Meteo Forecast (Deterministic)
- **Endpoint:** `https://api.open-meteo.com/v1/forecast`
- **Models param:** `models=gfs_seamless,gfs_hrrr,ecmwf_ifs025,icon_seamless,ncep_nam_conus`
- **NBM (National Blend of Models):** separate call with `models=ncep_nbm_conus` — different endpoint behavior
- **HRRR** only covers CONUS and only goes 18h out. Handle null gracefully.
- **Variables to fetch:** `precipitation,temperature_2m,windspeed_10m,relativehumidity_2m,weathercode`

## Open-Meteo Historical
- **Endpoint:** `https://archive-api.open-meteo.com/v1/archive`
- Use for past 1-7 days precip when ACIS is unavailable
- Data lags ~5 days for full QC. For yesterday use IEM ASOS obs instead.

## Open-Meteo Geocoding (Place-Name Search)
- **Endpoint:** `https://geocoding-api.open-meteo.com/v1/search?name=&count=&language=en&format=json`
- **Client:** `apps/api/src/lib/weather/geocode.ts`, proxied as `GET /api/v1/geocode?q=`
- **No API key.** Adds nothing to `.env.example`.
- Returns `elevation` alongside lat/lon — required, because `applyLapseRate` needs it and
  a bare coordinate entry cannot supply it. Persist it on save or the saved location
  disagrees with its own preview by the full lapse-rate correction.
- Also returns `timezone`, `admin1`, `country`. **`admin1` + `country` are not optional
  decoration:** `?name=Red Rock Canyon` returns three real places — a state park in
  Oklahoma (480 m), another in California (738 m), and the National Conservation Area in
  Nevada (1200 m). Rendering `name` alone makes the choice a coin flip, and picking wrong
  is silent: a real forecast for the wrong state.
- A no-match search is a **200 with the `results` key absent entirely**, not an empty
  array. A query under 2 characters always returns nothing, so it is short-circuited
  client-side before a request is spent.

## Open-Meteo Air Quality
- **Endpoint:** `https://air-quality-api.open-meteo.com/v1/air-quality`
- **Variables:** `us_aqi,pm2_5,pm10`
- US AQI scale: 0-50 Good, 51-100 Moderate, 101-150 Unhealthy for Sensitive Groups

## IEM ASOS (Current Observations)
- **Endpoint:** `https://mesonet.agron.iastate.edu/json/current.py?station={ID}&network={NETWORK}`
- **Staleness check:** Reject obs older than 90 minutes. Field: `utc_valid`
- **Station IDs matter:** Use `KMSN` not `MSN`. Always K-prefix for US ASOS.
- **Network format:** `WI_ASOS`, `MN_ASOS`, `IL_ASOS` — state code + `_ASOS`
- **Minnesota quirk:** Twin Cities metro uses `KSTP` (St Paul) for climbing areas, not `KMSP` (airport is too far from the bluffs)
- **Fields:** `tmpf` (temp F), `dwpf` (dewpoint F), `sknt` (wind knots), `p01i` (1h precip inches), `mslp` (sea level pressure mb), `relh` (relative humidity %)
- Convert wind knots → km/h: multiply by 1.852

## NOAA ACIS (Verified Precipitation)
- **Endpoint:** `https://data.rcc-acis.org/StnData`
- **Method:** POST with JSON body
- **Use for:** Ground-truth daily precip totals, 1-7 days back
- **Lags:** Data is typically available next morning for the previous day
- **Station IDs:** Use same ASOS station IDs
- Mark `verified=true` on rainfall_history rows sourced from ACIS

## NWS Alerts
- **Endpoint:** `https://api.weather.gov/alerts/active?point={lat},{lon}`
- **Required header:** `User-Agent: weatherteam6/1.0 your@email.com` — requests without this get blocked
- **No API key required**
- **Response:** GeoJSON FeatureCollection. Each feature has `properties.event`, `properties.severity`, `properties.certainty`
- **Alert tiers for climbing:** Watch → Advisory → Warning → Active, based on CAPE value in `properties.description` + `properties.event` string

## RainViewer
- **Frame index:** `https://api.rainviewer.com/public/weather-maps.json` — fetch this to get current tile timestamps
- **Tile URL:** `https://tilecache.rainviewer.com/v2/radar/{timestamp}/256/{z}/{x}/{y}/2/1_1.png`
- **Nowcast tiles:** available in same response under `nowcast` array
- Client-side rendering only — fetch frame index from backend, render tiles in mobile

## Tomorrow.io (Premium On-Demand)
- **Endpoint:** `https://api.tomorrow.io/v4/weather/forecast`
- **Auth:** `apikey` query param
- **Use:** On-demand only, triggered by user action. Never poll automatically.
- **Cost:** Log every call to `premium_pulls` table with estimated cost
- **Rate limit:** Varies by plan. Add 1s delay between calls if batching.

## OpenBeta Crag Data
- **Source:** `https://github.com/OpenBeta/climbing-data` — download export, do not call an API
- **Format:** JSON export, one file per area
- **Sync:** Weekly via background job that checks GitHub release date
- **Fields to extract:** `id`, `name`, `metadata.lat`, `metadata.lng`, `metadata.rock`, `pathTokens` (for area hierarchy)
- **Rock type mapping:** OpenBeta uses free-text. Map to: `sandstone | limestone | granite | basalt | unknown`

## suncalc
- **Package:** `suncalc` npm package — client-side only, no API
- **Use:** Solar position math for shade window calculation
- **Inputs:** lat, lon, date, wall aspect (degrees), cliff angle
- **Key functions:** `SunCalc.getPosition()`, `SunCalc.getTimes()`

## ShadeMap SDK
- **Use:** Terrain-based shade modeling per crag
- **Requires:** ShadeMap API key
- **Client-side only** — do not call from backend
