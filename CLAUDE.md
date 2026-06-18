# WeatherTeam6

Climbing conditions platform + general weather app. Core purpose: tell the user if a crag is climbable now, over the next 7 days, and support trip planning weeks out with improving forecast confidence over time.

## Stack
- **Mobile:** React Native + Expo (New Architecture, SDK 56 — `expo@~56.0.3`, `expo-router@~56.0.0`)
- **Backend:** Node.js + TypeScript + Express on Railway
- **ORM:** Drizzle (schema-as-TypeScript, SQL-close queries — never substitute Prisma)
- **DB:** PostgreSQL on Railway
- **Queue/Cache:** Redis + BullMQ on Railway
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

## Structure
```
apps/
  api/              # Node.js + TypeScript + Express backend
  mobile/           # React Native + Expo
packages/
  types/            # Shared TypeScript types (never duplicate across apps)
```

## Environment Variables

`.env.example` is the authoritative list — keep this section in sync with it.

```
DATABASE_URL=
REDIS_URL=
DEFAULT_USER_ID=                                    # seeded user UUID, set after first migration
AUTH_ENABLED=false
ADMIN_PASSWORD=                                     # gates Bull Board at /admin/queues; unset => /admin/queues returns 503 (fails closed)
NODE_ENV=development
PORT=3001
NWS_USER_AGENT=weatherteam6/1.0 your@email.com
TOMORROW_IO_API_KEY=
RAINVIEWER_KEY=
SHADEMAP_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
API_BASE_URL=                                       # server-side base URL (Railway)
LOG_LEVEL=                                          # pino log level; defaults to info (prod) / debug (dev)
EXPO_PUBLIC_API_BASE_URL=                           # read by mobile at bundle time (apps/mobile/src/lib/api.ts)
```

## Non-Negotiable Rules
- TypeScript strict mode everywhere. No `any`.
- All API responses use shape: `{ data, error, status }`
- All external API calls wrapped in try/catch with exponential backoff retry
- Never log secrets, tokens, or full API responses in production
- Never commit `.env` — use `.env.example` with blank values
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
- Before ANY mobile UI phase: read the relevant design handoff doc(s) below — the mockups are the spec, not prose descriptions

Full paths:
- **Data model + schema:** `.claude/docs/data-model.md`
- **API sources + quirks:** `.claude/docs/api-sources.md`
- **Scoring algorithm:** `.claude/docs/scoring-algorithm.md`
- **Architecture rules:** `.claude/rules/architecture.md`
- **Review checklist:** `.claude/rules/review-checklist.md` — run before every commit
- **Build plan:** `.claude/docs/plan.md`

**UI Design Handoffs (read before the relevant phase — these are the spec):**
- `docs/handoffs/weatherteam6-ui-handoff-v1.md` — Home screen + Location Detail (phases 7b/7c)
- `docs/handoffs/design-mockups/README.md` — Radar, Walls, and Trips screen specs (phases 9b/9c, 12, Walls)
- `docs/handoffs/design-mockups/weatherteam6UI.html` — primary mockup for Home + Location Detail
- `docs/handoffs/design-mockups/radar-shared.jsx` / `radar-variations.jsx` / `radar.css` — Radar screen (phase 12)
- `docs/handoffs/design-mockups/walls-flow.jsx` / `walls-viz.jsx` / `walls.css` — Walls screen + setup flow
- `docs/handoffs/design-mockups/trips-flow.jsx` / `trips.css` — Trip creation flow (phases 9b/9c)

## Session Start Protocol

At the start of EVERY session:
1. Read `.claude/rules/architecture.md`
2. Read `.claude/docs/session-notes.md` (current state and last completed phase)
3. Read `.claude/docs/plan.md` (what phase is next)
4. Run `git log --oneline -5` to confirm where the branch is
5. Run `npm run build --workspace=packages/types --workspace=packages/design` to ensure shared packages are compiled before typechecking mobile

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

**What's next:** <phase name> — <one sentence on where to start>
```

Stub entries (timestamps only, no content) are noise — never append a session-end line without the full block above.

## Known Gotchas

**Shared packages must be built before mobile typechecks pass.**
`packages/types` and `packages/design` compile to `dist/`. If `dist/` is missing (fresh clone or after clean), mobile TS will fail with "cannot find module". Fix:
```bash
npm run build --workspace=packages/types --workspace=packages/design
```

**Expo Router version must match the Expo SDK major version.**
Expo adopted SDK-matching versioning starting at SDK 52. For SDK 56 you need `expo-router@~56.0.0`. If Metro crashes with `Cannot find module 'expo-router/internal/routing'`, the router version is wrong — check `apps/mobile/package.json` and run `npm install`.

**`expo-router/internal/routing` crash is a version mismatch, not a code bug.**
The `@expo/cli` bundled inside `expo` (the `@expo/router-server` sub-package) requires `expo-router/internal/routing`. This path only exists in expo-router v56+. Earlier versions (4.x, 6.x) crash silently. typecheck passes fine — it's a runtime-only failure.

**Code reviews interrupted by context limits lose their findings.**
If `/code-review` or the code-review skill runs near the end of a long session and context compresses before the output is written, the findings are lost. Save intermediate review output to `.claude/docs/review-findings.md` before the session ends if verification is still in progress.

**Cloud dev environment blocks ngrok tunnels.**
`expo start --tunnel` will fail in this environment — ngrok connections are blocked by the network policy. Mobile testing must be done locally. To test on device: clone the repo on a local machine, run `cd apps/mobile && npx expo start`, scan the QR with Expo Go.

## Initial Setup Requirements
- Create `.env.example` with all keys from the Environment Variables section above, values blank
- Never create a `.env` file with real values — use Railway env vars for production
- Run `npm run db:generate` before `npm run db:migrate` — never run `drizzle-kit push`
