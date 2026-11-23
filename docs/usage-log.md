# Usage log

**Temporary** (owner, 2026-11-23). It records which screens and crag tabs each account opens,
so the next redesign starts from what people actually use rather than from guesses. Remove it
once that question is answered; the steps are below.

## What it records

One row in `usage_events` each time someone signed in:

- opens a screen, named by its route pattern: `/`, `/map`, `/trips/:id`, `/location/:id/edit`.
  Never the address itself, so no crag or trip ids, no query and no hash (`/join#<code>`
  carries an invite code);
- opens a crag, or switches tabs on one: `/location/:id` with `overview`, `daily`, `hourly`,
  `precip`, `rock` or `crag`.

**No account is stored** (owner, 2026-11-23). Each row has a visit id, the screen, the tab
(crag screen only) and the time, and nothing else: no account, no location, no device, no
address. The visit id is random, made each time the app loads and kept only in memory, so a
reload starts a new one and nothing links a visit to a person or to another visit. It exists
only so one visit's screens can be put in order for the time-on-screen figure.

A failed report is dropped silently and never retried, so the app never waits on it or shows an
error for it. The server refuses any screen name that is not a route pattern. An automated
browser (`navigator.webdriver`, as in the nightly `check:ui`) reports nothing, so test runs
never land in the log; `check:usage` covers the endpoint instead.

Volume is small: a few rows each time someone opens the app. That is far inside Neon's 512 MB
cap at this many accounts, so nothing prunes it.

## Reading it

From `apps/api`, with `DATABASE_URL` set in the shell:

```bash
npm run usage          # the last 30 days
npm run usage -- 7     # the last 7 days
```

It prints every screen and tab, across everyone, with how many times it was opened and a median
time on it. There is no per-person view. **The time is approximate.** The app reports when a
screen opens, not when the phone is put away, so time on a screen is the gap to the same
visit's next event, counted only under five minutes (`MAX_GAP_MS`). The last screen of each
visit gets no time.

## Removing it

Everything it adds, in one PR:

1. `apps/miniapp/src/lib/usage.ts` and `usage.test.ts`: delete.
2. `apps/miniapp/src/App.tsx`: remove the `useScreenUsage` import and its call in `SignedIn`.
3. `apps/miniapp/src/routes/LocationDetail.tsx`: remove the `useTabUsage` import and its call.
4. `apps/api/src/routes/usage.ts`: delete, and remove `usageRouter` from `src/index.ts` (import
   and mount list).
5. `apps/api/src/lib/usage/`: delete the folder.
6. `apps/api/src/scripts/usage.ts` and `checkUsage.ts`: delete, and remove the `usage` and
   `check:usage` scripts from `apps/api/package.json`.
7. `.github/workflows/ci.yml`: remove `usage` from the database checks' list.
8. `packages/types/src/usage.ts` and `usage.test.ts`: delete, and remove the export from
   `packages/types/src/index.ts`.
9. `apps/api/src/db/schema.ts`: delete `usageEvents`, then `npm run db:generate` (a migration
   that drops the table) and `npm run db:migrate`. Deploy the code first, so nothing writes to
   the table after it is gone. The table has no foreign keys, so nothing else changes.
10. `.claude/docs/data-model.md`: remove the `usage_events` line. Delete this file.

Then `grep -rnE "usageEvents|usage_events|UsageEvent|ScreenUsage|TabUsage|usageRouter" apps packages .github`
should find only the drop migration.
