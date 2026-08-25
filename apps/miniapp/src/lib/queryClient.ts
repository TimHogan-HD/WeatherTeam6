import { QueryClient } from '@tanstack/react-query'

/**
 * Configuration fixed by miniapp-design-v1.md §5.
 *
 * `refetchOnWindowFocus` is off deliberately: a Telegram webview fires focus
 * events on every keyboard dismissal, and live scoring costs several seconds
 * and six upstream fetches per detail screen.
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
