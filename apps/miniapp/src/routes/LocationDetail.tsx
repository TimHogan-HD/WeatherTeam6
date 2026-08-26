import { useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useBackButton } from '../telegram/useBackButton.js'
import { ScreenScaffold } from './ScreenScaffold.js'

/** `/location/:id` — back goes to the list (§2). */
export function LocationDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  useBackButton(useCallback(() => void navigate('/'), [navigate]))

  return <ScreenScaffold title="Location" subtitle={`Screen lands in Task 6. Route id: ${id ?? '—'}`} />
}
