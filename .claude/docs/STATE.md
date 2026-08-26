# Current state

**This is the only state document. Read it at session start; do not read the archive.**

`session-archive.md` is 165KB of dated session blocks. It is history, not state — grep it
when you need the reasoning behind a specific past decision, never at session start. It
used to be mandatory reading, which cost ~41,000 tokens before any work began.

Last updated: 2026-08-26 · `main` @ `516b438`

---

## Where the project is

The Telegram crossover is **complete**. All seven tasks shipped and the whole stack is
confirmed working on a real device: bot, Mini App, alerts, deep links, auth.

- **API** — Express on Vercel, one serverless function. Live.
- **Mini App** — three routes (list, detail, `/add`), live at https://weatherteam6.vercel.app
- **Bot** — commands, alerts, deep links into the Mini App.
- **`apps/mobile`** — archived, out of the build. Do not add features to it.

Baseline: `npm run test` 315 passing, `npm run typecheck` clean, `npm run check:hooks` 49 passing.

---

## What is next

The user's direction, set 2026-08-26 and revised the same day:

1. ~~**Agent-systems cleanup**~~ — **done.** `b954e9f` (PR #48): working hooks, a
   permissions allowlist, current models on the review agents, session-start context cut
   from 66,532 to 14,685 tokens. `516b438` (PR #49): the finish-the-delivery rule turned
   into a gate — see *Delivery is enforced* below.
2. **The chat interface is the priority.** The user wants to ask in plain language and get
   an answer, plus slash commands that pull specific information about a location or a span
   of time. This is the headline feature direction from here.
3. **An in-app feedback button.** Press it, type a note, and the note lands somewhere in
   this repo. Destination and mechanism undecided.
4. **Mini App polish** — deliberately downgraded. The user's words: *"the Mini App doesn't
   need to be super fancy."* Do not start a design system, a motion system or a CSS
   architecture for it on the strength of the old plan.

**Both 2 and 3 are design conversations the user wants to have first. Do not spec either
unilaterally.**

### Deliberately deferred, not forgotten

The **conditions score algorithm** — the open half of issue #21. The user has deferred it
twice, explicitly. The diagnosis is complete and two viable options are named in
`plan.md`. Do not start it, and do not let it ride along inside another change. It needs a
product decision the user has chosen not to make yet.

---

## Open issues

**Read them from GitHub — `gh issue list`. Do not trust a table in a document.**

A transcribed status table lived in `plan.md` and drifted in both directions: it claimed
six open when four were, and marked #33 and #34 open after both were fixed and closed. The
commit that claimed to correct it touched only the archive. Derived state cannot go stale;
copied state always does.

Standing context that is *not* on the issues themselves:

- **#21** — deferred by the user, twice. Tuning, not correctness. Do not start it.
- **#25** — needs a **product decision**, not code. Nothing writes `crag_climbability_history`
  or `location_normals` any more, so it is either a new cron or deleting the two endpoints.
- **#27** — parts 1, 3 and 4 are done. **Part 2 is open** and needs a table to record seen
  `update_id`s, so a migration, which cannot be applied from this environment.
- **#32** — materially less likely since #33 landed, because today's row now reliably
  exists. Entangled with the unfiled `ScoreInput` split below.

### Unfiled, worth filing when touched

- **`ScoreInput` conflates the humidity component with the drying humidity modifier** in one
  field, so per-day humidity cannot be fixed without moving the drying calculation too.
- **`GET /forecast/:id` and `GET /conditions/:id` each run their own `computeLiveForecast`.**
  One detail view is two ensemble calls plus two rainfall calls; a list of N climbing
  locations is 2N of each.
- **A layer below #34:** ACIS can return a *successful* response whose rows are all `'M'`
  sentinels, yielding `[]` — indistinguishable from a dry month. The #34 fix catches a
  failed call, not a call that succeeded with no usable data.

---

## Delivery is enforced, not remembered

The user's standing instruction: **only interact when it is absolutely needed.** Design
decisions qualify. Chasing an unmerged PR does not.

Two hooks make that structural rather than a promise:

- **`git commit` on the default branch is blocked** (PreToolUse). Branch first. The default
  branch is read from `origin/HEAD`, not assumed.
- **The turn cannot end** (Stop hook) while there are uncommitted changes, unpushed commits,
  a pushed branch with no PR, or a green mergeable PR still open. It hands back the reason
  so the work gets finished.

Escape hatch for a deliberate pause: `touch .claude/.wip`, delete it when work resumes.
Both gates are covered by `npm run check:hooks` and were sabotage-tested.

**Do not treat these as bureaucracy to route around.** They exist because the rule was in
CLAUDE.md, was followed most of the time, and a session-record commit still went straight
to `main`. If a gate fires, finish the work; if it misfires, add a case to
`check-hooks.mjs` rather than loosening the guard.

---

## Live gotchas

Only things that are still true and still bite. Historical gotchas are in the archive.

- **Python is not installed.** `python3` resolves to the Windows Store stub, which prints an
  advert and exits 0 — it does not fail loudly. Every project hook was silently dead for its
  whole life because of this. Use Node.
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

---

## What the user owes

**One thing, outstanding since 2026-08-26.** Set `TELEGRAM_WEBHOOK_SECRET` in the API's
Vercel project to a long random string, then re-run Telegram's `setWebhook` with
`secret_token` set to the same value. Until then the webhook's secret check is skipped and
the forgeable `chat.id` is the only gate.

Nothing else is waiting on them. #25 needs a decision, but only when they choose to pick it up.
