# WeatherTeam6

Weather app with high climbing specificity. Tells you whether a crag is climbable now, over the next 7 days, and supports trip planning weeks out with forecast confidence that firms up as the date approaches.

## What it is

A **Telegram bot** (push alerts, quick lookups) plus a **Telegram Mini App** (the full UI), backed by a Node/TypeScript API running as a single serverless function.

Conditions are scored from five weighted components — drying time, upcoming rain, wind, temperature, humidity — using rock type, cliff angle, aspect, and recent local rainfall. See `.claude/docs/scoring-algorithm.md`.

## Stack

| Layer | Choice |
|-------|--------|
| API | Node.js + TypeScript + Express, wrapped as one Vercel serverless function (`apps/api/api/index.ts`) |
| Database | PostgreSQL on Neon (`@neondatabase/serverless`, WebSocket driver) |
| ORM | Drizzle — schema-as-TypeScript, migrations only, never `push` |
| Client | Telegram bot + Telegram Mini App (`apps/miniapp` — not yet built) |
| Background work | **No queue.** Live per-request compute, plus one HTTP cron endpoint on an external schedule |
| Monorepo | Turborepo |

`apps/mobile` (React Native + Expo) is **archived** as of 2026-07-31 — superseded by the Mini App. Do not add features to it. Note it is still wired into the workspace and Turborepo pipeline; removing it from the build is Crossover Task 7, not yet done. (The long-standing `apps/mobile` ESLint failure that made CI red on every branch was fixed separately in `3117020` — a red CI now means something.)

## Layout

```
apps/
  api/        Express API + Vercel serverless entry
  mobile/     ARCHIVED — React Native, out of the build
  miniapp/    Telegram Mini App (planned)
packages/
  types/      Shared TypeScript types — never duplicated across apps
  design/     Design tokens (colors, spacing, type scale)
```

## Commands

```bash
npm run dev         # start all services
npm run build       # build all packages
npm run test        # run all tests
npm run typecheck   # tsc --noEmit across workspaces
npm run lint        # ESLint flat config
npm run db:generate # generate a Drizzle migration from schema changes
npm run db:migrate  # apply pending migrations
```

> **Migrations cannot be run from a restricted network.** `drizzle-kit` uses Neon's
> WebSocket driver, which some sandboxed environments block. Run `db:migrate` from an
> unrestricted machine with the Neon **direct** connection string.

## Where to start

| You want to… | Read |
|---|---|
| Understand current direction | `docs/handoffs/telegram-crossover-v4.md` |
| Know what to build next | `.claude/docs/plan.md` |
| Understand the rules | `.claude/rules/architecture.md` |
| Touch the database | `.claude/docs/data-model.md` |
| Touch scoring | `.claude/docs/scoring-algorithm.md` |
| Add a weather source | `.claude/docs/api-sources.md` |
| Review before committing | `.claude/rules/review-checklist.md` |
| See where things stand | `.claude/docs/session-notes.md` |

Documents describing the archived React Native app carry an ⚠️ banner at the top. Absence of a banner means the document is *maintained*, not that every line is current — long reference docs can still carry stale passages, so trust the code over the prose when they disagree.

## Configuration

`.env.example` is the authoritative variable list. Never commit `.env`; production values live in the Vercel project settings.
