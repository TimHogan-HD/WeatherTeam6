# WeatherTeam6 Mini App: Hourly Data Visualisation Handoff
Version: v1
Date: 2026-09-04
Status: Draft — Phase 1 authorised, Phases 2-4 pending review

## Context

The Mini App shows seven daily rows and nothing else. This document specifies exposing the
hourly forecast data the API already collects, and rebuilding the location detail screen
around a Daily tab and an Hourly tab with drill-down from a day into its hours.

Prompted by CragReport's forecast screens (screenshots reviewed 2026-09-04). The reference
is the *legibility* of a stacked chart column, not the feature list — see § Constraints.

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

- `.claude/docs/STATE.md` records Mini App polish as **deliberately downgraded**
  ("the Mini App doesn't need to be super fancy"), and `.claude/skills/miniapp-patterns`
  says a CSS or motion architecture is "not authorised".
- `docs/handoffs/miniapp-design-v1.md` §3 specifies location detail as **"one scroll, no
  internal tabs"**.

**Both are reversed by this document**, on the owner's decision of 2026-09-04. The bot
chat interface stays a first-class surface and is not being deprecated — the owner's words
were that chat "could get really clunky" for this kind of data and they want **both**
surfaces functioning. Phase 4 reconciles the two documents; until it lands, this file is
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

- **Per-hour or per-day conditions scores** — the coloured ribbon in the reference app.
  No endpoint returns a per-day score and `miniapp-design-v1.md` §3 rules it its own task.
  Not blocked, just not this.
- **Rock surface temperature.** Nothing in the repo computes it. It needs a thermal model
  taking aspect, cliff angle and shortwave radiation; that is a scoring-layer change.
- **Sun position / shade strip.** No solar geometry exists in the repo.
- **Snowfall rate and snow depth panels.** Not collected, and the reference app renders
  them as flat zero lines with axis labels reading "1 in / 1 in / 0 in" at a Caribbean
  crag. Do not reproduce.
- **Model switching UI.** See § Open Questions 1.
- **Radar, walls, trips, history, normals.** Unchanged non-goals.
- **`apps/mobile`.** Archived. Do not add anything to it.

## Pre-Implementation Checklist

- [ ] `npm run build --workspace=packages/types --workspace=packages/design`
- [ ] Confirm the branch is `claude/mini-app-data-viz-kgmuse`
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

### Phase 2: Chart primitives (not authorised yet)

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

### Phase 3: Daily / Hourly tabs (not authorised yet)

**Build:** location detail becomes two tabs.

- **Daily** — the existing seven rows, each now tappable, opening that day in Hourly.
  Alert banner, today hero, score section and sources footer keep their current order and
  stay outside the tabs; the alert banner in particular is above everything, always.
- **Hourly** — the chart column for the selected day, with the continuous multi-day series
  reachable by scrolling or paging.

**This revises `miniapp-design-v1.md` §3's "one scroll, no internal tabs".** Phase 4
rewrites that section rather than leaving two documents disagreeing.

**Acceptance:** tapping a day in Daily lands on that day in Hourly; Telegram's `BackButton`
returns to Daily rather than closing the Mini App; a day flagged without coverage in
`days[]` is not tappable.

**Git checkpoint:** commit.

---

### Phase 4: Recent rain + document reconciliation (not authorised yet)

**Build:**

- A recent-rain bar chart from `fetchRecentHourlyPrecip`, behind its **own** endpoint and
  its own React Query hook, so its upstream fetch cannot delay the rest of the screen.
  Sections fail independently — that rule is already in `DetailView.tsx`.
- Rewrite `miniapp-design-v1.md` §3 (tabs) and §9 (non-goals).
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
  /** Ordered by `valid_at`. */
  hours: HourlySample[]
  /** Ordered by date. What the Daily tab may offer a drill-down for. */
  days: HourlyDay[]
}
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
5. **`panels.ts:578` says "Model switching is the Mini App's."** This plan returns one
   model. That is a deliberate narrowing for Phase 1, not a contradiction — but it means
   the comment describes something that still does not exist. See Open Questions 1.
6. **Two documents currently forbid this work** (§ Current State). Until Phase 4, anyone
   reading `STATE.md` or `miniapp-patterns` will believe Mini App investment is
   unauthorised.
7. **`.claude/settings.json` hooks are enforced.** The turn cannot end with uncommitted
   changes, unpushed commits, a pushed branch with no PR, or a green mergeable PR left
   open. `git commit` on `main` is blocked. Escape hatch for a deliberate pause:
   `touch .claude/.wip`.
8. **The working tree is CRLF.** Multi-line `sed`/`perl` replacements match nothing and
   report success. Use the Edit tool for anything spanning more than one line. Python is
   not installed.

## Open Questions

1. **Should the Hourly tab let the user switch deterministic models?** We store six, the
   bot deliberately shows one, and `panels.ts` says switching is the Mini App's job.
   Phase 1 as specified returns one model chosen by coverage, which forecloses it without
   an API change. Cheap to keep open: return every model that answered and let the client
   pick. Costs payload. **Decision needed before Phase 1 is written.**
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
