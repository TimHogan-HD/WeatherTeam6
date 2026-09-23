import { colors } from '@weatherteam6/design/tokens'

/**
 * The PWA manifest, built from the design tokens rather than written out as
 * JSON in `public/`.
 *
 * Phase 2 of `docs/handoffs/leave-telegram-v1.md`: the bot's menu button was
 * the app's home-screen shell, and Add to Home Screen replaces it. `standalone`
 * is what removes the browser chrome; without it the installed app is a
 * bookmark with an address bar.
 *
 * **No service worker.** Push is parked, and a service worker with nothing to
 * cache is a cache-invalidation bug waiting to happen. Installability does not
 * require one.
 *
 * The two colours are the reason this is TypeScript. `theme_color` and
 * `background_color` are the same values `globals.css` paints the gradient
 * with, and a hex typed into a `.webmanifest` would be a colour redefined
 * inside an app — which the token rule forbids however right it looked the day
 * it was written.
 */
export type WebManifest = {
  name: string
  short_name: string
  description: string
  start_url: string
  scope: string
  display: string
  orientation: string
  theme_color: string
  background_color: string
  icons: { src: string; sizes: string; type: string; purpose: string }[]
}

export function buildWebManifest(): WebManifest {
  return {
    name: 'WeatherTeam6',
    short_name: 'WeatherTeam6',
    description: 'Climbing conditions and weather for your saved crags.',
    // The list, not the last route visited. Launching an installed app onto a
    // location that has since been removed would open an error screen.
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // `portrait` rather than `any`: every screen here is a single column and
    // the charts are sized for phone width.
    orientation: 'portrait',
    // What the OS paints around the app — the top of the gradient, which is
    // what sits under the status bar.
    theme_color: colors.bgGradientTop,
    // What it paints during launch, before the first frame. The *bottom* of
    // the gradient, because `html` carries that colour for the same reason:
    // it is what the surface ends on, so the splash does not flash lighter
    // than the page it becomes.
    background_color: colors.bgGradientBottom,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Separate art, not the same file relabelled. A maskable icon is cropped
      // to whatever shape the launcher uses, so it bleeds to the edges and
      // keeps its mark inside the inner 80%; listing an `any` icon as maskable
      // is what produces a logo with its corners sliced off.
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
