import { useCallback, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useNavigate } from '../hooks/useNavigate.js'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import {
  FEEDBACK_KIND_LABEL,
  FEEDBACK_KINDS,
  FEEDBACK_MESSAGE_MAX,
  FORECAST_VERDICT_LABEL,
  FORECAST_VERDICTS,
  OBSERVED_CONDITIONS,
  OBSERVED_CONDITIONS_LABEL,
  feedbackSnapshotFor,
  fieldLine,
  type CreateFeedbackInput,
  type Feedback as FeedbackRow,
  type FeedbackKind,
  type ForecastVerdict,
  type ObservedConditions,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { brandButton, cardV2, choicePill, fieldV2, quietButton, row, stack } from '../theme/styles.js'
import { backTarget } from '../lib/backTarget.js'
import { feedbackLines, fromLocalInputValue, shownReading, toLocalInputValue } from '../lib/feedback.js'
import { severeAlertEvent } from '../lib/forecast.js'
import { useLocations } from '../hooks/useLocations.js'
import { useNow } from '../hooks/useNow.js'
import { useAlerts, useConditions } from '../hooks/useWeather.js'
import { useCreateFeedback, useFeedbackList, useResolveFeedback } from '../hooks/useFeedback.js'
import { Screen } from '../components/Screen.js'
import { Sect } from '../components/charts/liquid.js'
import { InlineError, SkeletonCards } from '../components/States.js'

/**
 * `/feedback` — two forms and the reader's own history.
 *
 * - **Forecast check**: at a crag, say what the rock was actually like and
 *   whether the app agreed. The app's own reading for that hour is attached
 *   automatically — *what the screen said* beside *what the climber saw* — and
 *   only when it describes the hour being reported (`feedbackSnapshotFor`).
 * - **App feedback**: free text about the app.
 *
 * `?location=<id>` preselects the crag, opens on the check, and sends back to
 * that crag rather than to the list.
 */
export function Feedback() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fromLocationId = params.get('location')
  // A prefilled app note, e.g. the save screen's "Wrong rock type?".
  const initialMessage = params.get('message') ?? ''

  const [kind, setKind] = useState<FeedbackKind>(fromLocationId === null ? 'app' : 'forecast')
  const [saved, setSaved] = useState<FeedbackKind | null>(null)

  const onBack = useCallback(() => {
    void navigate(backTarget({ route: 'feedback', fromLocationId }).to)
  }, [navigate, fromLocationId])

  return (
    <Screen title="Feedback" onBack={onBack}>
      <div style={{ ...stack(spacing.listGapLg), paddingTop: `${spacing.sectionTop}px` }}>
        <div role="group" aria-label="Kind of feedback" style={{ ...row(spacing.listGapSm), flexWrap: 'wrap' }}>
          {FEEDBACK_KINDS.map((k) => (
            <Choice key={k} active={kind === k} onClick={() => { setKind(k); setSaved(null) }}>
              {FEEDBACK_KIND_LABEL[k]}
            </Choice>
          ))}
        </div>

        {saved === null ? null : (
          <p role="status" style={{ ...typeV2.body, color: colorsV2.goodInk }}>
            {FEEDBACK_KIND_LABEL[saved]} saved.
          </p>
        )}

        {kind === 'forecast' ? (
          <ForecastCheckForm initialLocationId={fromLocationId} onSaved={() => setSaved('forecast')} />
        ) : (
          <AppFeedbackForm initialMessage={initialMessage} onSaved={() => setSaved('app')} />
        )}

        <History />
      </div>
    </Screen>
  )
}

function ForecastCheckForm({
  initialLocationId,
  onSaved,
}: {
  initialLocationId: string | null
  onSaved: () => void
}) {
  const locations = useLocations()
  const crags = (locations.data ?? []).filter((l) => l.is_climbing_location)

  const [picked, setPicked] = useState<string | null>(initialLocationId)
  // A picked id that is not one of the reader's crags — a stale link, a
  // deleted crag — falls back to the first crag rather than posting a 404.
  const locationId = crags.some((c) => c.id === picked) ? picked : (crags[0]?.id ?? null)

  const now = useNow()
  const [when, setWhen] = useState(() => toLocalInputValue(Date.now()))
  const [observed, setObserved] = useState<ObservedConditions | null>(null)
  const [verdict, setVerdict] = useState<ForecastVerdict | null>(null)
  const [message, setMessage] = useState('')

  const conditions = useConditions(locationId ?? undefined, locationId === null ? undefined : true)
  const alerts = useAlerts(locationId ?? undefined)
  const create = useCreateFeedback()

  const observedMs = fromLocalInputValue(when)
  // The snapshot waits for the alerts query as the card does: an unsettled
  // alerts query reads as "no alert", and the score would be recorded as shown
  // when the card would have withheld it (defect class 7).
  const readingSettled = !conditions.isPending && !alerts.isPending
  const snapshot =
    observedMs === null || !readingSettled
      ? null
      : feedbackSnapshotFor(shownReading(conditions.data, severeAlertEvent(alerts.data)), observedMs)

  const ready =
    locationId !== null && observedMs !== null && observed !== null && verdict !== null && readingSettled

  const submit = () => {
    if (!ready) return
    const input: CreateFeedbackInput = {
      kind: 'forecast',
      location_id: locationId,
      observed_at: new Date(observedMs).toISOString(),
      observed_conditions: observed,
      verdict,
      message: message.trim() === '' ? null : message,
      app_readings: snapshot,
    }
    create.mutate(input, {
      onSuccess: () => {
        setObserved(null)
        setVerdict(null)
        setMessage('')
        onSaved()
      },
    })
  }

  if (locations.isPending) return <SkeletonCards count={1} height={240} />
  if (locations.isError) {
    return <InlineError message="Couldn't load your locations." onRetry={() => void locations.refetch()} />
  }
  if (crags.length === 0) {
    return <p style={{ ...typeV2.body, color: colorsV2.txt1 }}>Add a crag first.</p>
  }

  return (
    <section style={{ ...cardV2, ...stack(spacing.sectionGap) }}>
      <Field label="Crag">
        <select value={locationId ?? ''} onChange={(e) => setPicked(e.target.value)} style={fieldV2} aria-label="Crag">
          {crags.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="When you saw it">
        <input
          type="datetime-local"
          value={when}
          max={toLocalInputValue(now)}
          onChange={(e) => setWhen(e.target.value)}
          style={fieldV2}
          aria-label="When you saw it"
        />
      </Field>

      <Field label="The rock was">
        <div role="group" aria-label="The rock was" style={{ ...row(spacing.listGapSm), flexWrap: 'wrap' }}>
          {OBSERVED_CONDITIONS.map((c) => (
            <Choice key={c} active={observed === c} onClick={() => setObserved(c)}>
              {OBSERVED_CONDITIONS_LABEL[c]}
            </Choice>
          ))}
        </div>
      </Field>

      <Field label="The app said">
        {!readingSettled ? (
          <span style={typeV2.body}>Loading the app’s reading…</span>
        ) : conditions.isError ? (
          // A failed fetch is not "the app had no reading" — say which it was.
          <span style={typeV2.body}>Couldn’t load the app’s reading. You can still save.</span>
        ) : snapshot === null ? (
          <span style={typeV2.body}>No app reading for that hour. You can still save.</span>
        ) : (
          <span style={{ ...typeV2.body, fontSize: '15px', color: colorsV2.txt1 }}>
            {snapshot.fields.map(fieldLine).join(' · ')}
          </span>
        )}
      </Field>

      <Field label="Did it match?">
        <div role="group" aria-label="Did it match?" style={{ ...row(spacing.listGapSm), flexWrap: 'wrap' }}>
          {FORECAST_VERDICTS.map((v) => (
            <Choice key={v} active={verdict === v} onClick={() => setVerdict(v)}>
              {FORECAST_VERDICT_LABEL[v]}
            </Choice>
          ))}
        </div>
      </Field>

      <MessageField label="Notes (optional)" value={message} onChange={setMessage} />

      {create.isError ? <InlineError message="Couldn't save this check." /> : null}
      <SubmitButton disabled={!ready || create.isPending} pending={create.isPending} onClick={submit}>
        Save check
      </SubmitButton>
    </section>
  )
}

function AppFeedbackForm({ initialMessage, onSaved }: { initialMessage: string; onSaved: () => void }) {
  const [message, setMessage] = useState(initialMessage)
  const create = useCreateFeedback()
  const ready = message.trim() !== ''

  const submit = () => {
    if (!ready) return
    create.mutate({ kind: 'app', message }, { onSuccess: () => { setMessage(''); onSaved() } })
  }

  return (
    <section style={{ ...cardV2, ...stack(spacing.listGapLg) }}>
      <MessageField label="What’s working, what isn’t" value={message} onChange={setMessage} />
      {create.isError ? <InlineError message="Couldn't send this feedback." /> : null}
      <SubmitButton disabled={!ready || create.isPending} pending={create.isPending} onClick={submit}>
        Send feedback
      </SubmitButton>
    </section>
  )
}

/**
 * The reader's open feedback, one glass card of items. "Done" marks an item
 * acted on and it leaves the list.
 */
function History() {
  const list = useFeedbackList()
  const resolve = useResolveFeedback()
  if (list.isPending) return <SkeletonCards count={2} height={80} />
  if (list.isError) return <InlineError message="Couldn't load your feedback." onRetry={() => void list.refetch()} />
  if (list.data.length === 0) return null
  return (
    <section style={{ ...cardV2, ...stack(spacing.listGapLg) }} aria-label="Open feedback">
      <Sect title="Open feedback" aside={`${list.data.length} open`} />
      {resolve.isError ? <InlineError message="Couldn't mark that done." /> : null}
      {list.data.map((f, i) => (
        <div key={f.id} style={i === 0 ? undefined : { borderTop: `1px solid ${colorsV2.line}`, paddingTop: `${spacing.listGapLg}px` }}>
          <HistoryItem
            item={f}
            resolving={resolve.isPending && resolve.variables === f.id}
            onResolve={() => resolve.mutate(f.id)}
          />
        </div>
      ))}
    </section>
  )
}

export function HistoryItem({
  item,
  resolving = false,
  onResolve,
}: {
  item: FeedbackRow
  resolving?: boolean
  onResolve?: () => void
}) {
  const { head, verdict, appSaid } = feedbackLines(item)

  return (
    <article style={stack(spacing.micro)}>
      <span style={typeV2.note}>{head}</span>
      {verdict === null ? null : <span style={{ ...typeV2.body, fontSize: '15px', color: colorsV2.txt1 }}>{verdict}</span>}
      {appSaid === null ? null : <span style={typeV2.note}>{appSaid}</span>}
      {item.message === null ? null : (
        <p style={{ ...typeV2.body, fontSize: '15px', color: colorsV2.txt1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {item.message}
        </p>
      )}
      {onResolve === undefined ? null : (
        <button
          type="button"
          disabled={resolving}
          onClick={onResolve}
          style={{ ...quietButton, alignSelf: 'flex-start', marginTop: `${spacing.tight}px`, opacity: resolving ? 0.5 : 1 }}
        >
          {resolving ? 'Marking…' : 'Done'}
        </button>
      )}
    </article>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={stack(spacing.tight)}>
      <span style={typeV2.statLabel}>{label}</span>
      {children}
    </div>
  )
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} style={{ ...choicePill(active), ...typeV2.dayPick }}>
      {children}
    </button>
  )
}

function MessageField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label style={stack(spacing.tight)}>
      <span style={typeV2.statLabel}>{label}</span>
      <textarea
        value={value}
        maxLength={FEEDBACK_MESSAGE_MAX}
        rows={4}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...fieldV2, resize: 'vertical' }}
      />
    </label>
  )
}

function SubmitButton({
  disabled,
  pending,
  onClick,
  children,
}: {
  disabled: boolean
  pending: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{ ...brandButton, width: '100%', opacity: disabled ? 0.5 : 1 }}
    >
      {pending ? 'Saving…' : children}
    </button>
  )
}
