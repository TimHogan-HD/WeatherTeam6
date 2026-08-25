import type { TelegramWebApp } from './types.js'

/**
 * `null` whenever the SDK is not present — running in a plain browser during
 * development, or `telegram-web-app.js` failing to load. Every caller must
 * handle that: the app has to render outside Telegram or Task 6 cannot be
 * built without a phone in hand.
 */
export function getWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null
}

export function isInsideTelegram(): boolean {
  return getWebApp() !== null
}

/**
 * `isVersionAtLeast` is safe to call on every client (it predates the versioned
 * methods), but the WebApp object itself may be absent.
 */
export function supportsVersion(minimum: string): boolean {
  const webApp = getWebApp()
  return webApp !== null && webApp.isVersionAtLeast(minimum)
}
