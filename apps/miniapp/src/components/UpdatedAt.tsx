import { useEffect, useState } from 'react'
import { type } from '../theme/tokens.css.js'
import { formatUpdatedAt } from '../lib/format.js'

const TICK_MS = 30_000

/**
 * A clock that re-renders on a tick. Reading `Date.now()` during render is
 * impure — and here it would also be wrong: the label would freeze at whatever
 * the age was when the list last re-rendered and then quietly disagree with
 * reality for as long as the screen stayed open.
 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  return now
}

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
