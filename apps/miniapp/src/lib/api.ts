import { requireApiBaseUrl } from '../config/env.js'
import { clearToken, getToken } from './authToken.js'
import type { ApiResponse, AuthLoginResponse } from '@weatherteam6/types'

/**
 * The single place this app talks to the network. Components never call `fetch`
 * — they go through the React Query hooks in `src/hooks/`, which come here.
 *
 * **Credential.** The session token from `POST /api/v1/auth/login`, sent as
 * `Authorization: Session <token>`. It must travel in `Authorization`: the
 * API's CORS layer allows exactly `Content-Type, Authorization`, so a custom
 * header fails browser preflight before the auth middleware ever runs.
 *
 * Signed out, there is no token and every call 401s — which is handled here
 * rather than by each screen: a 401 on an authenticated call clears the stored
 * token, and `RequireAuth` in `App.tsx` sends the user to `/login`.
 */

/** Route prefix. Every endpoint this app uses is mounted under it. */
const API_PREFIX = '/api/v1'

/**
 * `VITE_API_BASE_URL` is documented as the API's *origin*, and the prefix is
 * appended here. A value that already ends in the prefix is accepted rather
 * than doubled: three separate docs describe this variable and none of them is
 * unambiguous about it, and the failure mode is a 404 on every call — cheap to
 * tolerate, expensive to debug from a deployed bundle.
 */
function endpoint(path: string): string {
  const base = requireApiBaseUrl().replace(new RegExp(`${API_PREFIX}$`), '')
  return `${base}${API_PREFIX}${path}`
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token === null ? {} : { Authorization: `Session ${token}` }
}

/**
 * Carries the status for logging and for distinguishing "not found" from
 * "failed". **Its message must never be rendered** — §5 forbids surfacing an
 * HTTP status or a raw error string to the user.
 */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function readBody(res: Response): Promise<ApiResponse<unknown> | null> {
  try {
    return (await res.json()) as ApiResponse<unknown>
  } catch {
    // A gateway or a Vercel error page is not JSON. Do not let a parse failure
    // surface as a different, more confusing error than the HTTP one.
    return null
  }
}

/**
 * `headers` is narrowed to a plain object on purpose. `RequestInit` also allows
 * a `Headers` instance or an array of pairs, and spreading either of those
 * yields nothing — which would drop the Authorization header silently and turn
 * every call into a 401 that looks like an auth bug.
 */
type JsonRequestInit = Omit<RequestInit, 'headers'> & { headers?: Record<string, string> }

/**
 * `authenticated: false` is for `POST /auth/login` alone, and it turns off two
 * things at once. The login route is mounted above the gate and ignores
 * `Authorization`, so sending a stale token there is pointless — and, more
 * importantly, a 401 from it means *wrong passphrase*, not *dead session*. If
 * that 401 cleared the token it would sign the user out of a session they were
 * only trying to renew, and the screen would say nothing about why.
 *
 * Only a 401 clears. A 503 means `API_SHARED_SECRET` or `AUTH_TOKEN_SECRET` is
 * unset on the server and the token is fine; signing the user out over a server
 * misconfiguration would send them to a login screen that cannot work either.
 */
async function request<T>(
  path: string,
  init: JsonRequestInit,
  authenticated: boolean = true,
): Promise<T> {
  const res = await fetch(endpoint(path), {
    ...init,
    headers: { ...(authenticated ? authHeaders() : {}), ...init.headers },
  })

  const body = await readBody(res)

  if (!res.ok) {
    if (authenticated && res.status === 401) clearToken()
    throw new ApiError(res.status, body?.error ?? `Request failed with ${res.status}`)
  }
  if (body === null) {
    throw new ApiError(res.status, 'Response body was not JSON')
  }

  // `data: null` on a 2xx is a real answer, not a failure — GET /conditions/:id
  // returns exactly that when no computed row matches today (§5), and DELETE
  // returns it on success. Callers type T to include null where that applies.
  return body.data as T
}

export function apiGet<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const query =
    params === undefined
      ? ''
      : `?${new URLSearchParams(
          Object.entries(params).map(([k, v]) => [k, String(v)]),
        ).toString()}`
  return request<T>(`${path}${query}`, { method: 'GET' })
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function apiDelete(path: string): Promise<null> {
  return request<null>(path, { method: 'DELETE' })
}

/**
 * The one unauthenticated call. It does not store the token — `Login.tsx` does
 * that, so the screen decides when the app is considered signed in rather than
 * the network layer deciding it mid-request.
 */
export function apiLogin(username: string, passphrase: string): Promise<AuthLoginResponse> {
  return request<AuthLoginResponse>(
    '/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, passphrase }),
    },
    false,
  )
}
