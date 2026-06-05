import type { ApiResponse } from '@weatherteam6/types'

const DEFAULT_BASE_URL = 'http://localhost:3001'

function baseUrl(): string {
  return process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_BASE_URL
}

/**
 * Single fetch helper for all API calls. Returns the unwrapped `data`
 * payload on success and throws on failure so React Query surfaces the
 * error via `isError` / `error` and applies its retry behavior.
 */
export async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`)

  let body: ApiResponse<T> | null = null
  try {
    body = (await res.json()) as ApiResponse<T>
  } catch {
    body = null
  }

  if (!res.ok || body === null || body.error !== null) {
    const message = body?.error ?? `HTTP ${res.status}`
    throw new Error(message)
  }

  return body.data as T
}
