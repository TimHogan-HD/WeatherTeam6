import { useEffect, useState } from 'react'
import { colorsV2 } from '@weatherteam6/design/tokens'
import { SPLASH_ICON } from '../theme/splashIcon.js'

/**
 * The longest the list's opening splash stays up. The cards' weather took
 * ~250–650 ms per request on the live API (2026-10-01); a second covers that
 * and a slow start without the app seeming to hang. Past it the list draws with
 * its grey placeholders, as it did before.
 */
export const SPLASH_MAX_MS = 1_000

/** Set once the splash has lifted, so it is never shown again in this page load. */
let lifted = false

/**
 * Whether the opening splash is still up: until `ready`, or `SPLASH_MAX_MS`
 * after the list first mounts, whichever comes first — **and only on the
 * app's first load.** Coming back to the list later draws it straight away,
 * even if a card is refetching; the splash is for a cold open, where the list
 * would otherwise draw every card as a grey bar for half a second (owner,
 * 2026-10-01).
 */
export function useOpeningSplash(ready: boolean): boolean {
  const [timedOut, setTimedOut] = useState(false)
  const up = !lifted && !ready && !timedOut
  useEffect(() => {
    if (!up) {
      lifted = true
      return
    }
    const timer = setTimeout(() => setTimedOut(true), SPLASH_MAX_MS)
    return () => clearTimeout(timer)
  }, [up])
  return up
}

/**
 * The app's icon on the app's background — what Android's own launch screen
 * draws from the manifest — so the hand-off from the phone's splash to this one
 * shows no seam. Above the bottom bar (`TabBar`'s 10), so nothing half-drawn
 * shows around it.
 */
export function Splash() {
  return (
    <div
      role="status"
      aria-label="Loading your crags"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20,
        backgroundColor: colorsV2.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <img src={SPLASH_ICON} alt="" width={96} height={96} />
    </div>
  )
}
