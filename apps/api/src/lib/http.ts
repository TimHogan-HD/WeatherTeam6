import type { Response } from 'express'
import { logger } from './logger.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Route params feed uuid columns; an unvalidated value makes Postgres throw
// (22P02), turning a bad id into a 500 instead of a 404.
export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

// Log the real error server-side; never echo driver/internal messages to clients.
export function sendServerError(res: Response, err: unknown, route: string): void {
  logger.error(
    { route, err: err instanceof Error ? err.message : String(err) },
    'route handler failed',
  )
  res.status(500).json({ data: null, error: 'Internal server error', status: 500 })
}
