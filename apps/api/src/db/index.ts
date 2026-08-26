import { neonConfig, Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import { logger } from '../lib/logger.js'
import * as schema from './schema.js'

const url = process.env['DATABASE_URL']
if (!url) {
  throw new Error('DATABASE_URL environment variable is required')
}

// Node.js runtime (local dev + Vercel's Node serverless functions) has no native
// WebSocket global — Neon's serverless driver needs one to open its session-based
// connection. Not needed on Edge runtimes, but we target Node here.
neonConfig.webSocketConstructor = ws

export const pool = new Pool({ connectionString: url })

/**
 * Issue #27 part 4, the half that is not a guess.
 *
 * `pg`'s `Pool` is an `EventEmitter`, and an `'error'` event with **no listener
 * attached crashes the process** — that is Node's rule for `'error'`, not a
 * library choice. The event fires for faults on an *idle* client, which on a
 * thawed serverless instance is exactly the connection Neon has since dropped.
 * So the failure mode is: the function idles, Neon closes the socket, and the
 * next invocation dies before it can serve anything.
 *
 * Logging and swallowing is right here. The pool discards the broken client on
 * its own and the next checkout opens a fresh one; there is nothing to recover.
 *
 * **The rest of #27 part 4 is deliberately not done.** `max` and idle timeouts
 * were flagged as "worth a look rather than an assumed fix", and no dead-client
 * 500 has appeared in the Vercel logs — tuning pool sizes against a failure
 * nobody has observed would be guessing.
 */
pool.on('error', (err: Error) => {
  // `describeError` is not used: this is not a request-scoped error and there is
  // no response to send. `err.message` alone, never the error object — a driver
  // error can carry the connection string.
  logger.error({ err: err.message }, '[db] idle client error — the pool will discard it')
})

export const db = drizzle(pool, { schema })
