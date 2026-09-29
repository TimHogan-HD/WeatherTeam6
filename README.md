# WeatherTeam6

Weather app with high climbing specificity. Tells you whether a crag is climbable now, over the next 7 days, and supports trip planning weeks out with forecast confidence that firms up as the date approaches.

## What it is

An installable **web app** at https://weatherteam6.vercel.app, backed by a Node/TypeScript API running as a single serverless function. You sign in with a passphrase; there is no signup flow, and accounts are created by an operator (`npm run user:add`).

The number on every screen is **Crag A** (`apps/api/src/lib/scoring/cragModel.ts`): `100 × dryness^0.55 × friction`, where dryness is a drying clock run on eight vertical walls and friction comes from condensation, heat, humidity and cold. A day's score is the worst hour of its best 3-hour run between 08:00 and 18:00 local. Every constant in it is a judgement call, and nothing is validated against outcomes. The v2 model underneath still supplies rock temperature and the drying rate, but its own score no longer reaches a response; the older five-component scorer still runs and renders nowhere. The whole model, and what still runs beside it, is in `.claude/docs/scoring-algorithm.md`.

**There is no notification channel.** NWS Severe+ warnings are collected, stored, and visible in the app, and reach nobody. That is a parked decision, not an oversight.

## Stack

| Layer | Choice |
|-------|--------|
| API | Node.js + TypeScript + Express, wrapped as one Vercel serverless function (`apps/api/api/index.ts`) |
| Database | PostgreSQL on Neon (`@neondatabase/serverless`, WebSocket driver) |
| ORM | Drizzle — schema-as-TypeScript, migrations only, never `push` |
| Client | `apps/miniapp` — Vite + React, static build, PWA manifest, no service worker |
| Auth | Passphrase → HMAC-signed token, 30-day TTL. Not a JWT, deliberately |
| Background work | **No queue.** Live per-request compute, plus HTTP cron endpoints on an external schedule |
| Monorepo | Turborepo |

## Layout

```
apps/
  api/        Express API + Vercel serverless entry
  miniapp/    The web app (the directory name is the last of a Telegram Mini App)
packages/
  types/      Shared TypeScript types — never duplicated across apps
  design/     Design tokens (colour, spacing, type, shadow, layout) — never redefined in an app
```

The archived React Native app (`apps/mobile`) and the Telegram bot were both deleted. Recover either from the `archive/2026-09-23-pre-cleanup` tag.

## Commands

```bash
npm run dev         # start all services
npm run build       # build all packages
npm run test        # run all tests
npm run typecheck   # tsc --noEmit across workspaces
npm run lint        # ESLint flat config
npm run db:generate # generate a Drizzle migration from schema changes
npm run db:migrate  # apply pending migrations (never drizzle-kit push)
npm run check:hooks        # every registered Claude hook has a scenario
npm run check:crag-facts   # every crag fact carries a source and confidence
npm run check:icons        # the PWA icons still match the design tokens
# CI runs every root-level check:* script, enumerated from package.json
```

Shared packages must be built before anything else typechecks:

```bash
npm run build --workspace=packages/types --workspace=packages/design
```

> **Migrations cannot be run from a restricted network.** `drizzle-kit` uses Neon's
> WebSocket driver, which some sandboxed environments block. Run `db:migrate` from an
> unrestricted machine with the Neon **direct** connection string.

## Where to start

| You want to… | Read |
|---|---|
| See where things stand | `.claude/docs/STATE.md` |
| Understand the rules | `.claude/rules/architecture.md` |
| Know what the defects here look like | `.claude/rules/defect-patterns.md` |
| Touch the database | `.claude/docs/data-model.md` |
| Touch scoring | `.claude/docs/scoring-algorithm.md`, then `.claude/docs/scoring-findings.md` |
| Add a weather source | `.claude/docs/api-sources.md` |
| Work in the web app | `apps/miniapp/README.md` |
| Change a screen | `docs/handoffs/miniapp-design-v1.md`, `docs/handoffs/design-system-v1.md`, and the mockup itself |
| Review before opening a PR | `/review-checklist` |

Trust the code over the prose when they disagree. Long reference docs can carry stale passages even when the document as a whole is maintained.

## Configuration

`.env.example` is the authoritative variable list. Never commit `.env` — do not create one at all; set variables in the shell for the one command that needs them. Production values live in the Vercel project settings.
