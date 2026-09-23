import { useSyncExternalStore } from 'react'
import { getToken, subscribeToToken } from '../lib/authToken.js'

/**
 * The session token as React state.
 *
 * `useSyncExternalStore` rather than a context with a setter, because the token
 * is cleared from outside React: `api.ts` drops it on a 401, which can happen
 * inside any React Query fetch on any screen. A context would need every one of
 * those paths to route back through a provider it does not have a handle on.
 *
 * The server snapshot is the same function. This app has no SSR, but Vite's
 * dev-time module graph will still call it if the hook is reached during a
 * hydration pass, and returning `null` there rather than the real value would
 * flash the login screen over a signed-in app.
 */
export function useAuthToken(): string | null {
  return useSyncExternalStore(subscribeToToken, getToken, getToken)
}
