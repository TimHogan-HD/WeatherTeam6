# apps/api: setup notes

What matters when setting up or repairing a deployment. `CLAUDE.md` holds what every session
needs; the root `README.md` describes the project.

## Vercel

**Never set `NODE_ENV=production` as a Vercel environment variable.** npm then omits
devDependencies, and the root postinstall that builds the shared packages dies with
`tsc: command not found`.

**The framework preset must be "Other", not "Express".** `api/index.ts` exports a
`handler(req, res)`, not an app; the Express preset fails confusingly at runtime.

**`vercel.json` skips the build step deliberately.** `outputDirectory` points at an
intentionally empty `public/`; without it, deploys fail with "No Output Directory named public
found".

**Deploys are limited on purpose.** The Hobby plan allows 100 deployments a day; on 2026-09-30 a
morning of PRs spent them all (59 on unused previews) and the last fix could not ship until the
next day. Both `vercel.json` files (this one and `apps/miniapp`'s) set `git.deploymentEnabled`
to main-only and an `ignoreCommand` that skips a build when the app's directory, `packages/` and
the root manifests are unchanged since its last deployment (when that commit is beyond Vercel's
10-commit clone, `|| exit 1` turns git's error into a build). `src/deployConfig.test.ts` holds
both.

**The function runs in `cle1` (Cleveland, AWS us-east-2), next to Neon.** `regions` in
`vercel.json` overrides the project setting; Hobby allows one region. Vercel's default is `iad1`,
and each database query from there crossed regions. If Neon ever moves, move this with it. The
`x-vercel-id` response header names the region a request ran in (`<edge>::<function>::…`).

## Neon

**Neon cannot be reached from a restricted cloud dev environment.** `drizzle-kit` uses Neon's
WebSocket driver regardless of app code, so migrations must run from an unrestricted machine or
with `*.aws.neon.tech` allowlisted.

**Point-in-time restore covers only 6 hours** (free plan). Take a snapshot (Backup & Restore)
before `db:migrate` on production.

**`DELETE` does not free space.** `TRUNCATE` reclaims it; `VACUUM FULL` needs as much free space
as the table and cannot run at the 512 MB cap.

**`drizzle-kit generate` needs no database**, only a non-empty `DATABASE_URL`.

## Running against production

The API is `https://weather-team6-api.vercel.app`; `/health` is the unauthenticated probe.

**A fresh merge is not a deploy.** Check the deployment's state and commit before probing
production. Env vars apply to new deployments only.

**Hobby keeps function logs about an hour.** Read a cron's logs right after it fires.

**`API_SHARED_SECRET` on preview differs from production** (deliberately); `AUTH_TOKEN_SECRET`
is the same on all three targets.

**Credentials for unattended runs are Windows user environment variables** on the owner's
machine: `DATABASE_URL`, `CRON_SECRET`, `API_SHARED_SECRET` and `VERCEL_TOKEN`. Read one with
`[Environment]::GetEnvironmentVariable('NAME','User')`, because `$env:` can read empty while it
exists, and never echo it. `AUTH_TOKEN_SECRET` is not among them; a local run generates a
throwaway. `VERCEL_TOKEN` is team-scoped and reaches `https://api.vercel.com` with no `teamId`;
it is how env vars get set, because the Vercel MCP's `projectEnvVars` 403s.

**cron-job.org** calls `check-alerts`, `collect-runs` and `prune-runs`. `record-trips` and
`collect-radar` exist too; confirm in cron-job.org that they are registered before relying on
their rows. `collect-sensors` (the owner's thermometer, every 30 minutes) needs `GOVEE_API_KEY`
on this project and answers 503 without it.

**`prune-runs` runs hourly (at :45), not daily.** cron-job.org gives up on a call after 30 s.
Once a day, a prune deleted a whole day of runs in one call: 7.6 s on 2026-11-27, then over 30 s
on 2026-11-28, and cron-job.org reported a timeout. Run hourly, each call deletes about an hour
of runs. A call that overruns does no harm: each batch commits on its own, and the next call
finishes the rest.

**Function CPU is the limit this project hits first.** On 2026-11-14 the Hobby team was paused
after using its 4 h a month of Fluid Active CPU, about 8 min a day, all of it this function; the
logs then showed `check-alerts` every 15 minutes and `collect-runs` hourly storing ~45 runs a
call. Vercel's per-route observability API answers 404 on our plan, so every request logs a
`[cpu] request` line (`middleware/cpuLog.ts`): `cpuMs`, `wallMs`, and on an instance's first
request `cold` with `initCpuMs`, the start-up cost. Sum per `path` over the non-`overlapped`
lines to see what each cron job costs.

## GitHub Actions

**A check stuck "in progress" after its steps finished is GitHub's**; see githubstatus.com. A
cloud session's token cannot re-run or cancel a run (403).

**Dependabot runs read the Dependabot copy of `CLAUDE_CODE_OAUTH_TOKEN`** (both copies expire
about Aug 2027). `@dependabot rebase` picks up a changed workflow; a re-run does not.
