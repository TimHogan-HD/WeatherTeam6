import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import type { Express } from 'express'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * App wiring — the mount order, and who sets `req.userId` where.
 *
 * These are not route tests. They exist because Phase 1 of
 * `docs/handoffs/leave-telegram-v1.md` moved `resolveUser` off the app-wide
 * mount, and the failure mode that move has is **silent**: `req.userId` is
 * typed non-optional `string`, so a route left outside every setter reads
 * `undefined` with no type error and no test failure — the bot simply stops
 * finding anything (defect class 8). Nothing in the repo could have caught it.
 */

const DEFAULT_USER_ID = '00000000-0000-0000-0000-0000000000aa'
const CHAT_ID = 4242

const { findLocationByName } = vi.hoisted(() => ({ findLocationByName: vi.fn() }))

// The webhook's first real use of req.userId. Mocked so the assertion is about
// the value it was handed, not about what the database says.
vi.mock('./lib/telegram/conditionsReply.js', () => ({
  findLocationByName,
  findLocationById: vi.fn(),
}))

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

describe('the Telegram webhook still gets an identity', () => {
  const original = {
    user: process.env['DEFAULT_USER_ID'],
    chat: process.env['TELEGRAM_CHAT_ID'],
    token: process.env['TELEGRAM_BOT_TOKEN'],
    hookSecret: process.env['TELEGRAM_WEBHOOK_SECRET'],
  }

  beforeAll(() => {
    process.env['DEFAULT_USER_ID'] = DEFAULT_USER_ID
    process.env['TELEGRAM_CHAT_ID'] = String(CHAT_ID)
    process.env['TELEGRAM_BOT_TOKEN'] = '123456:test-bot-token'
    // Unset on purpose: webhookSecretAccepted is deliberately permissive then,
    // which is the configuration these tests need and a documented state.
    delete process.env['TELEGRAM_WEBHOOK_SECRET']
    // The bot replies by calling Telegram. Nothing here asserts on the reply.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.startsWith('https://api.telegram.org')) {
          return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 })
        }
        return await realFetch(input, init)
      }),
    )
  })

  const realFetch = globalThis.fetch.bind(globalThis)

  afterAll(() => {
    vi.unstubAllGlobals()
    for (const [key, value] of [
      ['DEFAULT_USER_ID', original.user],
      ['TELEGRAM_CHAT_ID', original.chat],
      ['TELEGRAM_BOT_TOKEN', original.token],
      ['TELEGRAM_WEBHOOK_SECRET', original.hookSecret],
    ] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  afterEach(() => {
    findLocationByName.mockReset()
  })

  it('hands the handler DEFAULT_USER_ID, not undefined', async () => {
    // THE assertion this file exists for. `resolveUser` is mounted on
    // /api/telegram alone now; if that mount is dropped, this receives
    // `undefined` through a type that says it cannot be, every bot command
    // silently finds nothing, and nothing else in the suite notices.
    findLocationByName.mockResolvedValue(null)

    const res = await post('/api/telegram/webhook', {
      message: { chat: { id: CHAT_ID }, text: '/conditions somewhere' },
    })

    expect(res.status).toBe(200)
    expect(findLocationByName).toHaveBeenCalledTimes(1)
    expect(findLocationByName.mock.calls[0]?.[0]).toBe(DEFAULT_USER_ID)
    expect(findLocationByName.mock.calls[0]?.[0]).not.toBeUndefined()
  })

  it('refuses the update with 500 when DEFAULT_USER_ID is missing', async () => {
    // resolveUser answers before the route, so the handler never runs with an
    // unresolved user. This is what proves resolveUser is in *this* chain
    // rather than the assertion above passing for some other reason.
    delete process.env['DEFAULT_USER_ID']
    findLocationByName.mockResolvedValue(null)

    const res = await post('/api/telegram/webhook', {
      message: { chat: { id: CHAT_ID }, text: '/conditions somewhere' },
    })

    expect(res.status).toBe(500)
    expect(findLocationByName).not.toHaveBeenCalled()
    process.env['DEFAULT_USER_ID'] = DEFAULT_USER_ID
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

  it('serves a request with no Origin at all', async () => {
    // curl, a script, another server. CORS does not apply to them, and omitting
    // the header is not a refusal — the 401 below is the gate doing its job.
    const res = await fetch(`${base}/api/v1/locations`)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(res.status).toBe(401)
  })
})
