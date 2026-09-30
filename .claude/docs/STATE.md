# Current state

The only state document. `session-archive.md` is history — grep it for the reasoning behind
one past decision, never read it at session start. The SessionStart hook warns when this file
falls more than 15 commits behind `main`.

Last updated: 2026-09-30 · `main` @ `3f53cba`

---

## Where the project is

**Telegram is gone** (2026-09-23). Auth is a passphrase and a signed token; alert data is
still collected and delivery is parked. The audience is the owner plus a few climbing
partners, each with their own list. The cleanup is recoverable from the
`archive/2026-09-23-pre-cleanup` tag.

**Crag A is the live score** (owner decision 2026-09-24, `lib/scoring/cragModel.ts`). The
five-component scorer still runs, renders nowhere, and Phase 5 deletes it. Since then the
model gained: the drying clock reads the four global models' median rain (#210), rock
surface temperature lags the sun by 2 h, measured against USCRN (#226), and today counts only
the hours still ahead (#227). Every known crag's rock type was checked against a source
(#243), and rock drying and wet strength were corrected against climbers' reports (#235–#242).

**The web app is the WT6 Figma V2 design** (#188–#193, then #228–#254). Locations list, and a
detail screen with Overview, Daily, Hourly, Precip, Rock and Crag tabs:
- **Overview** fits one phone screen: today as one chart with a pickable hour, the next days
  as columns (#244–#250).
- **Precip** leads with hours since real rain, an hour-by-day grid, a running total and the
  rock's state under the rain (#232–#241). It draws the four-model median, not HRRR (#230).
- **Rock** is a field guide per rock type — how it formed, where the holds come from — with
  no crag-specific claims (#233, #251–#254).
- **Crag** is the OpenBeta guidebook with wall and route screens (#202), plus a logbook of
  ticks, to-dos and shared boulder positions (#206).
- A **Report** button sends app feedback and forecast checks (#200, #205, #207).

**Storage:** weather runs are stored per place, not per saved location (#194); a model is
fetched only when Open-Meteo published a new run (#195); raw payloads are no longer stored
(#208). Neon's 512 MB cap is still the constraint behind all three.

**Security:** cross-user holes closed and the API hardened (#198); `check:auth` covers them.

**Delivery tooling (2026-09-30):**
- Vercel deploys from `main` only, and only the project a change touched (#255) — the
  100-a-day Hobby limit was spent on 2026-09-30.
- A merge is blocked until the CI reviewer's `## Claude review` comment names the PR's head
  commit (`.claude/hooks/lib/reviewGate.mjs`, #257). The reviewer uses a repo prompt, not the
  `code-review` plugin, which had passed 60 PRs without reading them (#256).
- The destructive-command guards watch PowerShell; `.claude/.wip` expires after 12 h (#256).

### What is running

- **API** — `https://weather-team6-api.vercel.app`. The owner's account exists, username `tim`.
- **Web app** — https://weatherteam6.vercel.app, installable, no service worker. The owner uses
  it on a phone at about 480×1000 CSS px.
- **cron-job.org** — `check-alerts`, `collect-runs`, `prune-runs`. **`collect-runs` answers
  `200 OK` when it persists nothing** — that hid a day-long outage on 2026-09-13; whether to
  change it is undecided.

**Baseline (2026-09-30):** `npm run test` 1,297 passing — 711 api, 365 miniapp, 221 types —
across 39 / 27 / 12 files; `check:hooks` 97. **Compare the file count, not just the test
count** — miniapp once printed "123 passed" with three files failing to collect. The
database checks were last recorded on 2026-09-23 and are not run by CI.

**Mutation:** the weekly job last passed on 2026-09-28 against `thresholds.break: 67`.

**Credentials for unattended runs.** `DATABASE_URL`, `CRON_SECRET`, `API_SHARED_SECRET` and
`VERCEL_TOKEN` are Windows **user** environment variables — read one with
`[Environment]::GetEnvironmentVariable('NAME','User')`, because `$env:` can read empty while
it exists. Never echo one. `AUTH_TOKEN_SECRET` is not among them; a local run generates a
throwaway. `VERCEL_TOKEN` is team-scoped and reaches `https://api.vercel.com` with no
`teamId` — that is how env vars get set, because the Vercel MCP's `projectEnvVars` 403s.

---

## What is next

1. **Scoring Phase 4b — the location editor screen.** The server half shipped in #184
   (`PATCH /locations/:id`, wall geometry in `rockThermal`). The editor in the web app is
   unbuilt. A recorded aspect and angle matter only once Wall A is wired to individual walls.
   **Do not score `aspectDegrees` directly** (#139): the same aspect flips sign by season.
2. **Scoring Phase 5 — preferences, then retirement of the five-component scorer.** A past
   window can still render as that day's advice. #178's conflicting `Climbable in ~Nh` line
   left with the drying card in #251; re-check the issue before working it.
3. **Idea issues #213–#225** — webcams, radar, sensors, trip planner, "why this number". Filed,
   not scheduled.

Still open on Crag A: a minimum wait after rain for soft sandstone (F17), rain-history seeding
(#176), and whether a condition-report screen comes later. Whether GFS sunlight should be
replaced for rock temperature is #212.

---

## Open issues

Read them with `gh issue list`. Context not on the issues themselves:

- **#25** — product decision: a new cron, or delete the two endpoints.
- **#27** — most of it died with the webhook; re-read before working it.
- **#138–#140** — re-read against Crag A before working them.
- **#143** — the feedback button shipped; the forecast checks it collects are the only path to
  knowing whether any of this predicts anything. Nothing is validated against outcomes.
- **#176** — the fix (seeding `priorEffectiveHours` from daily history) is a model decision.

**Unfiled:** `/forecast/:id` and `/conditions/:id` each run their own `computeLiveForecast`,
so one detail view costs two ensemble and two rainfall calls; and ACIS can return a
successful response of all-`'M'` sentinels, yielding `[]` — indistinguishable from a dry
month.

**PR #201** (README diagrams as images) has been open since 2026-09-29 with checks that never
reported. Merge or close it.

---

## Working with the owner

- Interact only when it is needed. Design decisions qualify; chasing an unmerged PR does not.
- **Do not sit watching CI.** Check once with `gh pr checks <n>`, say what is pending, move on.
- **Visual work goes by side-by-side variants** — mock two or three, screenshot them together
  at phone size, let the owner pick.
- **The owner's field knowledge beats the research docs**, especially on rock and safety.

---

## Live gotchas

`CLAUDE.md` § Known Gotchas carries the rest.

- **`API_SHARED_SECRET` on preview differs from production** (deliberately). `AUTH_TOKEN_SECRET`
  is the same across all three targets. Env vars apply to new deployments only.
- **The reviewer action will not run on a PR that edits `claude-review.yml`** — it requires the
  file to match `main`. The merge gate exempts such a PR; its first real review is the next PR.
- **A command containing the text `gh pr merge <n>`** (an echo, a test payload) trips the merge
  gate. Put such payloads in a file.
- **Backticks in a bash heredoc or a double-quoted `node -e` are command substitution**, and a
  quoted heredoc is not reliable either. Write the file with the Write tool.
- **`sed` with `|` as the delimiter breaks on Markdown table rows.** Use `c\` instead.
- **A source file can contain a literal NUL byte**, which makes `git diff` and `grep` treat
  it as binary. `grep -a` and `git diff --text` see it.
- **`DELETE` does not free Neon space.** `TRUNCATE` reclaims; `VACUUM FULL` needs as much free
  space as the table and cannot run at the cap.
- **A fresh merge is not a deploy** — check the deployment state before probing production.
- **`fetchWithRetry` throws after exhausting retries on a 5xx or 429**, so a test mocking 503
  to reach a `!res.ok` branch reaches the `catch` instead. Use 403.
- **`drizzle-kit generate` needs no database**, only a non-empty `DATABASE_URL`.
- **Vercel Hobby log retention is ~1 hour.** Check right after a cron fires; filter by message.

---

## What the user owes

None of it blocks work. Neither item has been confirmed done since 2026-09-23.

1. **Tear down the Telegram bot registration.** Telegram still delivers updates to a path
   that now 404s. Needs `TELEGRAM_BOT_TOKEN` in the owner's own shell, then `deleteWebhook`.
2. **Delete `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET` and
   `AUTH_ENABLED`** from both Vercel projects. Nothing reads them; three are live credentials.
