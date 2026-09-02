# Current state

**This is the only state document. Read it at session start; do not read the archive.**

`session-archive.md` is history, not state — grep it for the reasoning behind one specific
past decision, never at session start.

Last updated: 2026-09-01 · `main` @ `e1e4067`

---

## Where the project is

The Telegram crossover is **complete**. All seven tasks shipped and the whole stack is
confirmed working on a real device: bot, Mini App, alerts, deep links, auth.

- **API** — Express on Vercel, one serverless function. Live.
- **Mini App** — three routes (list, detail, `/add`), live at https://weatherteam6.vercel.app
- **Bot** — commands, alerts, deep links into the Mini App.
- **`apps/mobile`** — archived, out of the build. Do not add features to it.

Baseline: `npm run test` 520 passing (446 api, 50 miniapp, 24 types), `npm run typecheck`
clean, `npm run check:hooks` 58 passing. **Mutation score 66.09%**, last measured
2026-08-26 and *not* re-measured since Phases 1, 2, 3 or the 2026-09-01 rebuild —
`npm run test:mutation --workspace=apps/api`, and see § Mutation testing below.

**Three migrations are stacked and unapplied — `0007` (`panel_states`), `0008` (the three
`weather_*` run tables) and `0009` (two ensemble columns).** Until `npm run db:migrate`
runs, every bot panel command fails in production, `/forecast` and `/rain` included, and
`/api/cron/collect-runs` 500s. See § What the user owes.

Always-loaded instruction budget: **~56,500 chars / ~14,100 est. tokens** (`CLAUDE.md` +
`.claude/rules/*`). It was 52,754 before Phase 3 added its five invariants. Anthropic's guidance is that a bloated
`CLAUDE.md` causes its own rules to be ignored — if you are about to add a paragraph to it,
check first whether the fact is derivable from the repo, or belongs in a skill or the archive.

**You did not have to read this file.** The `SessionStart` hook injected it, along with the
branch, working tree, unpushed commits, open PRs, open issues, and whether CI on `main` is
green. If you are reading it because that block was absent, the hook did not fire — say so.

---

## What is next

The user's direction, set 2026-08-26 and revised the same day:

1. **The chat interface is the priority — and its product decision was reversed on
   2026-09-01.** Read **`.claude/docs/telegram-precision-interface-plan.md`**, whose top
   box carries the reversal; the measurements, traps and schema in it all still stand, only
   the interface decisions are superseded.

   The old direction was *"the Mini App is the snapshot, the bot is the instrument"* —
   SpotWX-class precision in chat. Phases 1–3 built exactly that and the owner could not
   read the result: five keyboard rows, up to thirteen buttons, `p10/p50/p90` as three of
   six columns. **The bot now answers the question and the Mini App carries the depth**,
   in plain language, with one `⚙ More` per panel. See § What the rebuild changed.

   **Phases 0 to 3 are done and Phase 3 has been rebuilt. Phase 4 is next, but `/insight`
   needs re-specifying before it is built** — "model disagreement, ensemble distribution,
   outlier, confidence by lead time" is precisely the vocabulary the reversal removed, and
   it should become a plain-language confidence statement. **`/afd` is unaffected and gets
   better**: it is a human forecaster writing plain English, which is now the house style.

   **`/insight`'s run-to-run trend needs history that does not exist yet.** It needs the
   migrations applied *and* `/api/cron/collect-runs` registered — until both, there is one
   run per point and no trend to compute. The other three sections work from a single run.
2. **An in-app feedback button.** Press it, type a note, and the note lands somewhere in
   this repo. Destination and mechanism undecided.
3. **Mini App polish** — deliberately downgraded. The user's words: *"the Mini App doesn't
   need to be super fancy."* Do not start a design system, a motion system or a CSS
   architecture for it on the strength of the old plan.

**Item 2 is still a design conversation the user wants to have first. Do not spec it
unilaterally.** Item 1 has had that conversation — build to the plan, do not re-litigate it.

### What Phases 0 to 2 left behind

**Every rule from them is in `.claude/rules/architecture.md`, which loads automatically. Do
not re-derive them from here.** The measurements are in `.claude/docs/model-matrix.md` and
`.claude/docs/telegram-render.md` — read those, not a summary, before using a model or a
variable. Regenerate the matrix (`npm run probe:models --workspace=apps/api`) rather than
editing it; upstream coverage changes.

What is built: **Phase 0** measured Open-Meteo and the Telegram clients. **Phase 1** made
the bot receive button taps — one panel message edited in place, with `/start`, `/help`,
`/locations`, `/conditions` and `/alerts`. **Phase 2** built the data layer —
`fetchDeterministicHourly`, `fetchEnsembleRun`, the three `weather_*` tables and the two
cron routes.

Five facts that are not rules and live nowhere else:

- **`<pre>` monospace is the rendering, by decision, and the web half of Probe B was
  declined.** Do not re-raise it, and do not adopt rich tables on evidence from two clients
  out of three. `.claude/docs/telegram-render.md` §2 has the empty column waiting.
- **The nine-column width finding was measured on a *rich* table, not on `<pre>`.** A `<pre>`
  block scrolls sideways on a phone rather than wrapping, so width still binds on the path
  that actually ships; Phase 3's tables are held to 32 characters and tested for it.
- **No model run time is exposed anywhere in the response.** A header says *fetched 14:05Z*
  and never *12Z run*.
- **`panel_states` column names are not the plan's** — `interval` → `interval_hours`,
  `columns` → `column_set`; both of the plan's names are Postgres keywords.
- **`lat`, `lon` and `place_name` on `panel_states` are still unread.** They are Phase 5's,
  and they are in the table now so the migration is not run twice.

### What Phase 3 shipped

`/forecast` and `/rain`, on the Phase 1 panel, reading the Phase 2 tables through
`lib/runs/latestRuns.ts` — a stored batch younger than 60 minutes, or a fetch written back.

Its five invariants are in **`.claude/rules/architecture.md`**, which loads automatically:
the non-additive percentile and why `precip_mm_mean` exists, `members_wet` as the only
honest probability, the row owning the step *after* it, `dayHasData` versus padded hours,
and the stored-run freshness rule. Do not re-derive them from here.

Three facts that are not rules:

- **Migration `0009` adds `precip_mm_mean` and `members_wet` to `weather_ensemble_hours`.**
  Phase 3 was meant to change no schema; a percentile that cannot be summed forced it.
- **The one defect found was found by running the real path, not by a test.** HRRR returns
  168 hours of which 66 carry temperature, so "does not reach this day" had to test the
  *values*, not the presence of rows. It typechecked, linted and passed 94 new tests while
  wrong.
- **The independent PR reviewer was broken for two PRs and is now fixed** — see § Delivery
  and verification.

**Nothing has been driven from a real device, and `check:weather-runs` — extended to cover
the new read path — is still unrun.**

### What the rebuild changed (2026-09-01)

The panels' binding spec is now **`panels.ts`'s module comment**, not § What it looks like
in the plan doc. Three rules: plain language over the vocabulary of the data source; at
most three button rows and three buttons a row, except the one opt-in `More` row; and
nothing removed from the product, only from the first screen.

Facts that are not rules and live nowhere else:

- **`⚙ More` reuses `panel_states.mode`** (`advanced` is what it writes) but means something
  narrower than the old Simple/Advanced tier: the detail tables, the step picker and the
  unit toggle, nothing else.
- **Both `More` views draw two narrow stacked tables, not one wide one.** A nine-column
  forecast table measures 50 characters and the rain spread bolted onto its table measured
  36, against the 32 the width tests assert. `<pre>` scrolls sideways rather than wrapping,
  so either would have gone off the edge of a phone silently. The existing width assertion
  caught both.
- **The `pop` column was removed outright and `probability_is_shared` now has no renderer.**
  The field is still fetched, stored and flagged; `.claude/rules/architecture.md` says so,
  so the rule there is not mistaken for a description of live code.
- **Model switching, the column-set picker and the seven-day outlook left chat for the Mini
  App** — but the Mini App does not have model switching today. That is a real gap, not a
  completed migration.
- **Three defects were found by rendering the panels against a live Open-Meteo fetch**, none
  by a test: eight rows of em dashes under "No forecast reaches this day yet" (padded rows
  are real rows full of nulls, so `rows.length` was never 0 — `rainDayHasData` is the
  check); a sentence interpolated where a noun phrase belonged, giving "Based on no
  forecasts reach this day, just now"; and `timingLine` keying on `peak_odds_pct` alone, so
  a run with amounts but a null `members_wet` was called a day no forecast reached, above a
  table of those amounts.
- **A fourth came from the independent reviewer, and it is the most instructive.** The
  retry copy lived in `telegramWebhook.ts` and its keyboard was built in `panels.ts`; when
  the nav row lost its `🔄`, the message went on telling the user to tap a button that was
  no longer there. Neither file was wrong alone. `buildRetryPanel` now owns both.

### Deliberately deferred, not forgotten

The **conditions score algorithm** — the open half of issue #21. The user has deferred it
twice, explicitly. The diagnosis is complete and two viable options are named in
`plan.md`. Do not start it, and do not let it ride along inside another change. It needs a
product decision the user has chosen not to make yet.

---

## Open issues

**Read them from GitHub — `gh issue list`. Do not trust a table in a document.** One lived
in `plan.md` and drifted in both directions.

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
- **`GET /forecast/:id` and `GET /conditions/:id` each run their own `computeLiveForecast`** —
  one detail view costs two ensemble calls plus two rainfall calls.
- **A layer below #34:** ACIS can return a *successful* response whose rows are all `'M'`
  sentinels, yielding `[]` — indistinguishable from a dry month. The #34 fix catches a
  failed call, not a call that succeeded with no usable data.

---

## Delivery and verification are enforced, not remembered

Standing instruction: **only interact when it is absolutely needed.** Design decisions
qualify; chasing an unmerged PR or a broken check does not.

**Delivery** — two local hooks:

- **`git commit` on the default branch is blocked** (PreToolUse). Branch first. The default
  branch is read from `origin/HEAD`, not assumed.
- **The turn cannot end** (Stop hook) while there are uncommitted changes, unpushed commits,
  a pushed branch with no PR, or a green mergeable PR still open.

Escape hatch: `touch .claude/.wip`, delete it when work resumes.

**Verification:**

- **CI runs `build`, `typecheck`, `lint`, `test`, and every root-level `check:*` script**,
  enumerated from `package.json` rather than listed in the workflow, so a new one is covered
  the moment it exists.
- **`main` is protected**: PR required, CI required to pass, no force-push, no deletion,
  enforced for admins. A red PR cannot be merged, by anyone, including with `--admin`.
- **`check:hooks` fails if `.claude/settings.json` registers a hook no scenario exercises.**
  Adding an untested hook is now unmergeable.
- **A red CI run on `main` is reported at session start** by the SessionStart hook.
- **`.github/workflows/claude-review.yml`** runs an independent reviewer on every non-draft
  PR — outside the session that wrote the code, so it does not share its blind spot.
  **It works, and it is now proven:** on #58 it found a new test that could not reach the
  branch it named — defect class 11, in the PR whose purpose was fixing defect class 11.
  Take its findings seriously. Three failure signatures, all seen: a ~3-second pass means it
  skipped for a missing credential; a large `permission_denials_count` means the allowlist is
  short (`--allowedTools` *replaces* the default, it does not extend it), and a count of 1 to
  3 is routine; and `Failed to install Claude Code` with a curl 403 is the installer being
  unreachable — transient, re-run the job.
  **Fixed 2026-09-01 (#73):** the list was missing `Task` and `TodoWrite`, so the
  `/code-review` skill could not spawn its verification agents — 28 denials, $1.55 and no
  review, twice. A **failed** run now keeps `claude-execution-output.json` as an artifact,
  because the log records the denial *count* and never which tool was denied.

### Mutation testing

`npm run test:mutation --workspace=apps/api` — Stryker. The rationale is in
`.claude/rules/defect-patterns.md` §11; the operational facts:

- **Baseline 66.09% total / 74.49% covered.** `thresholds.break: 65` fails the run below
  that. Raise it when the score rises; lowering it to make a run pass is what it prevents.
- **Weekly and on demand, not per-PR** — `.github/workflows/mutation.yml`. ~13 minutes.
- **The mutate list is derived from the filesystem**, every source file with a sibling
  `*.test.ts`. Do not replace it with a hand-written list.
- **A rising score is not the goal.** Act on the survivors that contradict something this
  repo has written down about itself; the rest are mostly log strings or equivalent.

**None of this is bureaucracy to route around.** If a gate fires, finish the work; if it
misfires, add a case to `check-hooks.mjs` rather than loosening the guard. Never disable
branch protection to land something.

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
- **`fetchWithRetry` does not hand every response back.** It returns only `res.ok` or a
  non-429 below 500; a 5xx or a 429 exhausts four attempts and *throws*. A test that mocks a
  503 to reach a `!res.ok` branch reaches the caller's `catch` instead, and the branch it
  names is never evaluated. Use 403.

---

## What the user owes

**Three migrations are stacked and unapplied.** From `apps/api`, with `DATABASE_URL` set
**in the shell** — one command applies all three, then two checks prove them:

```powershell
npm run db:migrate          # applies 0007 (panel_states), 0008 (the weather_* run tables), 0009 (two ensemble columns)
npm run check:panel-state   # round trip, user scoping, prune cutoff, location-delete cascade
npm run check:weather-runs  # storage, the read path and its freshness cutoff, nulls surviving as nulls, prune ordering, the run cascade
```

**Registering `/api/cron/collect-runs` and `/api/cron/prune-runs` with cron-job.org is now
worth doing**, and it was not before: Phase 3 reads these tables. Without a schedule every
panel pays a live upstream fetch on a cold cache and writes the run back itself, and
`/insight`'s run-to-run trend in Phase 4 has no history to compare.

and, with `TELEGRAM_BOT_TOKEN` set in the shell, `npm run bot:set-commands` — needed again,
because `/forecast` and `/rain` are new entries in the client's command menu, and because
the 2026-09-01 rebuild reworded `/conditions`, `/forecast` and `/rain`. The list is
registered with Telegram, not read from the code at runtime, so the menu keeps the old
wording until that runs.

**The web half of Probe B was declined by the user on 2026-08-31. Do not ask again.**
The consequence is already the plan's default: `<pre>` monospace is the rendering, and
rich tables are **not adopted** — they cleared phone and desktop but no one has looked at
web, so promoting them would be a claim about a client nobody tested. If that changes,
`npm run probe:telegram-render --workspace=apps/api` re-sends the specimens and
`.claude/docs/telegram-render.md` §2 has the empty column waiting.

**Outstanding since 2026-08-26.** Set `TELEGRAM_WEBHOOK_SECRET` in the API's
Vercel project to a long random string, then re-run Telegram's `setWebhook` with
`secret_token` set to the same value. Until then the webhook's secret check is skipped and
the forgeable `chat.id` is the only gate.

`CLAUDE_CODE_OAUTH_TOKEN` is registered and the independent PR reviewer is live, working
and needs nothing further.

Nothing else is waiting on them. #25 needs a decision, but only when they choose to pick it up.
