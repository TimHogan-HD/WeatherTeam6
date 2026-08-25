import type { Response } from 'express'
import { logger } from './logger.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Route params feed uuid columns; an unvalidated value makes Postgres throw
// (22P02), turning a bad id into a 500 instead of a 404.
export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

/**
 * Turn an unknown throwable into a single readable log line.
 *
 * `String(err)` is not enough: database drivers routinely reject with plain
 * objects rather than `Error` instances, and those stringify to the useless
 * `[object Object]` — which is exactly what a wrong connection string produced.
 *
 * Only known-safe fields are read, and the object is never serialised wholesale.
 * Driver errors can carry the client config, connection string included, so
 * `JSON.stringify(err)` would put credentials in the log — the one thing the
 * logging rules forbid outright.
 */
export function describeError(err: unknown, depth = 0): string {
  if (typeof err === 'string') return err
  if (err === null || err === undefined) return String(err)

  // Cause chains can be cyclic (err.cause === err), and a deep one adds noise
  // long before it adds information.
  if (depth > 3) return '…'

  if (typeof err === 'object') {
    const parts: string[] = []
    const source = err as {
      name?: unknown
      message?: unknown
      code?: unknown
      errno?: unknown
      syscall?: unknown
      errors?: unknown
      cause?: unknown
    }

    if (typeof source.message === 'string' && source.message !== '') {
      parts.push(source.message)
    } else if (typeof source.name === 'string' && source.name !== '') {
      parts.push(source.name)
    }

    for (const key of ['code', 'errno', 'syscall'] as const) {
      const value = source[key]
      if (typeof value === 'string' || typeof value === 'number') {
        parts.push(`${key}=${String(value)}`)
      }
    }

    // AggregateError and Neon's multi-attempt failures nest the real reason.
    if (Array.isArray(source.errors) && source.errors.length > 0) {
      const nested = source.errors.slice(0, 3).map((e: unknown) => describeError(e, depth + 1))
      parts.push(`errors=[${nested.join('; ')}]`)
    } else if (source.cause !== undefined && source.cause !== null) {
      parts.push(`cause=${describeError(source.cause, depth + 1)}`)
    }

    if (parts.length > 0) return parts.join(' ')

    // Nothing recognisable. Name the shape rather than dumping it.
    const ctor = (err as { constructor?: { name?: unknown } }).constructor?.name
    return typeof ctor === 'string' && ctor !== 'Object'
      ? `unrecognised error of type ${ctor}`
      : `unrecognised error with keys [${Object.keys(err).join(', ')}]`
  }

  return String(err)
}

// Log the real error server-side; never echo driver/internal messages to clients.
export function sendServerError(res: Response, err: unknown, route: string): void {
  logger.error({ route, err: describeError(err) }, 'route handler failed')
  res.status(500).json({ data: null, error: 'Internal server error', status: 500 })
}
