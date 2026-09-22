# Current state

**This is the only state document. Read it at session start; do not read the archive.**

`session-archive.md` is history, not state — grep it for the reasoning behind one specific
past decision, never at session start.

Last updated: 2026-09-22 · `main` @ `9e8201f`

---

## Direction: Telegram is being removed

**Decided by the owner on 2026-09-22 and approved. The Telegram client mandate is REVERSED.**
The Mini App becomes a standalone web app on Vercel and the bot is deleted outright. The plan
is `docs/handoffs/leave-telegram-v1.md` — read it before any work on the client, on auth, or on
anything under `apps/api/src/lib/telegram/`.

| Decision | Answer |
| --- | --- |
| The bot | **Delete Telegram entirely.** No bot, no webhook, no alert delivery. |
| Auth | **Passphrase → signed token**, a third `Authorization` scheme beside `Bearer`. |
| Alerts | **Parked.** Alert *data* keeps being collected; delivery is a future decision. |
| Audience | **Owner plus a few climbing partners.** Build the identity seam once, properly. |

Four phases: **1** token auth in the API ✅ · **2** the web app stands alone · **3** delete
Telegram · **4** docs and rules. Phases 1 and 2 are additive and independently revertible;
**Phase 3 is the irreversible one** and gets its own PR.

**Phase 1 is shipped, merged and verified against production** (PR #167). `Session <token>`
is a third `Authorization` scheme; `requireApiAuth` is now the only thing that sets
`req.userId` under `/api/v1`, from the presented credential. The bot and the Mini App are
untouched and still work — this phase only added a door.

**The auth rules in `CLAUDE.md` and `.claude/rules/architecture.md` were corrected in that
PR**, ahead of the Phase 4 schedule, because a Non-Negotiable Rule forbidding the login UI
Phase 2 builds misdirects harder than a stale description. **Their Telegram halves are
untouched and still say the opposite** — the `telegram-patterns` skill,
`miniapp-design-v1.md` and the superseded banners are all Phase 4. Follow the handoff where
they disagree; it is not blocking.

---

## Where the project is

**Two live lines. Neither blocks the other.**

**Scoring model v2 — Phases 0 through 3 shipped and live.** The spec is
`docs/handoffs/weatherteam6-scoring-model-handoff-v1.md`; read it before touching anything
that produces or renders a reading. The model answers *is the rock dry* and *will it feel
good to climb on* separately and derives one 0-100 number by a weighted geometric mean.
**That number is the one on every screen**; the five-component scorer still runs, renders
nowhere, and Phase 5 deletes it.

Two rules govern every surface and are **the point of the change**: the words are the
readings themselves, never a phrase derived from the number (`stateLabel` and
`summarizeConditions` are deleted — a ladder must not come back); and a reading is a label
and a value, never a sentence. Both, with the Severe+ suppression, the ban on publishing a
friction magnitude and the alerts-pending gate, are stated in full in
`.claude/rules/architecture.md` and implemented once in `packages/types/src/readingsCopy.ts`.
Not repeated here — they load every session anyway.

**The dataviz line is parked, not cancelled.**
`docs/handoffs/miniapp-hourly-dataviz-handoff-v1.md` has its own Phases 1–5 (1, 1b, 2, 3
shipped) — **do not confuse its numbering with the scoring model's or the migration's.** Its
Phase 4 is superseded by the scoring handoff's; its Phase 5 is still wanted. **A CSS or
motion architecture is still not authorised.**

### What is running

- **API** — Express on Vercel, one serverless function. Live at
  `https://weather-team6-api.vercel.app`.
- **Auth** — three schemes on `Authorization`. `Session <token>` (a real user; `req.userId`
  is the token's subject), `Bearer $API_SHARED_SECRET` and `tma <initData>` (both act as
  `DEFAULT_USER_ID`). `POST /api/v1/auth/login` is mounted **above** the gate. Fail-closed on
  `API_SHARED_SECRET` **and** `AUTH_TOKEN_SECRET`. `npm run user:add` is the only way an
  account exists — there is no signup flow and should not be one.
- **Mini App** — three routes (list, detail, `/add`) at https://weatherteam6.vercel.app,
  still launched from Telegram and authenticating by `tma` until Phase 2. **Nobody has seen
  any of it on a phone.**
- **Bot** — nine commands, and the **only notification channel in the product**. **Deleted in
  migration Phase 3, with no channel replacing it.** Accepted; do not deepen it.
- **`/api/cron/collect-runs`** and **`prune-runs`** on cron-job.org. Retention 2 days parsed
  / 6h raw. **`collect-runs` answers `200 OK` when it persists nothing** — that hid a
  day-long outage on 2026-09-13; whether to change it is undecided.
- **`apps/mobile`** — archived, out of the build.
- Chart invariants are in the `miniapp-patterns` skill, the bot's in `telegram-patterns`;
  both load on the files they govern. **A mockup artifact is the spec, its prose summary is
  not** — one phase was built twice for reading the description instead of opening the file.

**Baseline:** `npm run test` **1,088 passing** (761 api, 260 miniapp, 67 types) across
**40 / 17 / 6** files; `typecheck`, `lint`, `check:hooks` (58) clean. Against real Postgres:
`check:auth` **22/22**, `check:add-location` **17/17**, `check:delete-trip` **9/9**,
`check:conditions` **17/17**. **Mutation 67.82%** (2026-09-21) against `thresholds.break: 67`
— 0.82 of headroom and api source has changed a lot since, so check the run, do not assume.
~37 min. **Read the file count, not just the test count**: miniapp once printed *"123
passed"* with three files failing to collect, having silently shrunk by 44.

**Claude runs everything unattended.** `DATABASE_URL`, `CRON_SECRET`, `API_SHARED_SECRET` and
**`VERCEL_TOKEN`** are Windows user environment variables and `Bash(npm run check:*)` is
allowlisted. Do not ask the owner to paste output. **Never echo a credential.**

**`VERCEL_TOKEN` is new (2026-09-22) and changes what is possible.** Team-scoped, all
projects. Read it with `[Environment]::GetEnvironmentVariable('VERCEL_TOKEN','User')` — it
lives in the registry, not this process's environment block, so `$env:` can read empty while
it exists. It reaches `https://api.vercel.com` directly and **needs no `teamId`**. This is
how environment variables get set now: **the Vercel MCP cannot — `projectEnvVars` 403s in
both directions.**

---

## What is next

1. **Leave Telegram, Phase 2 — the web app stands alone.** A `/login` route, the token in
   `localStorage`, an in-app back affordance, delete `apps/miniapp/src/telegram/` and
   `deepLink.ts`, `100dvh` and `env(safe-area-inset-*)`, a PWA manifest. **Its first PR
   produces the first preview deploy that can actually serve `/api/v1`** — see the gotcha
   below. Read the handoff's Phase 2 before writing any code.
2. **The measurements disclosure** — humidity, temperature, last rain, precipitation and dew
   point behind a drop-down. Asked for 2026-09-22. It is where the caveats' *mechanism*
   belongs now the gauges are terse, and it makes a reading checkable for the first time.
3. **One Current Conditions block** — "now" is spread across a now-line, a readings section
   and chips.
4. **Humidity and dew point charts, which exist nowhere**, though both are fetched and
   stored — `dewpoint_c` is read by nothing.
5. **A current-location GPS option.** No design yet; prefer the browser geolocation API.
   **Cheaper after Phase 2**, which removes the Telegram capability gate.
6. **Scoring Phase 4 — the location editor** (rock type, aspect, tilt). **Unblocked.** Every
   saved location has `cliff_angle` defaulted to 45, one has no `rock_type`, and **nothing in
   the response marks either** — a reading on placeholders looks like one on real crag data.
   **Do not score `aspectDegrees` directly** (#139): the same aspect flips sign by season.
7. **Scoring Phase 5 — preferences, then retirement of the five-component scorer.** A
   deletion, not a migration. It owns the nuance 3b left: a past window still renders as that
   day's, so *"Good hours: 6am–9am"* at 2pm is true and reads like advice for now.
8. **Parked:** issue #82 part 2. **Cancelled:** Phase 4 of the bot plan — the bot is going.

---

## Open issues

**Read them from GitHub — `gh issue list`.** Standing context not on the issues themselves:

- **#21, #108, #137, #148** — closed. #21's replacement is the v2 handoff.
- **#25** — product decision: a new cron, or delete the two endpoints.
- **#27** — parts 1, 3, 4 done; **part 2 open** and needs a migration.
- **#32** — much less likely since #33, and v2 has no "today row" to miss.
- **#138–#140** — #139 is half-answered by scoring Phase 4; #140 is superseded by the v2
  condensation margin. Re-read both against v2 before working them.
- **#143** — the only path to knowing whether any of this predicts anything. **Nothing in v2
  is validated against outcomes.**
- **#155** — why irradiance comes from one model and is never pooled. Live constraint.

**Unfiled, worth filing when touched:** `/forecast/:id` and `/conditions/:id` each run their
own `computeLiveForecast`, so one detail view costs two ensemble and two rainfall calls; and
ACIS can return a *successful* response of all-`'M'` sentinels, yielding `[]` —
indistinguishable from a dry month, one layer below #34.

---

## Delivery is enforced, not remembered

Standing instruction: **only interact when it is absolutely needed.** Design decisions
qualify; chasing an unmerged PR does not. Hooks, branch protection and CI enumeration are in
`CLAUDE.md`. Three things that are not:

- **Do not sit watching CI.** Owner's words, 2026-09-22: *"we get stuck on CI a lot."* Check
  once with `gh pr checks <n>`; if something is pending, say what and move on. **Auto-merge
  is not enabled on this repo** (`enablePullRequestAutoMerge` is refused), so the merge is a
  manual step — background the wait rather than blocking on it.
- **`review` is not a required check**, so a red reviewer does not block a merge — say so out
  loud rather than quietly merging. **It is worth waiting for**: on 2026-09-22 it caught a
  passphrase leaking to the terminal on backspace in code that had passed everything else.
  Failure signatures are in the archive — grep **"claude-review troubleshooting"**.
- **Mutation testing** — weekly in CI, `npm run test:mutation --workspace=apps/api` on
  demand. **A rising score is not the goal**; act on survivors that contradict something this
  repo has written down about itself.

If a gate fires, finish the work; if it misfires, add a case to `check-hooks.mjs`. Never
disable branch protection to land something.

---

## Live gotchas

Still true and still biting. Historical ones are in the archive.

- **An unauthenticated 401 proves nothing but that the gate is shut.** It used to prove
  `DEFAULT_USER_ID` was set. Since `resolveUser` came off the app-wide mount, a missing
  `DEFAULT_USER_ID` shows only as a **500 on an authenticated `Bearer`/`tma` call**, and not
  at all under `Session`. A **503 on every scheme** means `API_SHARED_SECRET` or
  `AUTH_TOKEN_SECRET` is unset. Every `/api/v1/*` path 401s whether or not it exists, so a
  401 is still not evidence a route deployed — check the commit SHA.
- **Preview deploys are behind Vercel SSO** (`ssoProtection: all_except_custom_domains`), so
  a preview URL answers **302 to a login page**, not your app. The production `*.vercel.app`
  alias is exempt. **Phase 2 wants Playwright on a preview**, which needs either a
  protection-bypass secret or SSO off for previews — **both are security settings; ask the
  owner first.**
- **`API_SHARED_SECRET` on preview is a DIFFERENT value from production** (set 2026-09-22,
  deliberately, because production's is sensitive and unreadable). `AUTH_TOKEN_SECRET` is the
  same across all three targets. Env vars apply to **new** deployments only.
- **`AUTH_ENABLED` still exists in Vercel and nothing reads it.** Dead; delete when convenient.
- **Backticks in a bash heredoc, or in a double-quoted `node -e`, are command substitution.**
  **A quoted heredoc is not a reliable escape either** — a 456-line one failed to parse at
  all on 2026-09-22. Write the file with the Write tool and `cp` it into place.
- **A source file can contain a literal NUL byte**, which makes `git diff` and `grep` treat
  it as binary and print nothing useful. `grep -a` and `git diff --text` see it.
- **`DELETE` does not free Neon space.** A prune of 700k rows leaves every size in
  `check:runs-storage` unchanged. `TRUNCATE` reclaims; `VACUUM FULL` needs as much free space
  as the table and cannot run at the cap.
- **A fresh merge is not a deploy** — check the deployment state before probing production.
- **`/api/v1/health` requires auth**, so an unauthenticated probe answers 401 and is not a
  readiness check.
- **`npm run test` cannot see database behaviour.** Vitest mocks `fetch` and never connects;
  flows that fail only against real Postgres need a `check:*` script. **Workspace-level
  `check:*` are deliberately excluded from CI** (`ci.yml:71-73`) — only root-level ones run.
- **`fetchWithRetry` does not hand every response back.** A 5xx or 429 exhausts four attempts
  and *throws*, so a test mocking 503 to reach a `!res.ok` branch reaches the `catch`
  instead. Use 403.
- **Vercel Hobby log retention is ~1 hour**, and its error level is noise. Check right after
  a cron fires; filter by message.

The CRLF working tree, the missing Python, `gh` not being on `PATH`, building the shared
packages, `NODE_ENV` on Vercel, and Vercel refusing to reveal a secret are all in
**`CLAUDE.md` § Known Gotchas**, which loads every session. Deliberately not duplicated here.

---

## What the user owes

**Three things, and none of them blocks Phase 2 starting.**

**1. A trip to the phone.** Open a saved climbing location in the Mini App, on your own
phone, in your own theme. Four questions, in full in the 2026-09-22 archive block:

- **The readings block**, which nobody has seen rendered — does it read as instrument
  readings rather than a verdict, and are two caveat fragments one too many at 360px?
- **Back on the Hourly tab** must return to Daily, not close the app. **This one has a shelf
  life** — Phase 2 makes it reachable from an ordinary browser. Answer now only if you are on
  the phone anyway.
- **Does the temperature ramp read** as continuous blue → neutral → amber → red?
- **The seven-day strip and the day pager** — confidence band or smudge, 168 rain bars too
  thin, and does `‹ Wed, Sep 16 ›` beat the seven chips?

**2. Does the 0-100 number survive?** Scoring handoff § Open Questions 3; it stays for now on
the §5.1 decision. **Ranking is the one job it still has alone** — the daily list's bar and
the seven-day comparison need a scalar, and two ordered word-pairs do not sort. It is also
the only thing suppression can remove, because the words are measurements. Dropping it is a
scoring-Phase-5 change, not a revert.

**3. Your own login, when you want one.** Pick a passphrase and run
`npm run user:add -- --username <you> --user-id 00000000-0000-0000-0000-000000000001`.
**The `--user-id` matters**: every saved crag belongs to `DEFAULT_USER_ID`, so a fresh row
would log you into an empty app. Not needed until Phase 2 has a login screen, and not
something to paste into a conversation.
