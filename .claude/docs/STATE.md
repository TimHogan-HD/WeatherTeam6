# Current state

The only state document, injected at session start, so keep it under 6,000 characters. It holds
only what no other file says: how the product stands is in `.claude/rules/`, issues in
`gh issue list`, feedback in `npm run feedback -- list`, history in `session-archive.md` (grep
it, never read it). A rewrite that finds the same fact in a rule file deletes it here.

Last updated: 2026-11-03

## What the user owes

None of it blocks work. Neither item has been confirmed done since 2026-09-23.

1. **Tear down the Telegram bot registration.** Telegram still delivers updates to a path
   that now 404s. Needs `TELEGRAM_BOT_TOKEN` in the owner's own shell, then `deleteWebhook`.
2. **Delete `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET` and
   `AUTH_ENABLED`** from both Vercel projects. Nothing reads them; three are live credentials.

## Working with the owner

- Interact only when it is needed. Design decisions qualify; chasing an unmerged PR does not.
- **The owner's field knowledge beats the research docs**, especially on rock and safety.

## Where the project is

The audience is the owner (account `tim`) plus a few climbing partners, each with their own
list. Crag A is the only score, and nothing is validated against outcomes: the forecast checks
the Report button collects are the only path to that. The app is the hybrid look, with five
bottom tabs: Conditions, Trips, Map, Crags, Profile. **Crags is still a placeholder**
(`UnbuiltSection`). Everything else on that bar is built.

### What is running

- **API**: `https://weather-team6-api.vercel.app`.
- **Web app**: https://weatherteam6.vercel.app. The owner uses it on a phone at about
  480×1000 CSS px.
- **cron-job.org**: `check-alerts`, `collect-runs` and `prune-runs` are registered.
  `record-trips` and `collect-radar` exist too; this rewrite did not check they are registered.
  **`collect-runs` still answers `200 OK` when it persists nothing.** That hid a day-long outage
  on 2026-09-13, and whether to change it is undecided.

**Credentials for unattended runs.** `DATABASE_URL`, `CRON_SECRET`, `API_SHARED_SECRET` and
`VERCEL_TOKEN` are Windows **user** environment variables. Read one with
`[Environment]::GetEnvironmentVariable('NAME','User')`, because `$env:` can read empty while
it exists. Never echo one. `AUTH_TOKEN_SECRET` is not among them; a local run generates a
throwaway. `VERCEL_TOKEN` is team-scoped and reaches `https://api.vercel.com` with no
`teamId`. That is how env vars get set, because the Vercel MCP's `projectEnvVars` 403s.

## What is next

Nothing is scheduled; the owner picks from the open issues.

- **#445 Sun and shade walls**: built. Still open on the issue: the owner's Winter Wall field
  test at 55 °F and sunny (is the sun boost too strong?) and the two wall lines on the Today
  chart. `docs/handoffs/wall-a-sun-shade-v1.md` is the entry point.
- **#293**: wall direction and angle per guidebook wall. Red Wing's lidar walls wait on it to
  be grouped by area. **Do not score `aspectDegrees` directly**: the same aspect flips sign by
  season.
- **#415 Sun on the wall**: built for Red Wing. Another crag needs the owner's `sun_confirmed`,
  then `npm run sun:walls`.
- **Still open on Crag A** (`crag-a-reference/README.md`): G5 (overhang in all-day drizzle
  scores 0 on synthetic weather) and G10/F13 (the heat rule can't see an overhang's shade).

## Live gotchas

`CLAUDE.md` § Known Gotchas carries the rest.

- **Auto mode will not commit an edit to `.claude/rules/`**, because it reads as
  self-modification. The owner turns auto mode off for that change.
- **The Crag A reference harness** (`.claude/docs/crag-a-reference/`) answers a model question
  in under 10 seconds when cut to `accuracy()`. A full run takes 9 minutes and about 2 GB. Its
  README says how.
- **`check:ui` runs on the dev server, so it never applies the production CSP.** A change to
  `vercel.json`'s headers needs the built app served with them (`vite preview` plus a
  Playwright route that adds the header).
- **`API_SHARED_SECRET` on preview differs from production** (deliberately).
  `AUTH_TOKEN_SECRET` is the same across all three targets. Env vars apply to new deployments
  only.
- **The reviewer action will not run on a PR that edits `claude-review.yml`.** Its first real
  review is the next PR.
- **A command containing the text `gh pr merge <n>`** (an echo, a test payload) trips the merge
  gate. Put such payloads in a file.
- **Backticks in a bash heredoc or a double-quoted `node -e` are command substitution.** Write
  the file with the Write tool.
- **`sed` with `|` as the delimiter breaks on Markdown table rows.** Use `c\` instead.
- **A source file can contain a literal NUL byte**, which makes `git diff` and `grep` treat it
  as binary. `grep -a` and `git diff --text` see it.
- **`DELETE` does not free Neon space.** `TRUNCATE` reclaims; `VACUUM FULL` needs as much free
  space as the table and cannot run at the cap.
- **A fresh merge is not a deploy.** Check the deployment state before probing production.
- **`fetchWithRetry` throws after exhausting retries on a 5xx or 429**, so a test mocking 503
  to reach a `!res.ok` branch reaches the `catch` instead. Use 403.
- **`drizzle-kit generate` needs no database**, only a non-empty `DATABASE_URL`.
- **Vercel Hobby log retention is ~1 hour.** Check right after a cron fires.
