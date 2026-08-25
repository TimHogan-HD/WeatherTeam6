import { useEffect } from 'react'
import { colors } from '@weatherteam6/design/tokens'
import { getWebApp, supportsVersion } from './webApp.js'

/**
 * Announces readiness and harmonizes Telegram's own chrome with the app's
 * gradient, so the header and overscroll area do not flash white.
 *
 * The two colour calls have different version floors and are gated separately
 * (miniapp-design-v1.md §1):
 *
 * - `setBackgroundColor` takes an arbitrary hex from Bot API 6.1. Gating it at
 *   6.9 alongside the header would give up correct behaviour on 6.1–6.8.
 * - `setHeaderColor` takes an arbitrary hex only from 6.9. Below that it accepts
 *   just the `bg_color` / `secondary_bg_color` keywords, and `bg_color` resolves
 *   to the *user's* theme background — white on a light theme, which is exactly
 *   the flash this exists to prevent. So there is no fallback: on older clients
 *   the header keeps Telegram's default.
 *
 * Content styling never reads `themeParams`. The app is the fixed WeatherTeam6
 * dark surface on every theme (§1).
 */
export function useTelegramChrome(): void {
  useEffect(() => {
    const webApp = getWebApp()
    if (webApp === null) return

    webApp.ready()
    webApp.expand()

    if (supportsVersion('6.1')) {
      webApp.setBackgroundColor(colors.bgGradientBottom)
    }
    if (supportsVersion('6.9')) {
      webApp.setHeaderColor(colors.bgGradientTop)
    }
  }, [])
}
