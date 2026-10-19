import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, cardV2, row, stack } from '../theme/styles.js'
import { useAccount } from '../hooks/useAccount.js'
import { useAllFeedback, useResolveFeedback } from '../hooks/useFeedback.js'
import { feedbackLines } from '../lib/feedback.js'
import { InlineError } from './States.js'

/**
 * Profile's card of every account's open feedback, for the owner alone
 * (`GET /me`'s `can_read_all_feedback`; the API refuses anyone else) — the
 * in-app copy of `npm run feedback -- list` (owner, 2026-10-19). "Done" marks
 * an item acted on and it leaves the list, as `feedback -- resolve` does.
 */
export function EveryonesFeedbackCard() {
  const account = useAccount()
  if (account.data?.can_read_all_feedback !== true) return null
  return <EveryonesFeedback />
}

/** Split out so the 403-for-anyone-else query mounts only for the owner. */
function EveryonesFeedback() {
  const list = useAllFeedback()
  const resolve = useResolveFeedback()

  return (
    <section style={{ ...cardV2, ...stack(spacing.listGapLg) }}>
      <div style={stack(spacing.micro)}>
        <h2 style={typeV2.cardTitle}>Everyone’s feedback</h2>
        <p style={{ ...typeV2.note, color: colorsV2.txtMuted }}>
          {list.isSuccess
            ? list.data.length === 0
              ? 'Nothing open.'
              : `${list.data.length} open, newest first.`
            : 'Open feedback from every account.'}
        </p>
      </div>

      {list.isPending ? null : list.isError ? (
        <InlineError message="Couldn’t load the feedback." onRetry={() => void list.refetch()} />
      ) : (
        <ul style={{ ...stack(spacing.listGapLg), listStyle: 'none', margin: 0, padding: 0 }}>
          {list.data.map((item) => {
            const { head, verdict, appSaid } = feedbackLines(item, item.username ?? 'Unnamed account')
            const resolving = resolve.isPending && resolve.variables === item.id
            return (
              <li key={item.id} style={stack(spacing.micro)}>
                <span style={{ ...typeV2.note, color: colorsV2.txtMuted }}>{head}</span>
                {verdict === null ? null : <span style={{ ...typeV2.controlValue, color: colorsV2.txt1 }}>{verdict}</span>}
                {appSaid === null ? null : <span style={{ ...typeV2.note, color: colorsV2.txtMuted }}>{appSaid}</span>}
                {item.message === null ? null : (
                  <p style={{ ...typeV2.controlValue, color: colorsV2.txt1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {item.message}
                  </p>
                )}
                <div style={row(spacing.cellPad)}>
                  <button
                    type="button"
                    disabled={resolving}
                    onClick={() => resolve.mutate(item.id)}
                    style={{ ...bareButton, ...typeV2.cardLink, width: 'auto', padding: `${spacing.micro}px 0`, opacity: resolving ? 0.5 : 1 }}
                  >
                    {resolving ? 'Marking…' : 'Done'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {resolve.isError ? <InlineError message="Couldn’t mark that done. Try again." /> : null}
    </section>
  )
}
