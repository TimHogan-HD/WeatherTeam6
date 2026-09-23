import { QueryClient } from '@tanstack/react-query'

/**
 * Configuration fixed by miniapp-design-v1.md §5.
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
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  })
}
