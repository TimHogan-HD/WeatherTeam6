# Current state

**This is the only state document. Read it at session start; do not read the archive.**

`session-archive.md` is history, not state — grep it for the reasoning behind one specific
past decision, never at session start.

Last updated: 2026-09-16 · `main` @ `0d70462`

---

## Where the project is

The Telegram crossover is complete and the bot is stable. **The active line is the Mini App
hourly data visualisation** — a five-phase plan in
`docs/handoffs/miniapp-hourly-dataviz-handoff-v1.md`, of which Phases 1, 1b, 2 and **3**
have shipped. **Phase 4 is next on that plan but is blocked on a product decision** (see
§ What is next); issue #108 is the unblocked build.

That plan reverses two older decisions, deliberately and on the owner's call: Mini App
polish is no longer downgraded, and location detail gains internal tabs against
`miniapp-design-v1.md` §3. **The bot stays first-class and is not being deprecated.** §3
carries a superseded banner; § Phase 5 of the handoff is where it gets rewritten in full.

### The research is closed — and it produced one document you actually read

**Finished 2026-09-16. Phase 3 was scrapped by the owner**; the forum half of it was done
instead and is the larger half. Nothing in the research authorises a constant change:
`scoring-algorithm.md` is still locked and every finding is recorded as a finding.

**Nothing from the research is applied to the app.** `conditionsScore` and `dryingModel` are
unchanged and production scores are exactly what they were. **`npm run compare:scoring
--workspace=apps/api`** prints today's scoring beside the two proposed changes with deltas —
offline, deterministic, and it asserts its own baseline against the real scorer so drift shows
up as a `MISMATCH`. **Run it before proposing any change to the scorer.**

Two things that harness surfaced which the research did not: **sandstone 12 hours after 12 mm of
rain scores 66 today** (a worse example of the additive problem than the 104 °F case #21 was
filed over), and **a geometric mean does not fully fix #21 on its own** — a failed temperature
component can only cost 30%, so 40 °C still scores 70.

**`.claude/docs/scoring-findings.md` is the output that matters.** ~4,900 lines of research
reduced to what touches the app, ranked by what a user would see, each item saying what is
wrong, how sure we are, and what it would change. **Read it instead of the research docs when
changing scoring code.** Its headline: **`dryingModel` is monotonic, but a crag can get wetter
on a dry day**, and the drying ramp is least accurate at its end — the day after rain, when the
wall looks dry and someone is deciding whether to drive.

**Five findings became issues** (#137–#140 new; #108 and #21 gained the designs the research
found). The four product decisions in §5 of that document are the owner's and are listed under
§ What is next.

**Two things a future session would otherwise reinvent**, both also in `CLAUDE.md`: the
dew-point **60 °F threshold is unsourced**, and there is **no measured basis for reweighting
the temperature or humidity components in either direction.** Both look like easy wins and are
not.

**Source verification changed the standing of the research itself.** Read
`rock-drying-research.md` §10 and `climbing-terminology-research.md` §17 before trusting any
figure in either — of twelve figures headed for constants, eight moved, and **not one because
the number was wrong**. They moved because the figure was in a different paper than the one
linked, in no cited paper at all, or because `[M]` had been applied to an advocacy page.

**The only code the research changed:** `basalt` split into `basalt_dense` /
`basalt_vesicular` (#124). Migration `0011` is applied to production and verified;
`check:add-location` passes 17/17. **No existing row's score moved** — plain `basalt` is
retained and means "kind not recorded".

**Per-crag facts are `.claude/docs/crag-facts.json`** (96 crags, `npm run check:crag-facts`).
Research data: **maps to no column and implies no migration.**

### Current state

- **API** — Express on Vercel, one serverless function. Live.
- **Mini App** — three routes (list, detail, `/add`), live at https://weatherteam6.vercel.app.
  Location detail is **Daily / Hourly tabs** (Phase 3). Inline SVG, no chart library.
  **Nobody has seen any of it on a phone** — see § What the user owes. The screen's spec is
  the mockup artifact, and the build detail is in the archive under 2026-09-15.
- **The chart invariants live in the `miniapp-patterns` skill**, which loads when you open
  `apps/miniapp/**`. Not repeated here — a copy in two places is the drift this document keeps
  having to repair. The one to know, because it shipped wrong and no gate saw it: **an
  accumulation and an instantaneous reading sit differently on the same axis** — a rain bar
  spans the hour *before* its timestamp, a temperature mark is centred on its own.
- **A mockup artifact is the spec; its prose summary is not.** Phase 3 was built twice because
  the first pass read a handoff's *description* of the design rather than opening the artifact
  it links. **Open the artifact before building a screen it covers**, and say so if it is
  unreachable rather than working from the prose.
- **`GET /api/v1/hourly/:locationId`** (#99) — one deterministic model chosen by measured
  coverage, joined to the pooled ensemble, seven local days. Verified 13/13 and 12/12 against
  production.
- **`GET /forecast/:id` carries per-day scores** (#107) — merged by `forecast_date`. A
  non-climbing location gets none, because the route omits the merge argument rather than
  checking a flag downstream. Verified 8/8 against production.
- **Bot** — `/start`, `/help`, `/locations`, `/conditions`, `/forecast`, `/rain`, `/alerts`,
  `/weather`, `/remove`, as native Telegram Rich Message tables with an HTML fallback.
  `/weather`, `/remove` and Save are verified against real Postgres (`check:chat-locations`
  8/8) but **unverified on a real device**. Everything else confirmed on the owner's phone
  2026-09-03. **Rendering rules are the `telegram-patterns` skill.**
- **`/api/cron/collect-runs`** and **`/api/cron/prune-runs`** registered with cron-job.org and
  running. Healthy 2026-09-14: `runsStored: 42, hoursStored: 7056, failed: 0`, database 12 MB.
  Retention 2 days parsed / 6h raw. **`collect-runs` answers `200 OK` when it persists
  nothing** — that hid a day-long outage on 2026-09-13. Whether to change it is § Open
  Question 5 in the handoff and is **undecided**.
- **`apps/mobile`** — archived, out of the build. Do not add features to it.

**Baseline:** `npm run test` **740 passing** (512 api, 195 miniapp, 33 types), `typecheck`
clean, `check:hooks` 58 passing. **Mutation score 66.09%**, last measured 2026-08-26 — **four**
sessions of new code have landed under it since.

**A falling test count can hide behind a green number.** `apps/miniapp` once reported *"123
passed"* while three files failed to collect on a parse error — the suite had shrunk by 44 and
still printed green. **Read the file count, not just the test count.**

**Claude runs the acceptance checks unattended.** `DATABASE_URL`, `CRON_SECRET` and
`API_SHARED_SECRET` are Windows user environment variables, `Bash(npm run check:*)` is
allowlisted, and the Vercel MCP serves logs and deployments. Do not ask the owner to paste
output. **Never echo a credential.**

**Playwright MCP is configured and working** — `.mcp.json` at the repo root, persistent profile
at `C:\Users\Tim\.claude-research-browser`. It reads any host tried so far. **A 403 is usually
a Cloudflare challenge that clears in 8–10 seconds, not a paywall** — wait it out before
concluding a page is gated.

**The deterministic JSON-parse failures are still unexplained** — working theory is Open-Meteo
rate-limiting Vercel's shared egress IP. Hobby log retention is ~1h, so catch it right after a
scheduled run.

**Instruction budget:** `CLAUDE.md` + `.claude/rules/*` load every session. Before adding a
paragraph to either, check whether the fact is derivable from the repo, or belongs in a skill
or the archive.

**This file was 3,769 words and is now 2,583 — still over the ~1,500 the `session-end` skill
asks for, and the first session in a while to cut more than it added.** It got there by
deleting the resolved browser blocker and moving the Phase 3 build detail to the archive. The
next candidates are § Current state's endpoint bullets, which duplicate what the route files
say. **Do not trim § Live gotchas to make room** — every entry there has silently wasted a
session, and they are the cheapest lines in the file.

**You did not have to read this file.** The `SessionStart` hook injects it along with branch,
working tree, unpushed commits, open PRs, open issues and CI status. If you are reading it
because that block was absent, the hook did not fire — say so.

---

## What is next

Direction set 2026-09-04, current as of 2026-09-16. The Mini App data-visualisation work is
**the active line**; everything below it is parked, not cancelled.

1. **Issue #108 — `hours_since_rain` never advances**, so days 2–7 all score
   `component_drying_time: 0` and cap at 60 of 100. **Phase 3 now draws it**, as a visibly flat
   Climbing column across six of seven rows. **The issue now carries a shipped competitor's
   design** — anchor the rain window to the hour being scored, fill it with forecast rain where
   that hour is future. Read `scoring-findings.md` §1.3 first.
2. **The four product decisions are ANSWERED (2026-09-16) and nothing is blocked on the owner.**
   `scoring-findings.md` §5 records them: **the score stays 0–100** — the precision objection
   was heard and rejected, so **stop raising it**; **this is a performance product**, with
   lightning alerts wanted eventually but explicitly not a priority; **tuning and outcome
   validation both arrive via an in-app feedback button** (issue #143), not now and not via
   logbook scraping. §1 of that document is unaffected either way — the drying ramp, the
   geometric mean and #108 are correctness issues that stand regardless of scale or tuning.
3. **Phase 4 — wall-aware scoring — is blocked on a product decision, not on code.** Nothing
   populates `walls`: full CRUD, no seed, no importer, no UI. How a wall gets created — hand
   entry, OpenBeta import, or derived from terrain — is the owner's call. **The aspect half is
   now issue #139**, and the research says **do not score `aspectDegrees` directly**: no
   constant works, because the same aspect flips sign between seasons. Do not start it.
4. **Phase 5 — recent rain + document reconciliation.** Unblocked, mostly documentation.
   Also where a CSS or motion architecture gets decided.
5. **Issue #82, part 2** — ranking climbing-relevant features above `PPL`. Product decision.
6. **Phase 4 of the *bot* plan** (`/insight`, `/afd`) — parked. `/insight` needs re-specifying
   in plain language; `/afd` could be built standalone.
7. **An in-app feedback button** — destination and mechanism undecided, a design conversation
   the owner wants first. Do not spec it unilaterally.

**A CSS or motion architecture is still not authorised** — separate from drawing charts, and
Phase 5 is where it gets settled.

---

## Open issues

**Read them from GitHub — `gh issue list`. Do not trust a table in a document.**

Standing context not on the issues themselves:

- **#21** — deferred by the user twice, as tuning. **The research reframes it as correctness**:
  it is not a mis-tuned band, it is what a weighted sum does, and a geometric mean fixes the
  class. Still the owner's call to start.
- **#25** — needs a product decision: a new cron, or delete the two endpoints.
- **#27** — parts 1, 3, 4 done. **Part 2 open**, needs a migration.
- **#32** — materially less likely since #33. Entangled with the `ScoreInput` split below.
- **#82** — part 1 shipped; part 2 is § What is next, item 5.
- **#137** — **closed 2026-09-16.** The ramp shipped concave; see `scoring-findings.md` §1.2.
- **#108** — **closed 2026-09-16.** The drying clock is per-day and forecast rain resets it.
- **#138–#140** — filed 2026-09-16 from the research. All three need inputs the scorer does
  not currently receive.

### Unfiled, worth filing when touched

- `ScoreInput` conflates the humidity component with the drying humidity modifier in one field,
  so per-day humidity cannot be fixed without moving the drying calculation too.
- `GET /forecast/:id` and `GET /conditions/:id` each run their own `computeLiveForecast` — one
  detail view costs two ensemble calls plus two rainfall calls.
- A layer below #34: ACIS can return a *successful* response whose rows are all `'M'`
  sentinels, yielding `[]` — indistinguishable from a dry month.

---

## Delivery and verification are enforced, not remembered

Standing instruction: **only interact when it is absolutely needed.** Design decisions qualify;
chasing an unmerged PR or a broken check does not.

Hooks, branch protection and CI enumeration are in `CLAUDE.md`. Two things that are not:

- **`review` is not a required check**, so a red reviewer does not block a merge — it means the
  diff got one reviewer instead of two, and that is worth saying out loud rather than quietly
  merging. Its failure signatures are in the archive: grep **"claude-review troubleshooting"**.
- **Mutation testing** — `npm run test:mutation --workspace=apps/api`. Baseline 66.09% total /
  74.49% covered, `thresholds.break: 65`. Weekly in CI (~13 min). **A rising score is not the
  goal** — act on survivors that contradict something this repo has written down about itself.

If a gate fires, finish the work; if it misfires, add a case to `check-hooks.mjs` rather than
loosening the guard. Never disable branch protection to land something.

---

## Live gotchas

Only things that are still true and still bite. Historical gotchas are in the archive.

- **Python is not installed.** `python3` resolves to the Windows Store stub, which prints an
  advert and exits 0 — it does not fail loudly. Use Node.
- **`jq` is not installed either.** A pipeline through it fails silently, and with a
  `|| echo '[]'` fallback it loops emitting nothing. Use `node -e` or `gh --jq`.
- **The working tree is CRLF.** Multi-line `sed`/`perl` replacements match nothing and report
  success. Use the Edit tool for anything spanning more than one line.
- **Backticks in a bash heredoc are command substitution.** A doc paragraph containing
  `` `filename.md` `` will silently lose the filename. Write the file with the Write tool
  instead — this cost a correction this session.
- **`DELETE` does not free Neon space.** A prune removing 700k rows leaves every size in
  `check:runs-storage` unchanged — not a failure. `TRUNCATE` reclaims; plain `VACUUM` makes
  space reusable; `VACUUM FULL` needs as much free space as the table and cannot run at the cap.
- **A fresh merge is not a deploy.** A probe 45s after merging reported three failures that were
  the old code. Check `list_deployments` (Vercel MCP) first.
- **Vercel's error level is noise** — anything on stderr counts, and a `DEP0169` warning filled
  19 of 19 error lines in three hours. Filter by message; a real failure may be at `warn`.
- **`gh` is installed but not always on `PATH`** — full path `C:\Program Files\GitHub CLI\gh.exe`.
- **Shared packages must be built before typechecks pass** —
  `npm run build --workspace=packages/types --workspace=packages/design`.
- **Neon cannot be reached from a cloud dev environment.** Migrations run from an unrestricted
  machine.
- **`npm run test` cannot see database behaviour.** Vitest mocks `fetch` and never connects.
  Flows that fail only against real Postgres need a `check:*` script.
- **A module mock replaces the whole module.** Use `importOriginal` and spread, or you will hide
  a pure helper and break unrelated tests.
- **`timezone=auto`, not `UTC`.** If a doc says otherwise it predates issue #33.
- **`fetchWithRetry` does not hand every response back.** It returns only `res.ok` or a non-429
  below 500; a 5xx or a 429 exhausts four attempts and *throws*. A test mocking a 503 to reach a
  `!res.ok` branch reaches the caller's `catch` instead. Use 403.
- **Vercel's Hobby-plan runtime log retention is ~1 hour.** Check logs right after a cron run
  fires, not after waiting for one.

---

## What the user owes

**One thing: a trip to the phone.** No credential, no dashboard setting.

**The browser blocker is resolved and has been deleted from this list.** Playwright MCP reads
every host that was previously listed as refusing — they were Cloudflare challenges, not
paywalls. `.claude/research-inbox/` still exists as a fallback for a genuine subscription wall,
and its wanted list is now spent.

### Open a saved climbing location in the Mini App, on your own phone, in your own theme

1. **Press back on the Hourly tab.** It must return to Daily, not close the Mini App. A Phase 3
   acceptance criterion that **no test in this workspace can reach** — `useBackButton` registers
   with Telegram's SDK, and `vitest.config.ts` is a `node` environment with no DOM, deliberately.
2. **Does the temperature ramp read?** A continuous blue → neutral → amber → red scale centred
   on 16 °C. This is the **second** attempt: the stepped version it replaced had its two warm
   steps only **ΔE 13.0** apart — below the floor for telling two hues apart with full colour
   vision. The question is whether the continuous one separates "warm" from "too hot" on a phone.
3. **The seven-day strip at the foot of the Daily tab.** Whether the band reads as confidence or
   as a smudge, and whether 168 rain bars are too thin to see.
4. **Does the day pager beat the seven chips it replaced?** `‹ Wed, Sep 16 ›` with "3 days out"
   beside it — two arrows instead of seven tap targets, skipping days the ensemble never reached.
