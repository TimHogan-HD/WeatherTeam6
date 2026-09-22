/**
 * Which browser origins may call this API.
 *
 * It was `Access-Control-Allow-Origin: *` until Phase 1 of
 * `docs/handoffs/leave-telegram-v1.md`, because the only browser client was a
 * Telegram webview. Now that an ordinary browser opens the app with a token in
 * `localStorage`, the wildcard is worth closing — but be clear about what that
 * buys: every route still requires an `Authorization` header and there are no
 * cookies, so CORS is not what keeps a hostile page out. It narrows who can
 * *attempt* a call, not who can succeed.
 *
 * Lives in `lib/` rather than inline in `index.ts` so it can be tested without
 * importing the app, which pulls in the database client and throws at import
 * time when DATABASE_URL is unset.
 */

/**
 * localhost is here so `npm run dev` in `apps/miniapp` can point at a deployed
 * API without a config dance.
 */
export const DEFAULT_ALLOWED_ORIGINS = [
  'https://weatherteam6.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

/**
 * `CORS_ALLOWED_ORIGINS`, comma separated, replaces the default list outright.
 * An entry may carry one `*` in place of a single host label —
 * `https://*.vercel.app` — which is how a preview deployment, whose URL changes
 * every build, becomes reachable from a browser.
 */
export function allowedOriginPatterns(
  raw: string | undefined = process.env['CORS_ALLOWED_ORIGINS'],
): string[] {
  if (!raw) return DEFAULT_ALLOWED_ORIGINS
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
  // An empty or whitespace-only value is a misconfiguration, not an instruction
  // to block every browser — and silently blocking every browser is the harder
  // of the two failures to diagnose.
  return entries.length > 0 ? entries : DEFAULT_ALLOWED_ORIGINS
}

/**
 * One `*`, standing for exactly one DNS label.
 *
 * The label is matched against `[a-z0-9-]+` rather than "anything but a dot",
 * so `https://*.vercel.app` cannot be satisfied by
 * `https://evil.com/x.vercel.app` or `https://evil.com@x.vercel.app` — the two
 * shapes that turn a suffix match into an open door.
 */
function matchesPattern(origin: string, pattern: string): boolean {
  if (pattern === origin) return true
  const star = pattern.indexOf('*')
  if (star === -1) return false

  const prefix = pattern.slice(0, star)
  const suffix = pattern.slice(star + 1)
  if (origin.length <= prefix.length + suffix.length) return false
  if (!origin.startsWith(prefix) || !origin.endsWith(suffix)) return false

  const label = origin.slice(prefix.length, origin.length - suffix.length)
  return /^[a-z0-9-]+$/i.test(label)
}

export function originAllowed(origin: string, patterns: readonly string[]): boolean {
  if (origin === '') return false
  return patterns.some((pattern) => matchesPattern(origin, pattern))
}
