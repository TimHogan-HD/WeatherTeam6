# Current state

**This is the only state document. Read it at session start; do not read the archive.**

`session-archive.md` is history, not state — grep it for the reasoning behind one specific
past decision, never at session start.

Last updated: 2026-09-23 · `main` @ `7a939fd`

---

## Direction: Telegram is gone, and so is the mess it left

**Leave Telegram is COMPLETE — all four phases shipped** (PRs #167, #169, #171, #173).
`docs/handoffs/leave-telegram-v1.md` is now a record, not direction; there is nothing left in
it to build.

| Decision | Answer |
| --- | --- |
| The bot | **Deleted, 2026-09-23.** No bot, no webhook, no alert delivery. |
| Auth | **Passphrase → signed token.** Two `Authorization` schemes: `Session` and `Bearer`. |
| Alerts | **Parked.** Alert *data* keeps being collected; delivery is a future decision. |
| Audience | **Owner plus a few climbing partners.** Each curates their own list. |

**The product has no notification channel.** NWS Severe+ warnings are collected, stored,
suppress scores, are visible in the app, and reach nobody. That is the owner's parked-alerts
decision, not an oversight. Do not deepen it and do not build a channel without asking.

**Everything the Phase 4 cleanup deleted** — `apps/mobile` and Expo, the Telegram docs, the
old plans and mobile-era specs — **is at the `archive/2026-09-23-pre-cleanup` tag.** What was
removed and why is in the archive's 2026-09-23 block. One piece of Expo outlived it: the root
`tsconfig.json` still extended `expo/tsconfig.base`, which broke the local dev server until
PR #175. If another Expo reference turns up, it is residue, not a dependency.

---

## Where the project is

**Two live lines. Neither blocks the other.**

**Scoring model v2 — Phases 0 through 3 and 4a shipped and live.** 4a (PR #180) is the
full `rock-drying-research.md` §7 taxonomy — **27 rock types**, each with its own drying
window in `dryingModel.ts`'s one table — and **known crags locked**: 54 crags in
`packages/types/src/knownCrags.ts` whose rock type is written from the research on save
and cannot be picked. Not-recorded kinds take their family's slowest window and
`unknown` is the slowest of all (48–120 h), so **every saved `sandstone`/`limestone`/
`granite`/`unknown` row reads differently from 2026-09-23.** Red Wing was re-typed to
cherty dolomite by `npm run locations:lock-known-crags -- --apply`; re-run that whenever
`KNOWN_CRAGS` changes. The spec is
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
shipped) — **do not confuse its numbering with the scoring model's.** Its Phase 4 is
superseded by the scoring handoff's; its Phase 5 is still wanted. **A CSS or motion
architecture is still not authorised.**

### What is running

- **API** — Express on Vercel, one serverless function. Live at
  `https://weather-team6-api.vercel.app`.
- **Auth** — **two** schemes on `Authorization`. `Session <token>` (a real user; `req.userId`
  is the token's subject) and `Bearer $API_SHARED_SECRET` (acts as `DEFAULT_USER_ID`). `POST
  /api/v1/auth/login` is mounted **above** the gate. Fail-closed on `API_SHARED_SECRET`
  **and** `AUTH_TOKEN_SECRET`. `npm run user:add` is the only way an account exists — there
  is no signup flow and should not be one. **The owner's account exists, username `tim`.**
  **`requireApiAuth` is the only setter of `req.userId` anywhere in the app.** A router
  mounted outside `/api/v1` reads `undefined` through a type saying it cannot be (defect
  class 8).
- **Web app** — four routes (`/login`, list, detail, `/add`) at https://weatherteam6.vercel.app,
  installable, no service worker. **Still nobody has seen it on a phone.**
- **`/api/cron/check-alerts`** — **collects, never delivers.** Keep it registered: a stale
  alert table is worse than a quiet one, because Severe+ rows suppress scores.
  `weather_alerts.notified_at` is **dormant** — null on every row means "never asked", not
  "not yet sent". The column is kept for whatever replaces the bot.
- **`/api/cron/collect-runs`** and **`prune-runs`** on cron-job.org. Retention 2 days parsed
  / 6h raw. **`collect-runs` answers `200 OK` when it persists nothing** — that hid a
  day-long outage on 2026-09-13; whether to change it is undecided.
- Chart invariants and the client's auth/back/PWA rules are in the `miniapp-patterns` skill.
  **A mockup artifact is the spec, its prose summary is not** — one phase was built twice for
  reading the description instead of opening the file.

**Baseline:** `npm run test` **986 passing** (525 api, 302 miniapp, 159 types) across
**29 / 23 / 8** files; `typecheck`, `lint`, `check:hooks` (58), `check:icons`,
`check:crag-facts` clean. Against real Postgres: `check:conditions` **24/24**,
`check:weather-runs` **44/44**, `check:auth` **22/22**, `check:hourly` **13/14** (#179, a partial collect-runs batch — not code),
`check:add-location` **25/25**, `check:delete-trip` **9/9**.
**Read the file count, not just the test count**: miniapp once printed *"123 passed"* with
three files failing to collect, having silently shrunk by 44.

**Mutation is STALE at 67.82% (2026-09-21)** and has not been re-run since Phase 3 deleted
~9,000 lines. `thresholds.break: 67` leaves 0.82 of headroom. **The weekly CI job is the next
thing that will find out** — Phase 4 changed no implementation line, so it should be unmoved.
Do not start a ~37-minute local run to close out a phase.

**Claude runs everything unattended.** `DATABASE_URL`, `CRON_SECRET`, `API_SHARED_SECRET`
and `VERCEL_TOKEN` are Windows user environment variables and `Bash(npm run check:*)` is
allowlisted. **`AUTH_TOKEN_SECRET` is not one of them** (checked 2026-09-23) — production's is
sensitive and unreadable, and a local run does not need it: see the browser recipe below. Do not ask the owner to paste output. **Never echo a
credential.** Read one with `[Environment]::GetEnvironmentVariable('NAME','User')` — they
live in the registry, so `$env:` can read empty while they exist.

**`VERCEL_TOKEN`** is team-scoped, all projects, and reaches `https://api.vercel.com` with
**no `teamId`**. This is how environment variables get set now: **the Vercel MCP cannot —
`projectEnvVars` 403s in both directions.**

**Driving the UI in a browser is routine, and the local dev server is the target.**
Preview deploys are behind Vercel SSO (302 to a Vercel login page) and turning that off is a
security setting. Instead: `vite` on `:5173` — already in the CORS default allowlist —
against a local `createApp()` on the real `DATABASE_URL`, with a throwaway user and location
created and torn down around the run. Three details that cost time on 2026-09-23:
**generate a throwaway `AUTH_TOKEN_SECRET`** for the run — the local server and the token you
mint with `signToken` only have to agree with each other; name the throwaway rows with a prefix
and **sweep by that prefix** in teardown, because a setup that throws halfway leaves rows no
state file knows about; and a harness in the scratchpad must import app modules by
**`file:///C:/…` URL**, since Node's ESM loader rejects a bare Windows path.

---

## What is next

The queue is the owner's product list. **Items 1 and 2 shipped 2026-09-23 (PR #175)**: "now"
is one `ConditionsNow` card — weather line, readings, and a collapsed **Measurements** panel
with the air and rock figures, each named with its model, and the caveats' mechanism.
**Assumption to confirm with the owner:** `Last rain` stayed on the drying card rather than
moving into the panel, because it is visible one card below beside the rain window; moving it
is two lines.

1. **Humidity and dew point charts, which exist nowhere as charts**, though both are fetched
   and stored. Dew point now reaches a screen for the first time, as one figure in the
   measurements panel — the hourly series is still unread.
2. **A current-location GPS option.** No design yet; prefer the browser geolocation API.
3. **Scoring Phase 4b — the location editor** (aspect, tilt, and rock type where it is not
   locked). 4a shipped the rock types; what remains is `PATCH /locations/:id`, the editor,
   and the aspect geometry in `rockThermal` that makes `I_wall` real. Every saved location
   still has `cliff_angle` defaulted to 45 and nothing in the response marks it. **Do not
   score `aspectDegrees` directly** (#139): the same aspect flips sign by season. The
   editor must refuse a rock-type change on a row with `known_crag` set.
4. **Scoring Phase 5 — preferences, then retirement of the five-component scorer.** A
   deletion, not a migration. It owns the nuance 3b left: a past window still renders as that
   day's, so *"Good hours: 6am–9am"* at 2pm is true and reads like advice for now. **It also
   owns the drying card's `Climbable in ~Nh` line**, which is the five-component model's
   drying clock and can disagree with the v2 `Dryness` reading in the card above it.
5. **Parked:** issue #82 part 2.

---

## Open issues

**Read them from GitHub — `gh issue list`.** Standing context not on the issues themselves:

- **#21, #108, #137, #148** — closed. #21's replacement is the v2 handoff, and its
  *diagnosis* now lives in `scoring-findings.md` §6c rather than the deleted `plan.md`.
- **#25** — product decision: a new cron, or delete the two endpoints.
- **#27** — **most of this issue died with the webhook.** Parts 1, 3, 4 were done; the
  webhook-hardening half is now moot. Re-read before working it.
- **#32** — much less likely since #33, and v2 has no "today row" to miss.
- **#138–#140** — #139 is half-answered by scoring Phase 4; #140 is superseded by the v2
  condensation margin. Re-read both against v2 before working them.
- **#143** — the only path to knowing whether any of this predicts anything. **Nothing in v2
  is validated against outcomes.**
- **#155** — why irradiance comes from one model and is never pooled. Live constraint.
- **#176** — a newly added crag reads `Wet` with no Friction or Score for ~4 days (no
  trailing history for `T_mass`) and `unavailable_reason` stays `null`. **4a widened
  it:** the v2 drying clock starts at 0 at the first stored hour (5 trailing days), and the
  slowest windows are now 96–120 h, so a slow-rock crag can read `Drying` after weeks of no
  rain. Measurements on the issue. The fix — seeding `priorEffectiveHours` from the daily
  history — is a model decision.
- **#179** — a partial collect-runs batch (one of the two deterministic requests failed)
  becomes the newest batch and hides a complete older one, so a missing GFS drops a crag's
  readings for the hour. Found by `check:hourly` on 2026-09-23.

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
  *"Mutation testing always takes forever."* Let the weekly CI job report it, and run it on
  demand only when a survivor would change a decision. **A rising score is not the goal.**

If a gate fires, finish the work; if it misfires, add a case to `check-hooks.mjs`. Never
disable branch protection to land something.

---

## Live gotchas

Still true and still biting. Historical ones are in the archive.

- **An unauthenticated 401 proves nothing but that the gate is shut.** A missing
  `DEFAULT_USER_ID` shows only as a **500 on an authenticated `Bearer` call**, and not at all
  under `Session`. A **503 on every scheme** means `API_SHARED_SECRET` or `AUTH_TOKEN_SECRET`
  is unset. Every `/api/v1/*` path 401s whether or not it exists, so a 401 is still not
  evidence a route deployed — check the commit SHA. **`/api/v1/health` requires auth**; the
  unauthenticated readiness probe is `/health`.
- **`API_SHARED_SECRET` on preview is a DIFFERENT value from production** (set 2026-09-22,
  deliberately, because production's is sensitive and unreadable). `AUTH_TOKEN_SECRET` is the
  same across all three targets. Env vars apply to **new** deployments only.
- **`AUTH_ENABLED`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` and `TELEGRAM_WEBHOOK_SECRET`
  still exist in Vercel and nothing reads them.** Dead; the three Telegram ones are live
  credentials sitting in a dashboard. Deleting them is the owner's.
- **Backticks in a bash heredoc, or in a double-quoted `node -e`, are command substitution.**
  **A quoted heredoc is not a reliable escape either** — a 456-line one failed to parse at
  all on 2026-09-22. Write the file with the Write tool and `cp` it into place.
- **A multi-line `sed`/`node -e` replacement against this CRLF tree silently matches
  nothing.** It reports success and leaves the file untouched — it did exactly that twice
  during Phase 4. Use the Edit or Write tool for anything spanning more than one line;
  single-line `sed -i` is fine, and `head`/`tail` splicing works for whole-block replacement.
  **The Write tool emits LF**, which git normalises on `add`.
- **`sed` with `|` as the delimiter breaks on Markdown table rows.** Use `c\` to replace the
  whole line instead. Cost two silent no-ops in Phase 4.
- **A source file can contain a literal NUL byte**, which makes `git diff` and `grep` treat
  it as binary and print nothing useful. `grep -a` and `git diff --text` see it.
- **`DELETE` does not free Neon space.** A prune of 700k rows leaves every size in
  `check:runs-storage` unchanged. `TRUNCATE` reclaims; `VACUUM FULL` needs as much free space
  as the table and cannot run at the cap.
- **A fresh merge is not a deploy** — check the deployment state before probing production.
- **`npm run test` cannot see database behaviour.** Vitest mocks `fetch` and never connects;
  flows that fail only against real Postgres need a `check:*` script. **Workspace-level
  `check:*` are deliberately excluded from CI** (`ci.yml`) — only root-level ones run.
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

**Three things. None blocks any work.**

**1. Tear down the bot with Telegram itself.** The code is gone but the registration is not,
so Telegram is still delivering updates to a path that now 404s. Needs `TELEGRAM_BOT_TOKEN`,
which Claude does not have and must not be given in chat — set it in your own shell and call
`deleteWebhook`. Deleting the bot via BotFather is optional; it is inert either way.

**2. Delete `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET` and
`AUTH_ENABLED`** from both Vercel projects. Nothing reads them; three are live credentials
sitting in a dashboard.

**3. A trip to the phone.** Open a saved climbing location on your own phone — now an
ordinary browser, no Telegram. Six questions; the first four are in full in the 2026-09-22
archive block, the last two no desktop browser can answer:

- **The Conditions now card**, now one block (PR #175) — does it read as instrument
  readings rather than a verdict, are two caveat fragments one too many at 360px, and does
  the **Measurements** control look tappable? Open it: is `Rock temperature 96°F` beside
  `Temperature 73°F` read as modelled, as the sentence under it says?
- **Does the temperature ramp read** as continuous blue → neutral → amber → red?
- **The seven-day strip and the day pager** — confidence band or smudge, 168 rain bars too
  thin, and does `‹ Wed, Sep 16 ›` beat the seven chips?
- **Safe-area padding.** `env(safe-area-inset-*)` was 0 in every check so far — there is no
  notch in a desktop browser.
- **Add to Home Screen.** It should open without browser chrome. Chrome will not *offer* to
  install (no service worker, deliberate) so it is in the menu; iOS Safari is in Share.

*Back on the Hourly tab is answered* — it returns to Daily, verified in a browser.

**Answered, and no longer owed:** *does the 0-100 number survive?* It stays for now on the
scoring handoff's §5.1 decision. **Ranking is the one job it still has alone** — the daily
list's bar and the seven-day comparison need a scalar, and two ordered word-pairs do not
sort. Dropping it is a scoring-Phase-5 change, not a revert.
