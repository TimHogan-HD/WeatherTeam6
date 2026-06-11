import type { ApiResponse } from '@weatherteam6/types'

function baseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_BASE_URL
  if (url) return url
  // In production builds a missing env var is a hard misconfiguration.
  // In development __DEV__ is true, so fall back to localhost for simulator
  // convenience. Physical devices and Android emulators cannot reach
  // localhost — set EXPO_PUBLIC_API_BASE_URL for those.
  if (__DEV__) return 'http://localhost:3001'
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

export async function apiFetch<T>(path: string): Promise<T | null> {
  const res = await fetch(`${baseUrl()}${path}`)

  let body: ApiResponse<T> | null = null
  try {
    body = (await res.json()) as ApiResponse<T>
  } catch {
    body = null
  }

  if (!res.ok || body === null || body.error !== null) {
    throw new ApiError(body?.error ?? `HTTP ${res.status}`, res.status)
  }

  return body.data
}
