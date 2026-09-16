# Current state

**This is the only state document. Read it at session start; do not read the archive.**

`session-archive.md` is history, not state — grep it for the reasoning behind one specific
past decision, never at session start.

Last updated: 2026-09-16 · `main` @ `bcc7e5a`

---

## Where the project is

The Telegram crossover is complete and the bot is stable. **The active line is the Mini App
hourly data visualisation** — a five-phase plan in
`docs/handoffs/miniapp-hourly-dataviz-handoff-v1.md`, of which Phases 1, 1b, 2 and **3**
have shipped. **Phase 4 is next on that plan but is blocked on a product decision** (see
§ What is next); issue #108 is the unblocked build.

That plan reverses two older decisions, deliberately and on the owner's call: Mini App
polish is no longer downgraded, and location detail gains internal tabs against
`miniapp-design-v1.md` §3. **The bot stays first-class and is not being deprecated.** §3 now
carries a superseded banner; the handoff's § Phase 5 is where it and the rest get rewritten
in full.

**2026-09-16 was a research session and shipped no application code.** The five-phase
climbing/rock research brief (`docs/handoffs/climbing-research-brief-v1.md`) is complete
except Phase 3, which is blocked on the owner. What it changed:

- **`basalt` split into `basalt_dense` / `basalt_vesicular`** (#124) — the only code change.
  Migration `0011` is **applied to production and verified**; `check:add-location` passes
  17/17 and both new enum values round-trip. **No existing row's score moved**: plain
  `basalt` is retained and means "kind not recorded", keeping its 12/48 window.
- **Every figure in the two research docs that was headed for a constant has been opened at
  source** (#128, #130). **Eight of twelve moved — and not one because the number was
  wrong.** They moved because the figure was in a different paper than the one linked, in no
  cited paper at all, or because `[M]` had been applied to an advocacy page or a sentence in
  someone's introduction. **Read `rock-drying-research.md` §10 and
  `climbing-terminology-research.md` §17 before trusting any figure in either.**
- **Three long-standing gaps closed** (#130), all by reading a literature that has never
  heard of climbing: overhang-versus-wetting is **wind-driven rain** in building physics,
  the temperature-versus-humidity friction debate has a **tribology** measurement saying
  neither matters, and measured crag drying rates exist in **stone conservation**.
- **`.claude/docs/crag-facts.json`** (#129) — 96 crags as structured data, with
  `npm run check:crag-facts` enforcing that `seepage_prone` is never `false`. Research data;
  **maps to no column and implies no migration.**
- **`.claude/research-inbox/`** (#127) — for sources four hosts refuse to serve. Its README
  carries a **wanted list** of fifteen specific pages and what each would settle.

**Two things a future session would otherwise reinvent**, both now in `CLAUDE.md`: the
dew-point **60 °F threshold is unsourced**, and there is **no measured basis for reweighting
the temperature or humidity components in either direction.** Both were about to look like
easy wins.

Current state:

- **API** — Express on Vercel, one serverless function. Live.
- **Mini App** — three routes (list, detail, `/add`), live at https://weatherteam6.vercel.app.
  Location detail is **Daily / Hourly tabs** (Phase 3, `03b6d00`, rebuilt against the
  mockup in `6302eab`).
  - **Daily**: a labelled identity grid, a one-line current-conditions row (the hour
    covering now, the day's **labelled** high/low, a score chip), a three-metric toggle
    (Temp / Rain / Climbing), seven weekday rows with gradient tracks on **one scale shared
    by all seven** plus an axis note saying what that scale is, then the continuous
    seven-day strip.
  - **Hourly**: the identity condensed to a line, a **day pager**, then four charts —
    temperature as a bar from a labelled floor with a p10-p90 whisker, rain, chance of
    rain, and wind with gusts — on an hour axis read from the crag's clock.
  - The alert banner, the score section and the sources footer sit outside the tabs.
    Inline SVG, no chart library. **Nobody has seen any of it on a phone** — see § What the
    user owes.
  - **The first build did not match the mockup** — it worked from the handoff's prose
    summary. The artifact is the spec; § Phase 3 as built records the gap and the rebuild.
- **The chart invariants are in the `miniapp-patterns` skill, which loads itself when you
  open `apps/miniapp/**`.** They are not repeated here: they were, and a copy in two places
  is the drift this document keeps having to repair. The one to know before reading any of
  it — because it shipped wrong and no gate saw it — is that **an accumulation and an
  instantaneous reading sit differently on the same axis**: a rain bar spans the hour
  *before* its timestamp, a temperature mark is centred on its own.
- **A mockup artifact is the spec; its prose summary is not.** Phase 3 was built twice
  because the first pass read § Decisions taken's *description* of the design rather than
  opening the artifact it links. That summary is accurate and still loses the design — it
  cannot tell you there is a day pager rather than seven chips, four charts rather than
  two, or that the temperature ramp is continuous. **Open the artifact before building a
  screen it covers**, and say so if it is unreachable rather than working from the prose.
- **`GET /api/v1/hourly/:locationId`** (new, #99) — one deterministic model chosen by
  measured coverage, joined to the pooled ensemble on the UTC instant, seven local days.
  `?models=all` adds every model that answered; anything else is a 400. Verified 13/13 by
  `npm run check:hourly` and 12/12 against production.
- **`GET /forecast/:id` now carries per-day scores** (new, #107) — `score`, `confidence`,
  `unavailable_reason` and the five `component_*` fields, merged by `forecast_date`. A
  non-climbing location gets none of them, because the route omits the merge argument rather
  than checking a flag downstream. Verified 8/8 against production.
- **Bot** — `/start`, `/help`, `/locations`, `/conditions`, `/forecast`, `/rain`, `/alerts`,
  `/weather`, `/remove`, rendered as **native Telegram Rich Message tables** (Bot API 10.1+),
  with an HTML fallback on a permanent rejection. `/weather`, `/remove` and the Save flow are
  verified against real Postgres (`check:chat-locations` 8/8) but **still unverified against
  a real device** — see below. Everything else was confirmed working on the owner's phone
  2026-09-03.
- **`/api/cron/collect-runs`** and **`/api/cron/prune-runs`** are registered with
  cron-job.org and running. Confirmed healthy 2026-09-14: `runsStored: 42, hoursStored:
  7056, failed: 0` and the database at **12 MB**.

  Retention is 2 days parsed / 6h raw. **`collect-runs` answers `200 OK` when it persists
  nothing** — a storage failure is caught and logged at `warn`, which is right for a panel
  render and invisible for a collection job; it hid a day-long outage on 2026-09-13.
  Whether to change that is § Open Question 5 in the handoff and is **undecided**.
  (Post-mortem in the archive, 2026-09-14.)
- **`apps/mobile`** — archived, out of the build. Do not add features to it.
- **"Update" a mis-saved location is remove-then-add.** `/help` says so; no separate edit
  flow exists, deliberately. (Phase 5's build detail is in the archive under 2026-09-03.)

Baseline: `npm run test` **740 passing** (512 api, 195 miniapp, 33 types), `npm run typecheck`
clean, `npm run check:hooks` 58 passing. **Mutation score 66.09%**, last measured
2026-08-26 — not re-measured since, and **three** sessions of new code have landed under
it. `npm run test:mutation --workspace=apps/api`.

**A falling test count can hide behind a green number.** `apps/miniapp`'s vitest reported
*"123 passed"* while three test files failed to collect on a JSX parse error — the suite had
shrunk by 44 and still printed a green figure. Read the **file** count, not just the test
count.

**Claude can now run the acceptance checks unattended.** `DATABASE_URL`, `CRON_SECRET` and
`API_SHARED_SECRET` are set as Windows user environment variables, `Bash(npm run check:*)`
is allowlisted, and the Vercel MCP serves runtime logs and deployments. So `check:hourly`,
`check:runs-storage`, triggering a cron, and probing production are all self-service — do
not ask the owner to paste output. **Never echo a credential**, and
`.claude/settings.local.json` is gitignored for the same reason.

Migrations `0007`–`0010` are applied and every acceptance check passes against the real
database.

**The cause of the deterministic JSON-parse failures is still unconfirmed** — working
theory is Open-Meteo rate-limiting Vercel's shared egress IP. Hobby-plan log retention is
~1h, so catching `[openMeteo] deterministic response was not JSON` means checking the
dashboard right after a scheduled run.

Always-loaded instruction budget: `CLAUDE.md` + `.claude/rules/*`. If you're about to add a
paragraph to either, check first whether the fact is derivable from the repo, or belongs in
a skill or the archive — a bloated always-loaded file causes its own rules to be ignored.

**This file is still over budget — ~3,650 words against the ~1,500 the `session-end` skill
asks for**, and it went *up* this session despite two extractions. Both repairs it had named
were done — the bot rendering rules became the `telegram-patterns` skill, and the
`claude-review` troubleshooting went to the archive, together ~1,050 words — and the
research summary plus the browser blocker spent more than that.

**That is the honest pattern: this file grows faster than it is trimmed, and every session
that trims it also adds to it.** The next candidates are § Current state's Mini App
sub-bullets (~350 words describing a screen that is already built and whose spec is the
mockup) and the Phase 3 build detail, which belongs in the archive.

**Do not trim § Live gotchas to make room.** Every entry there is something that has silently
wasted a session, and they are the cheapest lines in the file.

**You did not have to read this file.** The `SessionStart` hook injects it, along with the
branch, working tree, unpushed commits, open PRs, open issues, and whether CI on `main` is
green. If you are reading it because that block was absent, the hook did not fire — say so.

---

## What is next

Direction set 2026-09-04, current as of 2026-09-16. The Mini App data-visualisation work is
**the active line**; everything below it is parked, not cancelled.

**The research brief is not on this list because it is finished.** Phases 0, 1, 2, 4 and 5
are merged; **Phase 3 is the only one left and it needs the owner, not a session** — it is
podcast transcripts and pages from four hosts that refuse every tool, dropped into
`.claude/research-inbox/`. The README there says exactly which pages and what each settles.
**Nothing in the research authorises a constant change**; `scoring-algorithm.md` is still
locked and every finding is recorded as a finding.

1. **Issue #108 — `hours_since_rain` never advances**, so days 2-7 all score
   `component_drying_time: 0` and cap at 60 of 100. Filed 2026-09-14. It used to be a
   background annoyance; **Phase 3 now draws it**, as a visibly flat Climbing column across
   six of the seven daily rows, so it is the first thing a look at the new screen will raise.
   Read `.claude/docs/scoring-algorithm.md` and let the `conditions-score` skill load.
2. **Phase 4 — wall-aware scoring — is blocked on a product decision, not on code.**
   Nothing populates `walls`: there is full CRUD and no seed, no importer and no UI, so the
   table is empty and a wall picker would have nothing to pick. How a wall gets created —
   hand entry, OpenBeta import, or derived from terrain — is the owner's call. Separately,
   **the aspect half of the phase does not exist yet**: `aspectDegrees` is a dead field that
   no scorer reads, so making a wall's aspect change its score means adding an aspect term
   to the drying model first. Both are in § Phase 4 of the handoff. Do not start it.
3. **Phase 5 — recent rain + document reconciliation.** Unblocked and mostly documentation:
   a recent-rain chart behind its own endpoint, and rewriting `miniapp-design-v1.md` §3 and
   §9 in full (§3 currently carries a superseded banner, not a rewrite). This is also where
   a CSS or motion architecture gets decided.
4. **Issue #82, part 2** — ranking climbing-relevant features above `PPL`. Still a product
   decision, not started.
5. **Phase 4 of the *bot* plan** (`/insight`, `/afd`) — parked. `/insight` needs
   re-specifying in plain language first; `/afd` is unaffected and could be built standalone.
6. **An in-app feedback button** — destination and mechanism undecided, still a design
   conversation the owner wants to have first. Do not spec it unilaterally.

**"Mini App polish is deliberately downgraded" is no longer true** and has been removed
from this list. It was reversed on 2026-09-04, and the `miniapp-patterns` skill was
corrected to match on 2026-09-15. **A CSS or motion architecture is still not authorised**
— that is a separate decision from drawing charts, and Phase 5 of the dataviz handoff is
where it gets settled.

### Bot chat-rendering rules moved to a skill (2026-09-16)

The ~450 words of Telegram rendering invariants that used to sit here are now the
**`telegram-patterns` skill**, scoped to `apps/api/src/lib/telegram/**` and
`telegramWebhook.ts`. Unchanged in substance and still binding — they load when you open a
file they govern, instead of costing every Mini App session that never touches the bot.

This was the trim this file named as its own clearest candidate.

---

## Open issues

**Read them from GitHub — `gh issue list`. Do not trust a table in a document.**

Standing context not on the issues themselves:

- **#21** — deferred by the user, twice. Tuning, not correctness. Do not start it.
- **#25** — needs a **product decision**, not code: nothing writes `crag_climbability_history`
  or `location_normals` any more, so it's either a new cron or deleting the two endpoints.
- **#27** — parts 1, 3, 4 done. **Part 2 open**, needs a migration (can't apply from this
  environment).
- **#32** — materially less likely since #33 landed. Entangled with the unfiled
  `ScoreInput` split below.
- **#82** — part 1 shipped; part 2 is § What is next, item 2.

### Unfiled, worth filing when touched

- `ScoreInput` conflates the humidity component with the drying humidity modifier in one
  field, so per-day humidity can't be fixed without moving the drying calculation too.
- `GET /forecast/:id` and `GET /conditions/:id` each run their own `computeLiveForecast` —
  one detail view costs two ensemble calls plus two rainfall calls.
- A layer below #34: ACIS can return a *successful* response whose rows are all `'M'`
  sentinels, yielding `[]` — indistinguishable from a dry month.

---

## Delivery and verification are enforced, not remembered

Standing instruction: **only interact when it is absolutely needed.** Design decisions
qualify; chasing an unmerged PR or a broken check does not.

**The hooks, branch protection and CI enumeration are described in `CLAUDE.md`**, which is
always loaded — not restated here. What is *not* there, and matters every session:

The **independent PR reviewer**`s failure signatures, quota behaviour and the
`num_turns` caveat are in `session-archive.md` — grep **"claude-review troubleshooting"**.
They are a reference read when the reviewer misbehaves, not state, and they were ~600
always-loaded words. The one line worth keeping here: **`review` is not a required check, so
a red reviewer does not block a merge — it means the diff got one reviewer instead of two, and
that is worth saying out loud rather than quietly merging.**

### Mutation testing

`npm run test:mutation --workspace=apps/api` — Stryker. Rationale in
`.claude/rules/defect-patterns.md` §11. Baseline 66.09% total / 74.49% covered,
`thresholds.break: 65`. Weekly in CI (`mutation.yml`, ~13 min) and on demand. A rising
score is not the goal — act on survivors that contradict something this repo has written
down about itself.

**None of this is bureaucracy to route around.** If a gate fires, finish the work; if it
misfires, add a case to `check-hooks.mjs` rather than loosening the guard. Never disable
branch protection to land something.

---

## Live gotchas

Only things that are still true and still bite. Historical gotchas are in the archive.

- **Python is not installed.** `python3` resolves to the Windows Store stub, which prints an
  advert and exits 0 — it does not fail loudly. Use Node.
- **`jq` is not installed either.** A pipeline through it fails silently, and with a
  `|| echo '[]'` fallback it loops emitting nothing. Use `node -e` or `gh --jq`.
- **`DELETE` does not free Neon space.** A prune removing 700k rows leaves every size in
  `check:runs-storage` unchanged — not a failure. `TRUNCATE` reclaims; plain `VACUUM` makes
  space reusable so writes resume; `VACUUM FULL` needs as much free space as the table and
  cannot run at the cap. `check:runs-storage` prints which case you are in.
- **A fresh merge is not a deploy.** A probe 45s after merging reported three failures that
  were the old code. Check `list_deployments` (Vercel MCP) first — as with a 401, which
  proves the gate, not the route.
- **Vercel's error level is noise** — anything on stderr counts, and the `DEP0169
  url.parse()` warning filled 19 of 19 error lines in three hours. Filter by message; a real
  failure may be at `warn`. Wide log queries time out: use `group_by` or a narrow `since`.
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
  503 to reach a `!res.ok` branch reaches the caller's `catch` instead. Use 403.
- **Vercel's Hobby-plan runtime log retention is short (~1 hour).** Check logs right after a
  cron run fires, not after waiting for one.

---

## What the user owes

**Two things: a trip to the phone, and a browser.** Nothing else — no credential, no
dashboard setting.

### The browser one (added 2026-09-16)

**Research Phase 3, and the last unverified figures, need pages this environment cannot
fetch.** Four hosts refuse every tool available here — `ukclimbing.com`, `climbing.com`,
`sciencedirect.com`, `onlinelibrary.wiley.com` — and two of them refuse because of a
**login wall**, which is the part that matters: *the owner's own logged-in browser can read
them and no tool here ever will.*

`.claude/research-inbox/README.md` carries a **wanted list of fifteen pages**, ranked, each
with what it settles. Save them there (Ctrl+P → Save as PDF works; PDF text extraction is
proven) and a session reads them as files.

**Playwright MCP is now configured for exactly this** — `.mcp.json` at the repo root, a
persistent profile at `C:\Users\Tim\.claude-research-browser`. **It needs a one-time setup the
owner must do: `npx playwright install chromium`, restart Claude Code, approve the server, and
log in once to UKC and Outside in the browser window that opens.** After that a session can
read those hosts unattended and the inbox becomes a fallback rather than the only route.

**Be honest about what it fixes.** A real browser defeats a **bot wall**; it does not defeat a
**paywall**. It should get climbing.com and ukclimbing.com (login walls, if the owner has
accounts) and probably the AMS and AAPG 403s. ScienceDirect, Wiley and OUP will land on an
abstract-or-subscription page unless the owner has institutional access — which is the same
place the abstract already gets us for some of them.

**Claude for Chrome cannot be reached from Claude Code at all** — separate product, no channel
between them. Checked.

### The phone one

**Open a saved climbing location in the Mini App, on your own phone, in your own theme.**

1. **Press back on the Hourly tab.** It must return to Daily, not close the Mini App. This is
   a Phase 3 acceptance criterion and **no test in this workspace can reach it** —
   `useBackButton` registers with Telegram's SDK, and `vitest.config.ts` is a `node`
   environment with no DOM, deliberately.
2. **Does the temperature ramp read?** It is a continuous blue → neutral → amber → red
   scale centred on 16 °C, on both the hourly marks and the daily rows' gradient tracks.
   This is the **second** attempt: the stepped version it replaced had its two warm steps
   only **ΔE 13.0** apart — below the floor for telling two hues apart with full colour
   vision — so the question is whether the continuous one actually separates "warm" from
   "too hot" on a phone.
3. **The Phase 2 charts, still outstanding** — now the seven-day strip at the foot of the
   **Daily** tab. Whether the band reads as confidence or as a smudge, and whether 168 rain
   bars are too thin to see.
4. **Does the day pager beat the seven chips it replaced?** `‹ Wed, Sep 16 ›` with "3 days
   out" beside it. Two arrows instead of seven tap targets, and it skips days the ensemble
   never reached rather than showing them greyed.

Phase 5 rewrites the design docs around all of this, so a change of shape is still cheap.

**The Neon password rotation is closed — declined by the owner on 2026-09-14.** The
connection string was pasted into a chat transcript on 2026-09-02 and has not been rotated;
the owner has decided that is acceptable and **does not want this raised again.** It is
recorded here so it stays closed rather than being rediscovered and re-raised every session,
which is what happened for four of them. Do not re-add it to this list. If it ever needs
revisiting, that is the owner's call to make, not a session's to prompt.

Everything else in the old list (`bot:set-commands`, `TELEGRAM_WEBHOOK_SECRET` +
`setWebhook`, the two cron registrations, migration 0010) is done and confirmed working.

**Still never ask the owner to paste a secret into the conversation.** That is a separate
rule and it stands: secrets go in their own shell via `setx`, or in the gitignored
`.claude/settings.local.json`. This is how the 2026-09-02 leak happened in the first place.

**Also still open from the bot's Phase 5:** `/weather <place>`, both Save buttons,
`/remove` from a real Telegram client. The migration and the database-level checks are
done; a device trying the three panels is what is missing. Same trip to the phone as the
charts above.

**A product decision is owed, not a credential.** The drying model reads
`archive-api.open-meteo.com` (daily, ERA5 reanalysis) while the rain panel reads the
forecast API's `past_days` (hourly). They disagree badly — 11.3 mm against 90.8 mm for the
same day at the same point — and the archive's version visibly smeared one storm across two
days. The higher-resolution product looks more trustworthy, **but `hours_since_rain` feeds
the conditions score**, so switching changes every score the app has ever shown and touches
`.claude/docs/scoring-algorithm.md`. Do not switch it unilaterally.

`CLAUDE_CODE_OAUTH_TOKEN` is registered and the independent PR reviewer is live, working,
and needs nothing further.

Nothing else is waiting on them. #25 needs a decision, but only when they choose to pick it up.
