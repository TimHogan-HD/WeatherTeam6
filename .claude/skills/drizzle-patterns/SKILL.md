---
name: drizzle-patterns
description: Use when writing Drizzle ORM schema, queries, migrations, or anything touching the database layer. Covers this project's schema conventions, migration workflow, database driver, and gotchas.
---

# Drizzle Patterns for WeatherTeam6

The FK-cascade rules (`DEPENDENT_TABLES`, trip deletes) are in `.claude/rules/architecture.md`
§ Database Rules.

## Schema conventions

- One file: `apps/api/src/db/schema.ts`. Do not split it, and never import `db` into it.
- `timestamptz`, not `timestamp`. `defaultRandom()` for UUIDs.
- **Drizzle never creates indexes on FK columns.** Every FK used in a `WHERE` or join gets an
  explicit `index()` in the table's extra config.

## Migrations

`npm run db:generate` then `npm run db:migrate`. Never `drizzle-kit push` (it skips migration
files), never edit files in `drizzle/` by hand, never run SQL directly against the database.
`drizzle.config.ts` uses `dialect: 'postgresql'`.

## Driver

`apps/api/src/db/index.ts` uses Neon serverless with the **WebSocket** driver
(`drizzle-orm/neon-serverless` + `ws`).

- **Do not "simplify" it to `drizzle-orm/neon-http`.** `routes/trips.ts` uses an interactive
  `db.transaction()` (insert a trip, read its generated id, insert dependent rows); the HTTP
  driver only supports pre-batched transactions.
- **Do not use `pg` / `node-postgres`** — TCP pooling does not work from Vercel functions.
- `drizzle-kit` uses the WebSocket driver too, so migrations cannot run from a restricted
  cloud sandbox — see `CLAUDE.md` § Known Gotchas.
