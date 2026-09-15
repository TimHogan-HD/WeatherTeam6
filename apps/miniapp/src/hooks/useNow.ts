import { useEffect, useState } from 'react'

const TICK_MS = 30_000

/**
 * A clock that re-renders on a tick.
 *
 * Reading `Date.now()` during render is impure — and here it would also be
 * wrong: an age label would freeze at whatever it was when the screen last
 * re-rendered for some other reason, and then quietly disagree with reality for
 * as long as the screen stayed open.
 *
 * Shared by the stale-data line and the hourly charts' run age, which measure
 * different things but both have to keep counting.
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  return now
}
