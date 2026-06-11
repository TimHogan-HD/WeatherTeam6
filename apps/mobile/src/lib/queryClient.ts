import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Server-side weather data regenerates every 6h (forecast-snapshot job);
      // refetching every screen focus is wasted traffic.
      staleTime: 15 * 60_000,
      // One retry for network/5xx failures; never retry 4xx — the answer won't change.
      retry: (failureCount, error) =>
        error instanceof ApiError && error.status >= 400 && error.status < 500
          ? false
          : failureCount < 1,
    },
  },
})
