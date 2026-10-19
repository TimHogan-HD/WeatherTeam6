import { useLayoutEffect, useRef } from 'react'
import { colorsV2, motion, radius, spacing } from '@weatherteam6/design/tokens'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, row } from '../theme/styles.js'
import { ChevronLeftIcon } from './Icons.js'
import { FeedbackButton } from './FeedbackButton.js'
import { SelectionIndicator, useSelectedRect } from './SelectionIndicator.js'

export type CragChoice = {
  /** The reader's saved places, in the list's order. */
  options: readonly { id: string; name: string }[]
  active: string
  onChange: (id: string) => void
}

/**
 * A crag's top row (owner, 2026-10-19, the hybrid mockup's `toprow`): back,
 * the reader's saved places to switch between, and Feedback — on the
 * Overview's header and on the slim one. Back is the chevron alone, named for
 * a screen reader by where it goes, because the switcher takes the words' room.
 *
 * One aqua underline slides to the chosen place on the spring; the row
 * scrolls sideways when the names outrun it, and keeps the chosen one in view.
 */
export function CragBar({
  back,
  crags,
  feedbackLocationId,
}: {
  back: { label: string; onBack: () => void }
  crags: CragChoice
  feedbackLocationId: string | null
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const rect = useSelectedRect(rowRef, '[aria-pressed="true"]', crags.active)
  // The row's own scroll only: `scrollIntoView` would also scroll the page to the header.
  useLayoutEffect(() => {
    const el = rowRef.current
    const chosen = el?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (el == null || chosen == null) return
    const right = chosen.offsetLeft + chosen.offsetWidth
    if (chosen.offsetLeft < el.scrollLeft) el.scrollLeft = chosen.offsetLeft
    else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth
  }, [crags.active])

  return (
    <div style={{ ...row(spacing.tight), alignItems: 'center' }}>
      <button
        type="button"
        onClick={back.onBack}
        aria-label={`Back to ${back.label}`}
        style={{
          ...bareButton,
          ...row(0),
          width: 'auto',
          flex: 'none',
          justifyContent: 'center',
          minWidth: `${spacing.cellPad * 4}px`,
          minHeight: `${spacing.cellPad * 4}px`,
          marginLeft: `-${spacing.cellPad}px`,
        }}
      >
        <ChevronLeftIcon color={colorsV2.brandInk} />
      </button>
      <div
        ref={rowRef}
        role="group"
        aria-label="Saved places"
        style={{
          ...row(spacing.listGapLg),
          position: 'relative',
          flex: '1 1 auto',
          minWidth: 0,
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
      >
        {crags.options.map((option) => {
          const chosen = option.id === crags.active
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={chosen}
              onClick={() => {
                if (!chosen) crags.onChange(option.id)
              }}
              style={{
                ...bareButton,
                ...typeV2.switcher,
                width: 'auto',
                flexShrink: 0,
                position: 'relative',
                minHeight: `${spacing.cellPad * 4}px`,
                whiteSpace: 'nowrap',
                color: chosen ? colorsV2.txt1 : colorsV2.txtMuted,
                // Before the row is measured, the chosen name draws its own underline.
                boxShadow: chosen && rect === null ? `inset 0 -2px 0 ${colorsV2.brand}` : 'none',
              }}
            >
              {option.name}
            </button>
          )
        })}
        <SelectionIndicator
          rect={rect}
          timing={`${motion.switcherMs}ms ${motion.spring}`}
          style={{ bottom: 0, height: '2px', borderRadius: `${radius.stepBar}px`, backgroundColor: colorsV2.brand }}
        />
      </div>
      <FeedbackButton locationId={feedbackLocationId} />
    </div>
  )
}
