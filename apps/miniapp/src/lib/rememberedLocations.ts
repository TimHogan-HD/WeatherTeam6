import type { Location } from '@weatherteam6/types'

/**
 * The last list of saved locations this device received — names and places
 * only, never weather — so a cold open can draw the cards at once while their
 * numbers load.
 *
 * **It is a placeholder, never cache data.** `useLocations` hands it to React
 * Query as `placeholderData`, which is not written to the cache: the list
 * refetches straight away, and a crag screen seeded from the list cache
 * (`useLocation`) never sees a remembered row.
 *
 * Forgotten whenever the token goes (`App.tsx`), for the same reason the query
 * cache is cleared there: a second person signing in on the same device must
 * not see the first one's crags. Storage can throw or come back empty, as in
 * `authToken.ts`; either way the list simply loads as it did before.
 */
const STORAGE_KEY = 'wt6.locations'

export function rememberedLocations(): Location[] | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return undefined
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Location[]) : undefined
  } catch {
    return undefined
  }
}

export function rememberLocations(list: Location[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Unavailable storage costs only the instant list on the next cold open.
  }
}

export function forgetLocations(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // As above.
  }
}
