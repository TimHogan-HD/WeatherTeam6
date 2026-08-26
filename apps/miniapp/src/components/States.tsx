import type { ReactNode } from 'react'
import { colors, radius, spacing } from '@weatherteam6/design/tokens'
import { type } from '../theme/tokens.css.js'
import { bareButton, card, stack } from '../theme/styles.js'

/**
 * Loading, error and empty treatments, per miniapp-design-v1.md §5.
 *
 * Live scoring is slow — a measured `/conditions/:id` took about four seconds,
 * because the request makes three upstream fetches and a detail screen loading
 * conditions and forecast together makes six. Four seconds of spinner reads as
 * broken; a skeleton at the real final dimensions reads as loading. There is no
 * blocking full-screen loader anywhere in this app.
 */

export function Skeleton({ height }: { height: number }) {
  return (
    <div
      aria-hidden
      style={{
        height: `${height}px`,
        backgroundColor: colors.card,
        borderRadius: `${radius.card}px`,
      }}
    />
  )
}

export function SkeletonCards({ count, height }: { count: number; height: number }) {
  return (
    <div style={stack(spacing.listGap)}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={height} />
      ))}
    </div>
  )
}

/**
 * Errors are inline within the section that failed, never a whole-screen
 * takeover: the list must still render its locations when one card's
 * conditions call fails, and a detail screen must still show weather when
 * alerts fail.
 *
 * The message is fixed copy. An HTTP status or a raw error string is never
 * surfaced — `ApiError` carries those for logs only.
 */
export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const text = onRetry === undefined ? message : `${message} Tap to retry.`

  if (onRetry === undefined) {
    return <p style={type.bodyMd}>{text}</p>
  }
  return (
    <button type="button" style={{ ...bareButton, ...type.bodyMd }} onClick={onRetry}>
      {text}
    </button>
  )
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div style={{ ...card, ...stack(spacing.sectionTop), marginTop: `${spacing.sectionTop}px` }}>
      <p style={type.bodyMd}>{title}</p>
      {action}
    </div>
  )
}
