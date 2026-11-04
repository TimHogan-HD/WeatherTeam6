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
