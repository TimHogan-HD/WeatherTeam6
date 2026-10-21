/**
 * Apply the Drizzle migrations to the UI workflow's throwaway Postgres.
 *
 * `drizzle-kit migrate` opens its own Neon connection and cannot be pointed at
 * the WebSocket proxy, so this runs the same migrations from `./drizzle`
 * through the app's own driver. Refuses to run without `CHECK_UI_WS_PROXY`, so
 * it can never be aimed at Neon by mistake.
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { useLocalPostgresProxy } from './localPostgres.js'

async function main(): Promise<void> {
  if (!(await useLocalPostgresProxy())) {
    console.error('CHECK_UI_WS_PROXY is not set; this applies migrations only to a local Postgres. Use npm run db:migrate for Neon.')
    process.exit(2)
  }
  const { db, pool } = await import('../db/index.js')
  const { migrate } = await import('drizzle-orm/neon-serverless/migrator')
  try {
    await migrate(db, { migrationsFolder: resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle') })
    console.log('migrations applied')
  } finally {
    await pool.end()
  }
}

main().catch((err: unknown) => {
  console.error(`migrate failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
