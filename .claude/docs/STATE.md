# Current state

The only state document. `session-archive.md` is history — grep it for the reasoning behind
one past decision, never read it at session start.

Last updated: 2026-09-23 · `main` @ `7a939fd`

---

## Where the project is

**Telegram is gone.** The bot, webhook and alert delivery were deleted on 2026-09-23; auth is
a passphrase and a signed token; alert data is still collected and delivery is parked. The
audience is the owner plus a few climbing partners, each with their own list. Everything the
cleanup removed is at the `archive/2026-09-23-pre-cleanup` tag; any Expo reference that turns
up is residue, not a dependency.

**Scoring model v2 — Phases 0–3 and 4a are live.** 4a (PR #180) is the full
`rock-drying-research.md` §7 taxonomy — 27 rock types, each with its own drying window — and
54 known crags in `packages/types/src/knownCrags.ts` whose rock type is locked on save.
Re-run `npm run locations:lock-known-crags -- --apply` whenever `KNOWN_CRAGS` changes. The v2
number is the one on every screen; the five-component scorer still runs, renders nowhere, and
Phase 5 deletes it.

**The dataviz line is parked, not cancelled** — its Phase 5 is still wanted.

### What is running

- **API** — `https://weather-team6-api.vercel.app`. The owner's account exists, username `tim`.
- **Web app** — four routes (`/login`, list, detail, `/add`) at https://weatherteam6.vercel.app,
  installable, no service worker. **Nobody has seen it on a phone yet.**
- **cron-job.org** — `check-alerts`, `collect-runs`, `prune-runs`. **`collect-runs` answers
  `200 OK` when it persists nothing** — that hid a day-long outage on 2026-09-13; whether to
  change it is undecided.

**Baseline:** `npm run test` 986 passing (525 api, 302 miniapp, 159 types) across 29 / 23 / 8
files; `check:hooks` 58. Against real Postgres: `check:conditions` 24/24, `check:weather-runs`
44/44, `check:auth` 22/22, `check:hourly` 13/14 (#179), `check:add-location` 25/25,
`check:delete-trip` 9/9. **Compare the file count, not just the test count** — miniapp once
printed "123 passed" with three files failing to collect.

**Mutation is stale at 67.82% (2026-09-21)** against `thresholds.break: 67`. Let the weekly
CI job report it.

**Credentials for unattended runs.** `DATABASE_URL`, `CRON_SECRET`, `API_SHARED_SECRET` and
`VERCEL_TOKEN` are Windows **user** environment variables — read one with
`[Environment]::GetEnvironmentVariable('NAME','User')`, because `$env:` can read empty while
it exists. Never echo one. `AUTH_TOKEN_SECRET` is not among them; a local run generates a
throwaway. `VERCEL_TOKEN` is team-scoped and reaches `https://api.vercel.com` with no
`teamId` — that is how env vars get set, because the Vercel MCP's `projectEnvVars` 403s.

---

## What is next

The owner's product list:

1. **Humidity and dew point charts.** Both are fetched and stored; the hourly series is unread.
2. **A current-location GPS option.** No design yet; prefer the browser geolocation API.
3. **Scoring Phase 4b — the location editor**: `PATCH /locations/:id`, the editor (aspect,
   tilt, rock type where not locked), and the aspect geometry in `rockThermal` that makes
   `I_wall` real. Every saved location still has `cliff_angle` defaulted to 45. **Do not score
   `aspectDegrees` directly** (#139): the same aspect flips sign by season.
4. **Scoring Phase 5 — preferences, then retirement of the five-component scorer.** It owns
   two known wrinkles: a past window still renders as that day's, so *"Good hours: 6am–9am"*
   at 2pm reads like advice for now; and the drying card's `Climbable in ~Nh` line is the old
   model's clock and can disagree with the v2 `Dryness` reading above it (#178).

**Assumption to confirm with the owner:** `Last rain` stayed on the drying card rather than
moving into the Measurements panel.

---

## Open issues

Read them with `gh issue list`. Context not on the issues themselves:

- **#25** — product decision: a new cron, or delete the two endpoints.
- **#27** — most of it died with the webhook; re-read before working it.
- **#138–#140** — re-read against v2 before working them; #140 is superseded by the v2
  condensation margin.
- **#143** — the only path to knowing whether any of this predicts anything. Nothing in v2 is
  validated against outcomes.
- **#176** — the fix (seeding `priorEffectiveHours` from daily history) is a model decision.

**Unfiled:** `/forecast/:id` and `/conditions/:id` each run their own `computeLiveForecast`,
so one detail view costs two ensemble and two rainfall calls; and ACIS can return a
successful response of all-`'M'` sentinels, yielding `[]` — indistinguishable from a dry
month.

---

## Working with the owner

- Interact only when it is needed. Design decisions qualify; chasing an unmerged PR does not.
- **Do not sit watching CI.** Check once with `gh pr checks <n>`, say what is pending, move
  on. Auto-merge is not enabled on this repo, so the merge is a manual step.
- **The `review` CI check is not required** — a red reviewer does not block a merge, so say
  so rather than merging quietly. Failure signatures: grep the archive for
  "claude-review troubleshooting".

---

## Live gotchas

`CLAUDE.md` § Known Gotchas carries the rest.

- **`API_SHARED_SECRET` on preview differs from production** (deliberately). `AUTH_TOKEN_SECRET`
  is the same across all three targets. Env vars apply to new deployments only.
- **Backticks in a bash heredoc or a double-quoted `node -e` are command substitution**, and a
  quoted heredoc is not reliable either. Write the file with the Write tool.
- **`sed` with `|` as the delimiter breaks on Markdown table rows.** Use `c\` instead.
- **A source file can contain a literal NUL byte**, which makes `git diff` and `grep` treat
  it as binary. `grep -a` and `git diff --text` see it.
- **`DELETE` does not free Neon space.** `TRUNCATE` reclaims; `VACUUM FULL` needs as much free
  space as the table and cannot run at the cap.
- **A fresh merge is not a deploy** — check the deployment state before probing production.
- **Workspace-level `check:*` scripts are deliberately excluded from CI** — only root-level
  ones run.
- **`fetchWithRetry` throws after exhausting retries on a 5xx or 429**, so a test mocking 503
  to reach a `!res.ok` branch reaches the `catch` instead. Use 403.
- **`drizzle-kit generate` needs no database**, only a non-empty `DATABASE_URL`.
- **Vercel Hobby log retention is ~1 hour.** Check right after a cron fires; filter by message.

---

## What the user owes

None of it blocks work.

1. **Tear down the Telegram bot registration.** Telegram still delivers updates to a path
   that now 404s. Needs `TELEGRAM_BOT_TOKEN` in the owner's own shell, then `deleteWebhook`.
2. **Delete `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET` and
   `AUTH_ENABLED`** from both Vercel projects. Nothing reads them; three are live credentials.
3. **A trip to the phone.** Open a saved crag on a real phone:
   - The Conditions now card — does it read as instrument readings rather than a verdict, and
     does the Measurements control look tappable? Is `Rock temperature` read as modelled?
   - Does the temperature ramp read as continuous blue → neutral → amber → red?
   - The seven-day strip and the day pager — band or smudge, rain bars too thin?
   - Safe-area padding (always 0 on desktop).
   - Add to Home Screen — opens without browser chrome? (Chrome offers it only from the menu.)
