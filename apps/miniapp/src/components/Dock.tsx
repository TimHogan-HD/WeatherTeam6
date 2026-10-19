import { useRef } from 'react'
import { colors, colorsV2, glass, radius, spacing } from '@weatherteam6/design/tokens'
import { typeV2, withOpacity } from '../theme/tokens.css.js'
import { bareButton } from '../theme/styles.js'
import { glassDock } from '../theme/glass.js'
import type { HeaderTab } from './DetailHeader.js'
import { SelectionIndicator, useSelectedRect } from './SelectionIndicator.js'

export type DockTabs<T extends string> = {
  options: readonly HeaderTab<T>[]
  active: T
  onChange: (tab: T) => void
  /** The id each tab points `aria-controls` at. */
  panelId: string
}

/**
 * A crag's tabs in a floating glass dock at the bottom of the screen, within
 * thumb reach (hybrid look, owner 2026-10-19). It rises into place as the app
 * bar slides away (`TabBar`'s `away`), a beat behind it, and leaves with the
 * screen.
 *
 * One pill slides to the chosen tab (`SelectionIndicator`) and is the
 * tablist's last child; in static markup, before it is measured, the chosen
 * tab draws its own. Each tab is at least 40px tall to tap.
 */
export function Dock<T extends string>({ tabs }: { tabs: DockTabs<T> }) {
  const rowRef = useRef<HTMLDivElement>(null)
  const rect = useSelectedRect(rowRef, '[aria-selected="true"]', tabs.active)
  return (
    <div
      className="wt6-dock-rise"
      style={{
        position: 'fixed',
        left: `${spacing.listGap}px`,
        right: `${spacing.listGap}px`,
        bottom: `calc(${glass.dockLift}px + env(safe-area-inset-bottom, 0px))`,
        zIndex: 10,
        display: 'flex',
        justifyContent: 'center',
        // The strip either side of the dock is not part of it: taps there reach the page.
        pointerEvents: 'none',
      }}
    >
      <div
        ref={rowRef}
        role="tablist"
        aria-label="Location detail"
        style={{
          ...glassDock,
          position: 'relative',
          display: 'flex',
          padding: `${spacing.tight}px`,
          maxWidth: '100%',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          pointerEvents: 'auto',
        }}
      >
        {tabs.options.map((option) => {
          const selected = option.value === tabs.active
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={selected}
              {...(selected ? { 'aria-controls': tabs.panelId } : {})}
              onClick={() => tabs.onChange(option.value)}
              style={{
                ...bareButton,
                ...typeV2.tab,
                // `background`, not `backgroundColor`: `bareButton` sets the shorthand, and React
                // warns when a longhand beside it comes and goes as the pill is measured.
                background: selected && rect === null ? PILL_FILL : 'none',
                boxShadow: selected && rect === null ? PILL_RING : 'none',
                position: 'relative',
                zIndex: 1,
                width: 'auto',
                flexShrink: 0,
                minHeight: `${spacing.cellPad * 4}px`,
                padding: `0 ${spacing.cellPad}px`,
                borderRadius: `${radius.full}px`,
                whiteSpace: 'nowrap',
                color: selected ? colorsV2.txt1 : colorsV2.txtTab,
              }}
            >
              {option.label}
            </button>
          )
        })}
        <SelectionIndicator
          rect={rect}
          style={{
            backgroundColor: PILL_FILL,
            boxShadow: PILL_RING,
            top: `${spacing.tight}px`,
            bottom: `${spacing.tight}px`,
            borderRadius: `${radius.full}px`,
          }}
        />
      </div>
    </div>
  )
}

/** The app bar's lit pill, so a chosen tab reads the same in both bars. */
const PILL_FILL = withOpacity(colors.good, 0.1)
const PILL_RING = `inset 0 0 0 1px ${withOpacity(colors.good, 0.3)}`
