# Architecture Rules

> **Verification is enforced by machines, not by memory.** CI runs `build`, `typecheck`,
> `lint`, `test` and every root-level `check:*` script (enumerated from `package.json`, not
> listed by hand). `main` requires a passing CI run and a pull request, for admins too.
> `npm run check:hooks` fails if `.claude/settings.json` registers a hook that no scenario
> exercises. Adding a check without wiring it into CI, or a hook without covering it, is the
> failure this repo has shipped most often — both are now impossible to merge.
>
> **Two companion rules, both mandatory:**
> - **`/review-checklist`** before every commit and before opening a PR. It is a skill, so
>   it loads on demand rather than costing ~2,800 tokens in every session. Invoke it.
> - **`.claude/rules/defect-patterns.md`** before reviewing any diff. It loads
>   automatically — it stays always-on because it is the highest-value document here and
>   the cheapest of the rules. It exists because every defect this project has shipped
>   passed every automated gate in the repo.
>
> Domain patterns live in **skills** that load when you touch the matching files:
> `miniapp-patterns` (`apps/miniapp/**`), `drizzle-patterns`, `background-work`,
> `conditions-score`.

This file loads automatically at session start — you do not need to open it. These
decisions are final unless explicitly overridden by the user.

## Monorepo Structure
- Turborepo. Apps: `apps/api` (live), `apps/miniapp` (Vite + React; live at https://weatherteam6.vercel.app as the bot's menu button), `apps/mobile` (archived and **out of the build** — it declares no `build`/`dev`/`typecheck`/`lint`/`test` script, which is what makes turbo skip it; still a workspace member so `npm install` resolves its dependencies). Shared packages: `packages/types`, `packages/design`.
- Shared TypeScript types live in `packages/types` only. Never duplicate type definitions across apps.
- Design tokens live in `packages/design` only. Never redefine colors, spacing, or type scale in an app.
- Both shared packages compile to `dist/` and must be built before consuming workspaces typecheck.

## Backend Patterns
- Express route handlers are thin. Business logic lives in `src/lib/`, not in route files.
- Weather fetch functions live in `apps/api/src/lib/weather/` — one file per source.
- Scoring logic lives in `apps/api/src/lib/scoring/` — orchestration in `liveForecast.ts`, pure math in `conditionsScore.ts` / `dryingModel.ts` / `rockThermal.ts`.
- **`rockThermal.ts` is the v2 model's Layer 1 and nothing reads it yet** (Phase 1 of
  `docs/handoffs/weatherteam6-scoring-model-handoff-v1.md`). Two rules for the phase that
  wires it up. **Irradiance comes from one deterministic model — `gfs_seamless` — never
  pooled**, per issue #155; a reading above 1400 W/m² is a gap, not a measurement. And
  **`T_surface` is null whenever an input was missing and never degrades to air temperature**
  — a defaulted surface temperature would look like a measurement on every screen, and the
  per-hour `qualified` flag must travel with the reading rather than being dropped at the
  surface (§ Unknown aspect).
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
  the other lever and it is **not** free — `TEMP_BAND_C` also drives the Mini App's
  temperature chart, and nobody has measured where the top of that band belongs
  (`scoring-findings.md` §4).
- **There is no `apps/api/src/jobs/`.** It was deleted with BullMQ. Scheduled work is an HTTP route under `/api/cron/*` with its logic in `src/lib/` — see § Background Jobs.
- Telegram helpers live in `apps/api/src/lib/telegram/`; alert fetch/upsert/notify logic in `apps/api/src/lib/alerts/`.
- **The alert deep link is a plain `url` inline keyboard button, never `web_app`.** `startapp` is a Direct Link Mini App mechanism; a `web_app` button opens an *inline-button* Mini App and does not deliver `start_param` at all, so the app would launch on the list with no idea which location the alert was about. The link is built by `lib/telegram/deepLink.ts`, whose base (`https://t.me/WeatherTeam6_bot/Alert`) is a constant because neither the bot username nor the Direct Link short name is derivable from `TELEGRAM_BOT_TOKEN`.
- **A button that cannot be built correctly is omitted, not approximated.** `alertKeyboard` returns `null` for a non-uuid id. Telegram answers a malformed button url with a 400 — so a bad link costs the whole alert, not just the button. Same reason `InlineKeyboardMarkup` in `sendMessage.ts` is narrowed to url buttons: Telegram's real button type is a union where exactly one field may be set, and a wider type here would let a caller compile a 400.
- **A permanent Telegram rejection keeps its claim; only a transient one releases it.** `sendTelegramMessage` throws `TelegramPermanentError` for a non-429 4xx and a plain `Error` for everything else, and `notifyPendingAlerts` branches on the *type* — never on the message text. Releasing the claim unconditionally (what it did until 2026-08-26) meant a message Telegram rejects identically every time was re-sent on every cron run, forever. Keeping the row claimed costs one alert; releasing it costs an unbounded loop.
- **`POST /api/telegram/webhook` verifies `secret_token`** via `webhookSecretAccepted` in `lib/telegram/webhookAuth.ts` — the header Telegram echoes from `setWebhook`, and the only part of the request an outsider cannot forge (`chat.id` lives in the body). It is **deliberately permissive when `TELEGRAM_WEBHOOK_SECRET` is unset**, because making it mandatory takes the bot offline between deploy and re-running `setWebhook`; the `chat.id` check still runs in that window. The helper is pure and lives outside the route module for the same reason `validateInitData` does — importing the route pulls in the database client, which throws at import time without `DATABASE_URL`.
- **Every refusal on that route answers 200.** A non-200 makes Telegram redeliver the same update, and a distinguishable response reveals the endpoint to an unauthorized caller.
- **A button tap is authorized on *two* ids, not one.** `callback_query` carries `from.id` (who pressed) and `message.chat.id` (where the panel lives); **both** are checked against `TELEGRAM_CHAT_ID`. Checking only the chat lets anyone reaching a forwarded panel drive it; checking only `from` accepts a tap in a chat this bot never posted to. The `update.message` path still checks `chat.id` alone, because that is the only id it has.
- **The panel is one message edited in place, and its state lives in `panel_states`.** `callback_data` is 64 bytes, so a button carries an 8-hex-character state id plus the single field it changes (`callbackData.ts`); everything else is read back from the row and the panel is **re-rendered from what was written**, never patched in memory. A state row that is gone — pruned at 7 days, or another chat's — says *expired*; it never guesses. Buttons that will not encode are dropped, but the thing they pointed at is still named in the text.
- **`answerCallbackQuery` runs before the work, and `editMessageText` tolerates one 400.** The client spins until the query is answered and gives up at ~15 s, and a conditions render is two upstream fetches. Re-tapping the tab already showing produces byte-identical output, which Telegram rejects as *"message is not modified"* — tolerated by description in `sendMessage.ts`, and nothing wider, because every other 400 there is an escaping failure that must stay visible.
- **`InlineKeyboardButton` is a two-arm union whose arms close each other with `?: never`.** Excess-property checking against a plain union would accept a button carrying both `url` and `callback_data`, which Telegram answers with a 400 for the whole message.
- **`/weather <place>` creates one `panel_states` row per geocode result before sending anything.** A result's lat/lon/elevation/`feature_code` do not fit in `callback_data`, so its button (`VERB_GOTO`) points at a row that already carries them (`elevation_m`, `feature_code` — migration 0010) rather than re-deriving them from a re-run search, which could answer with a different set of results by the time it is tapped. A single unambiguous match skips the results screen and opens its one child state directly. The result list's subtitle is `placeSubtitle` (`packages/types/geocodeCopy.ts`), shared with the Mini App's `/add` picker — the issue #82 fix (a plain-language kind beside admin1/country) has exactly one implementation, not two that can drift.
- **The Save buttons on a weather-preview panel are the insert `POST /locations` also uses.** `insertGeneralLocation` (`lib/locations/createLocation.ts`) is the shared write; the flag (`climb`/`place`, `FIELD_KIND`) is always explicit, never inferred, same as §12. `VERB_SAVE` checks `state.locationId !== null` before inserting — a double-tap before the edited message reaches the client must not create two locations at the same coordinates, since there is no unique constraint to catch it.
- **"Update" a mis-saved location is remove-then-add, not a third flow.** `/remove` behind a confirm (`remove_confirm` view) plus `/weather` again is the whole answer — deliberately, editing rock type/aspect/cliff angle stays out of scope (§12.4), and `/help` says so. `VERB_REMOVE` reads the location's name *before* calling `deleteLocationCascade`, then creates a **new** `removed` panel state rather than updating the one just tapped: `panel_states` is itself a `DEPENDENT_TABLES` entry, so the cascade already deleted that row along with the location.
- Auth middleware lives in `apps/api/src/middleware/`. `resolveUser` (`auth.ts`) resolves *who* the caller is; `requireApiAuth` (`apiAuth.ts`) decides *whether* they may call `/api/v1/*` at all.
- **`/api/v1/*` is gated by `requireApiAuth`**, which accepts **two schemes on the one `Authorization` header** and nothing else. It exists because `resolveUser` hands every unauthenticated caller `DEFAULT_USER_ID`, i.e. owner rights on a public URL, and Vercel's production alias is not covered by Standard Protection (protecting it needs a paid plan). Do not move the gate to Vercel. `/api/cron/*` (CRON_SECRET) and `/api/telegram/*` (chat.id) keep their own auth and stay outside it.
  - `Bearer $API_SHARED_SECRET` — server-side callers, scripts, curl. **Fail-closed: an unset secret is a 503 under *both* schemes**, never an open door. This is what holds the door shut and it is not replaced by the scheme below.
  - `tma <initDataRaw>` — the Telegram Mini App. HMAC-SHA256 validated against `TELEGRAM_BOT_TOKEN` by `validateInitData` in `src/lib/telegram/initData.ts`; the bot token never reaches the client bundle.
- **A valid `initData` signature is not an authorization decision on its own.** It proves the launch came from *a* Telegram user, and anyone who finds the bot can open its menu button. `requireApiAuth` therefore also checks the signed `user.id` against `TELEGRAM_CHAT_ID` — the same single-user boundary the webhook uses. Removing that check silently grants `DEFAULT_USER_ID`'s rights to every Telegram account.
- **`validateInitData` stays pure** — no env reads, no Express types — so the middleware is a thin gate and the algorithm is directly testable. Three properties it must keep: **the check string is every received field except `hash` — `signature` included**, exactly one `hash` parameter is accepted (a second one appended by an attacker must not be ignored), and `auth_date` older than `INIT_DATA_MAX_AGE_SECONDS` is rejected.
- **The two Telegram validations exclude different fields, and mixing them up 401s every real launch.** The **bot-token HMAC** this app uses takes "a chain of all received fields", minus `hash` only — `signature` **included**. Excluding `signature` is the **Ed25519 third-party** rule and does not apply here; clients from Bot API 7.10 on send it on every launch, so dropping it leaves the check string a field short and 401s every real request. Authority: core.telegram.org/bots/webapps.
- **A crypto validator tested only against its own signing helper proves nothing.** `initData.test.ts` was green through all of the above because the helper built the check string with the same mistake. When a test fixture is generated by the same understanding as the code, the only real verification is production traffic — check the Vercel runtime logs after a real launch.
- The credential must travel in `Authorization`. The CORS layer in `index.ts` allows only `Content-Type, Authorization`, so a custom header fails browser preflight.
- Route error/validation helpers live in `apps/api/src/lib/http.ts`. Handlers validate `uuid` route params with `isUuid` (return 404, not a Postgres 500) and funnel caught errors through `sendServerError` — never hand-roll `err.message` into the response, which leaks DB internals. `sendServerError` logs through `describeError`, which reads only known-safe fields; never widen it to serialise an error object wholesale, because driver errors can carry the connection string.
- **All four ensemble models are pooled, and `model_sources` names the ones actually read.** `parseEnsemble` collects members for every suffix in `ENSEMBLE_MODEL_SUFFIXES` — 143 members live (GFS 30, ECMWF 50, ICON 39, GEM 20, plus one control run each) against 30 when it filtered to GFS alone. Attribution is derived from the models that actually yielded arrays, so a partial upstream response drops a model rather than claiming it. Members are pooled **unweighted**, so a model counts in proportion to how many members it runs; equal-weighting the four would need a documented reason to override that.
- **A deterministic multi-model response only labels its columns while more than one model has coverage.** Measured 2026-08-31: `models=gfs_seamless,ncep_hrrr_conus` at a point HRRR does not reach answers **200** with a bare `temperature_2m` — HRRR silently dropped, the survivor unlabelled — while HRRR alone there is a 400. `parseDeterministicHourly` therefore trusts a bare column **only when exactly one model was requested**, and otherwise reports `ambiguous` so `fetchDeterministicHourly` re-asks one model at a time. Attributing that series by request order would name the wrong model on every column.
- **`precipitation_probability` is not necessarily the selected model's own field, and which models share it is derived, not listed.** `markSharedProbability` flags every model whose series is byte-identical to another's in the same response — live at Red Rock that is GFS, HRRR and NBM together. A column a renderer heads with a model name must have `probability_is_shared` false; the flag reaches the database as `weather_runs.precip_prob_is_shared`, where **null means the question does not apply** (an ensemble run), not "no". **No surface renders that column today** — the bot's hourly panel dropped it in the September 2026 plain-language rebuild, because the `🌧 Rain` panel answers the same question from `members_wet / member_count`, which is a real proportion of real forecasts and needs no caveat. The field is still fetched, still stored and still flagged; the rule above governs the next renderer that wants it, and is not a description of one that exists.
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
- **A precipitation percentile does not add up, and the ensemble stores a mean because of it.** `precip_mm_mean` on `weather_ensemble_hours` is the only precipitation figure that can be summed — the mean of the members' daily totals *is* the total of the hourly means, whereas a sum of hourly p50s is the median of nothing. A step or day total comes from that column; the percentiles describe **one hour** of the step (the wettest by mean) and the panel says so. Printing summed percentiles as a step total would show three to twelve times the rain.
- **A precipitation percentile may be *drawn* for one hour; it may never be *added*.** `GET /hourly/:id` carries `precip_mm_p10`/`precip_mm_p90` beside the mean so a chart can shade how much the members disagree about a single hour. The no-summing rule above is unchanged and is what the two are for: a band or a whisker on one mark, never a step total, a day total or a header figure. `precip_mm_mean` remains the only precipitation figure that can be added up, and the mean routinely sits **outside** p10-p90 — nine members dry and one wet puts both percentiles at 0 with a non-zero mean, which is the disagreement worth drawing rather than a fault.
- **A client reads an absent column as a gap, and `=== null` does not do that.** The API and the Mini App deploy separately, so every release that adds a field has a window where the client is new and the response is not: the column is simply missing, and `undefined` passes every `=== null` guard. Found in production on the rain whiskers, which stroked `y1="NaN"` — no thrown error, no browser warning, marks silently absent from a chart that believed it had drawn them. Normalise with `?? null` where a response is turned into marks (`apps/miniapp/src/components/charts/hourlySeries.ts`, `toDatum`), not at each of the guards downstream.

- **The chance of rain is `members_wet / member_count`, never `precipitation_probability`.** The wet count is members at or above `MEASURABLE_PRECIP_MM` (0.1 mm, Open-Meteo's own resolution), computed in `parseEnsembleHourly`. `members_wet` is **nullable in the database and null means unknown** — a row from before the column existed withholds the probability rather than reporting 0%.
- **Hourly precipitation is stamped at the end of the hour it fell in, so a table row owns the step *after* it.** A 12:00 row at a 3 h step sums the hours stamped 13, 14 and 15 and means "rain between 12:00 and 15:00". `buildRows` and `buildRainDay` both follow it; if one changed, the two views would disagree about which row a shower belongs to.
- **"This model does not reach this day" is rows whose values are all gaps, not missing rows.** Open-Meteo pads every model to the longest horizon in the request — measured live, `ncep_hrrr_conus` returns 168 hours of which 66 carry temperature. `dayHasData` is the check, and it **excludes `precip_prob_pct`**: that series runs past the horizon of the model it was requested with, so it cannot be the evidence that the model answered.
- **A panel reads a stored run when one is fresher than `RUN_MAX_AGE_MINUTES`, and prints its age.** `lib/runs/latestRuns.ts` fetches and writes back only when there is none — every button tap re-renders the whole panel, and a six-model fetch per tap would sit inside a callback the client abandons at ~15 s. The write-back is **best effort**: a panel that rendered real upstream data must not fail because the row could not be stored.
- **`/api/cron/collect-runs` and `/api/cron/prune-runs`** carry Phase 2's scheduled work, gated on `CRON_SECRET` through the shared `cronGateFailed`, with `Promise.allSettled` across locations. **`prunePanelStates` stays on `/check-alerts` until `prune-runs` has a schedule registered against it** — moving it when the route exists rather than when its registration does would stop it running at all.
- **The model key suffix is not the model name and cannot be derived from it** (`gfs_seamless` → `_ncep_gefs_seamless`, `ecmwf_ifs025` → `_ecmwf_ifs025_ensemble`). `ENSEMBLE_MODEL_SUFFIXES` is the mapping; adding a model to `ENSEMBLE_MODELS` without adding it there means it is fetched and silently ignored — the exact failure that stood for months.
- **A control run is a member.** `precipitation_<model>` with no `_memberNN` is the model's unperturbed forecast. The old filter matched the literal `_member` prefix and dropped all four.
- **`temp_c_max`, `temp_c_min` and `wind_kmh_max` are the ensemble *median* of each member's own daily extreme — never a global `Math.max`.** A global max is the hottest hour of the hottest member: on 2026-08-26 it put **102 °F** on screen for Red Rock under the label "High" while the 143-member median said **99 °F**, and it can only get worse as members are added. Reach for `ensembleMedian`, not `Math.max`, for anything a user reads as a forecast. `humidity_pct`, `dewpoint_c` and `shortwave_wm2` stay means across all member-hours, which is already a central estimate.
- **`fetchRecentHourlyPrecip` returns a forecast tail, and anything that draws it must cut that off.** The call sets `forecast_days=1` deliberately — the bot's rain panel needs rain that is falling *now* — so the newest hours in the series have not happened. `GET /recent-precip/:locationId` passes the result through `trimToObservedHours` (`lib/weather/recentPrecipWindow.ts`) before answering, because a chart captioned "recent rain" drawing a prediction is an unbacked claim, not a rounding error. The cut is at the location's own clock, from the response's `utc_offset_seconds`; an hour stamped `T` covers `T-1h` to `T` and so is kept when `T` is now.
- **A window's caption is measured, not requested.** The route asks for five days; Open-Meteo returns what it has and the trim removes the future end. A surface saying "past 5 days" — or "no rain in the past 5 days" — must derive that span from the timestamps it received. `RecentPrecip.from_date` exists so a miss reads as "none in this window" rather than "none ever".

- **Every Open-Meteo call sets `timezone=auto`, and "today" is the *location's* local day** (issue #33). Daily buckets are the location's own calendar days and the response's `utc_offset_seconds` is carried out on `OpenMeteoResult`. `auto` rather than the stored `locations.timezone`: it needs no timezone database in-process and it is the only option that also works for `GET /preview`, which has no saved row.
- **`computeLiveForecast` returns `todayStr` and every caller uses it.** No route may derive its own date — `/forecast`, `/conditions` and `/preview` each used to compute `new Date().toISOString().slice(0, 10)` independently. Use `localDateString(now, offset)`, which shifts the epoch and reads the UTC date of the shifted instant, exactly as Open-Meteo bucketed the series. A non-finite offset degrades to UTC rather than producing `Invalid Date`.
- **The server marks the today row; the client never computes it.** `ForecastSnapshot.is_today` is set in `computeLiveForecast`. The old design had the API and the Mini App each derive a UTC date and compare it to UTC buckets — **both wrong in the same direction, so they agreed with each other and nothing could detect it**, and in the Americas today's high became tomorrow's every afternoon. `is_today` is optional on the type only for a response cached from before the fix: **a missing value is unknown, not `false`**.
- **External APIs are proxied, never called from the client.** `GET /api/v1/geocode` (Open-Meteo place search) and `GET /api/v1/radar/frames` follow this: the fetch lives in `src/lib/weather/`, wrapped in the shared `fetchWithRetry`, and the route is a thin pass-through returning `{ data, error, status }`. A client calling a third-party API directly bypasses the retry policy and the response contract both.
- `GET /api/v1/preview?lat=&lon=&elevation=` serves weather for a location that has **no row and no UUID** — the add flow's pre-save step. It runs `computeLiveForecast` over a synthetic `LiveForecastLocation` and **persists nothing**; `location.id` is the placeholder `"preview"`, used only for log lines and synthesized snapshot ids. It deliberately returns no conditions score: nothing has been classified as a climbing location yet.

## Operator Scripts
- One-off and verification scripts live in `apps/api/src/scripts/`, are plain TypeScript run with `tsx`, and are exposed as npm scripts (`db:seed`, `check:add-location`). They are the only place `console` is used instead of the logger — their output *is* the result.
- **Acceptance scripts exist because the test suite cannot reach the database.** Vitest mocks `fetch` and never connects, so FK violations, values that fail to persist, and constraint errors never surface there. A flow whose failures only appear against real Postgres gets a `check:*` script; see `checkAddLocationApi.ts`.
- Such a script must be safe to run against production data: create rows under an obvious prefix, clean up in a `finally` block even when a step fails, and say so loudly if cleanup did not work.
- Defer runtime imports of `../db/index.js` inside the entry function. It throws at import time when `DATABASE_URL` is unset, which pre-empts any friendlier message with a stack trace.

## Auth Pattern
- `AUTH_ENABLED=false` means all requests get `req.userId = DEFAULT_USER_ID` injected by `resolveUser`.
- Route handlers always use `req.userId`. Never reference `DEFAULT_USER_ID` directly in routes.
- Do not build login UI. Do not add Clerk. Do not add sessions.

## Database Rules
- Drizzle schema is the single source of truth. Schema lives in `apps/api/src/db/schema.ts`.
- All migrations via `drizzle-kit`. Never run raw SQL against the DB directly.
- All queries go through Drizzle. No raw `pg` queries unless Drizzle cannot express it.
- `user_id` FK exists on: `locations`, `trips`, `conditions_reports`, `push_tokens`, `premium_pulls`, `user_preferences`. This is intentional even though auth is off.
- **No FK in the schema declares `onDelete`**, so Postgres refuses to delete any row another table still references. Deletes therefore clear their dependents explicitly, in one transaction: `DELETE /locations/:id` goes through `deleteLocationCascade` (`src/lib/locations/deleteLocation.ts`), which walks `DEPENDENT_TABLES`. **Adding a table with a `location_id` FK means adding it to that list** — omit it and delete becomes a foreign-key violation surfacing as a generic 500, and only once real data exists. Do not "fix" this by adding cascades to the schema without deciding what it means for every other delete.
- **`DELETE /trips/:tripId` clears `trip_locations` and deletes the trip in one transaction**, the same shape as `deleteLocationCascade`. Covered by `npm run check:delete-trip` — the failure is a Postgres constraint error and the vitest suite cannot see it.
- **A new table with a `trip_id` FK gets cleared in that handler too**, exactly as a `location_id` FK gets added to `DEPENDENT_TABLES`. `trip_locations` is currently the only one.

## API Response Shape
All endpoints return:
```typescript
{ data: T | null, error: string | null, status: number }
```
Never deviate from this shape.

## State Machine: Forecast Window
- `>14 days out`: climatological normals only, no conditions score
- `7-14 days out`: low-confidence ensemble, score shown with low confidence label
- `<7 days out`: full conditions score active, p10/p90 bands shown

## Background Jobs

There is no queue infrastructure — no BullMQ, no Redis. The API is a single Express app wrapped as one Vercel serverless function (`apps/api/api/index.ts`), so nothing can run on an in-process schedule.

- `forecast-snapshot` and `rainfall-history` were deleted outright, not converted. Forecast/conditions scoring is computed live, per request, in `apps/api/src/lib/scoring/liveForecast.ts` (`computeLiveForecast`) — called directly from `GET /conditions/:id` and `GET /forecast/:id`. Recent (30-day) rainfall for the drying-time component is also live-fetched per request (ACIS via `fetchPrecipHistory` when the location has an `asos_station`, else Open-Meteo's archive API via `fetchArchivePrecip`) — there is no `rainfall_history`-table job keeping that data warm anymore.
- `alerts-poller` was converted, not deleted: its fetch/upsert/prune logic lives in `apps/api/src/lib/alerts/checkAlerts.ts` (`runAlertsCheck`), invoked by `POST /api/cron/check-alerts` (gated on a `CRON_SECRET` header) on an external schedule (cron-job.org), not a queue.
- **Any per-location loop that makes an upstream call runs under `Promise.allSettled`, never sequentially.** `fetchWithRetry` sleeps 1s + 2s + 4s across its attempts, so a serial loop multiplies an upstream outage by the number of locations and walks straight into the function's `maxDuration: 60`. In `runAlertsCheck` that killed the request **before `notifyPendingAlerts()` ran**, leaving pending alerts undelivered across every retry — and it got worse as locations were added. Concurrency is safe there because each location only touches its own rows.
- `snapshot-cleanup` was deleted — nothing to clean up once there's no snapshot table being written on a schedule.

Any handler that touches the DB across more than one request-scoped operation must still be safe to run concurrently / retry — the "idempotent, no duplicate data" bar from the old job-based world still applies, it's just enforced per-request now instead of per-job-run.

## Client — Telegram Mini App

**The Mini App is the client.** `apps/miniapp` (Vite + React, static build) is the real,
complete implementation of every user-facing screen. There is no second client to keep in
parity. `apps/mobile` is archived — **do not add features to it.**

The Mini App's own patterns — the design-token adapter, Telegram theming and
capability gating, deep links, React Query rules, null-safe formatting, score suppression,
the `is_today` flag, and the archived mobile patterns — live in the **`miniapp-patterns`
skill**, which loads automatically when you touch `apps/miniapp/**` or `packages/design/**`.
They are unchanged and still binding; they were moved out of this file because they cost
~2,000 tokens in every session, including the majority that never open the Mini App.

Two that stay here because they constrain the **API**, not the client:

- **The server marks the today row; the client never computes it.** `ForecastSnapshot.is_today`
  is set in `computeLiveForecast`. A missing value is **unknown, not `false`**.
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

