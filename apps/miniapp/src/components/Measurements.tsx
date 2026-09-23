import { useId, useState } from 'react'
import { colors, spacing } from '@weatherteam6/design/tokens'
import {
  MEASUREMENTS_LABEL,
  measurements,
  type MeasurementGroup,
  type MeasurementsInput,
} from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { bareButton, row, stack } from '../theme/styles.js'
import { ChevronDownIcon } from './Icons.js'

/**
 * **What the gauges above were read off**, behind a control the reader opens —
 * the air temperature, humidity, dew point, wind and rain of the hour covering
 * now, and the rock temperature and dew-point margin the readings were derived
 * from, each named with the model that produced it.
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
 */

/** One labelled figure, label left and value right — the drying card's shape. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...row(spacing.chipGapMd), justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <span style={{ ...type.labelSm, color: colors.txt5 }}>{label}</span>
      <span style={{ ...type.calDay, color: colors.txt1 }}>{value}</span>
    </div>
  )
}

function Group({ group, showSource }: { group: MeasurementGroup; showSource: boolean }) {
  return (
    <div style={stack(spacing.listGapSm)}>
      <div style={{ ...row(spacing.chipGapMd), justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span style={type.label}>{group.label}</span>
        {/*
          Named here only when the groups do not share one. When a group's
          source is unknown it names nothing — never the other group's model.
        */}
        {showSource && group.source !== null ? (
          <span style={type.sourceBadge}>{group.source}</span>
        ) : null}
      </div>
      {group.fields.map((f) => (
        <Field key={f.label} label={f.label} value={f.value} />
      ))}
    </div>
  )
}

export function Measurements(props: MeasurementsInput) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const { groups, sharedSource, notes } = measurements(props)

  // Nothing measured and nothing to explain: no control at all. A disclosure
  // that opens onto an empty panel is a promise the screen cannot keep.
  if (groups.length === 0 && notes.length === 0) return null

  return (
    <div style={stack(spacing.listGapSm)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        style={{
          ...bareButton,
          ...row(spacing.chipGap),
          paddingTop: `${spacing.listGapSm}px`,
          paddingBottom: `${spacing.listGapSm}px`,
        }}
      >
        <span style={type.label}>{MEASUREMENTS_LABEL}</span>
        <ChevronDownIcon open={open} />
      </button>

      <div id={panelId} hidden={!open} style={open ? stack(spacing.cellPad) : {}}>
        {groups.map((g) => (
          <Group key={g.label} group={g} showSource={sharedSource === null} />
        ))}

        {notes.length === 0 ? null : (
          <div style={stack(spacing.listGapSm)}>
            {notes.map((n) => (
              <p key={n} style={type.bodySm}>
                {n}
              </p>
            ))}
          </div>
        )}

        {sharedSource === null ? null : <span style={type.sourceBadge}>{sharedSource}</span>}
      </div>
    </div>
  )
}
