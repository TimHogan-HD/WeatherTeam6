import { requireApiBaseUrl } from '../config/env.js'
import { getWebApp } from '../telegram/webApp.js'
import type { ApiResponse } from '@weatherteam6/types'

/**
 * The single place this app talks to the network. Components never call `fetch`
 * — they go through the React Query hooks in `src/hooks/`, which come here.
 *
 * **Credential.** `Telegram.WebApp.initData`, sent as `Authorization: tma
 * <initData>` and validated server-side by HMAC. It must travel in
 * `Authorization`: the API's CORS layer allows exactly `Content-Type,
 * Authorization`, so a custom header fails browser preflight before the auth
 * middleware ever runs. Outside Telegram there is no initData and every call
 * 401s — that is expected, and the screens still render their error states.
 */

/** Route prefix. Every endpoint this app uses is mounted under it. */
const API_PREFIX = '/api/v1'

/**
 * `VITE_API_BASE_URL` is documented as the API's *origin*, and the prefix is
 * appended here. A value that already ends in the prefix is accepted rather
 * than doubled: three separate docs describe this variable and none of them is
 * unambiguous about it, and the failure mode is a 404 inside Telegram, where
 * there is no preview deployment to debug against.
 */
function endpoint(path: string): string {
  const base = requireApiBaseUrl().replace(new RegExp(`${API_PREFIX}$`), '')
  return `${base}${API_PREFIX}${path}`
}

function authHeaders(): Record<string, string> {
  const initData = getWebApp()?.initData
  return initData !== undefined && initData !== '' ? { Authorization: `tma ${initData}` } : {}
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

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(endpoint(path), {
    ...init,
    headers: { ...authHeaders(), ...init.headers },
  })

  const body = await readBody(res)

  if (!res.ok) {
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
