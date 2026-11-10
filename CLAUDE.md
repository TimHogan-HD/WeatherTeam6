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
npm run user:add            # create or reset an account (friends normally join by the owner's invite link)
npm run check:conditions    # GET /conditions composition — the strongest check here
npm run check:ui            # the web app in Chromium at 480x1000: every screen, screenshotted
npm run feedback -- list    # open feedback from every account
npm run feedback -- resolve <id>...   # mark items acted on
```

The other `check:*` scripts in `apps/api/package.json` run against the real database; the script under `src/scripts/` says what each covers.

**When a merged change answers a feedback item, resolve it** — open feedback is the to-do list the owner reads in the app.

Run `npm run db:generate` before `npm run db:migrate` — never `drizzle-kit push`.

## Structure

- **`packages/types` and `packages/design` are the only homes** for shared types and design tokens. Never duplicate a type across apps or redefine a colour, spacing value or type scale in one.
- **`apps/miniapp` reaches `type`/`shadow`/`layout` tokens through `src/theme/tokens.css.ts`**, never from `packages/design` directly. See `apps/miniapp/README.md`.

## Environment Variables

`.env.example` is the authoritative list. What it cannot tell you:

- **`VITE_API_BASE_URL` is for development only.** A production build calls its own `/api/...`, which `apps/miniapp/vercel.json` forwards to the API — no CORS preflights. It is inlined into a public bundle, so never put a credential in any `VITE_*` variable.
- **`API_SHARED_SECRET` and `AUTH_TOKEN_SECRET` are both fail-closed** — either unset means 503 on all of `/api/v1/*`. `CRON_SECRET` is a credential too.

Do not create a `.env` file at all — set variables in the shell for the one command that needs them.

## Rules

- **Design is a conversation, not a rulebook** (owner, 2026-10-01). Every visual and interaction choice in the docs — palette, layout, spacing, type, motion, press feedback, the Figma direction — is the current state, not a decision to defend. When you see a better option, say so and show it as variants; when a design skill disagrees with what is built, put the disagreement to the owner rather than silently applying or dropping it. Not taste, and still in force: the copy rules that keep a reading honest, and the contrast floors.

- TypeScript strict mode everywhere. No `any`.
- All API responses use the shape `{ data, error, status }`.
- All external API calls are wrapped in try/catch with exponential backoff retry.
- Never log secrets, tokens, or full API responses in production. Never serialise an error object wholesale into a log — driver errors can carry the connection string; go through `describeError` in `lib/http.ts`.
- Auth is a signed token, and `requireApiAuth` is the only setter of `req.userId` — see `.claude/rules/architecture.md` § Auth Pattern, and `auth.md` for the detail. There is no self-serve signup: an account comes from `user:add` or an invite link only the owner can mint.
- Drizzle migrations only — never mutate the DB directly.
- **Finish the delivery** (owner, 2026-11-04). Work reaches `main` through a branch, a PR, green `ci` and `review`, and a squash merge. GitHub is the gate; you open the PR and hand it to GitHub. The same steps run locally and in a cloud session:
  1. Push and open the PR. A cloud session opens it as a draft; drafts are reviewed too.
  2. When the work is finished, mark it ready (`gh pr ready <n>`, or in the cloud the GitHub MCP `update_pull_request` with `draft: false`) and arm auto-merge (`gh pr merge <n> --auto --squash --delete-branch`, or in the cloud the GitHub MCP `enable_pr_auto_merge`, method SQUASH). A PR already green and mergeable cannot be armed, and an armed one can sit green without merging (#513, #520); merge either directly (`merge_pull_request`, squash). In the cloud every `gh pr` subcommand fails with 403 (GraphQL), so use the MCP tools or `gh api` REST there.
  3. End the turn. GitHub merges when both checks pass. A red check or a conflict wakes a cloud session through its PR subscription; locally, run `npm run wait:pr` in the background before ending the turn so its exit wakes you. Either way a red check is yours to fix.
  Only the PR for your own branch is yours: others belong to other sessions, and you act on one only when the user asks. If the user asks you to pause mid-change, `touch .claude/.wip` and delete it when work resumes; it expires after 12 hours.
- **A check nothing runs is not a check.** CI runs every root-level `check:*` script and the `apps/api` checks that need only Postgres; a new such check goes on that list in `ci.yml`. `npm run check:hooks` fails if `.claude/settings.json` registers a hook no scenario exercises. `main` requires both `ci` and `review`, set only by GitHub Actions and enforced for admins too, so fix the red check rather than routing around it. `review` fails on the reviewer's blocking findings; clear one by fixing it, or by replying on its inline comment with why it is not a defect and re-running the job. Advisory findings do not block: fix the ones that are right in the same PR, or reply why not. A PR that edits `claude-review.yml` passes `review` unreviewed, so keep such a PR to the workflow alone.

## Reference Docs

`.claude/rules/architecture.md` and `defect-patterns.md` load in every session. The other rule files (scoring, readings, locations, weather, trips, auth) load only when a file under their `paths:` is read or edited; `architecture.md` indexes them, and a plan or review reads the ones its paths touch. Read these when the work needs them:

| Work | Read first |
| --- | --- |
| Database | `apps/api/src/db/schema.ts` (the source of truth), then `.claude/docs/data-model.md` (the map, and what the schema cannot show) |
| Weather fetches | `.claude/docs/api-sources.md` |
| Scoring code | `.claude/docs/scoring-algorithm.md`, then `.claude/docs/scoring-findings.md` (the research reduced to what touches the app — read it instead of the research docs) |
| Changing how the score's factors combine | `.claude/docs/scoring-algorithm.md`. Before proposing a weight, veto or cap, measure it: `compare:dryness` and `compare:rock-temp` (`apps/api`) are the harnesses that test against outcomes. `docs/handoffs/weatherteam6-scoring-model-handoff-v1.md` is the record of why the physics has its shape, not direction |
| Drying model or rock types | `.claude/docs/rock-drying-research.md` — §10 first (most figures it checked were misattributed); per-crag facts in `.claude/docs/crag-facts.json` |
| Wall angle, aspect, temperature/humidity scoring, `walls` | `.claude/docs/climbing-terminology-research.md` — `cliff_angle` runs backwards from climbers' usage and `aspectDegrees` scores nothing |
| Sun and shade walls on the Overview, Wall A per wall (#445) | `docs/handoffs/wall-a-sun-shade-v1.md`, then the mockups it lists, opened in a browser |
| Any UI work | `docs/handoffs/miniapp-design-v1.md` (the current screen spec — open, see Rules), `design-system-v1.md`, and `miniapp-hybrid-transition-v1.md` (built; wins for the items it lists). Open the mockup itself (`docs/handoffs/design-mockups/weatherteam6-hybrid.html`), not a prose summary of it — one phase was built twice from the description |
| CSS, hover, transitions or animation | `docs/handoffs/design-system-v1.md` § CSS and motion — allowed since 2026-10-01, on tokens, with `prefers-reduced-motion` |
| Placement, motion numbers, platform features, design tools | `.claude/docs/ui-craft.md` |
| Setting up or repairing a Vercel project, or migrating from a restricted environment | `apps/api/README.md` |

Paywalled or unfetchable source material goes in `.claude/research-inbox/` (gitignored except its README). Commit the claim, quote and citation — never the article.

## Session Start and End

The `SessionStart` hook injects branch, working tree, open PRs and issues, CI on `main`, and `.claude/docs/STATE.md`. Use it instead of re-running `git log` or `gh issue list`. If that block is missing, read `STATE.md` and run `git log --oneline -5` yourself. Then run the shared-package build above. Read issue state from GitHub (`gh issue list`, or MCP `list_issues` in the cloud), never from a table in a document. Grep `.claude/docs/session-archive.md` only for the reasoning behind one past decision.

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
- `npm run check:ui` (from `apps/api`) is the UI harness: every screen in Chromium at the owner's 480×1000, failing on page errors, console errors, API responses ≥ 400 and sideways scroll. It does not judge how a screen looks, so open the screenshots it prints. For interaction it does not cover, extend the script; its header covers the flags and the replay tape.
- **`ui.yml` runs `check:ui` every night, not on PRs** (owner, 2026-10-26), and a failure opens an issue. Run it locally only to reproduce a nightly failure: foreground (timeout 600000, a full run takes ~10 minutes), the narrowest flag, and one measurement run then one confirming run, because Open-Meteo rate-limits repeats. A failure is yours until shown otherwise, and is fixed in the PR that finds it. `-- --sweep` removes test users left by stopped runs; do it without asking.
- `npm run test:mutation --workspace=apps/api` takes ~64 minutes on CI (2026-10-21) and runs weekly there; the owner will stop a local run. Run it on demand only when a survivor would change a decision.
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

"Yes" is only for things the user alone can do; unstarted work goes under Next step. Name one next step, not a backlog. The block goes in once per stretch of work: when a Stop hook re-fires on a state you have already reported, answer in one line and do not repeat it.

## Known Gotchas

**Keep the root `vite` devDependency.** It stops a second, older vite being hoisted, which `@vitejs/plugin-react` would resolve (`Package subpath './internal' is not defined`). Since vitest 5 (#515) the lockfile holds one vite; keep it that way.

**Vercel deploys from `main` only, and only the project a change touched.** There are no PR previews, so drive the UI locally (§ Verification). A merge that hit the deployment limit ships with the next one, or by "Redeploy" in the dashboard.

**The working tree is mostly CRLF on Windows, not all of it.** About 30 files are LF, `OverviewTab.tsx` among them; `git ls-files --eol <path>` says which. Multi-line `sed`/`perl`/`node -e` replacements silently match nothing and report success. A script that assumes one ending breaks on the other, so use the Edit or Write tool for anything spanning more than one line.

**Never run Prettier.** The repo is not Prettier-formatted and has no config. One run on two files rewrote 965 lines and buried a ten-line change. If it happens, `git checkout -- <file>` and redo the edit by hand.

**From PowerShell, commit with `git commit -F <file>`.** `git commit -F -` fed by a here-string is read as a pathspec, so the commit fails and a following `git push` publishes an empty branch. Write the message to the scratchpad first; the same goes for `gh pr create --body-file`.

**A worktree-isolated session refuses compound shell commands that run git or `cd` elsewhere** ("too complex to verify that it stays inside the worktree"). Run plain, separate commands from the worktree root.

**An auto-mode permission denial is the harness, not the owner.** Say so once, with the exact command or permission rule that unblocks it, and do not ask again; "do what's best" is an answer.

**Python is not installed** (`python3` is the Windows Store stub and exits 0); use Node or PowerShell. `gh` may not be on `PATH`: `C:\Program Files\GitHub CLI\gh.exe`.

**Vercel will not give you a secret back.** Go to the source — Neon's dashboard for `DATABASE_URL` (pooled for runtime, direct for migrations). Never ask the user to paste a secret into the conversation.

**An unauthenticated 401 proves only that the gate is shut.** Every `/api/v1/*` path 401s whether or not it exists — check the deployment's commit SHA. A missing `DEFAULT_USER_ID` shows only as a 500 on an authenticated `Bearer` call; a 503 on every scheme means a secret is unset. `/api/v1/health` requires auth; the unauthenticated probe is `/health`.
