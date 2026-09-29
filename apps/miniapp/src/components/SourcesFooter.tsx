import { Fragment } from 'react'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import { typeV2 } from '../theme/tokens.css.js'
import { stack } from '../theme/styles.js'

/** What a source was used for, and who it was. A null `value` is a source that did not run. */
export type SourceEntry = { label: string; value: string | null }

/**
 * Required by the locked rule "always quote data sources by name".
 *
 * **Nothing here may be hardcoded**, because most sources vary per request:
 * the forecast models are whatever `model_sources` says actually ran, and the
 * rainfall source depends on whether the location has an `asos_station`.
 * Naming a source that never ran is a false attribution, which is the precise
 * thing the rule exists to prevent — so the caller computes these from the
 * response and passes them in.
 *
 * A source is omitted rather than guessed when its value is unknown.
 */
export function SourcesFooter({ sources }: { sources: readonly SourceEntry[] }) {
  const named = sources.filter(
    (s): s is { label: string; value: string } => s.value !== null && s.value !== '',
  )
  if (named.length === 0) return null

  // One row per use, so a reader can find what a figure came from. The single
  // run-on line it replaced wrapped into an unreadable block on a phone.
  return (
    <footer style={{ ...stack(spacing.tight), marginTop: `${spacing.sectionTop}px` }}>
      <span style={typeV2.footerLabel}>Sources</span>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          columnGap: `${spacing.cellPad}px`,
          rowGap: `${spacing.tight}px`,
        }}
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
