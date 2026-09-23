import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import type { Express } from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * App wiring — the mount order, and who sets `req.userId` where.
 *
 * These are not route tests. They exist because `req.userId` is typed
 * non-optional `string`, so a router mounted outside every setter reads
 * `undefined` with no type error and no test failure (defect class 8). Nothing
 * else in the repo can see that.
 *
 * `requireApiAuth` is now the **only** setter, because migration Phase 3 deleted
 * the Telegram webhook and `resolveUser` with it. The block this file used to
 * open with — proving the webhook still got an identity off its own mount —
 * went with them; what replaced it is the assertion that the mount is gone.
 */

let app: Express
let server: Server
let base: string

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  // db/index.ts throws at import time without this. The Pool is not connected
  // to, only constructed — every path these tests reach is mocked or refused
  // before a query runs.
  process.env['DATABASE_URL'] ??= 'postgres://user:pass@127.0.0.1:5432/never-connected'
  process.env['LOG_LEVEL'] ??= 'silent'

  const { createApp } = await import('./index.js')
  app = createApp()
  server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address() as AddressInfo
  base = `http://127.0.0.1:${String(address.port)}`
})

afterAll(() => {
  server.close()
})

describe('the Telegram webhook is gone', () => {
  it('404s the webhook path instead of accepting an update', async () => {
    // The bot is deleted, but Telegram keeps delivering to a registered webhook
    // until the registration is removed. What must not happen is a *silent*
    // acceptance: the old handler answered 200 to everything, including refusals,
    // so a surviving mount would look identical to a healthy bot from outside.
    //
    // This is also the only mechanical check that the mount came out of
    // `index.ts`. Deleting `routes/telegramWebhook.ts` alone would not compile,
    // but a re-added mount would, and nothing else would notice.
    const res = await post('/api/telegram/webhook', {
      message: { chat: { id: 4242 }, text: '/conditions somewhere' },
    })
    expect(res.status).toBe(404)
  })
})

describe('the login route is mounted above the gate', () => {
  const original = {
    secret: process.env['API_SHARED_SECRET'],
    tokenSecret: process.env['AUTH_TOKEN_SECRET'],
  }

  beforeAll(() => {
    process.env['API_SHARED_SECRET'] = 'test-secret'
    process.env['AUTH_TOKEN_SECRET'] = 'test-token-secret'
  })

  afterAll(() => {
    for (const [key, value] of [
      ['API_SHARED_SECRET', original.secret],
      ['AUTH_TOKEN_SECRET', original.tokenSecret],
    ] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('reaches POST /api/v1/auth/login with no Authorization header', async () => {
    // You cannot present a token in order to obtain one. A 400 for the missing
    // body proves the handler ran; a 401 would mean the gate is above it and
    // nobody could ever log in.
    const res = await post('/api/v1/auth/login', {})
    expect(res.status).toBe(400)
  })

  it('still 401s every other path under /api/v1/auth', async () => {
    // The hole in the gate is exactly one method on exactly one path. Express
    // matches in registration order, so an unmatched route under the auth
    // mount falls through to requireApiAuth rather than 404ing in the open.
    for (const path of ['/api/v1/auth/login', '/api/v1/auth/whatever']) {
      const res = await fetch(`${base}${path}`)
      expect(res.status).toBe(401)
    }
    const res = await post('/api/v1/auth/register', { username: 'x', passphrase: 'y' })
    expect(res.status).toBe(401)
  })

  it('still 401s a gated route with no Authorization header', async () => {
    const res = await fetch(`${base}/api/v1/locations`)
    expect(res.status).toBe(401)
  })
})

describe('CORS', () => {
  const original = {
    secret: process.env['API_SHARED_SECRET'],
    tokenSecret: process.env['AUTH_TOKEN_SECRET'],
  }

  beforeAll(() => {
    // Configured, so a 401 below means "no credential" rather than the 503 an
    // unconfigured gate answers with. The distinction is the whole point of the
    // last assertion in this block.
    process.env['API_SHARED_SECRET'] = 'test-secret'
    process.env['AUTH_TOKEN_SECRET'] = 'test-token-secret'
  })

  afterAll(() => {
    for (const [key, value] of [
      ['API_SHARED_SECRET', original.secret],
      ['AUTH_TOKEN_SECRET', original.tokenSecret],
    ] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('echoes an allowed origin and omits the header for anything else', async () => {
    const allowed = await fetch(`${base}/api/v1/locations`, {
      headers: { Origin: 'https://weatherteam6.vercel.app' },
    })
    expect(allowed.headers.get('access-control-allow-origin')).toBe(
      'https://weatherteam6.vercel.app',
    )

    const denied = await fetch(`${base}/api/v1/locations`, {
      headers: { Origin: 'https://evil.example.com' },
    })
    expect(denied.headers.get('access-control-allow-origin')).toBeNull()
    // Never `*` again: the wildcard was for a Telegram webview and there is
    // not one any more.
    expect(denied.headers.get('access-control-allow-origin')).not.toBe('*')
  })

  it('marks the response as varying by Origin', async () => {
    // The ACAO header now depends on the request, so a shared cache must not
    // serve one origin's copy to another.
    const res = await fetch(`${base}/api/v1/locations`, {
      headers: { Origin: 'https://weatherteam6.vercel.app' },
    })
    expect(res.headers.get('vary')).toContain('Origin')
  })

  it('answers preflight 204 and still allows the Authorization header', async () => {
    // The credential travels in Authorization, so preflight must permit it —
    // dropping it turns every browser call into an opaque CORS failure.
    const res = await fetch(`${base}/api/v1/locations`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://weatherteam6.vercel.app' },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-headers')).toContain('Authorization')
  })

  it('allows every method a route answers, PATCH included', async () => {
    // PATCH /locations/:id (Phase 4b) is the first non-simple method after
    // DELETE. Missing from this list, the route works from curl and fails
    // every browser call at preflight with nothing in the API's logs.
    const res = await fetch(`${base}/api/v1/locations/00000000-0000-0000-0000-000000000001`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://weatherteam6.vercel.app' },
    })
    const allowed = (res.headers.get('access-control-allow-methods') ?? '').split(/,\s*/)
    for (const m of ['GET', 'POST', 'PATCH', 'DELETE']) expect(allowed).toContain(m)
  })

  it('serves a request with no Origin at all', async () => {
    // curl, a script, another server. CORS does not apply to them, and omitting
    // the header is not a refusal — the 401 below is the gate doing its job.
    const res = await fetch(`${base}/api/v1/locations`)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(res.status).toBe(401)
  })
})
