# Current state

The only state document. `session-archive.md` is history — grep it for the reasoning behind
one past decision, never read it at session start. The SessionStart hook warns when this file
falls more than 15 commits behind `main`.

Last updated: 2026-10-21 · `main` @ `3b35305`, plus the F17 PR

---

## Where the project is

**Telegram is gone** (2026-09-23). Auth is a passphrase and a signed token. Accounts come
from `user:add` or a one-time invite link the owner mints on Profile (#328, #329); sign-in is
capped per username (#330). The audience is the owner plus a few climbing partners, each with
their own list. The cleanup is recoverable from the `archive/2026-09-23-pre-cleanup` tag.

**Crag A is the only score** (owner decision 2026-09-24, `lib/scoring/cragModel.ts`). The
drying clock reads the median of the four global models' six-hour mean rain (#324, #326);
rock surface temperature lags the sun by 2 h, measured against USCRN (#226); today counts
only the hours still ahead (#227). **Rock that breaks when wet never dries faster than
elapsed time** (F17, 2026-10-21, `maxDryingRate`; the owner asked for a wait after rain,
and a measurement picked this form of it). Before this, Red Rock
scored 76 two days after half an inch of rain in January sun; now it scores 39. Every known
crag's rock type was checked against a source (#243). Climbing areas lock the rock type, and
**Wrong rock type?** corrects it (#342). No friction word appears on any screen (#321). Score
causes appear only in Score breakdown. Nothing is validated against outcomes: the forecast
checks the Report button collects are the only path to that.

**The web app is the hybrid look** (owner, 2026-10-19; `docs/handoffs/miniapp-hybrid-transition-v1.md`,
all five phases built, #345–#370): dark liquid glass on a still background, an aqua
selection, page transitions, and a crag switcher on top. The bottom bar is Conditions ·
Trips · Map · Crags · Profile. Opening a crag swaps it for a glass dock of the crag's tabs.
- **Conditions** is the list, with remembered cards on a reopen and pull to refresh.
- **A crag** has Overview, Daily, Hourly, Precip, Rock and Crag tabs. The Overview hero is
  the crag's name, the hour-now score, and one Today chart starting at now (#358, #364).
  Hourly has four scrubbed charts with figures inside each card (#355). Crag is the OpenBeta
  guidebook with a logbook, drawn to the mockup (#368).
- **Trips** is built (#314–#316, #323, #335, #340, #369): a 16-day outlook per trip, a
  recorded forecast trend (whole trip and by day), editing, and an ended trip's day-by-day
  summary.
- **Map** (#304, #305): score pins on a dark relief map. Tiles load straight from the
  browser, which is the one exception to "external calls are proxied".
- **Crags** is still the "not built yet" placeholder (`UnbuiltSection`).
- **Profile** holds preferences, how the score works, invites, and everyone's open
  feedback for the owner to read and clear (#341).

**Design is an open conversation** with the owner, not a rulebook (#298).

**Storage:** weather runs are stored per place, fetched only when Open-Meteo published a new
run, with no raw payloads. The daily forecast reads the stored ensemble run. One broken model
no longer blanks the ensemble: each model is asked alone and whatever answers is pooled
(#334). Neon's 512 MB cap is the constraint behind all of it.

**Delivery tooling:** Vercel deploys from `main` only, and only the project a change touched.
A merge is blocked until the CI reviewer's `## Claude review` comment names the PR's head
commit; the gate reads GitHub over REST and fails closed (#331). Rules are split into
path-scoped files under `.claude/rules/` (#332). `check:ui` drives every screen in Chromium
against the real database. `--list-only` runs just the list checks in about 2 minutes
(#375), and `--sweep` removes stale test users (#371).

### What is running

- **API** — `https://weather-team6-api.vercel.app`. The owner's account is `tim`.
- **Web app** — https://weatherteam6.vercel.app, installable. A deploy reaches the first
  open after it (#367). The owner uses it on a phone at about 480×1000 CSS px.
- **cron-job.org** — `check-alerts`, `collect-runs`, `prune-runs`. `/api/cron/record-trips`
  exists too; this rewrite did not check whether it is registered there.
  **`collect-runs` still answers `200 OK` when it persists nothing.** That hid a day-long
  outage on 2026-09-13, and whether to change it is undecided.

**Baseline (2026-10-21):** `npm run test` 1,555 passing: 757 api, 560 miniapp and 238 types,
across 49, 51 and 14 files. `check:ui` was fully green at 173/0 on 2026-10-20 (#372).
**Compare the file count, not just the test count.** One full run on 2026-10-21 showed one
api file failing while a CPU-heavy script ran beside it, and the rerun passed 49/49. If it
recurs, find the file.

**Mutation runs again (#377, #380): 71.60% on 2026-10-21**, `thresholds.break` raised to
71. It takes 64 minutes on CI, under a 120-minute cap. 446 mutants have no covering test.

**Credentials for unattended runs.** `DATABASE_URL`, `CRON_SECRET`, `API_SHARED_SECRET` and
`VERCEL_TOKEN` are Windows **user** environment variables. Read one with
`[Environment]::GetEnvironmentVariable('NAME','User')`, because `$env:` can read empty while
it exists. Never echo one. `AUTH_TOKEN_SECRET` is not among them; a local run generates a
throwaway. `VERCEL_TOKEN` is team-scoped and reaches `https://api.vercel.com` with no
`teamId`. That is how env vars get set, because the Vercel MCP's `projectEnvVars` 403s.

---

## What is next

Nothing is scheduled; the owner picks from the open issues (`gh issue list`).

- **Open feedback**: krazykoreankyle (2026-10-17) says the score misses tree-covered crags
  and crags near water. Crag A has no shade or local-humidity input. Not answered yet.
- **#293**: wall direction and angle per guidebook wall. Wall A (`evaluateWallA`) is built
  and nothing calls it yet. **Do not score `aspectDegrees` directly**: the same aspect flips
  sign by season.
- **#415 Sun on the wall**: built for Red Wing (#419, 2026-10-27), on the Rock tab, display
  only. Another crag needs the owner's `sun_confirmed`, then `npm run sun:walls`. A ShadeMap
  link and tree shade are still open on the issue.
- **Map follow-ups**: #306, #307, #308, #309, and radar (#214, which needs a decision on
  proxying IEM tiles first).
- **The Crags tab** is a placeholder.
- **Idea issues** (#213–#225, #313, #317, #318): filed, not scheduled.

Still open on Crag A, from `crag-a-reference/README.md`: G5 (overhang in all-day drizzle
scores 0 on synthetic weather) and G10/F13 (the heat rule can't see an overhang's shade).

---

## Working with the owner

- Interact only when it is needed. Design decisions qualify; chasing an unmerged PR does not.
- **Merge in the same turn**: wait for CI and the review in a bounded loop, then merge.
- **Visual work goes by side-by-side variants**: mock two or three, screenshot them together
  at phone size, and let the owner pick.
- **The owner's field knowledge beats the research docs**, especially on rock and safety.

---

## Live gotchas

`CLAUDE.md` § Known Gotchas carries the rest.

- **Auto mode will not commit an edit to `.claude/rules/`**, because it reads as
  self-modification. The owner turns auto mode off for that change.
- **The Crag A reference harness** (`.claude/docs/crag-a-reference/`) answers a model
  question in under 10 seconds when cut to `accuracy()`. A full run takes 9 minutes and about
  2 GB. Its README says how.
- **`check:ui` runs on the dev server, so it never applies the production CSP.** A change to
  `vercel.json`'s headers needs the built app served with them (`vite preview` plus a
  Playwright route that adds the header).
- **`API_SHARED_SECRET` on preview differs from production** (deliberately).
  `AUTH_TOKEN_SECRET` is the same across all three targets. Env vars apply to new deployments
  only.
- **The reviewer action will not run on a PR that edits `claude-review.yml`.** The merge gate
  exempts such a PR; its first real review is the next PR.
- **A command containing the text `gh pr merge <n>`** (an echo, a test payload) trips the
  merge gate. Put such payloads in a file.
- **Backticks in a bash heredoc or a double-quoted `node -e` are command substitution.** Write
  the file with the Write tool.
- **`sed` with `|` as the delimiter breaks on Markdown table rows.** Use `c\` instead.
- **A source file can contain a literal NUL byte**, which makes `git diff` and `grep` treat it
  as binary. `grep -a` and `git diff --text` see it.
- **`DELETE` does not free Neon space.** `TRUNCATE` reclaims; `VACUUM FULL` needs as much free
  space as the table and cannot run at the cap.
- **A fresh merge is not a deploy.** Check the deployment state before probing production.
- **`fetchWithRetry` throws after exhausting retries on a 5xx or 429**, so a test mocking 503
  to reach a `!res.ok` branch reaches the `catch` instead. Use 403.
- **`drizzle-kit generate` needs no database**, only a non-empty `DATABASE_URL`.
- **Vercel Hobby log retention is ~1 hour.** Check right after a cron fires.

---

## What the user owes

None of it blocks work. Neither item has been confirmed done since 2026-09-23.

1. **Tear down the Telegram bot registration.** Telegram still delivers updates to a path
   that now 404s. Needs `TELEGRAM_BOT_TOKEN` in the owner's own shell, then `deleteWebhook`.
2. **Delete `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET` and
   `AUTH_ENABLED`** from both Vercel projects. Nothing reads them; three are live credentials.
