import { useBackButton } from '../telegram/useBackButton.js'
import { ScreenScaffold } from './ScreenScaffold.js'

/** `/` — the root. Telegram's own chrome closes the app from here (§2). */
export function LocationList() {
  useBackButton(null)

  return <ScreenScaffold title="Locations" subtitle="Screen lands in Task 6." />
}
