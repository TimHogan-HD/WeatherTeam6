import { useCallback, useState, type CSSProperties, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useNavigate } from '../hooks/useNavigate.js'
import { colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import {
  FEEDBACK_KIND_LABEL,
  FEEDBACK_KINDS,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_OBSERVED_MAX_AGE_DAYS,
  FEEDBACK_PLACE_TEXT_MAX,
  FEEDBACK_ROUTES_TEXT_MAX,
  FEEDBACK_STOPS_MAX,
  FORECAST_VERDICT_LABEL,
  FORECAST_VERDICTS,
  OBSERVED_CONDITIONS,
  OBSERVED_CONDITIONS_LABEL,
  SHADE_CAUSE_LABEL,
  SHADE_CAUSES,
  SUN_EXPOSURE_LABEL,
  SUN_EXPOSURE_SHORT_LABEL,
  SUN_EXPOSURES,
  WALL_ANGLE_LABEL,
  WALL_ANGLES,
  WALL_FACING_CHOICES,
  cragRockOf,
  feedbackSnapshotFor,
  fieldLine,
  type CreateFeedbackInput,
  type Feedback as FeedbackRow,
  type FeedbackKind,
  type ForecastVerdict,
  type GuidebookRoute,
  type GuidebookSubWall,
  type GuidebookWall,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, brandButton, cardV2, choicePill, fieldV2, quietButton, row, stack } from '../theme/styles.js'
import { backTarget } from '../lib/backTarget.js'
import {
  CLEARED_PLACE,
  OTHER_AREA,
  draftLine,
  emptyStop,
  feedbackLines,
  missingAnswer,
  pickRoute,
  pickSun,
  pickWall,
  pickedArea,
  routeChoices,
  routeOptionLabel,
  shownReading,
  stopProblem,
  stopsPayload,
  stopsSpan,
  subWallsOf,
  sunWasBlocked,
  toLocalDateValue,
  toLocalTimeValue,
  type StopDraft,
} from '../lib/feedback.js'
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
  const [day, setDay] = useState(() => toLocalDateValue(Date.now()))
  const [stops, setStops] = useState<StopDraft[]>(() => [emptyStop(toLocalTimeValue(Date.now()))])
  // One wall open at a time; the rest fold to a line each.
  const [openStop, setOpenStop] = useState<number | null>(0)
  const [verdict, setVerdict] = useState<ForecastVerdict | null>(null)
  const [message, setMessage] = useState('')
  const [notesOpen, setNotesOpen] = useState(false)
  // The crag's rock is its walls': their word when they agree, Mixed when not.
  const observed = cragRockOf(stops.map((s) => s.rock))

  const conditions = useConditions(locationId ?? undefined, locationId === null ? undefined : true)
  const alerts = useAlerts(locationId ?? undefined)
  const guidebook = useGuidebook(locationId ?? undefined, locationId === null ? undefined : true)
  const create = useCreateFeedback()

  // A failed or empty guidebook is a typed area, not a missing field.
  const areas = guidebook.data?.walls ?? []

  const span = stopsSpan(day, stops)
  // Refused under the row, rather than sent to a 400 the screen can only
  // call a failed save.
  const problems = stops.map((s) => stopProblem(day, s, span?.fromMs ?? null, now))
  // The snapshot waits for the alerts query as the card does: an unsettled
  // alerts query reads as "no alert", and the score would be recorded as shown
  // when the card would have withheld it (defect class 7).
  const readingSettled = !conditions.isPending && !alerts.isPending
  const snapshot =
    span === null || !readingSettled
      ? null
      : feedbackSnapshotFor(shownReading(conditions.data, severeAlertEvent(alerts.data)), span.fromMs, span.untilMs)

  const missing = missingAnswer(stops, verdict)
  const ready =
    locationId !== null &&
    span !== null &&
    problems.every((p) => p === null) &&
    missing === null &&
    observed !== null &&
    verdict !== null &&
    readingSettled

  const setStop = (i: number, patch: Partial<StopDraft>) =>
    setStops((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  // A new stop starts where the last one finished, which is usually true, and opens.
  const addStop = () => {
    setStops((list) => [...list, emptyStop(list[list.length - 1]?.to || toLocalTimeValue(Date.now()))])
    setOpenStop(stops.length)
  }
  const removeStop = (i: number) => {
    setStops((list) => list.filter((_, j) => j !== i))
    setOpenStop((o) => (o === null || o === i ? null : o > i ? o - 1 : o))
  }

  const pickCrag = (id: string) => {
    setPicked(id)
    // Areas, walls, routes and what the wall is like belong to the crag; times, rock and sun do not.
    setStops((list) => list.map((s) => ({ ...s, areaPick: '', areaText: '', ...CLEARED_PLACE })))
  }

  const submit = () => {
    const payload = stopsPayload(day, stops, areas)
    if (!ready || payload === null || observed === null) return
    const input: CreateFeedbackInput = {
      kind: 'forecast',
      location_id: locationId,
      observed_at: new Date(span.fromMs).toISOString(),
      observed_conditions: observed,
      verdict,
      message: message.trim() === '' ? null : message,
      app_readings: snapshot,
      stops: payload,
    }
    create.mutate(input, {
      onSuccess: () => {
        setVerdict(null)
        setMessage('')
        setNotesOpen(false)
        setStops([emptyStop(toLocalTimeValue(Date.now()))])
        setOpenStop(0)
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
    <>
      <section style={{ ...cardV2, ...stack(spacing.sectionGap) }} aria-label="Where you climbed">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: `${spacing.listGapSm}px` }}>
          <Field label="Crag">
            <select value={locationId ?? ''} onChange={(e) => pickCrag(e.target.value)} style={fieldV2} aria-label="Crag">
              {crags.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Day">
            <input
              type="date"
              value={day}
              min={toLocalDateValue(now - FEEDBACK_OBSERVED_MAX_AGE_DAYS * 86_400_000)}
              max={toLocalDateValue(now)}
              onChange={(e) => setDay(e.target.value)}
              style={fieldV2}
              aria-label="Day"
            />
          </Field>
        </div>

        <div style={stack(spacing.listGapSm)}>
          <span style={typeV2.guideRowName}>Where you climbed</span>
          {stops.map((stop, i) => (
            <StopCard
              key={i}
              index={i}
              stop={stop}
              open={openStop === i}
              onToggle={() => setOpenStop(openStop === i ? null : i)}
              problem={problems[i] ?? null}
              areas={areas}
              areasPending={guidebook.isPending}
              onChange={(patch) => setStop(i, patch)}
              onRemove={stops.length === 1 ? undefined : () => removeStop(i)}
            />
          ))}
          {stops.length >= FEEDBACK_STOPS_MAX ? null : (
            <button type="button" onClick={addStop} style={{ ...quietButton, alignSelf: 'stretch' }}>
              Add another wall
            </button>
          )}
        </div>
      </section>

      <section style={{ ...cardV2, ...stack(spacing.sectionGap) }} aria-label="The app’s forecast">
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

        <Question label="Did the app match?">
          <div role="group" aria-label="Did it match?" style={gridOf(3)}>
            {FORECAST_VERDICTS.map((v) => (
              <Choice key={v} fill active={verdict === v} onClick={() => setVerdict(v)}>
                {FORECAST_VERDICT_LABEL[v]}
              </Choice>
            ))}
          </div>
        </Question>

        <Disclosure label="Add a note" open={notesOpen || message !== ''} onToggle={() => setNotesOpen(!notesOpen)}>
          <MessageField label="Notes" value={message} onChange={setMessage} />
        </Disclosure>

        {create.isError ? <InlineError message="Couldn't save this check." /> : null}
        {missing === null ? null : <span style={{ ...typeV2.note, textAlign: 'center' }}>{missing}</span>}
        <SubmitButton disabled={!ready || create.isPending} pending={create.isPending} onClick={submit}>
          Save check
        </SubmitButton>
      </section>
    </>
  )
}

/**
 * One place climbed: area, wall, routes, hours, the rock, the sun and what
 * kept it off, and which way the wall faces and how steep it is. Each is its
 * own observation, so a day that moves walls records each wall's own — the
 * start of a per-wall record of direction and shape (#293), kept in feedback
 * for now.
 *
 * Folded, it is one line; the form keeps one wall open at a time.
 */
function StopCard({
  index,
  stop,
  open,
  onToggle,
  problem,
  areas,
  areasPending,
  onChange,
  onRemove,
}: {
  index: number
  stop: StopDraft
  open: boolean
  onToggle: () => void
  problem: string | null
  areas: readonly GuidebookWall[]
  areasPending: boolean
  onChange: (patch: Partial<StopDraft>) => void
  onRemove: (() => void) | undefined
}) {
  const n = index + 1
  const typedArea = areas.length === 0 || stop.areaPick === OTHER_AREA
  const area = typedArea ? null : pickedArea(stop, areas)
  const walls = area === null ? [] : subWallsOf(area)
  const choices = area === null ? [] : routeChoices(area, stop.wallPick)
  const unpicked = choices.filter((r) => !stop.routePicks.includes(r.id))
  const pickedRoutes = choices.filter((r) => stop.routePicks.includes(r.id))
  // Shut until asked for, but shown open whenever it holds an answer, so nothing said is hidden.
  const [moreOpen, setMoreOpen] = useState(false)
  const bodyId = `wall-${n}-body`
  return (
    <div
      role="group"
      aria-label={`Wall ${n}`}
      style={{
        ...stack(0),
        backgroundColor: colorsV2.raised,
        border: `1px solid ${colorsV2.line}`,
        borderRadius: `${radius.chipMd}px`,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        style={{
          ...bareButton,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: `${spacing.tight}px ${spacing.listGapSm}px`,
          padding: `${spacing.cellPad}px ${spacing.listGapLg}px`,
          textAlign: 'left',
        }}
      >
        <span style={stack(spacing.micro)}>
          <span style={typeV2.guideRowName}>{area?.name ?? (stop.areaText.trim() || `Wall ${n}`)}</span>
          {open ? null : <span style={typeV2.rowSmall}>{draftLine(stop)}</span>}
        </span>
        <Chevron open={open} />
      </button>

      {open ? (
        <div id={bodyId} style={{ ...stack(spacing.listGapLg), padding: `0 ${spacing.listGapLg}px ${spacing.listGapLg}px` }}>
          <WallPlace
            n={n}
            stop={stop}
            area={area}
            areas={areas}
            areasPending={areasPending}
            typedArea={typedArea}
            walls={walls}
            unpicked={unpicked}
            pickedRoutes={pickedRoutes}
            onChange={onChange}
          />

          <Question label="The rock was">
            <div role="group" aria-label={`Rock at wall ${n}`} style={gridOf(4)}>
              {OBSERVED_CONDITIONS.map((c) => (
                <Choice key={c} fill active={stop.rock === c} onClick={() => onChange({ rock: c })}>
                  {OBSERVED_CONDITIONS_LABEL[c]}
                </Choice>
              ))}
            </div>
          </Question>

          <Field label="Sun on the rock">
            <div role="group" aria-label={`Sun on wall ${n}`} style={gridOf(5)}>
              {SUN_EXPOSURES.map((s) => (
                // A second tap clears it: "not said" must stay reachable once picked.
                <Choice
                  key={s}
                  fill
                  active={stop.sun === s}
                  label={SUN_EXPOSURE_LABEL[s]}
                  onClick={() => onChange(pickSun(stop.sun === s ? null : s))}
                >
                  {SUN_EXPOSURE_SHORT_LABEL[s]}
                </Choice>
              ))}
            </div>
          </Field>

          {/* Why it was not in full sun, which the amount alone cannot say:
              trees (#398), the way it faces (#293), the day's cloud, an overhang
              above, or other terrain. */}
          {sunWasBlocked(stop.sun) ? (
            <Field label="What kept the sun off?" hint="Pick any that apply">
              <div role="group" aria-label={`What shaded wall ${n}`} style={gridOf(6)}>
                {SHADE_CAUSES.map((c, i) => (
                  <div key={c} style={{ gridColumn: `span ${i < 3 ? 2 : 3}` }}>
                    <Choice
                      fill
                      active={stop.shadeCauses.includes(c)}
                      onClick={() =>
                        onChange({
                          shadeCauses: stop.shadeCauses.includes(c)
                            ? stop.shadeCauses.filter((x) => x !== c)
                            : SHADE_CAUSES.filter((x) => x === c || stop.shadeCauses.includes(x)),
                        })
                      }
                    >
                      {SHADE_CAUSE_LABEL[c]}
                    </Choice>
                  </div>
                ))}
              </div>
            </Field>
          ) : null}

          <Disclosure
            label="More about this wall"
            open={moreOpen || stop.facing !== null || stop.angle !== null}
            onToggle={() => setMoreOpen(!moreOpen)}
          >
            <Field label="Wall faces">
              <div role="group" aria-label={`Wall ${n} faces`} style={gridOf(4)}>
                {WALL_FACING_CHOICES.map((d) => (
                  <Choice key={d} fill active={stop.facing === d} onClick={() => onChange({ facing: stop.facing === d ? null : d })}>
                    {d}
                  </Choice>
                ))}
              </div>
            </Field>
            <Field label="Wall angle">
              <div role="group" aria-label={`Wall ${n} angle`} style={gridOf(4)}>
                {WALL_ANGLES.map((a) => (
                  <Choice key={a} fill active={stop.angle === a} onClick={() => onChange({ angle: stop.angle === a ? null : a })}>
                    {WALL_ANGLE_LABEL[a]}
                  </Choice>
                ))}
              </div>
            </Field>
          </Disclosure>

          {onRemove === undefined ? null : (
            <button type="button" onClick={onRemove} style={{ ...quietButton, alignSelf: 'flex-start' }} aria-label={`Remove wall ${n}`}>
              Remove this wall
            </button>
          )}
        </div>
      ) : null}

      {problem === null ? null : (
        <span
          role="alert"
          style={{ ...typeV2.note, color: colorsV2.poorInk, padding: `0 ${spacing.listGapLg}px ${spacing.cellPad}px` }}
        >
          {problem}
        </span>
      )}
    </div>
  )
}

/** A wall's area, wall, routes and hours. */
function WallPlace({
  n,
  stop,
  area,
  areas,
  areasPending,
  typedArea,
  walls,
  unpicked,
  pickedRoutes,
  onChange,
}: {
  n: number
  stop: StopDraft
  area: GuidebookWall | null
  areas: readonly GuidebookWall[]
  areasPending: boolean
  typedArea: boolean
  walls: readonly GuidebookSubWall[]
  unpicked: readonly GuidebookRoute[]
  pickedRoutes: readonly GuidebookRoute[]
  onChange: (patch: Partial<StopDraft>) => void
}) {
  return (
    <>
      <Field label="Area">
        {/* Held until the guidebook settles: a box typed into while it loads
            would be swapped for the list and its text dropped. */}
        {areasPending ? (
          <span style={typeV2.body}>Loading the crag’s areas…</span>
        ) : areas.length === 0 ? null : (
          <select
            value={stop.areaPick}
            // A wall, its routes and what it is like belong to their area.
            onChange={(e) => onChange({ areaPick: e.target.value, ...CLEARED_PLACE })}
            style={fieldV2}
            aria-label={`Area ${n}`}
          >
            <option value="">Pick an area</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            <option value={OTHER_AREA}>Somewhere else</option>
          </select>
        )}
        {typedArea && !areasPending ? (
          <input
            type="text"
            value={stop.areaText}
            maxLength={FEEDBACK_PLACE_TEXT_MAX}
            onChange={(e) => onChange({ areaText: e.target.value })}
            placeholder="e.g. Cyclops Area"
            style={fieldV2}
            aria-label={`Area name ${n}`}
          />
        ) : null}
      </Field>

      {/* A picked area with no walls of its own is itself the wall — every
          Red Wing area — so there is nothing to ask. */}
      {area !== null && walls.length === 0 ? null : (
        <Field label="Wall">
          {walls.length === 0 ? null : (
            <select
              value={stop.wallPick}
              onChange={(e) => area !== null && onChange(pickWall(stop, area, e.target.value))}
              style={fieldV2}
              aria-label={`Wall ${n} in the area`}
            >
              <option value="">Pick a wall</option>
              {walls.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
              <option value={OTHER_AREA}>Somewhere else</option>
            </select>
          )}
          {area === null || stop.wallPick === OTHER_AREA ? (
            <input
              type="text"
              value={stop.wall}
              maxLength={FEEDBACK_PLACE_TEXT_MAX}
              onChange={(e) => onChange({ wall: e.target.value })}
              placeholder="e.g. the left side"
              style={fieldV2}
              aria-label={`Wall ${n} name`}
            />
          ) : null}
        </Field>
      )}

      <Field label="Routes">
        {area === null ? null : (
          <>
            {pickedRoutes.length === 0 ? null : (
              <div style={{ ...row(spacing.listGapSm), flexWrap: 'wrap' }}>
                {pickedRoutes.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onChange({ routePicks: stop.routePicks.filter((id) => id !== r.id) })}
                    style={{ ...choicePill(true), ...typeV2.dayPick }}
                    aria-label={`Remove ${r.name}`}
                  >
                    {r.name} ✕
                  </button>
                ))}
              </div>
            )}
            <select
              // Always back on the prompt: each pick adds one route.
              value=""
              onChange={(e) => {
                const v = e.target.value
                if (v === OTHER_AREA) onChange({ routesTyped: true })
                else if (v !== '') onChange(pickRoute(stop, area, v))
              }}
              style={fieldV2}
              aria-label={`Routes ${n}`}
            >
              <option value="">{pickedRoutes.length === 0 ? 'Add a route' : 'Add another route'}</option>
              {unpicked.map((r) => (
                <option key={r.id} value={r.id}>
                  {routeOptionLabel(r)}
                </option>
              ))}
              {stop.routesTyped ? null : <option value={OTHER_AREA}>A route not listed</option>}
            </select>
          </>
        )}
        {area === null || stop.routesTyped ? (
          <input
            type="text"
            value={stop.routes}
            maxLength={FEEDBACK_ROUTES_TEXT_MAX}
            onChange={(e) => onChange({ routes: e.target.value })}
            placeholder={area === null ? 'e.g. Pine Tree, Cyclops' : 'Routes not in the list'}
            style={fieldV2}
            aria-label={area === null ? `Routes ${n}` : `Other routes ${n}`}
          />
        ) : null}
      </Field>

      <div style={{ ...row(spacing.listGapSm), alignItems: 'flex-end' }}>
        <div style={{ ...stack(spacing.tight), flex: '1 1 0', minWidth: 0 }}>
          <span style={typeV2.statLabel}>From</span>
          <input
            type="time"
            value={stop.from}
            onChange={(e) => onChange({ from: e.target.value })}
            style={fieldV2}
            aria-label={`Wall ${n} from`}
          />
        </div>
        <div style={{ ...stack(spacing.tight), flex: '1 1 0', minWidth: 0 }}>
          <span style={typeV2.statLabel}>Until</span>
          <input
            type="time"
            value={stop.to}
            onChange={(e) => onChange({ to: e.target.value })}
            style={fieldV2}
            aria-label={`Wall ${n} to`}
          />
        </div>
      </div>
    </>
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
  const { head, verdict, stops, appSaid } = feedbackLines(item)

  return (
    <article style={stack(spacing.micro)}>
      <span style={typeV2.note}>{head}</span>
      {verdict === null ? null : <span style={{ ...typeV2.body, fontSize: '15px', color: colorsV2.txt1 }}>{verdict}</span>}
      {stops.map((line, i) => (
        <span key={i} style={typeV2.note}>
          {line}
        </span>
      ))}
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

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={stack(spacing.tight)}>
      <span style={{ ...row(spacing.listGapSm), justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={typeV2.statLabel}>{label}</span>
        {hint === undefined ? null : <span style={typeV2.rowSmall}>{hint}</span>}
      </span>
      {children}
    </div>
  )
}

/** A question the check needs answered, set larger than the optional fields around it. */
function Question({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={stack(spacing.listGapSm)}>
      <span style={typeV2.guideRowName}>{label}</span>
      {children}
    </div>
  )
}

/** A quiet "show more" row that opens what it holds beneath it. */
function Disclosure({
  label,
  open,
  onToggle,
  children,
}: {
  label: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div style={stack(spacing.listGapLg)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          ...bareButton,
          ...row(spacing.tight),
          alignItems: 'center',
          alignSelf: 'flex-start',
          width: 'auto',
          ...typeV2.dayPick,
          color: colorsV2.brandInk,
        }}
      >
        <Chevron open={open} />
        {label}
      </button>
      {open ? children : null}
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        color: colorsV2.txtMuted,
        transform: open ? 'rotate(180deg)' : 'none',
        transition: 'transform 160ms ease-out',
      }}
    >
      ⌄
    </span>
  )
}
/** Equal columns gutter to gutter, so a short row of choices is not packed left. */
const gridOf = (columns: number): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
  gap: `${spacing.listGapSm}px`,
})

function Choice({
  active,
  fill = false,
  label,
  onClick,
  children,
}: {
  active: boolean
  /** Fill its grid cell rather than size to the word. */
  fill?: boolean
  /** The full words, when the button shows a short form of them. */
  label?: string
  onClick: () => void
  children: ReactNode
}) {
  const style: CSSProperties = { ...choicePill(active), ...typeV2.dayPick, ...(fill ? { width: '100%', textAlign: 'center' } : {}) }
  return (
    <button type="button" aria-pressed={active} aria-label={label} onClick={onClick} style={style}>
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
