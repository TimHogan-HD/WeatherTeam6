/**
 * The image the opening splash draws (`Splash.tsx`). The service worker keeps
 * it on the device (`serviceWorker.ts`), because the splash shows before
 * anything else has loaded. Its own module so the browser code and the
 * build-time worker share it without the browser importing `node:crypto`.
 */
export const SPLASH_ICON = '/icons/icon-192.png'
