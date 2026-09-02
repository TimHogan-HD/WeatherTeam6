# Current state

**This is the only state document. Read it at session start; do not read the archive.**

`session-archive.md` is history, not state — grep it for the reasoning behind one specific
past decision, never at session start.

Last updated: 2026-09-02 · `main` @ `c60d8be`

---

## Where the project is

The Telegram crossover is **complete**. All seven tasks shipped and the whole stack is
confirmed working on a real device: bot, Mini App, alerts, deep links, auth.

- **API** — Express on Vercel, one serverless function. Live.
- **Mini App** — three routes (list, detail, `/add`), live at https://weatherteam6.vercel.app
- **Bot** — commands, alerts, deep links into the Mini App.
- **`apps/mobile`** — archived, out of the build. Do not add features to it.

Baseline: `npm run test` 533 passing (459 api, 50 miniapp, 24 types), `npm run typecheck`
clean, `npm run check:hooks` 58 passing. **Mutation score 66.09%**, last measured
2026-08-26 and *not* re-measured since Phases 1, 2, 3 or the 2026-09-01 rebuild —
`npm run test:mutation --workspace=apps/api`, and see § Mutation testing below.

**The migrations are applied (2026-09-02) and both acceptance checks pass** — `0007`
(`panel_states`), `0008` (the three `weather_*` run tables) and `0009` (two ensemble
columns). `check:panel-state` 17/17 and `check:weather-runs` 40/40 against the real
database. Every bot panel command works in production.

**`check:weather-runs` failed on its first ever run, on correct data.** It compared a
`jsonb` column with `JSON.stringify` on both sides, and Postgres reorders jsonb keys by
length then bytewise — so it compared key *order*, which jsonb never promised, and could
only ever fail. Fixed in `ff7165d`. The lesson is the one this repo keeps relearning: an
assertion written beside the code it checks and **never executed** proves nothing, and
these scripts exist precisely where vitest cannot look.

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
   **Phase 5 now outranks Phase 4.** Asked for directly on 2026-09-02: *"I would like to be
   able to add remove and update locations from the chat rather than only in the app."*
   That is Phase 5 — `/weather` anywhere, save with an explicit climbing-or-weather flag,
   and `/remove` behind a confirm. Read its two **amendments** in the plan doc before
   building: the result list has to distinguish its results (issue #82, the Willow River
   fault), and "update" needs a decision because §12.4 still excludes rock type / aspect /
   cliff angle while *correcting a mis-saved location* is not addressed at all.
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
  that actually ships. The tables are held to **40** characters and tested for it — raised
  from 32 on 2026-09-02 on the evidence of a screenshot of the real bot, in which a
  24-character table left most of the message bubble blank.
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

**Both of those gaps are now closed:** the panels have been driven from a real device
(2026-09-02) and `check:weather-runs` passes 40/40 against the real database.

### What a real device found (2026-09-02)

Three reports, and the first two had one cause:

- **"conditions and forecast are the same it seems."** They were. `/forecast` and `/rain`
  with no location opened a plain `list` picker, and every location button on it carried
  the field `loc`, which `applyAction` maps to `conditions` — so all three commands,
  followed by the obvious next tap, landed on the same panel. **The picker now remembers
  which command opened it** (`pick_forecast` / `pick_rain`, buttons carrying `locf` /
  `locr`), and its heading says where the tap will land. `view` is a plain text column
  validated in the app, so no migration.
- **The inline bar drew as a dithered slab.** A run of `░` rendered as a dense speckled
  block that swamped the `█` beside it. The empty cell is a **space** now, and any non-zero
  value gets at least one block — at 1–12% everything was rounding to nothing and the
  column looked identical to no data.
- **"the row covers the 3 h after is confusing."** The rain rows are labelled with the
  window itself now (`12a-3a`, `9a-12p`), so the sentence that explained it is gone
  entirely. `rainTableNote` returns `null` in the simple case on purpose.

**A fourth finding is unresolved and needs a decision — see § What the user owes.** The
drying model and the rain panel read *different Open-Meteo products* and they disagree
badly. Measured at Willow River: `archive-api` reports 11.3 mm on 29 Aug and 11.0 mm on
30 Aug; the forecast API's `past_days` reports **90.8 mm** on 29 Aug and **0** on 30 Aug —
low-resolution reanalysis smearing one convective storm across two days. That is why
`/conditions` said *"no rain in 62h"* beside `/rain` saying *"4 days ago"*. **The 62h
figure feeds the conditions score**, so switching the source changes every score ever
shown. Left alone deliberately.

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

### What the second pass changed (2026-09-02, from a real device)

The first rebuild fixed the clutter and left the *data* unreadable. Four
complaints, from screenshots of the live bot, all acted on:

- **Tables used under half the bubble width.** That space now carries an inline
  bar — temperature on the hourly panel, chance of rain on the rain panel. The
  width assertion rose from **32 to 40 characters**, and the evidence is the
  screenshot itself: a 24-character table left most of the bubble blank. That is
  a measurement of the real client, which beats the 32 it replaced.
- **The standalone sparkline showed nothing** — eight blocks, no axis, no scale,
  no labels. Deleted, and `sparkline.ts` with it. The same values are a bar
  inside each row, where the clock time is the x label and the number is the y
  label, so it needs no legend. **A bar without a stated scale is forbidden**:
  `barScaleNote` exists for that and the caller must print it.
- **`hh` became a clock time.** `00`/`03` is a timestamp; `12am`/`3am` is a time
  of day. `clockCell` is fixed-width so the column cannot shift; `clockLabel`
  is the sentence form and lives in `forecastTable.ts` because `panels.ts`
  already imports it and the other direction is a cycle.
- **"Last rain: today" could not distinguish 3am from 5pm.** New
  `fetchRecentHourlyPrecip` (`/v1/forecast` + `past_days`, probed live first)
  gives an episode: *"Last rain: 1am–3am today (2026-09-02), 0.03 in."*

Facts that are not rules and live nowhere else:

- **The episode's timing and amount must come from the same hourly series.**
  Measured at Willow River: the ACIS gauge said 0.23 in for the day and the
  hourly reanalysis said 0.04 in. Quoting one against the other's clock time is
  two sources in one sentence. The daily lookup stays as the fallback for rain
  older than the 7-day hourly window and for the failure case.
- **An episode's start is one hour before its first wet stamp.** Open-Meteo
  stamps precipitation at the *end* of the hour it fell in — the convention
  `buildRows` and `buildRainDay` already follow — so stamps at 02:00 and 03:00
  are rain from 01:00. Printing the stamps verbatim said "2am–3am" for a shower
  that began at 1am. Caught reading the diff, not by a test.
- **The sources footer left the conditions panel.** §7 rule 6 requires a named
  source to be *computed*, not that one be *shown*; this is a display decision
  on one surface. `forecastSourceLabel` and `rainfallSourceLabel` are untouched
  and the Mini App still renders them. NWS is still named inline on every alert,
  and the model name is under `⚙ More`. **The age stays on the default panel** —
  it is the only provenance that changes what the reader should do.
- **`ConditionsReplyInput` lost `asosStation` and `snapshots`**, dead once the
  footer went. Defect class 10 is about exactly that.

### The panels are native Telegram tables now (2026-09-02, third pass)

**`<pre>` is no longer the rendering.** The grey box and `COPY CODE` footer are
Telegram's code-block chrome, and they are what made the panels read as *"this
shitty .md looking section"*. Monospace right-alignment is also why a wide header
sprawled left of a narrow number — a header and its values share only a right
edge, and nothing else lines up.

The evidence was already in `.claude/docs/telegram-render.md` §2 run 1: specimen
2 drew a **real table with grid lines** on this bot's own phone, and specimen 7
re-rendered the same message id as a table after an `editMessageText`. It had
been held back solely because nobody checked Telegram Web. **The owner accepted
that risk knowingly on 2026-09-02**; every report driving this design came from a
phone.

Facts that are not rules and live nowhere else:

- **The HTML path is still there, as an automatic fallback on a permanent
  rejection.** `sendRichMessage` is Bot API 10.1 and nothing in this repo can
  exercise it without the token, so a 4xx must not cost the panel. A transient
  failure still throws.
- **Nothing in this repo has ever made a `sendRichMessage` call.** Probe B proved
  the API accepts the shape and the phone draws it — but that was the probe
  script, not this path. **Confirm on a real device before trusting it.**
- **Escaping happens in exactly one place: `panelToHtml`.** Rich blocks are JSON
  and need none. Escaping in the builders would put a literal `&amp;` in the
  native table, which is issue #26 in reverse.
- **Every plain-text reply in the webhook goes through `sendPlain`.** Found
  reviewing the diff: the copy modules stopped escaping for the rich path, but
  three replies are not panels and still go out as HTML — two of them
  interpolating a user-typed name. `/conditions Bear & Cub` with no match would
  have been a silent 400. The rule is structural now, which is the only version
  of it that has ever held here.
- **Fixed column widths are gone.** A native table sizes itself; the fallback
  measures header and values and pads to the widest, so a value can never exceed
  its column. `TIME_COL_WIDTH`, `RANGE_COL_WIDTH` and every hardcoded width are
  deleted.
- **Units live on the value, never in the header** (`6 mph`, `976 mb`, `0 in`),
  `t` is the word `trace`, and `0 mph` reads `calm`.

**Three attempts at an inline chart all failed and all were removed** — a
sparkline, a dithered bar, a block bar. The pattern was trying to *use* the
horizontal space rather than asking what belonged in it; the answer was words.
Do not add a fourth without the owner asking for one.

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
  Take its findings seriously. Four failure signatures, all seen: a ~3-second pass means it
  skipped for a missing credential; a large `permission_denials_count` means the allowlist is
  short (`--allowedTools` *replaces* the default, it does not extend it), and a count of 1 to
  3 is routine; `Failed to install Claude Code` with a curl 403 is the installer being
  unreachable — transient, re-run the job; and **a run that gets *shorter* on each retry is
  exhausting the account's usage quota, not hitting anything in this repo.**
  **Fixed 2026-09-01 (#73):** the list was missing `Task` and `TodoWrite`, so the
  `/code-review` skill could not spawn its verification agents — 28 denials, $1.55 and no
  review, twice. A **failed** run now keeps `claude-execution-output.json` as an artifact,
  because the log records the denial *count* and never which tool was denied.
  **The artifact earned its keep on 2026-09-02 (#76):** two failures at 2m22s and 1m29s with
  1 and 3 denials looked like the #73 allowlist bug and were misread that way twice. The
  artifact held a `rate_limit_event` and *"You've hit your session limit"*. The tell was
  already written above — 1 to 3 denials is routine, so the count was never the cause.
  **Read the artifact before re-running; a retry on a spent quota costs money and fails.**

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

**The migrations are done (2026-09-02).** `0007`, `0008` and `0009` are applied and both
checks pass — nothing is owed here any more.

**A product decision is owed, and it is the only one on this list that is not a
credential.** The drying model reads `archive-api.open-meteo.com` (daily, ERA5 reanalysis)
while the rain panel reads the forecast API's `past_days` (hourly, higher resolution). They
disagree badly — 11.3 mm against 90.8 mm for the same day at the same point — and the
archive's version visibly smeared one storm across two days. The higher-resolution product
looks more trustworthy, **but `hours_since_rain` feeds the conditions score**, so switching
changes every score the app has ever shown and touches
`.claude/docs/scoring-algorithm.md`. Do not switch it unilaterally.

**Rotate the Neon password.** The connection string was pasted into a chat transcript on
2026-09-02. Neon dashboard → Roles → reset, then update `DATABASE_URL` in both Vercel
projects.

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
