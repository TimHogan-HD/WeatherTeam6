import { QueryClient } from '@tanstack/react-query'

/**
 * **How long an answer is trusted without asking again: up to `FRESH_MAX_MS`,
 * and never past the clock hour it was fetched in** (owner, 2026-11-14, #598).
 *
 * The weather behind every answer changes once an hour, when `collect-runs`
 * stores new runs, and the readings' "now" hour turns over on the hour. So an
 * answer from 10:52 is asked for again at 11:00, and one from 10:05 at 10:20.
 * Each request that is not sent saves a serverless cold start, which was most
 * of the API's CPU. Pull-to-refresh refetches regardless.
 *
 * The hour is the device's; the crags and the phone share a timezone in
 * practice, as `rememberedCards.isUsable` already assumes.
 */
export const FRESH_MAX_MS = 15 * 60 * 1000

/** How long an answer fetched at `updatedAt` stays fresh. 0 for no fetch yet. */
export function freshForMs(updatedAt: number): number {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return 0
  const nextHour = new Date(updatedAt)
  nextHour.setMinutes(60, 0, 0)
  return Math.max(0, Math.min(FRESH_MAX_MS, nextHour.getTime() - updatedAt))
}

/** Whether an answer fetched at `updatedAt` is still fresh at `now`. A future stamp (a wrong clock) is not. */
export function isFreshAt(updatedAt: number, now: number): boolean {
  return updatedAt > 0 && now >= updatedAt && now - updatedAt < freshForMs(updatedAt)
}

/**
 * Configuration fixed by miniapp-design-v1.md §5, except `staleTime` (above).
 *
 * `refetchOnWindowFocus` is off deliberately, and it stays off now the Telegram
 * webview is gone: live scoring costs several seconds and six upstream fetches
 * per detail screen, and there are unexplained Open-Meteo JSON-parse failures
 * theorised to be rate limiting on Vercel's shared egress. The second reason is
 * the one that binds — refetching every time the user returns to the tab is how
 * you find out.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: (query) => freshForMs(query.state.dataUpdatedAt),
        gcTime: 30 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  })
}
