# Current state

The only state document. `session-archive.md` is history — grep it for the reasoning behind
one past decision, never read it at session start. The SessionStart hook warns when this file
falls more than 15 commits behind `main`.

Last updated: 2026-10-02 · `main` @ `bf1db3b`

---

## Where the project is

**Telegram is gone** (2026-09-23). Auth is a passphrase and a signed token; alert data is
still collected and delivery is parked. The audience is the owner plus a few climbing
partners, each with their own list. The cleanup is recoverable from the
`archive/2026-09-23-pre-cleanup` tag.

**Crag A is the only score** (owner decision 2026-09-24, `lib/scoring/cragModel.ts`); the
five-component scorer was retired in #288. The model reads the four global models' median
rain (#210), rock surface temperature lags the sun by 2 h, measured against USCRN (#226), and
today counts only the hours still ahead (#227). A new crag is read with rain history from its
first fetch (#289). Every known crag's rock type was checked against a source (#243). The
screen says what is holding a score down (#291). Nothing is validated against outcomes: the
forecast checks the Report button collects are the only path to that.

**The web app is the WT6 Figma V2 design.** A bottom bar — Conditions · Trips · Map · Crags ·
Profile (#268, #284); Trips and Crags are "not built yet" placeholders.
- **Conditions** is the list, with an opening splash, remembered cards on a reopen (#276–#280)
  and pull to refresh (#299–#301). The API is called at the app's own address, so no CORS
  preflights (#277).
- **A crag** has Overview, Daily, Hourly, Precip, Rock and Crag tabs. Crag is the OpenBeta
  guidebook with a logbook (#202, #206). The editor sets the rock type only (#285, #294).
- **`/add`** searches places and Colorado climbing areas (#302), browses areas by state
  (#303), names a GPS fix after its town (#267), and opens on a point picked on the map. No
  weather preview before saving.
- **Map** (#304, #305): saved crags as score pins on a dark relief map with contours in feet,
  locate me, and a held finger to add a spot. MapLibre + OpenFreeMap, recoloured from tokens;
  terrain from AWS Open Data. Tiles load straight from the browser — the one exception to
  "external calls are proxied" (owner decision 2026-10-02, architecture.md). The map chunk
  warms 3 s after sign-in and the map outlives the tab; sign-out discards it.
- **Profile** holds preferences — temperature range, the tab a crag opens on (#286) — and how
  the score works (#296).

**Design is an open conversation** with the owner, not a rulebook (#298). CSS and motion are
allowed (#292); `docs/handoffs/ui-craft.md` (#295) and three vendored design skills (#297)
are the guidance.

**Storage:** weather runs are stored per place (#194), fetched only when Open-Meteo published
a new run (#195), with no raw payloads (#208). The daily forecast reads the stored ensemble
run (#274). Neon's 512 MB cap is the constraint behind all of it.

**Delivery tooling:** Vercel deploys from `main` only, and only the project a change touched
(#255). A merge is blocked until the CI reviewer's `## Claude review` comment names the PR's
head commit (#257). `check:ui` drives the web app in Chromium against the real database
(#260) and covers every screen, the Map tab included.

### What is running

- **API** — `https://weather-team6-api.vercel.app`. The owner's account exists, username `tim`.
- **Web app** — https://weatherteam6.vercel.app, installable, with a service worker that
  caches the app shell (map chunk included). The owner uses it on a phone at about 480×1000
  CSS px.
- **cron-job.org** — `check-alerts`, `collect-runs`, `prune-runs`. **`collect-runs` answers
  `200 OK` when it persists nothing** — that hid a day-long outage on 2026-09-13; whether to
  change it is undecided.

**Baseline (2026-10-02):** `npm run test` 1,330 passing — 650 api, 460 miniapp, 220 types —
across 40 / 40 / 12 files; `check:hooks` 109; `check:ui` 106. **Compare the file count, not
just the test count** — miniapp once printed "123 passed" with three files failing to collect.

**Mutation:** the weekly job last passed on 2026-09-28 against `thresholds.break: 67`.

**Credentials for unattended runs.** `DATABASE_URL`, `CRON_SECRET`, `API_SHARED_SECRET` and
`VERCEL_TOKEN` are Windows **user** environment variables — read one with
`[Environment]::GetEnvironmentVariable('NAME','User')`, because `$env:` can read empty while
it exists. Never echo one. `AUTH_TOKEN_SECRET` is not among them; a local run generates a
throwaway. `VERCEL_TOKEN` is team-scoped and reaches `https://api.vercel.com` with no
`teamId` — that is how env vars get set, because the Vercel MCP's `projectEnvVars` 403s.

---

## What is next

Nothing is scheduled; the owner picks from the open issues (`gh issue list`).

- **Map follow-ups** — a day slider that recolours the pins (#306, the map version of #217),
  OpenBeta areas as a faint layer (#307), 3D terrain (#308), overlapping pin labels (#309),
  and radar as a map layer (#214, which needs a decision on proxying IEM tiles first).
- **#293** — wall direction and angle per guidebook wall; Wall A (`evaluateWallA`) is built
  and nothing calls it yet. **Do not score `aspectDegrees` directly**: the same aspect flips
  sign by season.
- **Trips and Crags** are bottom-bar placeholders.
- **Idea issues #213–#225** — webcams, sensors, trip planner and the rest. Filed, not
  scheduled.

Still open on Crag A: a minimum wait after rain for soft sandstone (F17).

**Unfiled:** `/forecast/:id` and `/conditions/:id` each run their own `computeLiveForecast`,
so one detail view costs two rainfall calls; and ACIS can return a successful response of
all-`'M'` sentinels, yielding `[]` — indistinguishable from a dry month.

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

- **Auto mode will not commit an edit to `.claude/rules/`** — it reads as self-modification.
  The owner turns auto mode off for that change.
- **`check:ui` runs on the dev server, so it never applies the production CSP.** A change to
  `vercel.json`'s headers needs the built app served with them (`vite preview` plus a
  Playwright route that adds the header) — that is how the Map tab's CSP was checked.
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
