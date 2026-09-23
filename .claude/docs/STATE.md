# Current state

**This is the only state document. Read it at session start; do not read the archive.**

`session-archive.md` is history, not state — grep it for the reasoning behind one specific
past decision, never at session start.

Last updated: 2026-09-23 · `main` @ `274d49c`

---

## Direction: Telegram is gone

**Decided by the owner on 2026-09-22 and approved. The Telegram client mandate is REVERSED.**
The plan is `docs/handoffs/leave-telegram-v1.md`.

| Decision | Answer |
| --- | --- |
| The bot | **Deleted, 2026-09-23.** No bot, no webhook, no alert delivery. |
| Auth | **Passphrase → signed token**, a second `Authorization` scheme beside `Bearer`. |
| Alerts | **Parked.** Alert *data* keeps being collected; delivery is a future decision. |
| Audience | **Owner plus a few climbing partners.** Build the identity seam once, properly. |

**Phases 1, 2 and 3 are shipped and merged** (PRs #167, #169, #171). **Phase 4 — the docs
sweep — is all that remains**, and it is next.

**The product has no notification channel.** NWS Severe+ warnings are collected, stored, and
visible in the app, and reach nobody. That is the owner's parked-alerts decision, not an
oversight. Do not deepen it and do not build a channel without asking.

**The bot halves of `CLAUDE.md`, `.claude/rules/architecture.md`, the `review-checklist`
skill and the whole `telegram-patterns` skill now describe deleted code.** Each carries a
banner saying so. **Phase 4 deletes them properly** — until then, believe the banner, not the
paragraph.

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
- **Auth** — **two** schemes on `Authorization`. `Session <token>` (a real user; `req.userId`
  is the token's subject) and `Bearer $API_SHARED_SECRET` (acts as `DEFAULT_USER_ID`). `POST
  /api/v1/auth/login` is mounted **above** the gate. Fail-closed on `API_SHARED_SECRET`
  **and** `AUTH_TOKEN_SECRET`. `npm run user:add` is the only way an account exists — there
  is no signup flow and should not be one. **The owner's account exists, username `tim`.**
  **`requireApiAuth` is now the only setter of `req.userId` anywhere in the app** and owns the
  `Request` type augmentation; `resolveUser` is deleted. A router mounted outside `/api/v1`
  reads `undefined` through a type saying it cannot be (defect class 8).
- **Web app** — four routes (`/login`, list, detail, `/add`) at https://weatherteam6.vercel.app,
  installable, no service worker. **Still nobody has seen it on a phone.**
- **`/api/cron/check-alerts`** — **collects, never delivers.** Keep it registered: a stale
  alert table is worse than a quiet one, because Severe+ rows suppress scores.
  `weather_alerts.notified_at` is **dormant** — null on every row means "never asked", not
  "not yet sent". The column is kept for whatever replaces the bot.
- **`/api/cron/collect-runs`** and **`prune-runs`** on cron-job.org. Retention 2 days parsed
  / 6h raw. **`collect-runs` answers `200 OK` when it persists nothing** — that hid a
  day-long outage on 2026-09-13; whether to change it is undecided.
- **`apps/mobile`** — archived, out of the build.
- Chart invariants and the client's auth/back/PWA rules are in the `miniapp-patterns` skill.
  **A mockup artifact is the spec, its prose summary is not** — one phase was built twice for
  reading the description instead of opening the file.

**Baseline:** `npm run test` **852 passing** (501 api, 284 miniapp, 67 types) across
**28 / 22 / 6** files; `typecheck`, `lint`, `check:hooks` (58), `check:icons`,
`check:crag-facts` clean. Against real Postgres: `check:conditions` **24/24**,
`check:weather-runs` **44/44**, `check:auth` **22/22**, `check:hourly` **19/19**,
`check:add-location` **17/17**, `check:delete-trip` **9/9**.
**Read the file count, not just the test count**: miniapp once printed *"123 passed"* with
three files failing to collect, having silently shrunk by 44. The api drop from 761 to 501 is
Phase 3's deletions, accounted for exactly (252 in deleted files, 7 `tma` cases, 1 net
elsewhere).

**Mutation is STALE at 67.82% (2026-09-21) and has not been re-run since ~9,000 lines were
deleted.** `thresholds.break: 67` leaves 0.82 of headroom, and Phase 3 removed a large body
of well-tested code, so the total can have moved either way. **The weekly CI job is the next
thing that will find out.** Run `npm run test:mutation --workspace=apps/api` (~37 min) before
trusting the number.

**Claude runs everything unattended.** `DATABASE_URL`, `CRON_SECRET`, `API_SHARED_SECRET` and
`VERCEL_TOKEN` are Windows user environment variables and `Bash(npm run check:*)` is
allowlisted. Do not ask the owner to paste output. **Never echo a credential.**

**`VERCEL_TOKEN`** is team-scoped, all projects. Read it with
`[Environment]::GetEnvironmentVariable('VERCEL_TOKEN','User')` — it lives in the registry,
not this process's environment block, so `$env:` can read empty while it exists. It reaches
`https://api.vercel.com` directly and **needs no `teamId`**. This is how environment
variables get set now: **the Vercel MCP cannot — `projectEnvVars` 403s in both directions.**

**Driving the UI in a browser is routine, and the local dev server is the target.**
Preview deploys are behind Vercel SSO (302 to a Vercel login page) and turning that off is a
security setting. Instead: `vite` on `:5173` — already in the CORS default allowlist —
against a local `createApp()` on the real `DATABASE_URL`, with a throwaway user and location
created and torn down around the run.

---

## What is next

1. **Leave Telegram, Phase 4 — docs and rules.** The last phase. `CLAUDE.md`'s Telegram env
   block and mandatory-reading entry, ~15 Telegram paragraphs in
   `.claude/rules/architecture.md`, the whole `telegram-patterns` skill (delete),
   the `review-checklist` skill's *Telegram surfaces* section (delete), `miniapp-design-v1.md`
   §1/§2/§8 and the superseded banners. **Anything describing a *shared* invariant
   (`summarizeReadings`, `toConditionsReadings`, the sentinels) stays and loses only its bot
   half.** Leave the Telegram examples in `defect-patterns.md` — classes 3, 5 and 11 are still
   true of code that stayed.
2. **The measurements disclosure** — humidity, temperature, last rain, precipitation and dew
   point behind a drop-down. Asked for 2026-09-22. It is where the caveats' *mechanism*
   belongs now the gauges are terse, and it makes a reading checkable for the first time.
3. **One Current Conditions block** — "now" is spread across a now-line, a readings section
   and chips.
4. **Humidity and dew point charts, which exist nowhere**, though both are fetched and
   stored — `dewpoint_c` is read by nothing.
5. **A current-location GPS option.** No design yet; prefer the browser geolocation API.
6. **Scoring Phase 4 — the location editor** (rock type, aspect, tilt). **Unblocked.** Every
   saved location has `cliff_angle` defaulted to 45, one has no `rock_type`, and **nothing in
   the response marks either** — a reading on placeholders looks like one on real crag data.
   **Do not score `aspectDegrees` directly** (#139): the same aspect flips sign by season.
7. **Scoring Phase 5 — preferences, then retirement of the five-component scorer.** A
   deletion, not a migration. It owns the nuance 3b left: a past window still renders as that
   day's, so *"Good hours: 6am–9am"* at 2pm is true and reads like advice for now.
8. **Parked:** issue #82 part 2. **Cancelled:** the bot plan's Phase 4 — the bot is gone.

---

## Open issues

**Read them from GitHub — `gh issue list`.** Standing context not on the issues themselves:

- **#21, #108, #137, #148** — closed. #21's replacement is the v2 handoff.
- **#25** — product decision: a new cron, or delete the two endpoints.
- **#27** — **most of this issue died with the webhook.** Parts 1, 3, 4 were done; the
  webhook-hardening half is now moot. Re-read before working it.
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
- **Mutation testing is slow and the owner will stop it.** Owner's words, 2026-09-23:
  *"Mutation testing always takes forever."* Do not start a ~37-minute run to close out a
  phase; let the weekly CI job report it, and run it on demand only when a survivor would
  change a decision. **A rising score is not the goal.**

If a gate fires, finish the work; if it misfires, add a case to `check-hooks.mjs`. Never
disable branch protection to land something.

---

## Live gotchas

Still true and still biting. Historical ones are in the archive.

- **An unauthenticated 401 proves nothing but that the gate is shut.** A missing
  `DEFAULT_USER_ID` shows only as a **500 on an authenticated `Bearer` call**, and not at all
  under `Session`. A **503 on every scheme** means `API_SHARED_SECRET` or `AUTH_TOKEN_SECRET`
  is unset. Every `/api/v1/*` path 401s whether or not it exists, so a 401 is still not
  evidence a route deployed — check the commit SHA. **`/api/telegram/webhook` is the
  exception and is now a useful probe**: the old handler answered **200 to every update**, so
  a **404** there is real evidence the post-Phase-3 code is live.
- **`API_SHARED_SECRET` on preview is a DIFFERENT value from production** (set 2026-09-22,
  deliberately, because production's is sensitive and unreadable). `AUTH_TOKEN_SECRET` is the
  same across all three targets. Env vars apply to **new** deployments only.
- **`AUTH_ENABLED` still exists in Vercel and nothing reads it.** Dead; delete when convenient.
  **`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` and `TELEGRAM_WEBHOOK_SECRET` are the same** as
  of Phase 3 — out of `.env.example` and `turbo.json`, still live in the dashboard.
- **Backticks in a bash heredoc, or in a double-quoted `node -e`, are command substitution.**
  **A quoted heredoc is not a reliable escape either** — a 456-line one failed to parse at
  all on 2026-09-22. Write the file with the Write tool and `cp` it into place.
- **A multi-line `sed`/`node -e` replacement against this CRLF tree silently matches nothing.**
  It reports success and leaves the file untouched. Use the Edit tool for anything spanning
  more than one line. **The Write tool emits LF**, which git normalises on `add` — harmless,
  but a later `node -e` patch against that file must match `\n`, not `\r\n`.
- **A source file can contain a literal NUL byte**, which makes `git diff` and `grep` treat
  it as binary and print nothing useful. `grep -a` and `git diff --text` see it.
- **`DELETE` does not free Neon space.** A prune of 700k rows leaves every size in
  `check:runs-storage` unchanged. `TRUNCATE` reclaims; `VACUUM FULL` needs as much free space
  as the table and cannot run at the cap.
- **A fresh merge is not a deploy** — check the deployment state before probing production.
- **`/api/v1/health` requires auth**, so an unauthenticated probe answers 401 and is not a
  readiness check. The unauthenticated one is `/health`.
- **`npm run test` cannot see database behaviour.** Vitest mocks `fetch` and never connects;
  flows that fail only against real Postgres need a `check:*` script. **Workspace-level
  `check:*` are deliberately excluded from CI** (`ci.yml:71-73`) — only root-level ones run.
- **`fetchWithRetry` does not hand every response back.** A 5xx or 429 exhausts four attempts
  and *throws*, so a test mocking 503 to reach a `!res.ok` branch reaches the `catch`
  instead. Use 403.
- **`drizzle-kit generate` needs no database**, only a non-empty `DATABASE_URL` to satisfy
  `drizzle.config.ts`'s throw. A dummy string is enough to generate a migration offline.
- **Vercel Hobby log retention is ~1 hour**, and its error level is noise. Check right after
  a cron fires; filter by message.

The CRLF working tree, the missing Python, `gh` not being on `PATH`, building the shared
packages, `NODE_ENV` on Vercel, and Vercel refusing to reveal a secret are all in
**`CLAUDE.md` § Known Gotchas**, which loads every session. Deliberately not duplicated here.

---

## What the user owes

**Four things. None blocks Phase 4.**

**1. Tear down the bot with Telegram itself.** The code is gone but the registration is not,
so Telegram is still delivering updates to a path that now 404s. Needs
`TELEGRAM_BOT_TOKEN`, which Claude does not have and must not be given in chat — set it in
your own shell and call `deleteWebhook`. Deleting the bot via BotFather is optional; it is
inert either way.

**2. Delete `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` and `TELEGRAM_WEBHOOK_SECRET`** from
both Vercel projects. Nothing reads them; they are live credentials sitting in a dashboard.

**3. A trip to the phone.** Open a saved climbing location on your own phone — now an
ordinary browser, no Telegram. Six questions; the first four are in full in the 2026-09-22
archive block, the last two no desktop browser can answer:

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

**4. Does the 0-100 number survive?** Scoring handoff § Open Questions 3; it stays for now on
the §5.1 decision. **Ranking is the one job it still has alone** — the daily list's bar and
the seven-day comparison need a scalar, and two ordered word-pairs do not sort. It is also
the only thing suppression can remove, because the words are measurements. Dropping it is a
scoring-Phase-5 change, not a revert.
