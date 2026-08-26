/**
 * Build-time configuration. `VITE_API_BASE_URL` is inlined by Vite at build
 * time, so it is public — nothing secret may be read here.
 *
 * In particular `API_SHARED_SECRET` must never appear in this bundle. The Mini
 * App's credential is `Telegram.WebApp.initData`, validated server-side by HMAC
 * as middleware on `/api/v1/*`; that work is a prerequisite for Task 6 and ships
 * together with removing Vercel SSO protection from the API.
 */

const raw = import.meta.env.VITE_API_BASE_URL

/** `null` when unset, rather than a silent `undefined` in a URL string. */
export const apiBaseUrl: string | null =
  typeof raw === 'string' && raw.trim() !== '' ? raw.trim().replace(/\/+$/, '') : null

export function requireApiBaseUrl(): string {
  if (apiBaseUrl === null) {
    throw new Error('VITE_API_BASE_URL is not set — the Mini App has no API to call.')
  }
  return apiBaseUrl
}
