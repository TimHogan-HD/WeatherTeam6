/**
 * Build-time configuration. `VITE_API_BASE_URL` is inlined by Vite at build
 * time, so it is public — nothing secret may be read here.
 *
 * In particular `API_SHARED_SECRET` must never appear in this bundle. The app's
 * credential is the per-user session token from `POST /api/v1/auth/login`,
 * which is obtained at runtime and held in `localStorage` — see
 * `src/lib/authToken.ts`. Nothing about auth is a build-time value.
 */

const raw = import.meta.env.VITE_API_BASE_URL

/**
 * **A production build calls its own address**, and `vercel.json` forwards
 * `/api/...` to the API (2026-10-01). Across two origins, every request with
 * the session token carried a CORS preflight, a second round trip of ~170 ms,
 * 18 of them on every app open; at the same origin there are none. `''` makes
 * every URL relative to the page.
 *
 * `VITE_API_BASE_URL` is therefore for development only — the dev server and
 * `check:ui` point it at a local API. A production build ignores it.
 *
 * `null` when a development build has none, rather than a silent `undefined`
 * in a URL string.
 */
export const apiBaseUrl: string | null = import.meta.env.PROD
  ? ''
  : typeof raw === 'string' && raw.trim() !== ''
    ? raw.trim().replace(/\/+$/, '')
    : null

export function requireApiBaseUrl(): string {
  if (apiBaseUrl === null) {
    throw new Error('VITE_API_BASE_URL is not set — a development build has no API to call.')
  }
  return apiBaseUrl
}
