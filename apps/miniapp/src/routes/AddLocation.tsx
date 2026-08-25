import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBackButton } from '../telegram/useBackButton.js'
import { ScreenScaffold } from './ScreenScaffold.js'

/**
 * `/add` — back goes to the list (§2).
 *
 * Task 6 adds the preview step *within* this route, and its back target is
 * `/add` with the query and results intact — not `/`. `useBackButton` takes the
 * action rather than a destination so that stays expressible.
 */
export function AddLocation() {
  const navigate = useNavigate()

  useBackButton(useCallback(() => void navigate('/'), [navigate]))

  return <ScreenScaffold title="Add a location" subtitle="Screen lands in Task 6." />
}
