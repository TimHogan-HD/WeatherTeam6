# Current state

**This is the only state document. Read it at session start; do not read the archive.**

`session-archive.md` is history, not state — grep it for the reasoning behind one specific
past decision, never at session start.

Last updated: 2026-09-03 · `main` @ `57ea830`

---

## Where the project is

The Telegram crossover is **complete**, and the chat interface has been rebuilt three times
from real-device feedback since. Phase 5 (add/remove/update locations from chat) shipped
2026-09-03. Current state:

- **API** — Express on Vercel, one serverless function. Live.
- **Mini App** — three routes (list, detail, `/add`), live at https://weatherteam6.vercel.app
- **Bot** — `/start`, `/help`, `/locations`, `/conditions`, `/forecast`, `/rain`, `/alerts`,
  `/weather`, `/remove`, rendered as **native Telegram Rich Message tables** (Bot API 10.1+),
  with an HTML fallback on a permanent rejection. `/weather`, `/remove` and the Save flow are
  **unverified against a real device** — see below. Everything else was confirmed working on
  the owner's phone 2026-09-03.
- **`/api/cron/collect-runs`** and **`/api/cron/prune-runs`** are registered with
  cron-job.org and **confirmed running** (2026-09-03). `collect-runs` sometimes still shows
  "timeout" in cron-job.org's own UI at its 30s job timeout, but Vercel completes the work
  to its own 60s `maxDuration` regardless — that reads as a reporting artifact, not a real
  failure, unless the honest per-location failure counts (see below) say otherwise.
- **`apps/mobile`** — archived, out of the build. Do not add features to it.
- **Phase 5 shipped 2026-09-03** (PR #91, on top of #82 part 1's `feature_code` plumbing from
  PR #90). `placeSubtitle` — the picker's plain-language kind, e.g. "Park · Wisconsin, United
  States" — moved into `packages/types/geocodeCopy.ts` so the Mini App's `/add` and the bot's
  `/weather` share one implementation instead of two that can drift. "Update" a mis-saved
  location is remove-then-add — `/help` says so; no separate edit flow exists.

Baseline: `npm run test` 550 passing (469 api, 50 miniapp, 31 types), `npm run typecheck`
clean, `npm run check:hooks` 58 passing. **Mutation score 66.09%**, last measured
2026-08-26 — not re-measured since. `npm run test:mutation --workspace=apps/api`.

Migrations `0007`–`0009` are applied and both acceptance checks pass (`check:panel-state`
17/17, `check:weather-runs` 40/40) against the real database. **Migration `0010`
(`panel_states.elevation_m`, `.feature_code` — Phase 5) is generated but unapplied**: no
`DATABASE_URL` was reachable in the session that wrote it. `npm run db:migrate` from a
machine that can reach Neon, then `npm run check:chat-locations`, is the next step before
`/weather` can work in production — until then every `/weather` and Save tap will 500 on the
missing columns.

**A half-collection can no longer report as a clean run** (fixed `4176026`/PR #87 — see the
archive for detail). **The underlying cause of the deterministic JSON-parse failures it
surfaced is still unconfirmed** — working theory is Open-Meteo rate-limiting Vercel's shared
egress IP; Hobby-plan log retention is short (~1h), so catching
`[openMeteo] deterministic response was not JSON` means checking the dashboard right after a
scheduled run.

Always-loaded instruction budget: `CLAUDE.md` + `.claude/rules/*`. If you're about to add a
paragraph to either, check first whether the fact is derivable from the repo, or belongs in
a skill or the archive — a bloated always-loaded file causes its own rules to be ignored.

**You did not have to read this file.** The `SessionStart` hook injects it, along with the
branch, working tree, unpushed commits, open PRs, open issues, and whether CI on `main` is
green. If you are reading it because that block was absent, the hook did not fire — say so.

---

## What is next

Direction set 2026-08-26, revised 2026-09-01, current as of 2026-09-03. Phase 5 and issue
#82 part 1 are **done** — see § Where the project is; they're not repeated here.

1. **Apply migration 0010 and verify Phase 5 for real** — before anything else touches
   `apps/api/src/lib/telegram/`. `npm run db:migrate` (needs `DATABASE_URL` for a machine
   that can reach Neon), then `npm run check:chat-locations`, then drive `/weather <place>`,
   both Save buttons, and `/remove` from the owner's phone. Nothing in this flow has touched
   real Postgres or a real client yet.
2. **Issue #82, part 2** — ranking climbing-relevant features (`PRK`, `MT`, `CLF`, `RK`,
   `RESV`) above `PPL`. Still a product decision (helps crags, could hurt city lookups), not
   started.
3. **Phase 4** (`/insight`, `/afd`) — next up. `/insight` needs re-specifying in plain
   language first: "model disagreement, ensemble distribution, outlier, confidence by lead
   time" is exactly the vocabulary the 2026-09-01 reversal removed. `/afd` is unaffected
   (a human forecaster's plain-English text) and could be built standalone if wanted sooner.
4. **An in-app feedback button** — destination and mechanism undecided, still a design
   conversation the owner wants to have first. Do not spec it unilaterally.
5. **Mini App polish** — deliberately downgraded. The owner's words: *"the Mini App doesn't
   need to be super fancy."* Do not start a design system, motion system, or CSS
   architecture for it.

### Facts about the current chat rendering still in force

Full history of how the panels got here (four rounds of device feedback, three rebuilds) is
in the archive — grep `session-archive.md` for "native Telegram tables" and "the rebuild
changed" if you need the reasoning. What's still load-bearing for anyone touching
`apps/api/src/lib/telegram/`:

- **Escaping has exactly two homes and they are opposites.** Rich blocks (JSON): never
  escape. HTML (`panelToHtml`, `sendPlain`, `alertMessage`): always escape. Every plain-text
  reply in the webhook — not just panels — goes through `sendPlain` for this reason; three
  of them didn't, once, and it reintroduced issue #26.
- **No fixed column widths anywhere.** A native table sizes itself; the HTML fallback
  measures header and values and pads to the widest.
- **Units live on the value, never the header** (`6 mph`, not a "mph" column head), `t`
  means the word `trace`, `0 mph` reads `calm`.
- **`clockLabel` is for sentences, `clockShort`/`clockCell` for table cells.** "midnight" in
  a column widens the whole table.
- **Three inline-chart attempts (sparkline, dithered bar, block bar) all failed on a real
  device and were all removed.** Don't add a fourth without the owner asking for one.

---

## Open issues

**Read them from GitHub — `gh issue list`. Do not trust a table in a document.**

Standing context not on the issues themselves:

- **#21** — deferred by the user, twice. Tuning, not correctness. Do not start it.
- **#25** — needs a **product decision**, not code: nothing writes `crag_climbability_history`
  or `location_normals` any more, so it's either a new cron or deleting the two endpoints.
- **#27** — parts 1, 3, 4 done. **Part 2 open**, needs a migration (can't apply from this
  environment).
- **#32** — materially less likely since #33 landed. Entangled with the unfiled
  `ScoreInput` split below.
- **#82** — part 1 shipped; part 2 is § What is next, item 2.

### Unfiled, worth filing when touched

- `ScoreInput` conflates the humidity component with the drying humidity modifier in one
  field, so per-day humidity can't be fixed without moving the drying calculation too.
- `GET /forecast/:id` and `GET /conditions/:id` each run their own `computeLiveForecast` —
  one detail view costs two ensemble calls plus two rainfall calls.
- A layer below #34: ACIS can return a *successful* response whose rows are all `'M'`
  sentinels, yielding `[]` — indistinguishable from a dry month.

---

## Delivery and verification are enforced, not remembered

Standing instruction: **only interact when it is absolutely needed.** Design decisions
qualify; chasing an unmerged PR or a broken check does not.

**Delivery** — two local hooks: `git commit` on the default branch is blocked
(PreToolUse) — branch first; the turn cannot end (Stop hook) with uncommitted changes,
unpushed commits, a pushed branch with no PR, or a green mergeable PR still open. Escape
hatch: `touch .claude/.wip`, delete it when work resumes.

**Verification:** CI runs `build`, `typecheck`, `lint`, `test`, and every root-level
`check:*` script, enumerated from `package.json`. `main` is protected — PR required, CI
required, no force-push, no deletion, enforced for admins. `check:hooks` fails if
`.claude/settings.json` registers a hook no scenario exercises.

`.github/workflows/claude-review.yml` runs an independent reviewer on every non-draft PR.
**Check `num_turns` in the run log before trusting a green pass** — a 4-turn pass on a
900-line diff is a skip with a tick next to it, and it has missed a real defect this way
before. Failure signatures: ~3s pass = missing credential; large
`permission_denials_count` = allowlist too short (`--allowedTools` *replaces* the default,
doesn't extend it) — 1 to 3 denials is routine; `Failed to install Claude Code` with curl
403 = transient, re-run; a run that gets *shorter* on each retry = spent usage quota, not
a repo problem — read the `claude-execution-output.json` artifact before re-running.

### Mutation testing

`npm run test:mutation --workspace=apps/api` — Stryker. Rationale in
`.claude/rules/defect-patterns.md` §11. Baseline 66.09% total / 74.49% covered,
`thresholds.break: 65`. Weekly in CI (`mutation.yml`, ~13 min) and on demand. A rising
score is not the goal — act on survivors that contradict something this repo has written
down about itself.

**None of this is bureaucracy to route around.** If a gate fires, finish the work; if it
misfires, add a case to `check-hooks.mjs` rather than loosening the guard. Never disable
branch protection to land something.

---

## Live gotchas

Only things that are still true and still bite. Historical gotchas are in the archive.

- **Python is not installed.** `python3` resolves to the Windows Store stub, which prints an
  advert and exits 0 — it does not fail loudly. Use Node.
- **The working tree is CRLF.** Multi-line `sed`/`perl` replacements match nothing and report
  success. Use the Edit tool for anything spanning more than one line.
- **`gh` is installed but not always on `PATH`** — full path `C:\Program Files\GitHub CLI\gh.exe`.
- **Shared packages must be built before typechecks pass** —
  `npm run build --workspace=packages/types --workspace=packages/design`.
- **Neon cannot be reached from a cloud dev environment.** Migrations must run from an
  unrestricted machine.
- **`npm run test` cannot see database behaviour.** Vitest mocks `fetch` and never connects.
  Flows that fail only against real Postgres need a `check:*` script.
- **A module mock replaces the whole module.** Use `importOriginal` and spread, or you will
  hide a pure helper and break unrelated tests.
- **`timezone=auto`, not `UTC`.** If a doc says otherwise it predates issue #33; the code and
  #33 are right.
- **`fetchWithRetry` does not hand every response back.** It returns only `res.ok` or a
  non-429 below 500; a 5xx or a 429 exhausts four attempts and *throws*. A test that mocks a
  503 to reach a `!res.ok` branch reaches the caller's `catch` instead. Use 403.
- **Vercel's Hobby-plan runtime log retention is short (~1 hour).** Check logs right after a
  cron run fires, not after waiting for one.

---

## What the user owes

**Rotate the Neon password.** Still outstanding — the connection string was pasted into a
chat transcript on 2026-09-02. Neon dashboard → Roles → reset, then update `DATABASE_URL`
in Vercel. Everything else in the old list (`bot:set-commands`, `TELEGRAM_WEBHOOK_SECRET` +
`setWebhook`, the two cron registrations) is done and confirmed working.

**Run migration 0010.** From `apps/api`, with `$env:DATABASE_URL` set to the pooled Neon
string in the shell (never a `.env` file): `npm run db:migrate`, then
`npm run check:chat-locations`. No session this week has had a reachable `DATABASE_URL`, so
this is a "run it in your own shell" task, not a design decision — but it is the one thing
standing between Phase 5 and actually working in production.

**A product decision is owed, not a credential.** The drying model reads
`archive-api.open-meteo.com` (daily, ERA5 reanalysis) while the rain panel reads the
forecast API's `past_days` (hourly). They disagree badly — 11.3 mm against 90.8 mm for the
same day at the same point — and the archive's version visibly smeared one storm across two
days. The higher-resolution product looks more trustworthy, **but `hours_since_rain` feeds
the conditions score**, so switching changes every score the app has ever shown and touches
`.claude/docs/scoring-algorithm.md`. Do not switch it unilaterally.

`CLAUDE_CODE_OAUTH_TOKEN` is registered and the independent PR reviewer is live, working,
and needs nothing further.

Nothing else is waiting on them. #25 needs a decision, but only when they choose to pick it up.
