/**
 * Small display helpers with no React in them, kept out of the components so
 * their boundaries can be tested directly.
 */

/**
 * §5's stale/offline line. `updatedAt` is React Query's `dataUpdatedAt`, which
 * is 0 until something has actually loaded — that case renders nothing rather
 * than "Updated 56 years ago".
 */
export function formatUpdatedAt(updatedAt: number, now: number): string | null {
  if (updatedAt === 0) return null

  const minutes = Math.floor((now - updatedAt) / 60_000)
  if (minutes < 1) return 'Updated just now'
  if (minutes < 60) return `Updated ${minutes} min ago`
  return `Updated ${Math.floor(minutes / 60)} h ago`
}
