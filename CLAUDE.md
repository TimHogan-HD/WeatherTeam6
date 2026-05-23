# WeatherTeam6

Climbing conditions platform + general weather app. Core purpose: tell the user if a crag is climbable now, over the next 7 days, and support trip planning weeks out with improving forecast confidence over time.

## Stack
- **Mobile:** React Native + Expo (New Architecture, SDK 55+)
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
npm run typecheck     # typecheck all packages
npm run lint          # lint all packages
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
ADMIN_PASSWORD=                                     # gates Bull Board at /admin/queues
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
API_BASE_URL=                                       # mobile reads via EXPO_PUBLIC_API_BASE_URL
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

## Reference Docs (read when relevant)
- **Data model + schema:** `.claude/docs/data-model.md` — read before any DB work
- **API sources + quirks:** `.claude/docs/api-sources.md` — read before any weather fetch work
- **Scoring algorithm:** `.claude/docs/scoring-algorithm.md` — read before any conditions score work
- **Architecture rules:** `.claude/rules/architecture.md` — read at the start of every session
- **Review checklist:** `.claude/rules/review-checklist.md` — run before every commit

## Initial Setup Requirements
- Create `.env.example` with all keys from the Environment Variables section above, values blank
- Never create a `.env` file with real values — use Railway env vars for production
- Run `npm run db:generate` before `npm run db:migrate` — never run `drizzle-kit push`
