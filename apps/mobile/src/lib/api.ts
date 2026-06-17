import type { ApiResponse } from '@weatherteam6/types'

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? null

const REQUEST_TIMEOUT_MS = 15_000

/**
 * Single fetch helper for all API calls. Returns the unwrapped `data`
 * payload (or null for legitimate empty-data 200s) and throws ApiError
 * on failure so React Query surfaces it via `isError` and applies retry.
 */
export async function apiFetch<T>(path: string): Promise<T | null> {
  if (API_BASE_URL === null) {
    throw new ApiError(
      'EXPO_PUBLIC_API_BASE_URL is not set — add it to .env.local',
      0,
    )
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { signal: controller.signal })
  } catch (err) {
    clearTimeout(timer)
    if ((err as Error)?.name === 'AbortError') {
      throw new ApiError('Request timed out', 0)
    }
    throw err
  }
  clearTimeout(timer)

  let body: ApiResponse<T> | null = null
  try {
    body = (await res.json()) as ApiResponse<T>
  } catch {
    body = null
  }

  if (!res.ok || body === null || body.error !== null) {
    const message = body?.error ?? `HTTP ${res.status}`
    throw new ApiError(message, res.status)
  }

  return body.data
}
