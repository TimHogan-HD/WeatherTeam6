# Current state

**This is the only state document. Read it at session start; do not read the archive.**

`session-archive.md` is history, not state — grep it for the reasoning behind one specific
past decision, never at session start.

Last updated: 2026-08-31 · `main` @ `745bb61`

---

## Where the project is

The Telegram crossover is **complete**. All seven tasks shipped and the whole stack is
confirmed working on a real device: bot, Mini App, alerts, deep links, auth.

- **API** — Express on Vercel, one serverless function. Live.
- **Mini App** — three routes (list, detail, `/add`), live at https://weatherteam6.vercel.app
- **Bot** — commands, alerts, deep links into the Mini App.
- **`apps/mobile`** — archived, out of the build. Do not add features to it.

Baseline: `npm run test` 338 passing (264 api, 50 miniapp, 24 types), `npm run typecheck`
clean, `npm run check:hooks` 58 passing. **Mutation score 66.09%** —
`npm run test:mutation --workspace=apps/api`, and see § Mutation testing below.

Always-loaded instruction budget: **47,426 chars / ~11,857 est. tokens** (`CLAUDE.md` +
`.claude/rules/*`). It was 56,043 before `9d7015c`. Anthropic's guidance is that a bloated
`CLAUDE.md` causes its own rules to be ignored — if you are about to add a paragraph to it,
check first whether the fact is derivable from the repo, or belongs in a skill or the archive.

**You did not have to read this file.** The `SessionStart` hook injected it, along with the
branch, working tree, unpushed commits, open PRs, open issues, and whether CI on `main` is
green. If you are reading it because that block was absent, the hook did not fire — say so.

---

## What is next

The user's direction, set 2026-08-26 and revised the same day:

1. ~~**Agent-systems cleanup**~~ — **done**, #48 through #58. What it produced is described
   where it operates: the delivery and verification gates below, and § Mutation testing.
   Ordinary follow-up remains — 434 surviving mutants, and 216 more in code no test reaches
   at all — but it is no longer a phase.
2. **The chat interface is the priority, it is designed, and the plan is approved.** Read
   **`.claude/docs/telegram-precision-interface-plan.md`** — it is the spec, settled over a
   long design conversation on 2026-08-31, and it supersedes the one-line description this
   entry used to carry.

   The short version: **the Mini App is the snapshot, the bot is the instrument.** SpotWX-class
   precision in chat — per-model hourly tables, ensemble spread, `/rain`, `/insight`, `/afd`,
   run-to-run trend — on a panel message edited in place. Deep UI for this data does **not**
   get built in the Mini App.

   **Phase 0 is done and Phase 1 is next** — the interaction layer: `sendMessage.ts` widened
   to a two-arm button union, `callbackData.ts`, `commands.ts`, `panelState.ts`, `panels.ts`,
   `callback_query` dispatch in the webhook, and `setMyCommands`. No new data yet. See
   § What Phase 0 found, below, for the four measurements it must build on.
3. **An in-app feedback button.** Press it, type a note, and the note lands somewhere in
   this repo. Destination and mechanism undecided.
4. **Mini App polish** — deliberately downgraded. The user's words: *"the Mini App doesn't
   need to be super fancy."* Do not start a design system, a motion system or a CSS
   architecture for it on the strength of the old plan.

**Item 3 is still a design conversation the user wants to have first. Do not spec it
unilaterally.** Item 2 has had that conversation — build to the plan, do not re-litigate it.

### What Phase 0 found

Both probes are written and both output documents are committed. **Read the documents, not
this summary, before using a model or a variable** — `.claude/docs/model-matrix.md` and
`.claude/docs/telegram-render.md`. Regenerate the matrix (`npm run probe:models
--workspace=apps/api`) rather than editing it; upstream coverage changes.

The four measurements that constrain every later phase:

- **`precipitation_probability` is not the selected model's field.** Under
  `ncep_hrrr_conus` it runs 276h against a 54h model and is byte-identical to NBM's series.
  Never print it in a column headed with the selected model.
- **NBM returns 384 nulls for both pressure variables**, so pressure tendency cannot come
  from it — and an unchecked null there renders as a plausible `0 mb`.
- **No model run time is exposed.** Headers say *fetched 14:05Z*, never *12Z run*.
- **Out-of-coverage is a 400, not nulls** — that is what the disabled model button derives
  from. Ensemble confirmed at 143 members (ECMWF 51, ICON 40, GFS 31, GEM 21).

**Probe B ran on 2026-08-31. All ten specimens accepted; phone and desktop observed; web
still unobserved.** What it settled, in `.claude/docs/telegram-render.md` §2:

- **Rich tables render and survive an in-place edit** on phone and desktop — the same
  message id, edited with `rich_message`, came back a table. The "editing destroys rich
  formatting" claim is false on both.
- **`DisabledButton` is invisible.** The API accepts it and both clients draw it exactly
  like an enabled button, so an unavailable model gets a **labelled non-button row**, not
  a greyed button. Omitting it is still forbidden.
- **Rich blocks need no HTML escaping**; the `<pre>` path still does. Two paths, two rules.
- **Nine columns fit on the phone** with no wrap and no scroll — width is not the
  constraint the plan assumed.

**`<pre>` monospace still ships first.** Promoting rich tables to primary needs web —
one tab at web.telegram.org, specimens 2, 3, 7 and 9. Phase 1 is not blocked on it.

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
  Take its findings seriously. Two failure signatures: a ~3-second pass means it skipped for
  a missing credential, and a large `permission_denials_count` means the allowlist is short
  (`--allowedTools` *replaces* the default, it does not extend it). A count of 1 is routine.

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

**Small, 2026-08-31 — the web half of Probe B.** The specimens are already sitting in the
chat with the bot; open web.telegram.org and look at messages 70, 71, 74 and 77
(specimens 2, 3, 7, 9). Real tables, or an "unsupported message" card? That is the only
thing standing between rich tables and being promoted from opt-in to primary. Re-send
them with `npm run probe:telegram-render --workspace=apps/api` if the chat has been
cleared. Nothing is blocked on it — `<pre>` ships regardless.

**Outstanding since 2026-08-26.** Set `TELEGRAM_WEBHOOK_SECRET` in the API's
Vercel project to a long random string, then re-run Telegram's `setWebhook` with
`secret_token` set to the same value. Until then the webhook's secret check is skipped and
the forgeable `chat.id` is the only gate.

`CLAUDE_CODE_OAUTH_TOKEN` is registered and the independent PR reviewer is live, working
and needs nothing further.

Nothing else is waiting on them. #25 needs a decision, but only when they choose to pick it up.
