# WeatherTeam6

Climbing conditions platform + general weather app. Core purpose: tell the user if a crag is climbable now, over the next 7 days, and support trip planning weeks out with improving forecast confidence over time.

## Stack
- **Client:** Telegram bot + Telegram Mini App (`apps/miniapp`, Vite + React — not yet built, see Crossover Tasks 5-7)
- **Mobile (ARCHIVED):** React Native + Expo lives in `apps/mobile`. Superseded by the Mini App as of 2026-07-31 — code retained, out of the build, do not add features to it.
- **Backend:** Node.js + TypeScript + Express, wrapped as a single serverless function on Vercel (`apps/api/api/index.ts`)
- **ORM:** Drizzle (schema-as-TypeScript, SQL-close queries — never substitute Prisma)
- **DB:** PostgreSQL on Neon (`@neondatabase/serverless`, `drizzle-orm/neon-serverless`)
- **Background work:** no queue — `alerts-poller` is now `POST /api/cron/check-alerts`, triggered by an external scheduler (cron-job.org); forecast/conditions scoring is computed live per request instead of a snapshot job
- **Storage:** Cloudflare R2 (conditions report photos)
- **Monorepo:** Turborepo

## Commands
```bash
npm run dev           # start all services
npm run build         # build all packages
npm run test          # run all tests
npm run typecheck     # typecheck all packages (tsc --noEmit)
npm run lint          # ESLint flat config (eslint.config.mjs) — separate from typecheck
npm run db:generate   # generate Drizzle migration from schema changes
npm run db:migrate    # apply pending migrations to DB
npm run db:studio     # open Drizzle Studio
```

From `apps/api`, against a real database (`DATABASE_URL` set in the shell, no `.env` file):
```bash
npm run db:seed             # seed the user + 3 locations
npm run check:add-location  # acceptance check for the add-location flow (Task 5a)
```

## Structure
```
apps/
  api/              # Express API + Vercel serverless entry (api/index.ts)
  miniapp/          # Telegram Mini App — NOT YET BUILT (Crossover Task 5)
  mobile/           # ARCHIVED — React Native + Expo. No new features.
                    #   Still in workspaces/turbo until Task 7 removes it.
packages/
  types/            # Shared TypeScript types (never duplicate across apps)
  design/           # Design tokens — colors, spacing, type scale
```

Both `packages/*` compile to `dist/` and must be built before consuming workspaces typecheck.

## Environment Variables

`.env.example` is the authoritative list — keep this section in sync with it.

```
DATABASE_URL=                                       # Neon connection string (pooled for app runtime; direct for migrations)
DEFAULT_USER_ID=                                    # seeded user UUID, set after first migration
AUTH_ENABLED=false
NODE_ENV=development                                # NEVER set this on Vercel — see Known Gotchas
PORT=3001
NWS_USER_AGENT=weatherteam6/1.0 your@email.com
TELEGRAM_BOT_TOKEN=                                 # bot token (alerts + /api/telegram/webhook); never reaches a client bundle
TELEGRAM_CHAT_ID=                                   # single-user chat id — the bot's auth boundary
CRON_SECRET=                                        # gates POST /api/cron/check-alerts; treat as a credential
API_SHARED_SECRET=                                  # gates ALL of /api/v1/* via `Authorization: Bearer`; fail-closed — unset means 503, never open
EXPO_PUBLIC_SHADEMAP_KEY=                           # archived — apps/mobile only
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
API_BASE_URL=                                       # server-side base URL (Vercel)
LOG_LEVEL=                                          # pino log level; defaults to info (prod) / debug (dev)
EXPO_PUBLIC_API_BASE_URL=                           # archived — read by mobile at bundle time
```

The Mini App will add `VITE_API_BASE_URL` when `apps/miniapp` is built (Crossover Task 5).
`TOMORROW_IO_API_KEY` and `RAINVIEWER_KEY` are **not** in `.env.example` — Tomorrow.io was
replaced by ACIS in Phase 11, and RainViewer's key is unused by the current code.

## Non-Negotiable Rules
- TypeScript strict mode everywhere. No `any`.
- All API responses use shape: `{ data, error, status }`
- All external API calls wrapped in try/catch with exponential backoff retry
- Never log secrets, tokens, or full API responses in production. Never serialise an error object wholesale into a log — database driver errors can carry the connection string; go through `describeError` in `lib/http.ts`, which reads only known-safe fields
- Never commit `.env`, and **do not create one at all** — use `.env.example` with blank values, and set variables in the shell for the one command that needs them (see § Verification Standards)
- Auth is toggled via `AUTH_ENABLED` env var. Do not build a login UI.
- `DEFAULT_USER_ID` is injected by `resolveUser` middleware — never hardcode it in route handlers
- Drizzle migrations only — never mutate the DB directly
- Commit after each completed phase

## Reference Docs

**MANDATORY reading rules:**

- At the start of EVERY session: read `.claude/rules/architecture.md`
- Before starting any new phase: read `.claude/docs/plan.md`
- Before ANY database work: read `.claude/docs/data-model.md` AND `.claude/rules/architecture.md`
- Before ANY weather fetch work: read `.claude/docs/api-sources.md`
- Before ANY conditions score work: read `.claude/docs/scoring-algorithm.md`
- Before ANY Mini App UI phase: read `docs/handoffs/miniapp-design-v1.md` AND the §Design System section of `docs/handoffs/weatherteam6-ui-handoff-v1.md` — the mockups are the spec, not prose descriptions

Full paths:
- **Data model + schema:** `.claude/docs/data-model.md`
- **API sources + quirks:** `.claude/docs/api-sources.md`
- **Scoring algorithm:** `.claude/docs/scoring-algorithm.md`
- **Architecture rules:** `.claude/rules/architecture.md`
- **Review checklist:** `.claude/rules/review-checklist.md` — run before every commit
- **Build plan:** `.claude/docs/plan.md`

**Direction (read first):**
- `docs/handoffs/telegram-crossover-v4.md` — **authoritative product direction.** Telegram bot + Mini App replaces the native app. Tasks 1-4 complete, plus **Task 5a (add-location API, merged `a90613f`)** — a task added later and listed in that doc between Tasks 5 and 6, despite its name it is backend work unrelated to Task 5. **Task 5 (Mini App shell) is next**, then Task 6, then Task 7.

**UI Design Handoffs:**
- `docs/handoffs/weatherteam6-ui-handoff-v1.md` — written for the archived mobile app, but its **§Design System is still in force and client-agnostic**: locked contrast rules, layout constants, and copy rules. Read before any Mini App UI work. §7b (Home), §7c (Location Detail), §7e (Locations) are the closest existing specs to the Mini App's screens. Note the Mini App has **three** routes, not two — §12 added `/add`; the "two screens" phrasing predates it.
- `docs/handoffs/design-mockups/weatherteam6UI.html` — primary mockup for Home + Location Detail. Visual reference only; where it and `miniapp-design-v1.md` disagree, the spec wins.
- `docs/handoffs/miniapp-design-v1.md` — **the Mini App spec, and it is binding.** Written and agreed in Phase B0 (merged `14c9757`). Screens, theming, units, states, copy model, and §12 the add-location flow. Read before any Mini App code; it supersedes this repo's older two-screen sketches.

**Mobile-only mockups (archived — reference only, not being built):**
- `docs/handoffs/design-mockups/README.md`, `radar-*.jsx/css`, `walls-*.jsx/css`, `trips-*.jsx/css` — Radar, Walls, and Trips screens. Out of scope for the Mini App — its surface is three routes (list, detail, `/add`) and these are none of them.

## Session Start Protocol

At the start of EVERY session:
1. Read `.claude/rules/architecture.md`
2. Read `.claude/docs/session-notes.md` (current state and last completed phase)
3. Read `.claude/docs/plan.md` (what phase is next)
4. Run `git log --oneline -5` to confirm where the branch is
5. Run `npm run build --workspace=packages/types --workspace=packages/design` to ensure shared packages are compiled before typechecking mobile

**Self-start rule:** If the user's opening message is "next phase", "continue", "do Phase X", or equivalent — complete steps 1–5 above, then state in one sentence what phase you are building and what branch you will create, and proceed. Do not ask for a detailed prompt. The docs are the spec. If a handoff doc section is listed in the session-end block of `session-notes.md`, read it before writing any UI code.

## Session End Protocol

Before ending ANY session, append a full state block to `.claude/docs/session-notes.md`. Use this exact format:

```
---

## YYYY-MM-DD — branch: <branch> — commit: <short-hash>

**Phase completed:** <phase name and number>

**What was built this session:**
- <file or feature> — <one-line description>
- ...

**Known issues / deferred work:**
- <anything left incomplete, version mismatches noticed, TODOs punted>

**Blockers for next session:**
- <anything the next session must resolve before proceeding>

**What's next:** Phase <n> — `git checkout -b phase/<n>-<name>` off `<base branch>` — read `<handoff doc path and section>` before writing any UI

**Gotchas for next session:**
- <cross-file dependency, ordering constraint, spec gap, or non-obvious detail not captured in the plan or handoff docs>
- None if nothing to flag
```

Stub entries (timestamps only, no content) are noise — never append a session-end line without the full block above.

**Then reconcile the docs the block just made stale.** The session block is a record, not a substitute — the files agents are *told to read* must not contradict what shipped. Before ending, grep for every reference to what you changed and fix each one:

- A completed task is marked complete **in both places the task list lives** — `docs/handoffs/telegram-crossover-v4.md` (the canonical list) and `.claude/docs/plan.md` (the same list with detail). A task recorded in only one of them is effectively unfindable in the other.
- A new endpoint is added to the inventory in `docs/handoffs/weatherteam6-miniapp-handoff-v1.md`.
- A new external API is added to `.claude/docs/api-sources.md`.
- A new invariant future work must uphold goes in `.claude/rules/architecture.md`, and as a checkbox in `.claude/rules/review-checklist.md` if it can rot silently.
- **Specs written in the future tense get a status banner once built**, rather than being left to read as unbuilt work.
- Anything a doc says is missing, broken, or "does not exist yet" that now exists.

This is not tidying. A stale rule is worse than a missing one: "Two screens only — do not let them creep back in" survived three weeks past the spec that added a third screen, and any agent obeying it would have refused to build a feature that was already specified and whose API was already merged.

**After a squash merge, correct the commit hash in the block you just wrote.** The branch commit it names ceases to exist; record the squashed hash on `main` instead.

## Verification Standards

Typecheck and lint prove a change compiles. They do not prove it works, and reporting a feature done on their strength alone has produced shipped-broken code in this repo before.

- **Exercise the real path before calling something complete.** For an endpoint that calls an external API, run it and read the response. For one that touches the database, run it against the database.
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

## Known Gotchas

**Shared packages must be built before typechecks pass.**
`packages/types` and `packages/design` compile to `dist/`. If `dist/` is missing (fresh clone or after clean), consuming workspaces fail with "cannot find module". Fix:
```bash
npm run build --workspace=packages/types --workspace=packages/design
```

**Never set `NODE_ENV=production` as a Vercel environment variable.**
npm omits devDependencies when it's set, `typescript` is a devDependency, and the root postinstall (which builds `packages/types` and `packages/design`) then dies with `tsc: command not found`. Vercel manages `NODE_ENV` itself.

**Vercel framework preset must be "Other", not the auto-detected "Express".**
Vercel's Express preset expects the entry file to `export default app` or call `app.listen()`. `apps/api/api/index.ts` exports a `handler(req, res)` that forwards into the app, and `apps/api/package.json`'s `main` points at a module exporting `createApp` — a factory, not an app instance. The preset fails confusingly at runtime rather than at build.

**`apps/api/vercel.json` skips the build step deliberately.**
`buildCommand` is a no-op and `outputDirectory` points at an intentionally empty `public/`. Vercel's Node builder compiles `api/` itself and the workspace packages are built in the root postinstall, so `turbo run build` there only produced an unused `apps/api/dist`. Without the empty `public/`, deploys fail with "No Output Directory named public found".

**Neon cannot be reached from this cloud dev environment.**
The egress proxy blocks both Neon's WebSocket path (403) and its HTTP SQL API host (not allowlisted). `drizzle-kit` auto-detects `@neondatabase/serverless` and uses the WebSocket driver regardless of app code, so **migrations must be run from an unrestricted machine**, or the environment's egress allowlist widened to `*.aws.neon.tech`.

**This repo is checked out on Windows, and the working tree is CRLF.**
Multi-line `sed`/`perl` replacements silently match nothing — they fail quietly, report success, and leave the file untouched. Use the Edit tool for anything spanning more than one line; single-line `sed -i` is fine. **Python is not installed**; reach for Node or PowerShell instead. `gh` is installed but not always on `PATH` — the full path is `C:\Program Files\GitHub CLI\gh.exe`.

**Vercel will not give you a secret back.**
`DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, and the other credentials are marked sensitive in the Vercel project: the dashboard refuses to copy them and `vercel env pull` cannot recover them either. Go to the source instead — Neon's dashboard for `DATABASE_URL` (use the **pooled** string for app runtime, direct only for migrations). Do not ask the user to paste a secret into the conversation; have them set it in their own shell.

**An unauthenticated 401 from production proves `DEFAULT_USER_ID` is set.**
`resolveUser` runs before `requireApiAuth`, so a server missing `DEFAULT_USER_ID` answers 500 "Server misconfigured" even without credentials. A 401 therefore confirms the variable is present — a config check that needs no secret. Note the converse: **every** `/api/v1/*` path returns 401 unauthenticated, existing or not, so a 401 is *not* evidence that a route was deployed. Check the deployment's commit SHA for that.

**Code reviews interrupted by context limits lose their findings.**
If `/code-review` or the code-review skill runs near the end of a long session and context compresses before the output is written, the findings are lost. Save intermediate review output to `.claude/docs/review-findings.md` before the session ends if verification is still in progress.

### Archived — mobile gotchas (`apps/mobile` is out of the build)

**Expo Router version must match the Expo SDK major version.** For SDK 56 you need `expo-router@~56.0.0`. If Metro crashes with `Cannot find module 'expo-router/internal/routing'`, the router version is wrong.

**`expo-router/internal/routing` crash is a version mismatch, not a code bug.** That path only exists in expo-router v56+; earlier versions crash silently. typecheck passes — it's runtime-only.

**Cloud dev environment blocks ngrok tunnels.** `expo start --tunnel` fails here. Mobile testing had to be done locally via Expo Go.

## Initial Setup Requirements
- Create `.env.example` with all keys from the Environment Variables section above, values blank
- Never create a `.env` file with real values — use Vercel project env vars for production
- Run `npm run db:generate` before `npm run db:migrate` — never run `drizzle-kit push`
