import { spacing } from '@weatherteam6/design/tokens'
import { type } from '../theme/tokens.css.js'
import { row, sourceBadge } from '../theme/styles.js'

/**
 * Required by the locked rule "always quote data sources by name".
 *
 * **Nothing here may be hardcoded**, because two of the three vary per request:
 * the forecast model is whatever `model_sources` says actually ran, and the
 * rainfall source depends on whether the location has an `asos_station`.
 * Naming a source that never ran is a false attribution, which is the precise
 * thing the rule exists to prevent — so the caller computes these from the
 * response and passes them in.
 *
 * A source is omitted rather than guessed when its value is unknown.
 */
export function SourcesFooter({ sources }: { sources: readonly string[] }) {
  const named = sources.filter((s) => s !== '')
  if (named.length === 0) return null

  return (
    <footer style={{ ...row(spacing.chipGap), flexWrap: 'wrap', marginTop: `${spacing.sectionTop}px` }}>
      <span style={type.label}>Sources</span>
      {named.map((source) => (
        <span key={source} style={{ ...sourceBadge, ...type.sourceBadge }}>
          {source}
        </span>
      ))}
    </footer>
  )
}
