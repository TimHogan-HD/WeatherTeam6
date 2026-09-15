import { type } from '../theme/tokens.css.js'
import { formatUpdatedAt } from '../lib/format.js'
import { useNow } from '../hooks/useNow.js'

/**
 * §5's stale/offline treatment. React Query keeps serving cached data when a
 * refetch fails, so the screen says how old what it is showing is rather than
 * blanking.
 *
 * `updatedAt` is React Query's `dataUpdatedAt` — 0 while nothing has loaded.
 */
export function UpdatedAt({ updatedAt }: { updatedAt: number }) {
  const text = formatUpdatedAt(updatedAt, useNow())
  if (text === null) return null
  return <p style={type.sourceBadge}>{text}</p>
}
