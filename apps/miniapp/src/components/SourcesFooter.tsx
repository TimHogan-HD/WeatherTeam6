import { spacing } from '@weatherteam6/design/tokens'
import { typeV2 } from '../theme/tokens.css.js'
import { stack } from '../theme/styles.js'

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

  // One line of names under a heading, as the v2 frames set it: the badges it
  // replaced wrapped into a ragged block on a phone.
  return (
    <footer style={{ ...stack(spacing.tight), marginTop: `${spacing.sectionTop}px` }}>
      <span style={typeV2.footerLabel}>Sources</span>
      <p style={typeV2.note}>{named.join(' · ')}</p>
    </footer>
  )
}
