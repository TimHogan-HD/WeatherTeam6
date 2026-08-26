import { useEffect, useRef } from 'react'
import { getWebApp } from './webApp.js'

/**
 * Telegram's `BackButton` is the app's only back affordance — an in-app back
 * arrow alongside it is a bug (miniapp-design-v1.md §2).
 *
 * Where it goes is per-route, not a blanket "navigate to `/`": pressing back
 * from the §12 preview must return to `/add` with the query and results intact,
 * and jumping to the list from there would discard the search the user just ran.
 * So this hook takes the action rather than a destination.
 *
 * Pass `null` to hide the button. Only the location list does that.
 */
export function useBackButton(onBack: (() => void) | null): void {
  // The handler is read through a ref so a caller passing an inline arrow does
  // not re-register with Telegram on every render. Kept in sync in its own
  // effect — writing a ref during render is not allowed.
  const handler = useRef(onBack)

  useEffect(() => {
    handler.current = onBack
  }, [onBack])

  const visible = onBack !== null

  useEffect(() => {
    const webApp = getWebApp()
    if (webApp === null) return

    const { BackButton } = webApp

    if (!visible) {
      BackButton.hide()
      return
    }

    const click = (): void => handler.current?.()
    BackButton.onClick(click)
    BackButton.show()

    return () => {
      BackButton.offClick(click)
      BackButton.hide()
    }
  }, [visible])
}
