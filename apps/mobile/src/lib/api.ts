import type { ApiResponse } from '@weatherteam6/types'

function baseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_BASE_URL
  if (url) return `${url}/api/v1`
  // In production builds a missing env var is a hard misconfiguration.
  // In development __DEV__ is true, so fall back to localhost for simulator
  // convenience. Physical devices and Android emulators cannot reach
  // localhost — set EXPO_PUBLIC_API_BASE_URL for those.
  if (__DEV__) return 'http://localhost:3001/api/v1'
  throw new Error('EXPO_PUBLIC_API_BASE_URL is not set')
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const REQUEST_TIMEOUT_MS = 15_000

/**
 * Single fetch helper for all API calls. Returns the unwrapped `data`
 * payload (or null for legitimate empty-data 200s) and throws ApiError
 * on failure so React Query surfaces it via `isError` and applies retry.
 */
export async function apiFetch<T>(path: string): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${baseUrl()}${path}`, { signal: controller.signal })
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
    // Prefer the envelope's status: a proxy may deliver HTTP 200 around a body
    // that declares an error, and retry policy keys off this value.
    throw new ApiError(body?.error ?? `HTTP ${res.status}`, body?.status ?? res.status)
  }

  return body.data
}

export async function apiPost<T>(path: string, body: unknown): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if ((err as Error)?.name === 'AbortError') {
      throw new ApiError('Request timed out', 0)
    }
    throw err
  }
  clearTimeout(timer)

  let responseBody: ApiResponse<T> | null = null
  try {
    responseBody = (await res.json()) as ApiResponse<T>
  } catch {
    responseBody = null
  }

  if (!res.ok || responseBody === null || responseBody.error !== null) {
    throw new ApiError(responseBody?.error ?? `HTTP ${res.status}`, responseBody?.status ?? res.status)
  }

  return responseBody.data
}

export async function apiDelete(path: string): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method: 'DELETE',
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if ((err as Error)?.name === 'AbortError') {
      throw new ApiError('Request timed out', 0)
    }
    throw err
  }
  clearTimeout(timer)

  if (!res.ok) {
    let errorBody: ApiResponse<null> | null = null
    try { errorBody = (await res.json()) as ApiResponse<null> } catch { /* empty */ }
    throw new ApiError(errorBody?.error ?? `HTTP ${res.status}`, errorBody?.status ?? res.status)
  }
}
