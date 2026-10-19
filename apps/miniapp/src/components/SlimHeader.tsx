import { colors, colorsV2, spacing } from '@weatherteam6/design/tokens'
import { EM_DASH } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { row, stack } from '../theme/styles.js'
import { glassHeader } from '../theme/glass.js'
import { FLIP_ATTR } from '../lib/flip.js'
import { scoreTone } from '../lib/locationList.js'
import type { SlimFigure } from '../lib/slimHeader.js'
import { BackLink } from './DetailHeader.js'
import { FeedbackButton } from './FeedbackButton.js'

const TONE_INK = { good: colors.good, fair: colors.fair, poor: colors.poor } as const

function figureColour(f: SlimFigure): string {
  if (f.value === null) return colorsV2.txtMuted
  if (f.tone === 'score') return TONE_INK[scoreTone(f.value)]
  return f.tone === 'rain' ? colorsV2.rain : colorsV2.txt1
}

/**
 * The header on every crag tab but Overview (hybrid look, owner 2026-10-19):
 * back and Feedback, the crag's name, and the tab's key figure (`slimFigure`),
 * frosted and stuck to the top as the tab scrolls under it. The Overview's day
 * score flies into the figure as the reader leaves it.
 *
 * `tab` keys the line and the figure, so they arrive afresh when the tab
 * under them changes rather than swapping in place.
 */
export function SlimHeader({
  name,
  figure,
  tab,
  back,
  feedbackLocationId,
}: {
  name: string | null
  figure: SlimFigure
  tab: string
  back: { label: string; onBack: () => void }
  feedbackLocationId: string | null
}) {
  return (
    <header
      style={{
        ...glassHeader,
        ...stack(spacing.tight),
        position: 'sticky',
        top: 0,
        zIndex: 5,
        marginTop: 'calc(-1 * env(safe-area-inset-top, 0px))',
        paddingTop: `calc(env(safe-area-inset-top, 0px) + ${spacing.topWeb}px)`,
        paddingInline: `${spacing.screenH}px`,
        paddingBottom: `${spacing.cellPad}px`,
      }}
    >
      <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between' }}>
        <BackLink onBack={back.onBack} label={back.label} />
        <FeedbackButton locationId={feedbackLocationId} />
      </div>
      <div style={{ ...row(spacing.listGapLg), justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ ...stack(spacing.micro), flex: '1 1 auto', minWidth: 0 }}>
          {name === null ? null : (
            <h1 style={{ ...typeV2.slimName, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </h1>
          )}
          {figure.line === null ? null : (
            <p key={tab} className="wt6-header-swap" style={{ ...typeV2.note, color: colorsV2.txt2 }}>
              {figure.line}
            </p>
          )}
        </div>
        <div key={tab} className="wt6-header-swap" style={{ ...stack(0), alignItems: 'flex-end', flex: 'none' }}>
          <span {...{ [FLIP_ATTR]: 'score' }} style={{ ...typeV2.slimFigure, color: figureColour(figure), display: 'inline-block' }}>
            {figure.value === null ? EM_DASH : `${figure.value}${figure.unit ?? ''}`}
          </span>
          <span style={typeV2.slimFigureLabel}>{figure.label}</span>
        </div>
      </div>
    </header>
  )
}
