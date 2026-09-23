import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * What happens to the stored token when a call fails.
 *
 * This is the whole sign-out path. `RequireAuth` redirects on the token being
 * gone, not on a status code it saw, so if the clear here is wrong there is
 * nothing downstream to catch it — the app either strands a user on screens
 * that cannot load, or signs them out of a working session for a reason that
 * is not theirs to fix.
 *
 * Modules are re-imported per test because `authToken.ts` reads storage once at
 * load and `config/env.ts` reads `VITE_API_BASE_URL` once at load.
 */

type Loaded = {
  api: typeof import('./api.js')
  authToken: typeof import('./authToken.js')
  fetchMock: ReturnType<typeof vi.fn>
}

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  }
}

/** A real `Response`-shaped object; `readBody` calls `.json()` on it. */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response
}

async function load(): Promise<Loaded> {
  vi.resetModules()
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
  vi.stubGlobal('window', { localStorage: memoryStorage() })

  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)

  const authToken = await import('./authToken.js')
  const api = await import('./api.js')
  return { api, authToken, fetchMock }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('authenticated requests', () => {
  it('sends the stored token as the Session scheme', async () => {
    const { api, authToken, fetchMock } = await load()
    authToken.setToken('tok-123')
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [], error: null, status: 200 }))

    await api.apiGet('/locations')

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.headers).toMatchObject({ Authorization: 'Session tok-123' })
  })

  /**
   * Signed out, the header is absent rather than `Session null`. A literal
   * "null" would reach `requireApiAuth` as a malformed credential and produce
   * the same 401 — which is why this is worth pinning: the two are
   * indistinguishable from the outside, and only one of them is a bug.
   */
  it('sends no Authorization header when signed out', async () => {
    const { api, fetchMock } = await load()
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [], error: null, status: 200 }))

    await api.apiGet('/locations')

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.headers).not.toHaveProperty('Authorization')
  })

  it('clears the token on a 401', async () => {
    const { api, authToken, fetchMock } = await load()
    authToken.setToken('tok-123')
    fetchMock.mockResolvedValue(jsonResponse(401, { data: null, error: 'nope', status: 401 }))

    await expect(api.apiGet('/locations')).rejects.toBeInstanceOf(api.ApiError)
    expect(authToken.getToken()).toBeNull()
  })

  /**
   * A 503 means the server has no `AUTH_TOKEN_SECRET` or `API_SHARED_SECRET`.
   * The token is fine; signing the user out would send them to a login screen
   * that cannot issue a new one either, so the failure would look like their
   * fault and be unfixable by them.
   */
  it('keeps the token on a 503', async () => {
    const { api, authToken, fetchMock } = await load()
    authToken.setToken('tok-123')
    fetchMock.mockResolvedValue(jsonResponse(503, { data: null, error: 'unconfigured', status: 503 }))

    await expect(api.apiGet('/locations')).rejects.toBeInstanceOf(api.ApiError)
    expect(authToken.getToken()).toBe('tok-123')
  })

  it('keeps the token on a 404', async () => {
    const { api, authToken, fetchMock } = await load()
    authToken.setToken('tok-123')
    fetchMock.mockResolvedValue(jsonResponse(404, { data: null, error: 'gone', status: 404 }))

    await expect(api.apiGet('/locations/x')).rejects.toBeInstanceOf(api.ApiError)
    expect(authToken.getToken()).toBe('tok-123')
  })
})

describe('apiLogin', () => {
  it('returns the token without storing it', async () => {
    const { api, authToken, fetchMock } = await load()
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: { token: 'fresh', expires_at: '2026-10-01T00:00:00.000Z' },
        error: null,
        status: 200,
      }),
    )

    await expect(api.apiLogin('tim', 'pass')).resolves.toMatchObject({ token: 'fresh' })
    // The screen stores it, not the network layer — so the app is considered
    // signed in at one place rather than mid-request.
    expect(authToken.getToken()).toBeNull()
  })

  it('sends no Authorization header even when a stale token is stored', async () => {
    const { api, authToken, fetchMock } = await load()
    authToken.setToken('stale')
    fetchMock.mockResolvedValue(
      jsonResponse(200, { data: { token: 'fresh', expires_at: 'x' }, error: null, status: 200 }),
    )

    await api.apiLogin('tim', 'pass')

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.headers).not.toHaveProperty('Authorization')
  })

  /**
   * The reason `apiLogin` bypasses the clear. A 401 here is a wrong
   * passphrase; clearing on it would sign the user out of a session they were
   * signing back into, and the screen says nothing about that.
   */
  it('does not clear an existing token when the passphrase is wrong', async () => {
    const { api, authToken, fetchMock } = await load()
    authToken.setToken('still-valid')
    fetchMock.mockResolvedValue(
      jsonResponse(401, { data: null, error: 'Invalid username or passphrase', status: 401 }),
    )

    await expect(api.apiLogin('tim', 'wrong')).rejects.toBeInstanceOf(api.ApiError)
    expect(authToken.getToken()).toBe('still-valid')
  })
})
