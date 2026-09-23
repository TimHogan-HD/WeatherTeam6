# WeatherTeam6

Climbing conditions platform + general weather app. Core purpose: tell the user if a crag is climbable now, over the next 7 days, and support trip planning weeks out with improving forecast confidence over time.

**The client is a standalone web app** at https://weatherteam6.vercel.app — `apps/miniapp`, Vite + React, installable through a PWA manifest, signed in with a session token. The directory name is the last of a Telegram Mini App that no longer exists.

## Stack

`package.json` and the workspace manifests are the authoritative record of what is installed. What they cannot tell you:

- **Drizzle is the ORM and the choice is final.** Never substitute Prisma.
- **There is no queue** — no BullMQ, no Redis. Scheduled work is an HTTP route under `/api/cron/*` triggered by cron-job.org; scoring is computed live per request.
- **The API is one serverless function** on Vercel — `apps/api/api/index.ts` wraps the whole Express app.
- **Two apps: `apps/api` and `apps/miniapp`.** The React Native app was deleted and is recoverable from the `archive/2026-09-23-pre-cleanup` tag; reviving it is a product decision.

## Commands

Root scripts are in `package.json`. The one you would not guess:

```bash
npm run build --workspace=packages/types --workspace=packages/design   # must run before consuming workspaces typecheck
```

From `apps/api`, against a real database (`DATABASE_URL` set **in the shell**, no `.env` file):

```bash
npm run db:seed             # seed the user + 3 locations
npm run user:add            # create or reset an account — the only way one exists
npm run check:auth          # token auth, including the cross-user denial
npm run check:add-location  # acceptance check for the add-location flow
npm run check:delete-trip   # DELETE /trips/:tripId and its FK cascade
npm run check:conditions    # GET /conditions composition — the strongest check here
npm run check:hourly        # GET /hourly/:id
npm run check:weather-runs  # run storage and pruning
```

Run `npm run db:generate` before `npm run db:migrate` — never `drizzle-kit push`.

## Structure

- **`packages/types` and `packages/design` are the only homes** for shared types and design tokens. Never duplicate a type across apps or redefine a colour, spacing value or type scale in one.
- **`apps/miniapp` reaches `type`/`shadow`/`layout` tokens through `src/theme/tokens.css.ts`**, never from `packages/design` directly. See `apps/miniapp/README.md`.

## Environment Variables

`.env.example` is the authoritative list. What it cannot tell you:

- **`VITE_API_BASE_URL` is inlined into a public client bundle at build time.** Set it in the web app's own Vercel project. Never put a credential in any `VITE_*` variable.
- **`API_SHARED_SECRET` and `AUTH_TOKEN_SECRET` are both fail-closed** — either unset means 503 on all of `/api/v1/*`. `CRON_SECRET` is a credential too.
- **`TOMORROW_IO_API_KEY` and `RAINVIEWER_KEY` are deliberately absent.** Tomorrow.io was replaced by ACIS; RainViewer's key is unused.
- `conditions_reports.photo_urls` has no upload path behind it; a photo feature would add its own storage variables.

Do not create a `.env` file at all — set variables in the shell for the one command that needs them.

## Rules

- TypeScript strict mode everywhere. No `any`.
- All API responses use the shape `{ data, error, status }`.
- All external API calls are wrapped in try/catch with exponential backoff retry.
- Never log secrets, tokens, or full API responses in production. Never serialise an error object wholesale into a log — driver errors can carry the connection string; go through `describeError` in `lib/http.ts`.
- Auth is a signed token, and `requireApiAuth` is the only setter of `req.userId` — see `.claude/rules/architecture.md` § Auth Pattern. There is no self-serve signup.
- Drizzle migrations only — never mutate the DB directly.
- **Finish the delivery.** Work reaches `main` through a branch, a PR, green CI and a squash merge, all done by you. A PreToolUse hook blocks `git commit` on the default branch, and a Stop hook refuses to end the turn with uncommitted changes, unpushed commits, a pushed branch with no PR, or a green mergeable PR left open. If the user asks you to pause mid-change, `touch .claude/.wip` and delete it when work resumes.
- **A check nothing runs is not a check.** CI runs every root-level `check:*` script, enumerated from `package.json`. `npm run check:hooks` fails if `.claude/settings.json` registers a hook no scenario exercises. `main` is protected for admins too; fix the red check rather than routing around it.

## Reference Docs

`.claude/rules/` loads automatically. Read these when the work needs them:

| Work | Read first |
| --- | --- |
| Database | `.claude/docs/data-model.md` |
| Weather fetches | `.claude/docs/api-sources.md` |
| Scoring code | `.claude/docs/scoring-algorithm.md`, then `.claude/docs/scoring-findings.md` (the research reduced to what touches the app — read it instead of the research docs) |
| Anything that produces or renders a reading, or changes how the score components combine | `docs/handoffs/weatherteam6-scoring-model-handoff-v1.md`, and run `npm run compare:scoring --workspace=apps/api` before proposing a weight, veto or cap |
| Drying model or rock types | `.claude/docs/rock-drying-research.md` — §10 first (most figures it checked were misattributed); per-crag facts in `.claude/docs/crag-facts.json` |
| Wall angle, aspect, temperature/humidity scoring, `walls` | `.claude/docs/climbing-terminology-research.md` — `cliff_angle` runs backwards from climbers' usage and `aspectDegrees` scores nothing |
| Any UI phase | `docs/handoffs/miniapp-design-v1.md` (binding screen spec) and `docs/handoffs/design-system-v1.md`. Open the mockup itself (`docs/handoffs/design-mockups/weatherteam6UI.html`), not a prose summary of it — one phase was built twice from the description. Where it disagrees with the spec, the spec wins |
| Dataviz Phase 5 | `docs/handoffs/miniapp-hourly-dataviz-handoff-v1.md` — parked; its phase numbers are its own. A CSS or motion architecture is not authorised |

Paywalled or unfetchable source material goes in `.claude/research-inbox/` (gitignored except its README). Commit the claim, quote and citation — never the article.

## Session Start and End

The `SessionStart` hook injects branch, working tree, open PRs and issues, CI on `main`, and `.claude/docs/STATE.md`. Use it instead of re-running `git log` or `gh issue list`. If that block is missing, read `STATE.md` and run `git log --oneline -5` yourself. Then run the shared-package build above. Read issue state from `gh issue list`, never from a table in a document. Grep `.claude/docs/session-archive.md` only for the reasoning behind one past decision.

If the user says "next phase", "continue" or "do Phase X", say in one sentence which phase and branch, and proceed from the docs.

To end a session, invoke `/session-end`.

## Verification

Run `/review-checklist` before opening a PR.

- Exercise the real path before calling something complete: an endpoint that calls an external API is run and its response read; one that touches the database is run against the database.
- `npm run test` cannot cover database behaviour — Vitest mocks `fetch` and never connects. A flow that can only fail against real Postgres gets a `check:*` script under `apps/api/src/scripts/`; `check:add-location` is the worked example.
- Run the API locally against the real database when you need to (no `.env`):
  ```powershell
  cd apps/api
  $env:DATABASE_URL = "<Neon pooled connection string>"   # keep the quotes: the string contains &
  npm run check:add-location
  ```
  `DEFAULT_USER_ID` is optional; the seeded user is `00000000-0000-0000-0000-000000000001`.
- To drive the UI, use the local dev server: preview deploys are behind Vercel SSO. Run `vite` on `:5173` (already in the CORS allowlist) against a local `createApp()` on the real `DATABASE_URL`. Generate a throwaway `AUTH_TOKEN_SECRET` for the run, create throwaway rows under a prefix and sweep by that prefix in teardown, and import app modules from a scratch harness by `file:///C:/…` URL.
- `npm run test:mutation --workspace=apps/api` takes ~37 minutes and runs weekly in CI; the owner will stop a local run. Run it on demand only when a survivor would change a decision.
- State plainly what was and was not verified.

## Reporting Work

Lead with what happened and what it means; say what failed, was skipped, or is unverified without being asked; use plain sentences over schema or driver terms.

Every recap, summary, PR body and message that ends a stretch of work ends with this block:

```
## Do you need to do anything?

**Yes / No.** <If yes: the specific actions only they can do —
a credential, a dashboard setting, a phone, a product decision.>

## Next step

<The single next action, and who does it. If it is blocked, say what on.>
```

"Yes" is only for things the user alone can do; unstarted work goes under Next step. Name one next step, not a backlog.

## Known Gotchas

**`vite` is pinned at the repo root so the web app's plugins resolve the right copy.** `apps/api`'s vitest pulls in an older vite that npm hoists, and `@vitejs/plugin-react` then resolves it instead of `apps/miniapp`'s — the build dies with `Package subpath './internal' is not defined`. Do not remove the root `vite` devDependency.

**Never set `NODE_ENV=production` as a Vercel environment variable.** npm then omits devDependencies, and the root postinstall that builds the shared packages dies with `tsc: command not found`.

**Vercel framework preset must be "Other", not "Express".** `apps/api/api/index.ts` exports a `handler(req, res)`, not an app; the Express preset fails confusingly at runtime.

**`apps/api/vercel.json` skips the build step deliberately.** `outputDirectory` points at an intentionally empty `public/`; without it, deploys fail with "No Output Directory named public found".

**Neon cannot be reached from a restricted cloud dev environment.** `drizzle-kit` uses Neon's WebSocket driver regardless of app code, so migrations must run from an unrestricted machine or with `*.aws.neon.tech` allowlisted.

**The working tree is CRLF on Windows.** Multi-line `sed`/`perl`/`node -e` replacements silently match nothing and report success — use the Edit or Write tool for anything spanning more than one line. **Python is not installed** (`python3` is the Windows Store stub and exits 0); use Node or PowerShell. `gh` may not be on `PATH`: `C:\Program Files\GitHub CLI\gh.exe`.

**Vercel will not give you a secret back.** Go to the source — Neon's dashboard for `DATABASE_URL` (pooled for runtime, direct for migrations). Never ask the user to paste a secret into the conversation.

**An unauthenticated 401 proves only that the gate is shut.** Every `/api/v1/*` path 401s whether or not it exists — check the deployment's commit SHA. A missing `DEFAULT_USER_ID` shows only as a 500 on an authenticated `Bearer` call; a 503 on every scheme means a secret is unset. `/api/v1/health` requires auth; the unauthenticated probe is `/health`.
