# Current state

**This is the only state document. Read it at session start; do not read the archive.**

`session-archive.md` is history, not state — grep it for the reasoning behind one specific
past decision, never at session start.

Last updated: 2026-09-21 · `main` @ `b57dc5e`

---

## Where the project is

**The active line is scoring model v2, and Phases 0 through 3 are shipped and live.** The
spec is `docs/handoffs/weatherteam6-scoring-model-handoff-v1.md`; read it before touching
anything that produces or renders a reading.

The model answers two questions separately — *is the rock dry* and *will it feel good to
climb on* — and derives one 0-100 number from them by a weighted geometric mean. As of
2026-09-21 **that number is the one on every screen**; the five-component scorer still runs
and is rendered nowhere. Phase 5 deletes it.

**One thing to carry into any surface work, because it is the point of the whole change:**
the words on screen are the two readings themselves, never a phrase derived from the number.
`stateLabel` and `summarizeConditions` are **deleted** and a ladder must not be
reintroduced. The rest — the reversed Severe+ suppression, the two required caveat sentences,
the ban on publishing a friction magnitude — is in `.claude/rules/architecture.md` and in
`packages/types/src/readingsCopy.ts`, which is the shared copy model.

### The Mini App data-visualisation line is parked, not cancelled

`docs/handoffs/miniapp-hourly-dataviz-handoff-v1.md` has its own Phases 1–5, of which 1, 1b,
2 and 3 shipped. **Do not confuse its numbering with the scoring model's.** Its Phase 4
(wall-aware scoring) is superseded by the scoring handoff's Phase 4; its Phase 5 (document
reconciliation, and where a CSS or motion architecture gets decided) is still wanted.

**A CSS or motion architecture is still not authorised.** Separate from drawing charts.

### Current state

- **API** — Express on Vercel, one serverless function. Live.
- **Mini App** — three routes (list, detail, `/add`), live at https://weatherteam6.vercel.app.
  Location detail is **Daily / Hourly tabs**. Inline SVG, no chart library.
  **Nobody has seen any of it on a phone** — see § What the user owes.
- **The chart invariants live in the `miniapp-patterns` skill** and the bot's in
  `telegram-patterns`; both load when you open a file they govern. Not repeated here — a copy
  in two places is the drift this document keeps having to repair.
- **A mockup artifact is the spec; its prose summary is not.** One phase was built twice
  because the first pass read a handoff's *description* of a design rather than opening the
  artifact it links.
- **Bot** — `/start`, `/help`, `/locations`, `/conditions`, `/forecast`, `/rain`, `/alerts`,
  `/weather`, `/remove`, as native Rich Message tables with an HTML fallback. The conditions
  panel now leads with the two readings.
- **`/api/cron/collect-runs`** and **`/api/cron/prune-runs`** registered with cron-job.org
  and running. Retention 2 days parsed / 6h raw. **`collect-runs` answers `200 OK` when it
  persists nothing** — that hid a day-long outage on 2026-09-13, and whether to change it is
  still undecided.
- **`apps/mobile`** — archived, out of the build. Do not add features to it.

**Baseline:** `npm run test` **1,028 passing** (699 api, 266 miniapp, 63 types), `typecheck`
clean, `lint` clean, `check:hooks` 58 passing. **Mutation score 67.82%**, measured
2026-09-21, `thresholds.break: 67` — **0.82 of headroom**, so check the run rather than
assuming it passes. It takes ~37 minutes.

**A falling test count can hide behind a green number.** `apps/miniapp` once reported *"123
passed"* while three files failed to collect on a parse error — the suite had shrunk by 44
and still printed green. **Read the file count, not just the test count.**

**Claude runs the acceptance checks unattended.** `DATABASE_URL`, `CRON_SECRET` and
`API_SHARED_SECRET` are Windows user environment variables, `Bash(npm run check:*)` is
allowlisted, and the Vercel MCP serves logs and deployments. The production API alias is
`https://weather-team6-api.vercel.app`. Do not ask the owner to paste output. **Never echo a
credential.**

**Playwright MCP is configured and working** — `.mcp.json` at the repo root, persistent
profile at `C:\Users\Tim\.claude-research-browser`. **A 403 is usually a Cloudflare challenge
that clears in 8–10 seconds, not a paywall** — wait it out before concluding a page is gated.

**The deterministic JSON-parse failures are still unexplained** — working theory is
Open-Meteo rate-limiting Vercel's shared egress IP. Hobby log retention is ~1h, so catch it
right after a scheduled run.

**Instruction budget:** `CLAUDE.md` + `.claude/rules/*` load every session. Before adding a
paragraph to either, check whether the fact is derivable from the repo, or belongs in a skill
or the archive.

**You did not have to read this file.** The `SessionStart` hook injects it along with branch,
working tree, unpushed commits, open PRs, open issues and CI status. If you are reading it
because that block was absent, the hook did not fire — say so.

---

## What is next

1. **Phase 4 of the scoring handoff — the location editor.** Rock type, aspect and tilt,
   editable per location. **It is unblocked and it is the next build.** Running the model
   against the owner's own crags found that *every* saved location has `cliff_angle` unset
   and defaulted to 45, and one has no `rock_type` at all — and **nothing in the response
   marks either**, so a reading built on two placeholders is indistinguishable from one built
   on recorded crag data. `qualified` covers the sun and nothing else.
   **The research says do not score `aspectDegrees` directly** (issue #139): no constant
   works, because the same aspect flips sign between seasons. Both shipped competitors feed
   sun into a "feels like" temperature instead.
2. **Phase 5 — preferences UI, then retirement.** Delete the five-component scorer,
   `SCORE_COMPONENT_MAX`, `scoreUnavailableLine` and the sections of `scoring-algorithm.md`
   that describe them. It is now a deletion rather than a migration: nothing renders that
   score. It also owns the copy pass for the one nuance 3b left — a window in the past still
   renders as that day's window, so *"Good from 6am to 9am"* at 2pm is true and reads like
   advice for now.
3. **Phase 5 of the dataviz plan** — recent rain, document reconciliation, and where a CSS or
   motion architecture gets decided.
4. **Issue #82, part 2** — ranking climbing-relevant features above `PPL`. Product decision.
5. **Phase 4 of the *bot* plan** (`/insight`, `/afd`) — parked. `/insight` needs
   re-specifying in plain language; `/afd` could be built standalone.

---

## Open issues

**Read them from GitHub — `gh issue list`. Do not trust a table in a document.**

Standing context not on the issues themselves:

- **#21 and #108 and #137 and #148** — all closed. #21's replacement is the scoring model v2
  handoff, which is now built through Phase 3.
- **#25** — needs a product decision: a new cron, or delete the two endpoints.
- **#27** — parts 1, 3, 4 done. **Part 2 open**, needs a migration.
- **#32** — materially less likely since #33, and the v2 model does not have a "today row"
  to miss. Re-read it against v2 before working it.
- **#138–#140** — filed from the research. **#139 is now half-answered by Phase 4**, which is
  what makes aspect real; #140's humidity averaging is superseded by the v2 model's
  condensation margin, so re-read it before working it.
- **#143** — the feedback button is still the only path to knowing whether any of this
  predicts anything. Nothing in v2 is validated against outcomes.
- **#155** — the reason irradiance comes from one model and is never pooled. Live constraint.

### Unfiled, worth filing when touched

- `GET /forecast/:id` and `GET /conditions/:id` each run their own `computeLiveForecast` —
  one detail view costs two ensemble calls plus two rainfall calls, and `/conditions` now
  reads a stored hourly run on top.
- A layer below #34: ACIS can return a *successful* response whose rows are all `'M'`
  sentinels, yielding `[]` — indistinguishable from a dry month.

---

## Delivery and verification are enforced, not remembered

Standing instruction: **only interact when it is absolutely needed.** Design decisions
qualify; chasing an unmerged PR or a broken check does not.

Hooks, branch protection and CI enumeration are in `CLAUDE.md`. Two things that are not:

- **`review` is not a required check**, so a red reviewer does not block a merge — it means
  the diff got one reviewer instead of two, and that is worth saying out loud rather than
  quietly merging. Its failure signatures are in the archive: grep **"claude-review
  troubleshooting"**.
- **Mutation testing** — `npm run test:mutation --workspace=apps/api`. Weekly in CI.
  **A rising score is not the goal** — act on survivors that contradict something this repo
  has written down about itself.

If a gate fires, finish the work; if it misfires, add a case to `check-hooks.mjs` rather than
loosening the guard. Never disable branch protection to land something.

---

## Live gotchas

Only things that are still true and still bite. Historical gotchas are in the archive.

- **Python is not installed.** `python3` resolves to the Windows Store stub, which prints an
  advert and exits 0 — it does not fail loudly. Use Node.
- **`jq` is not installed either.** A pipeline through it fails silently, and with a
  `|| echo '[]'` fallback it loops emitting nothing. Use `node -e` or `gh --jq`.
- **The working tree is CRLF.** Multi-line `sed`/`perl` replacements match nothing and report
  success. Use the Edit tool for anything spanning more than one line.
- **Backticks in a bash heredoc — or in a double-quoted `node -e` — are command
  substitution.** A doc paragraph containing `` `filename.md` `` silently loses the filename,
  and a `node -e` string replacement containing backticks fails to match. This cost a
  correction in each of the last two sessions. Use the Write or Edit tool for prose
  containing code spans.
- **`DELETE` does not free Neon space.** A prune removing 700k rows leaves every size in
  `check:runs-storage` unchanged — not a failure. `TRUNCATE` reclaims; plain `VACUUM` makes
  space reusable; `VACUUM FULL` needs as much free space as the table and cannot run at the
  cap.
- **A fresh merge is not a deploy.** A probe 45s after merging reported three failures that
  were the old code. Check `list_deployments` (Vercel MCP) first.
- **`/api/v1/health` requires auth like everything else** — an unauthenticated probe of it
  answers 401, so it is not a readiness check.
- **Vercel's error level is noise** — anything on stderr counts, and a `DEP0169` warning
  filled 19 of 19 error lines in three hours. Filter by message; a real failure may be at
  `warn`.
- **`gh` is installed but not always on `PATH`** — full path `C:\Program Files\GitHub CLI\gh.exe`.
- **Shared packages must be built before typechecks pass** —
  `npm run build --workspace=packages/types --workspace=packages/design`.
- **Neon cannot be reached from a cloud dev environment.** Migrations run from an
  unrestricted machine.
- **`npm run test` cannot see database behaviour.** Vitest mocks `fetch` and never connects.
  Flows that fail only against real Postgres need a `check:*` script.
- **A module mock replaces the whole module.** Use `importOriginal` and spread, or you will
  hide a pure helper and break unrelated tests.
- **`timezone=auto`, not `UTC`.** If a doc says otherwise it predates issue #33.
- **`fetchWithRetry` does not hand every response back.** It returns only `res.ok` or a
  non-429 below 500; a 5xx or a 429 exhausts four attempts and *throws*. A test mocking a 503
  to reach a `!res.ok` branch reaches the caller's `catch` instead. Use 403.
- **Vercel's Hobby-plan runtime log retention is ~1 hour.** Check logs right after a cron run
  fires, not after waiting for one.

---

## What the user owes

**Two things, and one of them is new.**

### 1. A product decision — does the 0-100 number survive?

Scoring handoff § Open Questions 3, **asked rather than deferred as of 2026-09-21** because
it could only be answered once the readings were on screen beside it. It stays for now, on
the owner's §5.1 decision. Two things building Phase 3b turned up:

- It is doing visibly less work. On the list card it is a bare figure beside *"Dry rock ·
  Great friction"*. The one place it still earns its keep is **ranking** — the daily list's
  bar and its seven-day comparison need a scalar, and two ordered word-pairs do not sort.
- It is what makes a suppression rule possible. Dropping a number under a warning is a thing
  a surface can do; there is no equivalent move for a measurement.

Dropping it is a Phase 5 change, not a revert.

### 2. A trip to the phone

**Still outstanding, and now covering more.** No credential, no dashboard setting. Open a
saved climbing location in the Mini App, on your own phone, in your own theme:

1. **The readings, which nobody has seen rendered.** *"Dry rock · Great friction"* at card
   title size, the window line and a small score chip under it, and two caveat sentences
   below that. Is the caveat pair too much on a phone, and does the number read as secondary
   or as missing?
2. **Press back on the Hourly tab.** It must return to Daily, not close the Mini App. An
   acceptance criterion **no test in this workspace can reach** — `useBackButton` registers
   with Telegram's SDK, and `vitest.config.ts` is a `node` environment with no DOM,
   deliberately.
3. **Does the temperature ramp read?** A continuous blue → neutral → amber → red scale
   centred on 16 °C, on its second attempt — the stepped version it replaced had its two warm
   steps only **ΔE 13.0** apart, below the floor for telling two hues apart.
4. **The seven-day strip, and the day pager.** Whether the band reads as confidence or as a
   smudge, whether 168 rain bars are too thin to see, and whether `‹ Wed, Sep 16 ›` beats the
   seven chips it replaced.
