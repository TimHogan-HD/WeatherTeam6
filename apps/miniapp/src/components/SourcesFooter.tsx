import { Fragment, useId, useState } from 'react'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, row, stack } from '../theme/styles.js'
import { ChevronDownIcon } from './Icons.js'

/** What a source was used for, and who it was. A null `value` is a source that did not run. */
export type SourceEntry = { label: string; value: string | null }

/**
 * Required by the locked rule "always quote data sources by name".
 *
 * **Nothing here may be hardcoded**, because most sources vary per request:
 * the forecast models are whatever `model_sources` says actually ran, and the
 * precipitation feed is named only once it answered.
 * Naming a source that never ran is a false attribution, which is the precise
 * thing the rule exists to prevent — so the caller computes these from the
 * response and passes them in.
 *
 * A source is omitted rather than guessed when its value is unknown.
 *
 * **Collapsed to one line by default** (owner, 2026-09-30: the open list took
 * too much of every tab). The rows are still in the markup, `hidden` until
 * opened, for the same reasons `Measurements` keeps its panel mounted.
 */
export function SourcesFooter({ sources }: { sources: readonly SourceEntry[] }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const named = sources.filter(
    (s): s is { label: string; value: string } => s.value !== null && s.value !== '',
  )
  if (named.length === 0) return null

  return (
    <footer style={{ ...stack(spacing.tight), marginTop: `${spacing.tight}px` }}>
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
        <span style={typeV2.footerLabel}>Sources</span>
        <ChevronDownIcon color={colorsV2.txtMuted} open={open} />
      </button>
      {/* One row per use, so a reader can find what a figure came from. */}
      <dl
        id={panelId}
        hidden={!open}
        style={
          open
            ? {
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                columnGap: `${spacing.cellPad}px`,
                rowGap: `${spacing.tight}px`,
              }
            : {}
        }
      >
        {named.map((s) => (
          <Fragment key={s.label}>
            <dt style={typeV2.note}>{s.label}</dt>
            <dd style={{ ...typeV2.note, color: colorsV2.txt2 }}>{s.value}</dd>
          </Fragment>
        ))}
      </dl>
    </footer>
  )
}
