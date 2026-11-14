import type { BeforeSendMiddleware } from '@vercel/speed-insights'

type BeforeSendEvent = Parameters<BeforeSendMiddleware>[0]

/**
 * Speed Insights (Vercel) reports load and tap timings from real phones. Two
 * things must not leave the device with them:
 *
 * - the hash, because `/join#<code>` carries a live invite code;
 * - ids in the path, which would split one screen into a row per crag or trip
 *   on the dashboard.
 *
 * So every report names the screen by its pattern (`/location/:id/wall/:id`),
 * never the address the browser shows. A path segment that is a plain
 * lowercase word is a route name (`location`, `trips`, `edit`); anything else
 * (a uuid, a number) is an id. That holds for every route in `App.tsx` without
 * keeping a second list of them.
 */
export function insightsRoute(pathname: string): string {
  const segments = pathname.split('/').filter((s) => s !== '')
  if (segments.length === 0) return '/'
  return '/' + segments.map((s) => (/^[a-z]+$/.test(s) ? s : ':id')).join('/')
}

/** Rewrites the reported URL to origin + route: no query, no hash, no ids. */
export function redactInsightsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  let url: URL
  try {
    url = new URL(event.url)
  } catch {
    // A URL we cannot read is one we cannot redact; drop the report.
    return null
  }
  const route = insightsRoute(url.pathname)
  return { ...event, url: `${url.origin}${route}`, route }
}
