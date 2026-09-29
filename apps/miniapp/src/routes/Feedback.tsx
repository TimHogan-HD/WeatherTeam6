import { useCallback, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { colors, spacing } from '@weatherteam6/design/tokens'
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
import { type } from '../theme/tokens.css.js'
import { bareButton, btnPrimary, btnPrimaryText, card, chip, chipActive, inputBox, row, stack } from '../theme/styles.js'
import { backTarget } from '../lib/backTarget.js'
import { fromLocalInputValue, shownReading, toLocalInputValue } from '../lib/feedback.js'
import { severeAlertEvent } from '../lib/forecast.js'
import { useLocations } from '../hooks/useLocations.js'
import { useNow } from '../hooks/useNow.js'
import { useAlerts, useConditions } from '../hooks/useWeather.js'
import { useCreateFeedback, useFeedbackList } from '../hooks/useFeedback.js'
import { Screen } from '../components/Screen.js'
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

  const [kind, setKind] = useState<FeedbackKind>(fromLocationId === null ? 'app' : 'forecast')
  const [saved, setSaved] = useState<FeedbackKind | null>(null)

  const onBack = useCallback(() => {
    void navigate(backTarget({ route: 'feedback', fromLocationId }).to)
  }, [navigate, fromLocationId])

  return (
    <Screen title="Report" onBack={onBack}>
      <div style={{ ...stack(spacing.listGapLg), paddingTop: `${spacing.sectionTop}px` }}>
        <div role="group" aria-label="Kind of feedback" style={{ ...row(spacing.chipGap), flexWrap: 'wrap' }}>
          {FEEDBACK_KINDS.map((k) => (
            <Choice key={k} active={kind === k} onClick={() => { setKind(k); setSaved(null) }}>
              {FEEDBACK_KIND_LABEL[k]}
            </Choice>
          ))}
        </div>

        {saved === null ? null : (
          <p role="status" style={{ ...type.bodySm, color: colors.good }}>
            {FEEDBACK_KIND_LABEL[saved]} saved.
          </p>
        )}

        {kind === 'forecast' ? (
          <ForecastCheckForm initialLocationId={fromLocationId} onSaved={() => setSaved('forecast')} />
        ) : (
          <AppFeedbackForm onSaved={() => setSaved('app')} />
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
    return <p style={type.bodyMd}>Save a climbing location first — a forecast check is about a crag.</p>
  }

  return (
    <section style={{ ...card, ...stack(spacing.listGap) }}>
      <Field label="Crag">
        <select
          value={locationId ?? ''}
          onChange={(e) => setPicked(e.target.value)}
          style={{ ...inputBox, ...type.calDay, width: '100%' }}
          aria-label="Crag"
        >
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
          style={{ ...inputBox, ...type.calDay, width: '100%' }}
          aria-label="When you saw it"
        />
      </Field>

      <Field label="The rock was">
        <div role="group" aria-label="The rock was" style={{ ...row(spacing.chipGap), flexWrap: 'wrap' }}>
          {OBSERVED_CONDITIONS.map((c) => (
            <Choice key={c} active={observed === c} onClick={() => setObserved(c)}>
              {OBSERVED_CONDITIONS_LABEL[c]}
            </Choice>
          ))}
        </div>
      </Field>

      <Field label="The app said">
        {!readingSettled ? (
          <span style={{ ...type.bodySm, color: colors.txt3 }}>Loading the app’s reading…</span>
        ) : conditions.isError ? (
          // A failed fetch is not "the app had no reading" — say which it was.
          <span style={{ ...type.bodySm, color: colors.txt3 }}>
            Couldn’t load the app’s reading — the check is saved without one.
          </span>
        ) : snapshot === null ? (
          <span style={{ ...type.bodySm, color: colors.txt3 }}>
            No reading for that hour — the check is saved without one.
          </span>
        ) : (
          <span style={type.bodyMd}>{snapshot.fields.map(fieldLine).join(' · ')}</span>
        )}
      </Field>

      <Field label="Did it match?">
        <div role="group" aria-label="Did it match?" style={{ ...row(spacing.chipGap), flexWrap: 'wrap' }}>
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

function AppFeedbackForm({ onSaved }: { onSaved: () => void }) {
  const [message, setMessage] = useState('')
  const create = useCreateFeedback()
  const ready = message.trim() !== ''

  const submit = () => {
    if (!ready) return
    create.mutate({ kind: 'app', message }, { onSuccess: () => { setMessage(''); onSaved() } })
  }

  return (
    <section style={{ ...card, ...stack(spacing.listGap) }}>
      <MessageField label="What’s working, what isn’t" value={message} onChange={setMessage} />
      {create.isError ? <InlineError message="Couldn't send this feedback." /> : null}
      <SubmitButton disabled={!ready || create.isPending} pending={create.isPending} onClick={submit}>
        Send feedback
      </SubmitButton>
    </section>
  )
}

function History() {
  const list = useFeedbackList()
  if (list.isPending) return <SkeletonCards count={2} height={80} />
  if (list.isError) return <InlineError message="Couldn't load your feedback." onRetry={() => void list.refetch()} />
  if (list.data.length === 0) return null
  return (
    <section style={stack(spacing.listGap)}>
      <h2 style={type.label}>Your feedback</h2>
      {list.data.map((f) => (
        <HistoryItem key={f.id} item={f} />
      ))}
    </section>
  )
}

export function HistoryItem({ item }: { item: FeedbackRow }) {
  const when = new Date(item.observed_at ?? item.created_at)
  const head = [
    FEEDBACK_KIND_LABEL[item.kind],
    item.location_name,
    Number.isFinite(when.getTime())
      ? when.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : null,
  ]
    .filter((p) => p !== null)
    .join(' · ')

  const verdictLine =
    item.kind === 'forecast' && item.observed_conditions !== null && item.verdict !== null
      ? `Rock: ${OBSERVED_CONDITIONS_LABEL[item.observed_conditions]} · Forecast: ${FORECAST_VERDICT_LABEL[item.verdict]}`
      : null

  return (
    <article style={{ ...card, ...stack(spacing.micro) }}>
      <span style={{ ...type.bodySm, color: colors.txt3 }}>{head}</span>
      {verdictLine === null ? null : <span style={type.bodyMd}>{verdictLine}</span>}
      {item.kind !== 'forecast' ? null : (
        <span style={{ ...type.bodySm, color: colors.txt3 }}>
          {item.app_readings === null
            ? 'No app reading attached'
            : `App said: ${item.app_readings.fields.map(fieldLine).join(' · ')}`}
        </span>
      )}
      {item.message === null ? null : <p style={{ ...type.bodyMd, whiteSpace: 'pre-wrap' }}>{item.message}</p>}
    </article>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={stack(spacing.micro)}>
      <span style={type.label}>{label}</span>
      {children}
    </div>
  )
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{ ...bareButton, ...(active ? chipActive : chip), ...type.labelSm, width: 'auto' }}
    >
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
    <label style={stack(spacing.micro)}>
      <span style={type.label}>{label}</span>
      <textarea
        value={value}
        maxLength={FEEDBACK_MESSAGE_MAX}
        rows={4}
        onChange={(e) => onChange(e.target.value)}
        // iOS zooms the page into any focused control under 16px.
        style={{ ...inputBox, ...type.bodyMd, fontSize: '16px', width: '100%', resize: 'vertical' }}
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
      style={{ ...bareButton, ...btnPrimary, ...btnPrimaryText, textAlign: 'center', opacity: disabled ? 0.5 : 1 }}
    >
      {pending ? 'Saving…' : children}
    </button>
  )
}
