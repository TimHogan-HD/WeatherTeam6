# WeatherTeam6

Climbing conditions platform + general weather app. Core purpose: tell the user if a crag is climbable now, over the next 7 days, and support trip planning weeks out with improving forecast confidence over time.

## Stack

`package.json` and the workspace manifests are the authoritative record of what is installed. What they cannot tell you:

- **Drizzle is the ORM and the choice is final** — schema-as-TypeScript, SQL-close queries. Never substitute Prisma.
- **`apps/mobile` is ARCHIVED and out of the build** since 2026-08-26. Code retained, do not add features to it.
- **There is no queue.** No BullMQ, no Redis. Scheduled work is an HTTP route under `/api/cron/*` triggered by an external scheduler (cron-job.org). Forecast/conditions scoring is computed live per request, not by a snapshot job.
- **The API is one serverless function** on Vercel — `apps/api/api/index.ts` wraps the whole Express app.
- **The Mini App is the client.** `apps/miniapp` (Vite + React) is live at https://weatherteam6.vercel.app, opened from the bot's menu button, authenticated by `initData` HMAC as a second `Authorization` scheme.

## Commands

Root scripts are in `package.json` — `npm run dev|build|test|typecheck|lint`, `db:generate|db:migrate|db:studio`, `check:hooks`. The ones you would not guess:

```bash
npm run build --workspace=packages/types --workspace=packages/design   # must run before consuming workspaces typecheck
```

From `apps/api`, against a real database (`DATABASE_URL` set **in the shell**, no `.env` file):

```bash
npm run db:seed             # seed the user + 3 locations
npm run check:add-location  # acceptance check for the add-location flow (Task 5a)
npm run check:delete-trip   # acceptance check for DELETE /trips/:tripId (its FK cascade)
```

Run `npm run db:generate` before `npm run db:migrate` — never `drizzle-kit push`.

## Structure

`ls` shows the layout. What it does not show:

- **`packages/types` and `packages/design` are the only homes** for shared types and design tokens. Never duplicate a type across apps or redefine a colour, spacing value or type scale in one. Both compile to `dist/` and must be built before consuming workspaces typecheck.
- **`apps/miniapp` reaches design tokens through `src/theme/tokens.css.ts`** — never import `type`/`shadow`/`layout` from `packages/design` directly. See `apps/miniapp/README.md`.
- **`apps/mobile` declares no `build`/`dev`/`typecheck`/`lint`/`test` script**, which is what makes turbo skip it. It is still a workspace member so `npm install` resolves its deps. See `apps/mobile/ARCHIVED.md`.

## Environment Variables

**`.env.example` is the authoritative list. Read it — do not maintain a second copy here.**

What `.env.example` cannot tell you:

- **`VITE_API_BASE_URL` is inlined into a PUBLIC client bundle at build time.** Set it in the Mini App's own Vercel project. Never put a credential in any `VITE_*` variable.
- **`TELEGRAM_CHAT_ID` must be the private-chat id** (= the owner's Telegram user id). It is the auth boundary for both the bot webhook and the Mini App's `tma` scheme; a group id would make every Mini App request 401.
- **`API_SHARED_SECRET` is fail-closed** — unset means 503 on all of `/api/v1/*`, never an open door. `CRON_SECRET` and `TELEGRAM_BOT_TOKEN` are credentials; the bot token must never reach a client bundle.
- **`TELEGRAM_WEBHOOK_SECRET` unset means the check is skipped** and the forgeable `chat.id` is the only gate.
- **Never set `NODE_ENV` on Vercel** — see Known Gotchas.
- **`TOMORROW_IO_API_KEY` and `RAINVIEWER_KEY` are deliberately absent.** Tomorrow.io was replaced by ACIS in Phase 11; RainViewer's key is unused by the current code.

Never commit `.env`, and **do not create one at all** — set variables in the shell for the one command that needs them.

## Non-Negotiable Rules

- TypeScript strict mode everywhere. No `any`.
- All API responses use shape: `{ data, error, status }`
- All external API calls wrapped in try/catch with exponential backoff retry
- Never log secrets, tokens, or full API responses in production. Never serialise an error object wholesale into a log — database driver errors can carry the connection string; go through `describeError` in `lib/http.ts`, which reads only known-safe fields
- Auth is toggled via `AUTH_ENABLED` env var. Do not build a login UI.
- `DEFAULT_USER_ID` is injected by `resolveUser` middleware — never hardcode it in route handlers
- Drizzle migrations only — never mutate the DB directly

- **Finish the delivery, don't hand it back.** Work reaches `main` through a branch, a PR,
  green CI and a squash merge — all of it done by you, not the user. Do not end a turn with
  uncommitted changes, unpushed commits, a pushed branch with no PR, or a green mergeable PR
  left open.

  This is **enforced, not advisory**. `git commit` on the default branch is blocked by a
  PreToolUse hook, and a Stop hook refuses to end the turn while any of the above is
  outstanding. Both are covered by `npm run check:hooks`. If the user explicitly asks you to
  pause mid-change, `touch .claude/.wip` to suppress the gate and delete it when work resumes.

- **A check nothing runs is not a check.** Every root-level `check:*` script in
  `package.json` is executed by CI, enumerated from `package.json` rather than listed in
  the workflow, so a new one is covered the moment it exists. Every hook `.claude/settings.json`
  registers must be exercised by `npm run check:hooks`, which fails if it is not.

  `main` is protected on GitHub: pull request required, CI required to pass, force-push and
  deletion refused, and the rules apply to admins. Do not route around this by disabling
  protection; fix the red check.

Both gates exist because the prose version failed in production. The incidents are recorded in `.claude/docs/session-archive.md` — grep it if you need the reasoning.

## Reference Docs

**MANDATORY reading rules:**

Everything in `.claude/rules/` is loaded automatically at session start — you do not need to open those files.

- At the start of EVERY session: read `.claude/docs/STATE.md`
- Before starting any new phase: read `.claude/docs/plan.md`
- Before ANY database work: read `.claude/docs/data-model.md` AND `.claude/rules/architecture.md`
- Before ANY weather fetch work: read `.claude/docs/api-sources.md`
- Before ANY conditions score work: read `.claude/docs/scoring-algorithm.md`
- **Before reviewing any diff, and before reporting any work complete: read `.claude/rules/defect-patterns.md`**
- Before ANY Mini App UI phase: read `docs/handoffs/miniapp-design-v1.md` AND the §Design System section of `docs/handoffs/weatherteam6-ui-handoff-v1.md` — the mockups are the spec, not prose descriptions

Skills load on demand: **`/review-checklist`** (run before every commit), **`/session-end`** (the session-end protocol), plus `miniapp-patterns`, `drizzle-patterns`, `background-work` and `conditions-score`, which load themselves when you touch the matching files.

**Direction (read first):**
- `docs/handoffs/telegram-crossover-v4.md` — **authoritative product direction.** Telegram bot + Mini App replaces the native app. **All seven tasks complete as of 2026-08-26; the crossover is finished and there is no Task 8.** Remaining work lives in the open issues and `.claude/docs/plan.md`, not in that doc.

**UI Design Handoffs:**
- `docs/handoffs/weatherteam6-ui-handoff-v1.md` — written for the archived mobile app, but its **§Design System is still in force and client-agnostic**: locked contrast rules, layout constants, copy rules. §7b (Home), §7c (Location Detail), §7e (Locations) are the closest existing specs to the Mini App's screens. Note the Mini App has **three** routes, not two — §12 added `/add`.
- `docs/handoffs/miniapp-design-v1.md` — **the Mini App spec, and it is binding.** Screens, theming, units, states, copy model, and §12 the add-location flow. It supersedes this repo's older two-screen sketches.
- `docs/handoffs/design-mockups/weatherteam6UI.html` — primary mockup for Home + Location Detail. Visual reference only; where it and `miniapp-design-v1.md` disagree, the spec wins.
- Mobile-only mockups (`radar-*`, `walls-*`, `trips-*`) are **archived reference, not being built.**

## Session Start Protocol

**Steps 1 and 2 are no longer yours to remember.** The `SessionStart` hook
(`.claude/hooks/session-start-state.mjs`) injects them into context before your first
turn: current branch, working tree, unpushed commits, open PRs with their CI status, open
issues, whether CI on `main` is green, and `.claude/docs/STATE.md` verbatim. Read what it
gave you instead of re-running `git log`, `gh issue list`, or opening `STATE.md`.

One step is still yours, because it changes the working tree rather than reporting on it:

1. Run `npm run build --workspace=packages/types --workspace=packages/design`

If the injected block is missing (the hook failed, or you are running somewhere it does not
fire), fall back to reading `STATE.md` and running `git log --oneline -5` by hand.

That is the whole protocol. Everything else is read **when the work needs it**:

| Read this | When |
| --- | --- |
| `.claude/docs/plan.md` | before starting a new phase, or when you need the #21 diagnosis |
| `gh issue list` | whenever you need issue state — **never a table in a document** |
| `.claude/docs/session-archive.md` | never at session start. Grep it for the reasoning behind one specific past decision |
| the domain skills | they load themselves when you touch the matching files |

**Self-start rule:** If the user's opening message is "next phase", "continue", "do Phase X", or equivalent — complete the step above, then state in one sentence what phase you are building and what branch you will create, and proceed. Do not ask for a detailed prompt. The docs are the spec. If `STATE.md` names a handoff doc section for the work you are picking up, read it before writing any code.

## Session End Protocol

**Invoke the `/session-end` skill.** It carries the full protocol: rewrite `STATE.md`, append a state block to `session-archive.md`, reconcile the docs the block made stale, and correct the commit hash after a squash merge.

## Verification Standards

Typecheck and lint prove a change compiles. They do not prove it works.

- **Read the diff before reporting anything done. This is not optional and it is not the checklist.** The defects this project ships are not type errors; they are correct-looking code that says a wrong thing, and no tool in the repo can see them. `.claude/rules/defect-patterns.md` catalogues the classes with real examples — read it before reviewing a diff.
- **When a check passes, ask what it would have caught.** A green suite over an untested path is not evidence.
- **Exercise the real path before calling something complete.** For an endpoint that calls an external API, run it and read the response. For one that touches the database, run it against the database.
- **A green suite is not a suite that constrains anything.** `npm run test:mutation
  --workspace=apps/api` reports which lines of the implementation could change without
  a single test noticing. Baseline 66.09% (2026-08-26); `thresholds.break` fails the run
  below 65. Weekly in CI, on demand locally. See `.claude/rules/defect-patterns.md` §11.
- **`npm run test` cannot cover database behaviour.** Vitest mocks `fetch` and never opens a connection, so foreign-key violations, values that silently fail to persist, and constraint errors are all invisible to it. That class of failure needs a script under `apps/api/src/scripts/`, exposed as an `npm run check:*` command — `check:add-location` is the worked example. Write one when you add a flow whose failures only appear against real Postgres.
- **Run the API locally against the real database when you need to.** No `.env` file is required, and none should be created:
  ```powershell
  cd apps/api
  $env:DATABASE_URL = "<Neon pooled connection string>"   # keep the quotes: the string contains &
  npm run check:add-location
  ```
  `DEFAULT_USER_ID` is optional — it can be read from the `users` table. The seeded user is `00000000-0000-0000-0000-000000000001`.
- **State plainly what was and was not verified.** "Typechecks, but never run against a database" is a useful sentence; omitting it is how an untested endpoint becomes a dependency.

## Reporting Work

- Lead with what happened and what it means, not the mechanism. A caveat does not need its justification attached — say what breaks, and keep the reasoning for when it is asked for.
- Say what failed, what was skipped, and what remains unverified, without being asked.
- Do not describe a problem in schema or driver terms when a plain sentence covers it.

### MANDATORY: every piece of finished work ends with a handoff block

**This applies to every recap, every summary, every PR body, and every message that ends a stretch of work.** The user should never have to read back through a report to work out whether a ball is in their court.

Use this exact structure, last, under a heading:

```
## Do you need to do anything?

**Yes / No.** <If yes: the specific actions, each one a thing only they can do —
a credential, a dashboard setting, a phone, a product decision. If no, say so
plainly and do not pad it.>

## Next step

<The single next action, and who does it. If it is blocked, say what on.>
```

Rules for it:

- **Answer the yes/no first, in bold.** Anything else buries it.
- **"Yes" is only for things the user alone can do** — a credential, a dashboard setting, a real phone, a product decision. Work that is merely *unstarted* is not a user action; it goes under Next step.
- **Do not manufacture a "yes".** If nothing needs them, "No" is the correct and useful answer.
- **One next step, not a backlog.** Rank if there are several; name the single one that comes first.
- A blocked next step still gets named, along with what it is blocked on.

## Known Gotchas

**Shared packages must be built before typechecks pass.**
`packages/types` and `packages/design` compile to `dist/`. If `dist/` is missing (fresh clone or after clean), consuming workspaces fail with "cannot find module". Fix:
```bash
npm run build --workspace=packages/types --workspace=packages/design
```

**`vite` is pinned at the repo root so the Mini App's plugins resolve the right copy.**
`apps/api`'s vitest 2 pulls in vite 5, which npm hoists to the root. `@vitejs/plugin-react`
hoists too, and it resolved that vite 5 instead of `apps/miniapp`'s vite 8 — the build
died with `Package subpath './internal' is not defined`. The root `package.json` now
declares `vite` directly. Do not remove that devDependency because "nothing at the
root uses it".

**Never set `NODE_ENV=production` as a Vercel environment variable.**
npm omits devDependencies when it's set, `typescript` is a devDependency, and the root postinstall (which builds `packages/types` and `packages/design`) then dies with `tsc: command not found`. Vercel manages `NODE_ENV` itself.

**Vercel framework preset must be "Other", not the auto-detected "Express".**
Vercel's Express preset expects the entry file to `export default app` or call `app.listen()`. `apps/api/api/index.ts` exports a `handler(req, res)` that forwards into the app, and `apps/api/package.json`'s `main` points at a module exporting `createApp` — a factory, not an app instance. The preset fails confusingly at runtime rather than at build.

**`apps/api/vercel.json` skips the build step deliberately.**
`buildCommand` is a no-op and `outputDirectory` points at an intentionally empty `public/`. Vercel's Node builder compiles `api/` itself and the workspace packages are built in the root postinstall. Without the empty `public/`, deploys fail with "No Output Directory named public found".

**Neon cannot be reached from this cloud dev environment.**
The egress proxy blocks both Neon's WebSocket path (403) and its HTTP SQL API host. `drizzle-kit` auto-detects `@neondatabase/serverless` and uses the WebSocket driver regardless of app code, so **migrations must be run from an unrestricted machine**, or the environment's egress allowlist widened to `*.aws.neon.tech`.

**This repo is checked out on Windows, and the working tree is CRLF.**
Multi-line `sed`/`perl` replacements silently match nothing — they fail quietly, report success, and leave the file untouched. Use the Edit tool for anything spanning more than one line; single-line `sed -i` is fine. **Python is not installed** (`python3` resolves to the Windows Store stub, which prints an advert and exits 0 — it does not fail loudly); reach for Node or PowerShell instead. `gh` is installed but not always on `PATH` — the full path is `C:\Program Files\GitHub CLI\gh.exe`.

**Vercel will not give you a secret back.**
`DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, and the other credentials are marked sensitive: the dashboard refuses to copy them and `vercel env pull` cannot recover them. Go to the source instead — Neon's dashboard for `DATABASE_URL` (use the **pooled** string for app runtime, direct only for migrations). Do not ask the user to paste a secret into the conversation; have them set it in their own shell.

**An unauthenticated 401 from production proves `DEFAULT_USER_ID` is set.**
`resolveUser` runs before `requireApiAuth`, so a server missing `DEFAULT_USER_ID` answers 500 "Server misconfigured" even without credentials. Note the converse: **every** `/api/v1/*` path returns 401 unauthenticated, existing or not, so a 401 is *not* evidence that a route was deployed. Check the deployment's commit SHA for that.

**Code reviews interrupted by context limits lose their findings.**
If `/code-review` or the code-review skill runs near the end of a long session and context compresses before the output is written, the findings are lost. Save intermediate review output to `.claude/docs/review-findings.md` before the session ends if verification is still in progress.

Mobile-specific gotchas live in `apps/mobile/ARCHIVED.md` — that workspace is out of the build.
