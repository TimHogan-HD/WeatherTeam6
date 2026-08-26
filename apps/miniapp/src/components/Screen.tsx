import type { ReactNode } from 'react'
import { spacing } from '@weatherteam6/design/tokens'
import { layout, type } from '../theme/tokens.css.js'

type ScreenProps = {
  title: string
  /** Optional right-hand action in the title row, e.g. the list's add affordance. */
  action?: ReactNode
  children: ReactNode
}

/**
 * The screen frame. Horizontal gutter, top safe area and bottom inset are the
 * locked layout constants and come from `spacing`, never from a local number.
 *
 * `#root` already carries Telegram's safe-area insets, so `topSafe` here is the
 * design's own clearance stacked on top of the device's — which is what §Design
 * System specifies.
 */
export function Screen({ title, action, children }: ScreenProps) {
  return (
    <main
      style={{
        ...layout.body,
        paddingTop: `${spacing.topSafe}px`,
        paddingBottom: `${spacing.bottomInset}px`,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: `${spacing.inlineGap}px`,
        }}
      >
        <h1 style={type.screenTitle}>{title}</h1>
        {action}
      </div>
      {children}
    </main>
  )
}
