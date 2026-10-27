import { useCallback, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useNavigate } from '../hooks/useNavigate.js'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import {
  FEEDBACK_KIND_LABEL,
  FEEDBACK_KINDS,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_PLACE_TEXT_MAX,
  FORECAST_VERDICT_LABEL,
  FORECAST_VERDICTS,
  OBSERVED_CONDITIONS,
  OBSERVED_CONDITIONS_LABEL,
  SUN_EXPOSURE_LABEL,
  SUN_EXPOSURES,
  feedbackSnapshotFor,
  fieldLine,
  type CreateFeedbackInput,
  type Feedback as FeedbackRow,
  type FeedbackKind,
  type ForecastVerdict,
  type ObservedConditions,
  type SunExposure,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { brandButton, cardV2, choicePill, fieldV2, quietButton, row, stack } from '../theme/styles.js'
import { backTarget } from '../lib/backTarget.js'
import { feedbackLines, fromLocalInputValue, shownReading, toLocalInputValue, untilFromTimeValue, untilProblem } from '../lib/feedback.js'
import { severeAlertEvent } from '../lib/forecast.js'
import { useGuidebook } from '../hooks/useGuidebook.js'
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

/** The area select's value for "not in the guidebook" — not a uuid, so never sent as one. */
const OTHER_AREA = 'other'

const blankToNull = (s: string): string | null => (s.trim() === '' ? null : s.trim())

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
  const [untilTime, setUntilTime] = useState('')
  const [observed, setObserved] = useState<ObservedConditions | null>(null)
  const [verdict, setVerdict] = useState<ForecastVerdict | null>(null)
  const [message, setMessage] = useState('')
  // `areaPick` is a guidebook area id, OTHER_AREA for a typed one, or '' for not said.
  const [areaPick, setAreaPick] = useState('')
  const [areaText, setAreaText] = useState('')
  const [wall, setWall] = useState('')
  const [sun, setSun] = useState<SunExposure | null>(null)

  const conditions = useConditions(locationId ?? undefined, locationId === null ? undefined : true)
  const alerts = useAlerts(locationId ?? undefined)
  const guidebook = useGuidebook(locationId ?? undefined, locationId === null ? undefined : true)
  const create = useCreateFeedback()

  // A failed or empty guidebook is a typed area, not a missing field.
  const areas = guidebook.data?.walls ?? []
  const pickedArea = areas.find((a) => a.id === areaPick) ?? null
  const typedArea = areas.length === 0 || areaPick === OTHER_AREA

  const observedMs = fromLocalInputValue(when)
  const untilMs = observedMs === null ? null : untilFromTimeValue(observedMs, untilTime)
  // Refused here, on the field, rather than saved as "no end time" or sent
  // to a 400 that the screen can only call a failed save.
  const untilError = untilProblem(observedMs, untilTime, now)
  const untilInvalid = untilError !== null
  // The snapshot waits for the alerts query as the card does: an unsettled
  // alerts query reads as "no alert", and the score would be recorded as shown
  // when the card would have withheld it (defect class 7).
  const readingSettled = !conditions.isPending && !alerts.isPending
  const snapshot =
    observedMs === null || !readingSettled
      ? null
      : feedbackSnapshotFor(shownReading(conditions.data, severeAlertEvent(alerts.data)), observedMs, untilMs)

  const ready =
    locationId !== null &&
    observedMs !== null &&
    !untilInvalid &&
    observed !== null &&
    verdict !== null &&
    readingSettled

  const pickCrag = (id: string) => {
    setPicked(id)
    setAreaPick('')
    setAreaText('')
    setWall('')
  }

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
      area_id: typedArea ? null : (pickedArea?.id ?? null),
      area_name: typedArea ? blankToNull(areaText) : (pickedArea?.name ?? null),
      wall: blankToNull(wall),
      observed_until: untilMs === null ? null : new Date(untilMs).toISOString(),
      sun_exposure: sun,
    }
    create.mutate(input, {
      onSuccess: () => {
        setObserved(null)
        setVerdict(null)
        setMessage('')
        setUntilTime('')
        setSun(null)
        // Area and wall stay: a second check from the same day is usually the same spot.
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
        <select value={locationId ?? ''} onChange={(e) => pickCrag(e.target.value)} style={fieldV2} aria-label="Crag">
          {crags.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Area (optional)">
        {/* Held until the guidebook settles: a box typed into while it loads
            would be swapped for the list and its text dropped. */}
        {guidebook.isPending ? (
          <span style={typeV2.body}>Loading the crag’s areas…</span>
        ) : areas.length === 0 ? null : (
          <select value={areaPick} onChange={(e) => setAreaPick(e.target.value)} style={fieldV2} aria-label="Area">
            <option value="">Pick an area</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            <option value={OTHER_AREA}>Somewhere else</option>
          </select>
        )}
        {typedArea && !guidebook.isPending ? (
          <input
            type="text"
            value={areaText}
            maxLength={FEEDBACK_PLACE_TEXT_MAX}
            onChange={(e) => setAreaText(e.target.value)}
            placeholder="e.g. Cyclops Area"
            style={fieldV2}
            aria-label={areas.length === 0 ? 'Area' : 'Area name'}
          />
        ) : null}
      </Field>

      <Field label="Wall or route (optional)">
        <input
          type="text"
          value={wall}
          maxLength={FEEDBACK_PLACE_TEXT_MAX}
          onChange={(e) => setWall(e.target.value)}
          placeholder="e.g. the left arete"
          style={fieldV2}
          aria-label="Wall or route"
        />
      </Field>

      <Field label="Started climbing">
        <input
          type="datetime-local"
          value={when}
          max={toLocalInputValue(now)}
          onChange={(e) => setWhen(e.target.value)}
          style={fieldV2}
          aria-label="Started climbing"
        />
      </Field>

      <Field label="Finished (optional)">
        <input
          type="time"
          value={untilTime}
          onChange={(e) => setUntilTime(e.target.value)}
          style={fieldV2}
          aria-label="Finished"
        />
        {untilError === null ? null : (
          <span role="alert" style={{ ...typeV2.note, color: colorsV2.poorInk }}>
            {untilError}
          </span>
        )}
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

      <Field label="Sun on the rock (optional)">
        <div role="group" aria-label="Sun on the rock" style={{ ...row(spacing.listGapSm), flexWrap: 'wrap' }}>
          {SUN_EXPOSURES.map((s) => (
            // A second tap clears it: "not said" must stay reachable once picked.
            <Choice key={s} active={sun === s} onClick={() => setSun(sun === s ? null : s)}>
              {SUN_EXPOSURE_LABEL[s]}
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
          <span style={typeV2.body}>No app reading for that time. You can still save.</span>
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
  const { head, verdict, where, appSaid } = feedbackLines(item)

  return (
    <article style={stack(spacing.micro)}>
      <span style={typeV2.note}>{head}</span>
      {verdict === null ? null : <span style={{ ...typeV2.body, fontSize: '15px', color: colorsV2.txt1 }}>{verdict}</span>}
      {where === null ? null : <span style={typeV2.note}>{where}</span>}
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
