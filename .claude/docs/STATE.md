# Current state

**This is the only state document. Read it at session start; do not read the archive.**

`session-archive.md` is history, not state — grep it for the reasoning behind one specific
past decision, never at session start.

Last updated: 2026-09-22 · `main` @ `ee3c63f`

---

## Direction: Telegram is being removed

**Decided by the owner on 2026-09-22 and approved. The Telegram client mandate is REVERSED.**
The Mini App becomes a standalone web app on Vercel and the bot is deleted outright. The plan
is `docs/handoffs/leave-telegram-v1.md` — read it before any work on the client, on auth, or on
anything under `apps/api/src/lib/telegram/`. **Nothing is built yet; Phase 1 has not started.**

| Decision | Answer |
| --- | --- |
| The bot | **Delete Telegram entirely.** No bot, no webhook, no alert delivery. |
| Auth | **Passphrase → signed token**, a third `Authorization` scheme beside `Bearer`. |
| Alerts | **Parked.** Alert *data* keeps being collected; delivery is a future decision. |
| Audience | **Owner plus a few climbing partners.** Build the identity seam once, properly. |

Four phases: **1** token auth in the API · **2** the web app stands alone · **3** delete
Telegram · **4** docs and rules. Phases 1 and 2 are additive and independently revertible;
**Phase 3 is the irreversible one** and gets its own PR.

**Two loaded documents still say the opposite, and they are not blocking.** `CLAUDE.md` and
`.claude/rules/architecture.md` both carry the Telegram client mandate and the *"Do not build a
login UI. Do not add sessions."* rule. Those overrides are listed in the handoff's § Explicit
rule overrides and the rule text is amended in **Phase 4**, deliberately not before — a
docs-only rewrite of both files ahead of the code would leave the repo describing something
that does not exist. Follow the handoff where they disagree.

**One correction the handoff carries:** `CLAUDE.md` and `apiAuth.ts:13-14` claim protecting
Vercel's production alias needs a paid plan. It does not any more — Vercel Authentication at
"All Deployments" scope is free on Hobby. Not the chosen approach, but stop repeating it.

---

## Where the project is

**The active line is scoring model v2, and Phases 0 through 3 are shipped and live.** The
spec is `docs/handoffs/weatherteam6-scoring-model-handoff-v1.md`; read it before touching
anything that produces or renders a reading.

The model answers two questions separately — *is the rock dry* and *will it feel good to
climb on* — and derives one 0-100 number from them by a weighted geometric mean. **That
number is the one on every screen**; the five-component scorer still runs, is rendered
nowhere, and Phase 5 deletes it.

**Two rules to carry into any surface work. Together they are the point of the change:**

1. **The words are the readings themselves, never a phrase derived from the number.**
   `stateLabel` and `summarizeConditions` are **deleted**; a ladder must not be reintroduced.
2. **A reading is a label and a value, never a sentence** — `Dryness: Dry · Friction: Great ·
   Score: 100`, then `Good hours: All day`. Phase 3b wrote them as prose and the owner's
   verdict (2026-09-22) was that it **read as fact**. The two required caveats are fragments.

The rest — reversed Severe+ suppression, the ban on publishing a friction magnitude, the
alerts-pending gate — is in `.claude/rules/architecture.md` and
`packages/types/src/readingsCopy.ts`, the copy model the bot and the Mini App share.

**The dataviz line is parked, not cancelled.**
`docs/handoffs/miniapp-hourly-dataviz-handoff-v1.md` has its own Phases 1–5 (1, 1b, 2, 3
shipped) — **do not confuse its numbering with the scoring model's.** Its Phase 4 is
superseded by the scoring handoff's; its Phase 5 is still wanted. **A CSS or motion
architecture is still not authorised.**

### What is running

- **API** — Express on Vercel, one serverless function. Live.
- **Mini App** — three routes (list, detail, `/add`) at https://weatherteam6.vercel.app.
  Detail is Daily / Hourly tabs, inline SVG, no chart library. **Nobody has seen any of it on
  a phone.**
- **Bot** — nine commands as native Rich Message tables with an HTML fallback. Its conditions
  panel reads the same `summarizeReadings` the Mini App does. It is also the **only
  notification channel in the product**: NWS alerts reach the owner through
  `notifyPendingAlerts` and nothing else. **All of this is deleted in migration Phase 3, and
  no notification channel replaces it** — alert *data* keeps being collected and shown in the
  app, and reaches nobody until a channel is chosen. Accepted; do not deepen the bot.
- **`/api/cron/collect-runs`** and **`prune-runs`** on cron-job.org. Retention 2 days parsed
  / 6h raw. **`collect-runs` answers `200 OK` when it persists nothing** — that hid a
  day-long outage on 2026-09-13; whether to change it is undecided.
- **`apps/mobile`** — archived, out of the build.
- Chart invariants live in the `miniapp-patterns` skill, the bot's in `telegram-patterns`.
  Both load when you open a file they govern; not repeated here.
- **A mockup artifact is the spec; its prose summary is not.** One phase was built twice for
  reading a handoff's *description* of a design instead of opening the artifact it links.

**Baseline:** `npm run test` **1,026 passing** (699 api, 260 miniapp, 67 types); `typecheck`,
`lint` and `check:hooks` (58) clean; `check:conditions` **17/17** against real Postgres and
live Open-Meteo. **Mutation 67.82%** (2026-09-21) against `thresholds.break: 67` — 0.82 of
headroom and api source has changed since, so check the run rather than assuming. ~37 min.
**Read the file count, not just the test count**: miniapp once printed *"123 passed"* with
three files failing to collect, having silently shrunk by 44.

**Claude runs the acceptance checks unattended.** `DATABASE_URL`, `CRON_SECRET` and
`API_SHARED_SECRET` are Windows user environment variables, `Bash(npm run check:*)` is
allowlisted, and the Vercel MCP serves logs and deployments. Production API is
`https://weather-team6-api.vercel.app`. Do not ask the owner to paste output. **Never echo a
credential.**

**Also true:** Playwright MCP works (a 403 is usually a Cloudflare challenge that clears in
8–10s, not a paywall). The deterministic JSON-parse failures are still unexplained — working
theory is Open-Meteo rate-limiting Vercel's shared egress IP. `CLAUDE.md` + `.claude/rules/*`
load every session, so check whether a new paragraph belongs in a skill or the archive
instead. **You did not have to read this file** — the `SessionStart` hook injects it with the
branch, tree, PRs, issues and CI status; if that block was absent, say so.

---

## What is next

1. **Leave Telegram, Phase 1 — token auth in the API.** `docs/handoffs/leave-telegram-v1.md`.
   Nothing else on this list depends on it — but Phase 2 does, and the migration cannot start
   without it.
2. **The measurements disclosure** — humidity, temperature, last rain, precipitation and dew
   point behind a drop-down. Asked for on 2026-09-22. It is where the caveats' *mechanism*
   belongs now the gauges are terse, and it makes a reading checkable for the first time.
3. **One Current Conditions block** — everything "now" is spread across a now-line, a
   readings section and chips.
4. **Humidity and dew point charts, which exist nowhere**, though both are fetched and
   stored — `dewpoint_c` is read by nothing.
5. **A current-location GPS option.** No design yet. Prefer the browser geolocation API.
   **Cheaper after the migration** — browser geolocation needs no Telegram capability gate.
6. **Scoring Phase 4 — the location editor.** Rock type, aspect, tilt. **Unblocked.** Every
   saved location has `cliff_angle` unset and defaulted to 45, one has no `rock_type`, and
   **nothing in the response marks either** — a reading on two placeholders looks exactly
   like one on recorded crag data. **Do not score `aspectDegrees` directly** (#139): no
   constant works, because the same aspect flips sign between seasons.
7. **Scoring Phase 5 — preferences, then retirement.** Delete the five-component scorer,
   `SCORE_COMPONENT_MAX`, the `component_*` fields and the parts of `scoring-algorithm.md`
   describing them. A deletion, not a migration. It owns the nuance 3b left: a window in the
   past still renders as that day's window, so *"Good hours: 6am–9am"* at 2pm is true and
   reads like advice for now.
8. **Parked:** issue #82 part 2. **Cancelled:** Phase 4 of the bot plan (`/insight`,
   `/afd`) — the bot is being deleted.

---

## Open issues

**Read them from GitHub — `gh issue list`.** Standing context not on the issues themselves:

- **#21, #108, #137, #148** — closed. #21's replacement is the v2 handoff, built through
  Phase 3.
- **#25** — product decision: a new cron, or delete the two endpoints.
- **#27** — parts 1, 3, 4 done; **part 2 open** and needs a migration.
- **#32** — much less likely since #33, and v2 has no "today row" to miss.
- **#138–#140** — #139 is half-answered by Phase 4; #140's humidity averaging is superseded
  by the v2 condensation margin. Re-read both against v2 before working them.
- **#143** — still the only path to knowing whether any of this predicts anything. **Nothing
  in v2 is validated against outcomes.**
- **#155** — why irradiance comes from one model and is never pooled. Live constraint.

**Unfiled, worth filing when touched:** `/forecast/:id` and `/conditions/:id` each run their
own `computeLiveForecast`, so one detail view costs two ensemble calls plus two rainfall
calls; and ACIS can return a *successful* response of all-`'M'` sentinels, yielding `[]` —
indistinguishable from a dry month, one layer below #34.

---

## Delivery is enforced, not remembered

Standing instruction: **only interact when it is absolutely needed.** Design decisions
qualify; chasing an unmerged PR or a broken check does not. Hooks, branch protection and CI
enumeration are in `CLAUDE.md`. Two things that are not:

- **`review` is not a required check**, so a red reviewer does not block a merge — say so out
  loud rather than quietly merging. **It is worth waiting for**: on 2026-09-22 it found three
  assertions that could not have failed, in an otherwise green PR. Failure signatures are in
  the archive — grep **"claude-review troubleshooting"**.
- **Mutation testing** — weekly in CI, `npm run test:mutation --workspace=apps/api` on
  demand. **A rising score is not the goal**; act on survivors that contradict something this
  repo has written down about itself.

If a gate fires, finish the work; if it misfires, add a case to `check-hooks.mjs`. Never
disable branch protection to land something.

---

## Live gotchas

Still true and still biting. Historical ones are in the archive.

- **Python and `jq` are not installed.** `python3` is the Windows Store stub, which prints an
  advert and exits 0. A pipeline through `jq` fails silently. Use Node or `gh --jq`.
- **The working tree is CRLF.** Multi-line `sed`/`perl` replacements match nothing and report
  success, and a `node -e` replacement has the same problem — match the file's own line
  endings or work on a line array.
- **Backticks in a bash heredoc, or in a double-quoted `node -e`, are command substitution**,
  so a doc paragraph silently loses a backticked filename. **A quoted heredoc is not a
  reliable escape either** — a 456-line one failed to parse at all on 2026-09-22. Write the
  file with the Write tool and `cp` it into place.
- **A source file can contain a literal NUL byte**, which makes `git diff` and `grep` treat
  it as binary and print nothing useful. `grep -a` and `git diff --text` see it.
- **`DELETE` does not free Neon space.** A prune of 700k rows leaves every size in
  `check:runs-storage` unchanged. `TRUNCATE` reclaims; `VACUUM FULL` needs as much free space
  as the table and cannot run at the cap.
- **A fresh merge is not a deploy** — check `list_deployments` before probing production.
- **`/api/v1/health` requires auth**, so an unauthenticated probe answers 401 and is not a
  readiness check.
- **`npm run test` cannot see database behaviour.** Vitest mocks `fetch` and never connects;
  flows that fail only against real Postgres need a `check:*` script.
- **`fetchWithRetry` does not hand every response back.** A 5xx or 429 exhausts four attempts
  and *throws*, so a test mocking 503 to reach a `!res.ok` branch reaches the `catch`
  instead. Use 403.
- **Shared packages must be built before typechecks pass** —
  `npm run build --workspace=packages/types --workspace=packages/design`.
- **`gh` is not always on `PATH`** — `C:\Program Files\GitHub CLI\gh.exe`.
- **Vercel Hobby log retention is ~1 hour**, and its error level is noise (a `DEP0169`
  warning filled 19 of 19 error lines). Check right after a cron fires; filter by message.

---

## What the user owes

**Two things, and neither is a credential or a dashboard setting.**

**1. A trip to the phone.** Open a saved climbing location in the Mini App, on your own
phone, in your own theme. Four questions:

- **The readings block**, which nobody has seen rendered: three labelled gauges
  (`DRYNESS / FRICTION / SCORE`) over their values, then `GOOD HOURS` and its span, then two
  caveat fragments. Does it read as instrument readings rather than a verdict, and are two
  fragments one too many at 360px?
- **Press back on the Hourly tab.** It must return to Daily, not close the app — an
  acceptance criterion **no test here can reach**, because `useBackButton` registers with
  Telegram's SDK and `vitest.config.ts` is a `node` environment with no DOM, deliberately.
  **This question has a shelf life.** Migration Phase 2 replaces `useBackButton` with an
  in-app affordance and makes the behaviour reachable from a preview deploy in an ordinary
  browser. Still worth answering now if you are on the phone anyway; do not schedule a trip
  for it alone.
- **Does the temperature ramp read?** Continuous blue → neutral → amber → red, centred on
  16 °C, on its second attempt; the stepped version had its two warm steps only **ΔE 13.0**
  apart, below the floor for telling two hues apart.
- **The seven-day strip and the day pager** — does the band read as confidence or as a
  smudge, are 168 rain bars too thin, and does `‹ Wed, Sep 16 ›` beat the seven chips?

**2. Does the 0-100 number survive?** Scoring handoff § Open Questions 3, asked rather than
deferred since the readings landed beside it. It stays for now on the §5.1 decision. It is
now the third gauge in a row of three, and **ranking is the one job it still has alone** —
the daily list's bar and the seven-day comparison need a scalar, and two ordered word-pairs
do not sort. It is also the only thing suppression can remove, because the words are
measurements. Dropping it is a Phase 5 change, not a revert, and **no answer is needed to
proceed with anything above.**
