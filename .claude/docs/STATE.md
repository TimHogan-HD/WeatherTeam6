# Current state

**This is the only state document. Read it at session start; do not read the archive.**

`session-archive.md` is history, not state — grep it for the reasoning behind one specific
past decision, never at session start.

Last updated: 2026-09-22 · `main` @ `b4f91fa`

---

## Direction: Telegram is being removed

**Decided by the owner on 2026-09-22 and approved. The Telegram client mandate is REVERSED.**
The plan is `docs/handoffs/leave-telegram-v1.md` — read it before any work on the client, on
auth, or on anything under `apps/api/src/lib/telegram/`.

| Decision | Answer |
| --- | --- |
| The bot | **Delete Telegram entirely.** No bot, no webhook, no alert delivery. |
| Auth | **Passphrase → signed token**, a third `Authorization` scheme beside `Bearer`. |
| Alerts | **Parked.** Alert *data* keeps being collected; delivery is a future decision. |
| Audience | **Owner plus a few climbing partners.** Build the identity seam once, properly. |

**Phases 1 and 2 are shipped, merged and verified against production** (PRs #167, #169).
Phase 3 — deleting Telegram — **is next and is the irreversible one**; Phase 4 is the docs
sweep.

**The client left Telegram on 2026-09-22.** `apps/miniapp` is a standalone web app: `/login`,
a session token in `localStorage`, its own back control, a PWA manifest. `src/telegram/`,
`deepLink.ts` and the SDK script are deleted. The directory name is the last of the Mini App.

**Accepted transitional cost until Phase 3:** the bot's alert button opens the app on the
**list** rather than the location the alert was about, because nothing reads `start_param`
any more. The alert text names the location. **Do not fix this by reviving the client deep
link** — without the SDK there is no `initData` and that launch path is over. If Phase 3
slips, drop the button from `alertKeyboard` instead.

**`CLAUDE.md` and `.claude/rules/architecture.md` are corrected wherever this migration
deleted their subject** — the auth rules in Phase 1, the client section in Phase 2. Their
remaining **bot** halves still describe the bot, which still exists. The `telegram-patterns`
skill and `miniapp-design-v1.md`'s banners are Phase 4. Follow the handoff where they
disagree; it is not blocking.

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
  `DEFAULT_USER_ID`; `tma` has no client left and Phase 3 deletes it). `POST
  /api/v1/auth/login` is mounted **above** the gate. Fail-closed on `API_SHARED_SECRET`
  **and** `AUTH_TOKEN_SECRET`. `npm run user:add` is the only way an account exists — there
  is no signup flow and should not be one. **The owner's account exists, username `tim`.**
- **Web app** — four routes (`/login`, list, detail, `/add`) at https://weatherteam6.vercel.app,
  installable, no service worker. **Driven in a real browser for the first time on
  2026-09-22. Still nobody has seen it on a phone.**
- **Bot** — nine commands, and the **only notification channel in the product**. **Deleted in
  migration Phase 3, with no channel replacing it.** Accepted; do not deepen it.
- **`/api/cron/collect-runs`** and **`prune-runs`** on cron-job.org. Retention 2 days parsed
  / 6h raw. **`collect-runs` answers `200 OK` when it persists nothing** — that hid a
  day-long outage on 2026-09-13; whether to change it is undecided.
- **`apps/mobile`** — archived, out of the build.
- Chart invariants and the client's auth/back/PWA rules are in the `miniapp-patterns` skill,
  the bot's in `telegram-patterns`; both load on the files they govern. **A mockup artifact
  is the spec, its prose summary is not** — one phase was built twice for reading the
  description instead of opening the file.

**Baseline:** `npm run test` **1,112 passing** (761 api, 284 miniapp, 67 types) across
**40 / 22 / 6** files; `typecheck`, `lint`, `check:hooks` (58), `check:icons`,
`check:crag-facts` clean. Against real Postgres: `check:auth` **22/22**,
`check:add-location` **17/17**, `check:delete-trip` **9/9**, `check:conditions` **17/17**.
**Mutation 67.82%** (2026-09-21) against `thresholds.break: 67` — 0.82 of headroom, so check
the run, do not assume. ~37 min. **Read the file count, not just the test count**: miniapp
once printed *"123 passed"* with three files failing to collect, having silently shrunk by 44.

**Claude runs everything unattended.** `DATABASE_URL`, `CRON_SECRET`, `API_SHARED_SECRET` and
`VERCEL_TOKEN` are Windows user environment variables and `Bash(npm run check:*)` is
allowlisted. Do not ask the owner to paste output. **Never echo a credential.**

**`VERCEL_TOKEN`** is team-scoped, all projects. Read it with
`[Environment]::GetEnvironmentVariable('VERCEL_TOKEN','User')` — it lives in the registry,
not this process's environment block, so `$env:` can read empty while it exists. It reaches
`https://api.vercel.com` directly and **needs no `teamId`**. This is how environment
variables get set now: **the Vercel MCP cannot — `projectEnvVars` 403s in both directions.**

**Driving the UI in a browser is now routine, and the local dev server is the target.**
Preview deploys are behind Vercel SSO (302 to a Vercel login page) and turning that off is a
security setting. Instead: `vite` on `:5173` — already in the CORS default allowlist —
against a local `createApp()` on the real `DATABASE_URL`, with a throwaway user and location
created and torn down around the run. It reaches live Open-Meteo data and needs no decision
from anyone.

---

## What is next

1. **Leave Telegram, Phase 3 — delete Telegram.** ~9,000 lines: `lib/telegram/`, the webhook,
   four operator scripts, `escapeTelegramHtml`, the `panel_states` table and a drop
   migration. **Its own PR, and its diff read as prose is the last chance to notice something
   the bot was quietly carrying.** Confirm `check-alerts` still writes `weather_alerts` with
   delivery removed, and that an alert still suppresses a score. Run mutation once after.
2. **Leave Telegram, Phase 4 — docs and rules.** The sweep the earlier phases deliberately
   did not do: `telegram-patterns`, `miniapp-design-v1.md`'s banners, the remaining bot halves.
3. **The measurements disclosure** — humidity, temperature, last rain, precipitation and dew
   point behind a drop-down. Asked for 2026-09-22. It is where the caveats' *mechanism*
   belongs now the gauges are terse, and it makes a reading checkable for the first time.
4. **One Current Conditions block** — "now" is spread across a now-line, a readings section
   and chips.
5. **Humidity and dew point charts, which exist nowhere**, though both are fetched and
   stored — `dewpoint_c` is read by nothing.
6. **A current-location GPS option.** No design yet; prefer the browser geolocation API.
   **Cheaper now** — Phase 2 removed the Telegram capability gate.
7. **Scoring Phase 4 — the location editor** (rock type, aspect, tilt). **Unblocked.** Every
   saved location has `cliff_angle` defaulted to 45, one has no `rock_type`, and **nothing in
   the response marks either** — a reading on placeholders looks like one on real crag data.
   **Do not score `aspectDegrees` directly** (#139): the same aspect flips sign by season.
8. **Scoring Phase 5 — preferences, then retirement of the five-component scorer.** A
   deletion, not a migration. It owns the nuance 3b left: a past window still renders as that
   day's, so *"Good hours: 6am–9am"* at 2pm is true and reads like advice for now.
9. **Parked:** issue #82 part 2. **Cancelled:** Phase 4 of the bot plan — the bot is going.

---

## Open issues

**Read them from GitHub — `gh issue list`.** Standing context not on the issues themselves:

- **#21, #108, #137, #148** — closed. #21's replacement is the v2 handoff.
- **#25** — product decision: a new cron, or delete the two endpoints.
- **#27** — parts 1, 3, 4 done; **part 2 open** and needs a migration. Much of the rest of
  this issue dies with the webhook in Phase 3.
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

- **An unauthenticated 401 proves nothing but that the gate is shut.** A missing
  `DEFAULT_USER_ID` shows only as a **500 on an authenticated `Bearer`/`tma` call**, and not
  at all under `Session`. A **503 on every scheme** means `API_SHARED_SECRET` or
  `AUTH_TOKEN_SECRET` is unset. Every `/api/v1/*` path 401s whether or not it exists, so a
  401 is still not evidence a route deployed — check the commit SHA.
- **`API_SHARED_SECRET` on preview is a DIFFERENT value from production** (set 2026-09-22,
  deliberately, because production's is sensitive and unreadable). `AUTH_TOKEN_SECRET` is the
  same across all three targets. Env vars apply to **new** deployments only.
- **`AUTH_ENABLED` still exists in Vercel and nothing reads it.** Dead; delete when convenient.
- **Backticks in a bash heredoc, or in a double-quoted `node -e`, are command substitution.**
  **A quoted heredoc is not a reliable escape either** — a 456-line one failed to parse at
  all on 2026-09-22. Write the file with the Write tool and `cp` it into place.
- **A multi-line `sed`/`node -e` replacement against this CRLF tree silently matches nothing.**
  It reports success and leaves the file untouched. Use the Edit tool for anything spanning
  more than one line.
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

**Two things, and neither blocks Phase 3.**

**1. A trip to the phone.** Open a saved climbing location on your own phone — now an
ordinary browser, no Telegram. Six questions; the first four are in full in the 2026-09-22
archive block, the last two are new because Phase 2 created them and no desktop browser can
answer either:

- **The readings block**, which nobody has seen rendered — does it read as instrument
  readings rather than a verdict, and are two caveat fragments one too many at 360px?
- **Does the temperature ramp read** as continuous blue → neutral → amber → red?
- **The seven-day strip and the day pager** — confidence band or smudge, 168 rain bars too
  thin, and does `‹ Wed, Sep 16 ›` beat the seven chips?
- **Safe-area padding.** `env(safe-area-inset-*)` was 0 in every check so far — there is no
  notch in a desktop browser.
- **Add to Home Screen.** It should open without browser chrome. Chrome will not *offer* to
  install (no service worker, deliberate) so it is in the menu; iOS Safari is in Share.

*Back on the Hourly tab is answered* — it returns to Daily, verified in a browser.

**2. Does the 0-100 number survive?** Scoring handoff § Open Questions 3; it stays for now on
the §5.1 decision. **Ranking is the one job it still has alone** — the daily list's bar and
the seven-day comparison need a scalar, and two ordered word-pairs do not sort. It is also
the only thing suppression can remove, because the words are measurements. Dropping it is a
scoring-Phase-5 change, not a revert.

*Your own login is no longer owed — the account exists, username `tim`.*
