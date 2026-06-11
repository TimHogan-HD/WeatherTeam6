import type { ApiResponse } from '@weatherteam6/types'

function baseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_BASE_URL
  if (url) return url
  // In production builds a missing env var is a hard misconfiguration.
  // In development __DEV__ is true, so fall back to localhost for convenience.
  if (__DEV__) return 'http://localhost:3001'
  throw new Error('EXPO_PUBLIC_API_BASE_URL is not set')
}

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

  // body.data may be null for nullable generics (e.g. apiFetch<ConditionsScore | null>).
  // Callers that expect non-null arrays will never receive null from the API.
  return body.data as T
}
