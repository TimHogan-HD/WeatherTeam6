import type { TelegramWebApp } from '../telegram/types.js'

/**
 * `startapp` deep link handling (miniapp-design-v1.md §2, Crossover Task 7).
 *
 * An alert message carries a `url` button pointing at
 * `https://t.me/WeatherTeam6_bot/Alert?startapp=loc_<uuid>`. Telegram launches
 * this app and hands the parameter back; this module turns it into a location
 * id and arranges history so the detail screen is reachable *and* leaveable.
 *
 * Everything here is pure apart from `applyDeepLink`, which takes the History
 * object rather than reaching for `window` — that is what makes the back-stack
 * behaviour testable without a DOM.
 */

/** Mirrors `isUuid` in the API's `lib/http.ts`. Deliberately not RFC-strict on
 * version/variant nibbles: the job is to keep a corrupted parameter away from
 * the API, not to police UUID versions. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PREFIX = 'loc_'
const PARAM = 'tgWebAppStartParam'

/**
 * `loc_<uuid>` → the uuid. Anything else → `null`, which the caller turns into
 * "land on `/` silently" — a bad deep link never renders an error.
 *
 * The dashes are left exactly as they arrive. Stripping and reinserting them at
 * fixed offsets would turn a corrupted parameter into a well-formed but *wrong*
 * UUID, which reaches the API and 404s instead of falling back to the list.
 */
export function parseLocationStartParam(param: string | null | undefined): string | null {
  if (typeof param !== 'string' || !param.startsWith(PREFIX)) return null
  const id = param.slice(PREFIX.length)
  return UUID_RE.test(id) ? id : null
}

function paramFromQuery(query: string): string | null {
  if (query === '' || query === '?' || query === '#') return null
  const value = new URLSearchParams(query.replace(/^[?#]/, '')).get(PARAM)
  return value === null || value === '' ? null : value
}

/**
 * The raw `startapp` value, or `null`.
 *
 * Two sources, in the order the spec fixes: `initDataUnsafe.start_param` first,
 * the `tgWebAppStartParam` launch parameter second. The launch parameter is
 * looked for in the query string and in the hash, because Telegram has
 * delivered its `tgWebApp*` parameters in the fragment as well — checking one
 * and not the other would make the documented fallback a fallback that never
 * fires. The primary path is unaffected either way.
 *
 * `webApp` is `null` outside Telegram, which is the whole reason the second
 * source is useful during development: appending
 * `?tgWebAppStartParam=loc_<uuid>` in a plain browser exercises this path.
 */
export function readStartParam(
  webApp: TelegramWebApp | null,
  location: { readonly search: string; readonly hash: string },
): string | null {
  const fromInitData = webApp?.initDataUnsafe.start_param
  if (typeof fromInitData === 'string' && fromInitData !== '') return fromInitData
  return paramFromQuery(location.search) ?? paramFromQuery(location.hash)
}

/** The subset of `window.history` this needs — a fake in tests, real in `main.tsx`. */
export type HistoryLike = {
  replaceState(data: unknown, unused: string, url: string): void
  pushState(data: unknown, unused: string, url: string): void
}

/**
 * Seat a valid deep link in history and return the location id it routed to
 * (`null` when there was nothing valid to route to, leaving history untouched
 * so the app boots on `/`).
 *
 * **Two entries, list first.** This is the acceptance criterion for Task 7 and
 * the one thing the naive implementation gets wrong: pushing only
 * `/location/:id` leaves it as the *first* entry in the stack, so Telegram's
 * `BackButton` — and the platform back gesture — closes the Mini App instead of
 * revealing the list. `replaceState('/')` first drops the launch URL (with its
 * `tgWebApp*` parameters, already consumed by the SDK in `index.html` before
 * this module runs) and puts the list underneath.
 *
 * Called before React mounts, so `BrowserRouter` reads `/location/:id` as its
 * initial location and the list never flashes on screen.
 */
export function applyDeepLink(startParam: string | null, history: HistoryLike): string | null {
  const id = parseLocationStartParam(startParam)
  if (id === null) return null
  history.replaceState(null, '', '/')
  history.pushState(null, '', `/location/${id}`)
  return id
}
