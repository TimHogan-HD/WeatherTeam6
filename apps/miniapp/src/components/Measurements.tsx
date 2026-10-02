import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { colorsV2, motion, spacing } from '@weatherteam6/design/tokens'
import {
  HELD_BACK_LABEL,
  MEASUREMENTS_LABEL,
  measurements,
  type MeasurementGroup,
  type MeasurementsInput,
  type ReadingField,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, row, stack } from '../theme/styles.js'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js'
import { ChevronDownIcon } from './Icons.js'
import { LabelledFigure } from './LabelledFigure.js'
import { SCORE_EXPLAINER_PATH } from './ScoreExplainer.js'

/**
 * **What the gauges above were read off**, behind a control the reader opens:
 * what is holding the score down, then as tiles the figures the card does not
 * already print (gusts, the past hour's rain, the rock temperature and its
 * dew-point margin), each group named with the model that produced it. Kept
 * short on the owner's word (2026-10-01); the full explanation is on Profile.
 *
 * Every decision about *what* appears is `measurements()` in `packages/types`,
 * where it is tested; this is only the renderer. The Mini App's tests have no
 * DOM, so a rule that lived here, behind a click, would be reachable by nothing.
 *
 * **Collapsed by default, and that is the owner's design rather than a space
 * saving.** The gauges were made terse on 2026-09-21 because fluent copy read as
 * fact; five more figures and three sentences open under them would undo that.
 * Opening the panel is the reader asking for the working.
 *
 * **The panel is always in the markup and `hidden` when closed**, rather than
 * mounted on open. `aria-controls` then always points at an element that exists,
 * and the static-markup tests can see what the panel says without a click.
 * Its layout style is applied **only while open**: an inline `display` beats the
 * user-agent's `[hidden] { display: none }`, and a flex panel with `hidden` on it
 * would simply stay visible.
 *
 * **It grows open and shrinks shut** (owner, 2026-10-01) on a
 * `grid-template-rows: 0fr → 1fr` transition, which Safari supports where a
 * `height: auto` transition is Chromium-only. It closes faster than it opens,
 * and takes `hidden` only once it has finished closing.
 */

/**
 * The model behind the figures: once when every group shares it, else
 * `Air: Open-Meteo · HRRR · Rock: Open-Meteo · GFS`. A group whose source is
 * unknown names nothing, never the other group's model.
 */
function sourceLine(groups: readonly MeasurementGroup[], shared: string | null): string {
  if (shared !== null) return shared
  return groups
    .filter((g) => g.source !== null)
    .map((g) => `${g.label}: ${g.source}`)
    .join(' · ')
}

/** `Heat · air above your 60°F high`, one line per penalty, most limiting first. */
function HeldBack({ fields }: { fields: ReadingField[] }) {
  return (
    <div style={stack(spacing.listGapSm)}>
      <span style={{ ...typeV2.kicker, color: colorsV2.txtMuted }}>{HELD_BACK_LABEL}</span>
      {fields.map((f) => (
        <p key={f.label} style={{ ...typeV2.note, color: colorsV2.txtMuted }}>
          <span style={{ color: colorsV2.txt1 }}>{f.label}</span> · {f.value}
        </p>
      ))}
    </div>
  )
}

/**
 * `lead` sits on the control's line, left of it — the hero's caveats, which
 * would otherwise take a line of their own. It renders even when there is no
 * control.
 *
 * `heldBack` is `ReadingsSummary.heldBack`, already suppressed with the score.
 * It opens the panel because it answers the question a reader opens it with:
 * why this number (issue #218).
 */
export function Measurements({
  lead = null,
  heldBack = null,
  tileSurface,
  ...input
}: MeasurementsInput & { lead?: ReactNode; heldBack?: ReadingField[] | null; tileSurface?: CSSProperties }) {
  const [open, setOpen] = useState(false)
  // Closed and done closing: only then does the panel take `hidden`, so it can
  // shrink out of view first.
  const [collapsed, setCollapsed] = useState(true)
  const reduced = usePrefersReducedMotion()
  const panelId = useId()
  const { groups, sharedSource, notes } = measurements(input)

  // Nothing measured and nothing to explain: no control at all. A disclosure
  // that opens onto an empty panel is a promise the screen cannot keep.
  if (groups.length === 0 && notes.length === 0) return lead

  const toggle = () => {
    if (!open) setCollapsed(false)
    else if (reduced) setCollapsed(true)
    setOpen(!open)
  }
  const ms = open ? motion.disclosureOpenMs : motion.disclosureCloseMs
  const ease = `${ms}ms ${motion.easeOut}`

  return (
    <div>
      <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between', alignItems: 'center' }}>
        {lead}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          style={{
            ...bareButton,
            ...row(spacing.chipGap),
            width: 'auto',
            flex: '0 0 auto',
            paddingTop: `${spacing.listGapSm}px`,
            paddingBottom: `${spacing.listGapSm}px`,
          }}
        >
          <span style={typeV2.disclosure}>{MEASUREMENTS_LABEL}</span>
          <ChevronDownIcon color={colorsV2.txt2} open={open} />
        </button>
      </div>

      <div
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && !open) setCollapsed(true)
        }}
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          opacity: open ? 1 : 0,
          transition: reduced ? 'none' : `grid-template-rows ${ease}, opacity ${ease}`,
        }}
      >
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
      <div
        id={panelId}
        hidden={collapsed}
        style={collapsed ? {} : { ...stack(spacing.cellPad), paddingTop: `${spacing.listGapSm}px` }}
      >
        {heldBack === null ? null : <HeldBack fields={heldBack} />}
        {/* The figures as tiles, like the card's own. Each label says whose
            figure it is, and the line below names each group's model. */}
        {groups.length === 0 ? null : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${spacing.chipGapMd}px` }}>
            {groups.flatMap((g) =>
              g.fields.map((f) => (
                <LabelledFigure
                  key={f.label}
                  value={f.value}
                  label={f.label}
                  color={colorsV2.txt1}
                  labelColor={colorsV2.txtMuted}
                  {...(tileSurface === undefined ? {} : { surface: tileSurface })}
                />
              )),
            )}
          </div>
        )}

        {/* One small paragraph: each note is a one-line fragment, and the long
            explanation lives on Profile behind the link below. */}
        {notes.length === 0 ? null : <p style={{ ...typeV2.note, color: colorsV2.txtMuted }}>{notes.join(' ')}</p>}

        <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span style={typeV2.note}>{sourceLine(groups, sharedSource)}</span>
          <Link to={SCORE_EXPLAINER_PATH} style={{ ...typeV2.note, color: colorsV2.txt1 }}>
            How the score works ›
          </Link>
        </div>
      </div>
        </div>
      </div>
    </div>
  )
}
