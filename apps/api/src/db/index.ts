import { neonConfig, Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
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
export const db = drizzle(pool, { schema })
