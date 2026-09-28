import type { CSSProperties, ReactNode } from 'react'
import { colorsV2, radius, spacing, toneSurfacesV2 } from '@weatherteam6/design/tokens'
import { SCORE_LABEL } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton } from '../theme/styles.js'
import { scoreTone } from '../lib/locationList.js'

/**
 * One day as a tinted row, from the WT6 Figma "V2" page — the Overview's
 * "Next 3 days" and the Daily tab draw the same row, so a day wears the same
 * colour on both.
 *
 * **The tint is the score's rung (`SCORE_BANDS`) and nothing else**, and a day
 * with no score on screen is the plain raised row: under a Severe+ alert, while
 * alerts load, for a city, and past the readings. A tint with no number beside
 * it would be a verdict nobody can read off.
 */

/** "Score 82", in the rung's own pill. Never rendered for a `null` score. */
export function ScorePill({ score }: { score: number }) {
  const s = toneSurfacesV2[scoreTone(score)]
  return (
    <span
      style={{
        ...typeV2.rowPill,
        flex: '0 0 auto',
        color: s.pillInk,
        backgroundColor: s.pill,
        borderStyle: 'solid',
        borderWidth: '1px',
        borderColor: s.pillLine,
        borderRadius: `${radius.full}px`,
        padding: `${spacing.listGapSm}px ${spacing.listGap}px`,
      }}
    >
      {SCORE_LABEL} {score}
    </span>
  )
}

/** The row's surface: the rung's tint, or the plain raised well when no score is shown. */
export function dayRowSurface(score: number | null): CSSProperties {
  return {
    backgroundColor: score === null ? colorsV2.raised : toneSurfacesV2[scoreTone(score)].row,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderColor: colorsV2.line,
    borderRadius: `${radius.rowV2}px`,
    padding: `${spacing.cellPad}px`,
  }
}

/**
 * The row as a button when it opens a day, a plain box when it does not.
 *
 * **Never a button with an interactive descendant** — a control inside a
 * control is markup the browser reparses. Nothing a row carries is interactive.
 */
export function DayRowShell({
  score,
  onOpen,
  style,
  children,
}: {
  score: number | null
  /** `null` for a day the hourly charts cannot draw, and on the `/add` preview. */
  onOpen: (() => void) | null
  style: CSSProperties
  children: ReactNode
}) {
  const surface = { ...dayRowSurface(score), ...style }
  return onOpen === null ? (
    <div style={surface}>{children}</div>
  ) : (
    <button type="button" onClick={onOpen} style={{ ...bareButton, ...surface }}>
      {children}
    </button>
  )
}
