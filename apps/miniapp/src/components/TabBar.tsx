import { useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { bottomNav, colors, colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import { typeV2, withOpacity } from '../theme/tokens.css.js'
import { navGeometry, type SectionKey } from '../lib/bottomNav.js'
import { NavIcon } from './Icons.js'

/**
 * The app's five sections, fixed to the bottom of the screen (owner,
 * 2026-09-30; the clickable prototype is the "Bottom tab bar options" canvas).
 *
 * Unlit tabs are icons; the lit one carries its name in a lime pill. **One pill
 * slides between tabs** rather than each tab painting its own: its leading edge
 * leaves first and its trailing edge follows a beat later with a slight
 * overshoot, so the pill reads as pulled across to the next tab. Under
 * `prefers-reduced-motion` it moves without animating. This is the one
 * animation the design system authorises (`design-system-v1.md` § Non-goals).
 *
 * Links, not tabs: each one changes the URL, and `role="tab"` belongs to the
 * location screen's own row. The lit one is `aria-current="page"`. Tapping it
 * again goes to its section's first screen — from inside a location, the lit
 * Conditions tab is the way back to the list, which is why that screen has no
 * back link of its own.
 */
export function TabBar({ active }: { active: SectionKey }) {
  const rowRef = useRef<HTMLDivElement>(null)
  const rowWidth = useWidth(rowRef)
  const reduced = usePrefersReducedMotion()

  // The pill's direction of travel decides which edge leads, so the bar
  // remembers the tab it last lit.
  const index = bottomNav.tabs.findIndex((t) => t.key === active)
  const [travel, setTravel] = useState({ index, rightward: true })
  if (travel.index !== index) setTravel({ index, rightward: index > travel.index })
  const rightward = travel.index === index ? travel.rightward : index > travel.index

  const geometry = rowWidth === null ? null : navGeometry(rowWidth, active)
  const lead = rightward ? 'right' : 'left'
  const trail = rightward ? 'left' : 'right'
  const motion = (css: string) => (reduced ? 'none' : css)

  return (
    <nav
      aria-label="Main"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10,
        backgroundColor: withOpacity(colorsV2.surface, 0.97),
        borderTop: `1px solid ${colorsV2.line}`,
        paddingTop: `${bottomNav.padTop}px`,
        paddingBottom: `calc(${bottomNav.padBottom}px + env(safe-area-inset-bottom, 0px))`,
        paddingLeft: `calc(${spacing.cellPad}px + env(safe-area-inset-left, 0px))`,
        paddingRight: `calc(${spacing.cellPad}px + env(safe-area-inset-right, 0px))`,
      }}
    >
      <div
        ref={rowRef}
        style={{ position: 'relative', display: 'flex', gap: `${bottomNav.gap}px`, height: `${bottomNav.pillH}px` }}
      >
        {geometry === null ? null : (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${geometry.pill.left}px`,
              right: `${geometry.pill.right}px`,
              borderRadius: `${radius.full}px`,
              backgroundColor: withOpacity(colors.good, 0.1),
              border: `1px solid ${withOpacity(colors.good, 0.3)}`,
              boxSizing: 'border-box',
              pointerEvents: 'none',
              transition: motion(`${lead} 0.32s ${PULL}, ${trail} 0.46s ${PULL} 0.07s`),
            }}
          />
        )}
        {bottomNav.tabs.map((tab, i) => {
          const lit = tab.key === active
          return (
            <Link
              key={tab.key}
              to={tab.route}
              aria-label={tab.label}
              {...(lit ? { 'aria-current': 'page' as const } : {})}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: geometry === null ? '1 1 0' : `0 0 ${geometry.widths[i] ?? 0}px`,
                minWidth: 0,
                borderRadius: `${radius.full}px`,
                textDecoration: 'none',
                color: lit ? colors.good : colorsV2.txtTab,
                transition: motion(`flex-basis 0.46s ${PULL}, color 0.25s ease`),
              }}
            >
              <NavIcon name={tab.icon} />
              <span
                aria-hidden
                style={{
                  ...typeV2.navLabel,
                  display: 'inline-block',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  marginLeft: lit ? `${spacing.inlineGap}px` : 0,
                  maxWidth: lit ? `${tab.pillW}px` : 0,
                  opacity: lit ? 1 : 0,
                  transition: motion(
                    `max-width 0.4s ${PULL}, margin-left 0.4s ${PULL}, opacity 0.22s ease ${lit ? '0.14s' : '0s'}`,
                  ),
                }}
              >
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

/** Overshoots slightly and settles — the "pull". */
const PULL = 'cubic-bezier(.3,1.25,.45,1)'

/**
 * The row's width in CSS px, measured before first paint and on every resize.
 * `null` until then — and always under `renderToStaticMarkup`, where the tabs
 * fall back to equal flex slots and no pill.
 */
function useWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return
    setWidth(el.clientWidth)
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return width
}

const REDUCED = '(prefers-reduced-motion: reduce)'

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCED)
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    () => window.matchMedia(REDUCED).matches,
    () => false,
  )
}
