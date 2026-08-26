/**
 * The slice of `Telegram.WebApp` this app actually uses.
 *
 * Hand-written rather than pulled from a types package: the surface is small,
 * the SDK is loaded from `telegram.org` at runtime (so there is no npm package
 * carrying the implementation anyway), and every member here is one the Mini
 * App design spec names. Widen it as screens need more — do not reach for
 * `any` to skip a member.
 */

export type TelegramThemeParams = Readonly<Record<string, string | undefined>>

export type TelegramBackButton = {
  readonly isVisible: boolean
  show(): void
  hide(): void
  onClick(callback: () => void): void
  offClick(callback: () => void): void
}

export type TelegramInitDataUnsafe = {
  readonly start_param?: string
}

export type TelegramWebApp = {
  /** Bot API version this client implements, e.g. `"7.10"`. */
  readonly version: string
  readonly platform: string
  /** Signed payload for server-side HMAC validation. Task 6 sends this. */
  readonly initData: string
  readonly initDataUnsafe: TelegramInitDataUnsafe
  /** Read for chrome only — content styling never branches on it (§1). */
  readonly themeParams: TelegramThemeParams
  readonly BackButton: TelegramBackButton
  ready(): void
  expand(): void
  isVersionAtLeast(version: string): boolean
  setHeaderColor(color: string): void
  setBackgroundColor(color: string): void
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp
    }
  }
}
