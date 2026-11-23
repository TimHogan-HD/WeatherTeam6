import { useNavigate } from '../hooks/useNavigate.js'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton } from '../theme/styles.js'

/**
 * The way in to `/feedback`, in the top-right of every signed-in screen so it
 * is found wherever the reader notices something. From a crag it carries the
 * crag, so the forecast check opens with it chosen and back returns to it.
 *
 * Plain muted text, still 44 px tall: lime is for scores only (owner,
 * 2026-11-23, #644).
 */
export function FeedbackButton({ locationId = null }: { locationId?: string | null }) {
  const navigate = useNavigate()
  const to = locationId === null ? '/feedback' : `/feedback?location=${encodeURIComponent(locationId)}`
  return (
    <button
      type="button"
      onClick={() => void navigate(to)}
      style={{
        ...bareButton,
        width: 'auto',
        flexShrink: 0,
        minHeight: '44px',
        padding: `0 ${spacing.tight}px`,
      }}
    >
      <span style={{ ...typeV2.controlValue, color: colorsV2.txtMuted }}>Feedback</span>
    </button>
  )
}
