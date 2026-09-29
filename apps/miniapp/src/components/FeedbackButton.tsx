import { useNavigate } from 'react-router-dom'
import { colors, radius, spacing } from '@weatherteam6/design/tokens'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton } from '../theme/styles.js'

/**
 * The way in to `/feedback`, in the top-right of every signed-in screen so it
 * is found wherever the reader notices something. From a crag it carries the
 * crag, so the forecast check opens with it chosen and back returns to it.
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
        border: `1px solid ${colors.good}`,
        borderRadius: `${radius.full}px`,
        padding: `${spacing.listGap}px ${spacing.cardPadSm}px`,
      }}
    >
      <span style={{ ...typeV2.controlValue, color: colors.good }}>Feedback</span>
    </button>
  )
}
