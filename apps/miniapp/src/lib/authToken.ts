/**
 * The session token, and the one place it is stored.
 *
 * Phase 2 of `docs/handoffs/leave-telegram-v1.md`: the app's credential used to
 * be `Telegram.WebApp.initData`, handed to us by the platform on every launch.
 * Outside Telegram there is no platform, so the token from
 * `POST /api/v1/auth/login` is held here and travels as `Authorization: Session
 * <token>`.
 *
 * **`localStorage` can throw, and can come back empty.** Safari's private mode
 * and a browser with site data blocked both make the accessor throw rather than
 * return null, and every read and write here is wrapped for that. A browser
 * that cannot store the token still works — the user simply logs in again on
 * the next load, which is the same outcome as an expired token.
 *
 * **No client-side expiry check, deliberately.** `AuthLoginResponse.expires_at`
 * exists so a client can send the user back to the login screen before a call
 * fails rather than after, and we do not use it: a device with a wrong clock
 * would then discard a token it had just been issued, bounce to `/login`, and
 * do the same again on the next successful login — a dead end with no error to
 * explain it. A 401 from the API is authoritative and costs one round trip, so
 * that is the only thing that clears the token. `expires_at` is therefore not
 * stored either; a stored field nothing reads is worse than no field.
 */

/** Namespaced so it cannot collide with anything else on the origin. */
const STORAGE_KEY = 'wt6.session.token'

/**
 * The in-memory copy is the source of truth for a render. It exists because
 * `useSyncExternalStore` requires a `getSnapshot` that returns a stable value
 * between notifications — reading `localStorage` on every call returns a fresh
 * string each time only in the sense that it is a new read, but more
 * importantly it turns every render into synchronous disk I/O, and it would
 * keep working in a browser where the write silently failed, which is the one
 * case that must not look like success.
 */
let current: string | null = readStorage()

const listeners = new Set<() => void>()

function readStorage(): string | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw !== null && raw !== '' ? raw : null
  } catch {
    return null
  }
}

function notify(): void {
  for (const listener of listeners) listener()
}

/** `null` when nobody is signed in. Callers must handle that on every path. */
export function getToken(): string | null {
  return current
}

export function setToken(token: string): void {
  current = token
  try {
    window.localStorage.setItem(STORAGE_KEY, token)
  } catch {
    // Storage is unavailable. The token still works for this page load; it just
    // does not survive a reload. Failing the login over that would be worse.
  }
  notify()
}

/**
 * Called on sign-out and on any 401 from an authenticated call. It must clear
 * the in-memory copy even when the storage write throws, or the app would keep
 * presenting a credential the API has already rejected.
 */
export function clearToken(): void {
  current = null
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Same reasoning as setToken: in-memory state is already correct.
  }
  notify()
}

export function subscribeToToken(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
