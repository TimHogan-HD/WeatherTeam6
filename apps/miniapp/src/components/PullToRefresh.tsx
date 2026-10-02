import { useCallback, type ReactNode } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { colorsV2, motion, spacing } from '@weatherteam6/design/tokens'
import { typeV2 } from '../theme/tokens.css.js'
import { stack } from '../theme/styles.js'
import { usePullToRefresh } from '../hooks/usePullToRefresh.js'
import { pullDisplacement, pullMessage, type PullPhase } from '../lib/pullToRefresh.js'

/**
 * Pull a screen down to refetch every query on it (owner, 2026-10-01): the
 * Conditions list and a location's forecast tabs. Its parent must be
 * `position: relative`; the panel the pull uncovers sits above `children`,
 * which move down with the finger. `freshness` is what the panel says about
 * the data's age, worded by the screen. With `enabled` false the screen
 * scrolls and bounces as the browser's own.
 */
export function PullToRefresh({
  enabled = true,
  freshness,
  children,
}: {
  enabled?: boolean
  freshness: string | null
  children: ReactNode
}) {
  const queryClient = useQueryClient()
  const refresh = useCallback(() => refreshQueries(queryClient), [queryClient])
  const pull = usePullToRefresh(refresh, enabled)
  const shift = pullDisplacement(pull)
  const settle = pull.kind === 'pulling' ? 'none' : `${motion.pullReturnMs}ms ${motion.drawer}`

  return (
    <>
      <PullPanel phase={pull} shift={shift} freshness={freshness} settle={settle} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          transform: shift === 0 ? 'none' : `translateY(${shift}px)`,
          transition: settle === 'none' ? 'none' : `transform ${settle}`,
        }}
      >
        {children}
      </div>
    </>
  )
}

/**
 * What a pull uncovers: what the pull will do, and how fresh the data is. It
 * is the header band's colour and sits under the status bar like the band, so
 * a pull reads as the band stretching.
 */
function PullPanel({
  phase,
  shift,
  freshness,
  settle,
}: {
  phase: PullPhase
  shift: number
  freshness: string | null
  settle: string
}) {
  const message = pullMessage(phase)
  return (
    <div
      aria-live="polite"
      style={{
        ...stack(spacing.micro),
        position: 'absolute',
        top: 'calc(-1 * env(safe-area-inset-top, 0px))',
        left: 0,
        right: 0,
        height: `calc(env(safe-area-inset-top, 0px) + ${shift}px)`,
        overflow: 'hidden',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: shift === 0 ? 0 : `${spacing.listGap}px`,
        backgroundColor: colorsV2.surface,
        transition: settle === 'none' ? 'none' : `height ${settle}`,
      }}
    >
      {message === null ? null : <p style={{ ...typeV2.meta, color: colorsV2.txt1 }}>{message}</p>}
      {message === null || freshness === null ? null : <p style={typeV2.meta}>{freshness}</p>}
    </div>
  )
}

/**
 * Refetches every query on screen and says whether all of them answered. A
 * failed refetch keeps its last data, so the screen stays drawn either way.
 */
async function refreshQueries(queryClient: QueryClient): Promise<boolean> {
  await queryClient.refetchQueries({ type: 'active' })
  return !queryClient
    .getQueryCache()
    .findAll({ type: 'active' })
    .some((q) => q.state.status === 'error')
}
