import type { ReactNode } from 'react'
import { colors, spacing } from '@weatherteam6/design/tokens'
import { layout, type } from '../theme/tokens.css.js'
import { bareButton, row } from '../theme/styles.js'
import { ChevronLeftIcon } from './Icons.js'

type ScreenProps = {
  title: string
  /**
   * The back affordance. Omitted on the list, which is the root — see
   * `lib/backTarget.ts` for where each screen's back goes and why `undefined`
   * here is not the same as "navigate to `/`".
   */
  onBack?: () => void
  /** Optional right-hand action in the title row, e.g. the list's add affordance. */
  action?: ReactNode
  children: ReactNode
}

/**
 * The screen frame. Horizontal gutter, top safe area and bottom inset are the
 * locked layout constants and come from `spacing`, never from a local number.
 *
 * `#root` already carries the device's safe-area insets, so `topSafe` here is
 * the design's own clearance stacked on top of them — which is what §Design
 * System specifies.
 */
export function Screen({ title, onBack, action, children }: ScreenProps) {
  return (
    <main
      style={{
        ...layout.body,
        paddingTop: `${spacing.topSafe}px`,
        paddingBottom: `${spacing.bottomInset}px`,
      }}
    >
      {onBack === undefined ? null : <BackControl onBack={onBack} />}
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

/**
 * Its own row above the title rather than inside it. The title row is baseline
 * aligned, and an icon baseline-aligned against a display-size `<h1>` sits
 * visibly low; more importantly the row is already the add affordance's home
 * and a control on each side of a long location name wraps at 360px.
 *
 * The horizontal padding is negative so the glyph lines up with the screen
 * gutter while the tap target still extends past it — a 18px chevron alone is
 * well under the 44px minimum, and padding is the only way to reach it without
 * drawing a box the mockups do not have.
 */
function BackControl({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      style={{
        ...bareButton,
        ...row(spacing.tight),
        width: 'auto',
        alignSelf: 'flex-start',
        marginLeft: `-${spacing.cellPad}px`,
        paddingLeft: `${spacing.cellPad}px`,
        paddingRight: `${spacing.cellPad}px`,
        paddingTop: `${spacing.cellPad}px`,
        paddingBottom: `${spacing.cellPad}px`,
        marginTop: `-${spacing.cellPad}px`,
      }}
    >
      <ChevronLeftIcon color={colors.txt2} />
      <span style={{ ...type.label, color: colors.txt2 }}>Back</span>
    </button>
  )
}
