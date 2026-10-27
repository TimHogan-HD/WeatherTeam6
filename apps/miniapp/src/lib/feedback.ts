import {
  FEEDBACK_CLOCK_SKEW_MS,
  FEEDBACK_KIND_LABEL,
  FEEDBACK_SPAN_MAX_HOURS,
  FORECAST_VERDICT_LABEL,
  OBSERVED_CONDITIONS_LABEL,
  SUN_EXPOSURE_LABEL,
  fieldLine,
  summarizeReadings,
  type Conditions,
  type Feedback,
  type ForecastStop,
  type GuidebookRoute,
  type GuidebookSubWall,
  type GuidebookWall,
  type ReadingField,
  type SunExposure,
} from '@weatherteam6/types'

/**
 * What the Conditions card shows for a crag right now, as the fields a forecast
 * check stores beside the climber's observation.
 *
 * **The same `summarizeReadings` call the card makes**, so the snapshot is the
 * words on screen and nothing else: `Dryness`, `Friction`, and `Score` only
 * when the card would print it — a Severe+ alert drops the number there and
 * drops it here. The day's `Good hours` window is not a reading of now and is
 * left out.
 *
 * `null` when there is nothing to attach: no row, readings absent from an older
 * API, a named unavailable reason, or a run that does not reach this hour.
 * `feedbackSnapshotFor` then decides whether the hour matches the observation.
 */
export function shownReading(
  conditions: Conditions | null | undefined,
  severeAlertEvent: string | null,
): { valid_at: string; model: string | null; fields: ReadingField[] } | null {
  const r = conditions?.readings
  if (r === undefined || r === null || r.now === null || r.unavailable_reason !== null) return null
  const summary = summarizeReadings({
    reading: r.now,
    window: null,
    utcOffsetSeconds: r.utc_offset_seconds,
    severeAlertEvent,
    alertsPending: false,
    unavailableReason: null,
  })
  const fields = summary.scoreField === null ? summary.readings : [...summary.readings, summary.scoreField]
  return { valid_at: r.now.valid_at, model: r.model, fields }
}

const pad = (n: number): string => String(n).padStart(2, '0')

/**
 * A `datetime-local` value for an instant, on **this device's** clock — the
 * input has no zone and the browser reads it back in the device's own. The
 * reader is normally standing at the crag, so the two clocks agree.
 */
export function toLocalInputValue(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** The instant a `datetime-local` value names, or `null` for an empty or invalid one. */
export function fromLocalInputValue(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (m === null) return null
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number]
  const ms = new Date(y, mo - 1, d, h, mi).getTime()
  return Number.isFinite(ms) ? ms : null
}

/** A `date` input's value for an instant, on this device's clock. */
export function toLocalDateValue(ms: number): string {
  return toLocalInputValue(ms).slice(0, 10)
}

/** A `time` input's value for an instant, on this device's clock. */
export function toLocalTimeValue(ms: number): string {
  return toLocalInputValue(ms).slice(11)
}

/**
 * The instant a `date` input's day and a `time` input's `HH:MM` name together,
 * or `null` for an empty or invalid one. A check is one day at the crag, so
 * every stop's times are on the check's day.
 */
export function timeOnDay(day: string, time: string): number | null {
  return fromLocalInputValue(`${day}T${time}`)
}

/**
 * One row of the form's stop list, as typed. `areaPick` is a guidebook area id,
 * `OTHER_AREA` for a typed name, or `''` for not said; `wallPick` the same
 * for a wall inside the picked area. `routePicks` are guidebook route ids;
 * `routes` is typed — every route when the area was typed, otherwise the ones
 * the list did not have, shown once `routesTyped` is set.
 */
export type StopDraft = {
  areaPick: string
  areaText: string
  wallPick: string
  wall: string
  routePicks: string[]
  routesTyped: boolean
  routes: string
  from: string
  to: string
  sun: SunExposure | null
}

/** The area or wall select's value for "not in the guidebook" — not a uuid, so never sent as one. */
export const OTHER_AREA = 'other'

export function emptyStop(from: string): StopDraft {
  return { areaPick: '', areaText: '', wallPick: '', wall: '', routePicks: [], routesTyped: false, routes: '', from, to: '', sun: null }
}

/** The guidebook area a stop picked, or null when it was typed or not said. */
export function pickedArea(stop: StopDraft, areas: readonly GuidebookWall[]): GuidebookWall | null {
  return areas.find((a) => a.id === stop.areaPick) ?? null
}

/** The area's walls. Empty when the area is itself one wall, as every Red Wing area is. */
export function subWallsOf(area: GuidebookWall): GuidebookSubWall[] {
  return area.sub_walls ?? []
}

/**
 * The routes a stop may pick, A–Z: the picked wall's, or the whole area's
 * while no wall is picked or the wall was typed.
 */
export function routeChoices(area: GuidebookWall, wallPick: string): GuidebookRoute[] {
  const wall = subWallsOf(area).find((w) => w.id === wallPick)
  const ids = wall === undefined ? null : new Set(wall.route_ids)
  return area.routes.filter((r) => ids === null || ids.has(r.id)).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * What picking a route changes. With no wall picked yet, the route's own wall
 * is picked for it, so the stop is tied to the wall the route is on.
 */
export function pickRoute(stop: StopDraft, area: GuidebookWall, routeId: string): Partial<StopDraft> {
  const routePicks = stop.routePicks.includes(routeId) ? stop.routePicks : [...stop.routePicks, routeId]
  if (stop.wallPick !== '') return { routePicks }
  const wall = subWallsOf(area).find((w) => w.route_ids.includes(routeId))
  return wall === undefined ? { routePicks } : { routePicks, wallPick: wall.id }
}

/** `Pine Tree 5.9`, `Fat Bob V4`; the name alone when OpenBeta has no grade. */
export function routeOptionLabel(route: GuidebookRoute): string {
  const grade = route.yds ?? route.vscale
  return grade === null ? route.name : `${route.name} ${grade}`
}

/** What picking a wall changes: routes that are not on it are dropped. */
export function pickWall(stop: StopDraft, area: GuidebookWall, wallPick: string): Partial<StopDraft> {
  const on = new Set(routeChoices(area, wallPick).map((r) => r.id))
  return { wallPick, routePicks: stop.routePicks.filter((id) => on.has(id)) }
}

const blankToNull = (s: string): string | null => (s.trim() === '' ? null : s.trim())

/**
 * The earliest start and the latest end (or start) across the stops, or
 * `null` while any start is missing. The check's `observed_at` is the first;
 * the snapshot attaches to a reading anywhere between the two.
 */
export function stopsSpan(day: string, stops: readonly StopDraft[]): { fromMs: number; untilMs: number } | null {
  let fromMs = Number.POSITIVE_INFINITY
  let untilMs = Number.NEGATIVE_INFINITY
  for (const s of stops) {
    const start = timeOnDay(day, s.from)
    if (start === null) return null
    const end = s.to === '' ? null : timeOnDay(day, s.to)
    fromMs = Math.min(fromMs, start)
    untilMs = Math.max(untilMs, end ?? start)
  }
  return stops.length === 0 ? null : { fromMs, untilMs }
}

/**
 * Why a stop would be refused, or `null` — the server's own limits
 * (`parseStops`), said under the row rather than as a failed save.
 * `earliestMs` is the earliest start across every stop.
 */
export function stopProblem(day: string, stop: StopDraft, earliestMs: number | null, nowMs: number): string | null {
  const start = timeOnDay(day, stop.from)
  if (start === null) return 'Add a start time.'
  const latest = nowMs + FEEDBACK_CLOCK_SKEW_MS
  if (start > latest) return 'The start time can’t be later than now.'
  const end = stop.to === '' ? null : timeOnDay(day, stop.to)
  if (stop.to !== '' && (end === null || end <= start)) return 'The finish must be after the start.'
  if (end !== null && end > latest) return 'The finish time can’t be later than now.'
  if (earliestMs !== null && (end ?? start) - earliestMs > FEEDBACK_SPAN_MAX_HOURS * 3600_000) {
    return `Every stop must fall within ${FEEDBACK_SPAN_MAX_HOURS} hours of the first.`
  }
  return null
}

/**
 * The stops as `POST /feedback` takes them. A picked area sends its id and
 * name; a typed one only its name. `null` while any start time is missing.
 */
export function stopsPayload(
  day: string,
  stops: readonly StopDraft[],
  areas: readonly GuidebookWall[],
): ForecastStop[] | null {
  const out: ForecastStop[] = []
  for (const s of stops) {
    const typed = areas.length === 0 || s.areaPick === OTHER_AREA
    const picked = typed ? null : pickedArea(s, areas)
    const start = timeOnDay(day, s.from)
    if (start === null) return null
    const end = s.to === '' ? null : timeOnDay(day, s.to)
    const wall = picked === null ? undefined : subWallsOf(picked).find((w) => w.id === s.wallPick)
    const routes = picked === null ? [] : routeChoices(picked, s.wallPick).filter((r) => s.routePicks.includes(r.id))
    out.push({
      area_id: picked?.id ?? null,
      area_name: typed ? blankToNull(s.areaText) : (picked?.name ?? null),
      wall_id: wall?.id ?? null,
      // A picked area with no walls of its own is itself the wall: nothing to send.
      wall: wall !== undefined ? wall.name : picked === null || s.wallPick === OTHER_AREA ? blankToNull(s.wall) : null,
      route_picks: routes.map((r) => ({ id: r.id, name: r.name })),
      routes: picked === null || s.routesTyped ? blankToNull(s.routes) : null,
      started_at: new Date(start).toISOString(),
      ended_at: end === null ? null : new Date(end).toISOString(),
      sun_exposure: s.sun,
    })
  }
  return out
}

const timeOf = (iso: string): string | null => {
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : null
}

/** `Cyclops Area · Left side · Routes: Pine Tree · 10:00 AM – 1:00 PM · Mostly shade` */
export function stopLine(stop: ForecastStop): string {
  const start = timeOf(stop.started_at)
  const end = stop.ended_at === null ? null : timeOf(stop.ended_at)
  // `route_picks` is absent on a row from an API older than route picking.
  const routes = [...(stop.route_picks ?? []).map((r) => r.name), ...(stop.routes === null ? [] : [stop.routes])]
  return [
    stop.area_name,
    stop.wall,
    routes.length === 0 ? null : `Routes: ${routes.join(', ')}`,
    start === null ? null : end === null ? start : `${start} – ${end}`,
    stop.sun_exposure === null ? null : SUN_EXPOSURE_LABEL[stop.sun_exposure],
  ]
    .filter((p): p is string => p !== null)
    .join(' · ')
}

/**
 * The lines an open feedback item prints, shared by the reader's own list on
 * `/feedback` and the owner's list of everyone's on Profile, so the two never
 * describe one row differently. `author` leads the head when given — the
 * owner's list names who sent each item; the reader's own does not.
 *
 * `appSaid` is null for app feedback, which carries no reading, and says so in
 * words for a check that was saved without one — absent is not "the app said
 * nothing".
 */
export function feedbackLines(
  item: Feedback,
  author?: string,
): { head: string; verdict: string | null; stops: string[]; appSaid: string | null } {
  const when = new Date(item.observed_at ?? item.created_at)
  const head = [
    author,
    FEEDBACK_KIND_LABEL[item.kind],
    item.location_name,
    Number.isFinite(when.getTime())
      ? when.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : null,
  ]
    .filter((p): p is string => p !== null && p !== undefined)
    .join(' · ')

  const verdict =
    item.kind === 'forecast' && item.observed_conditions !== null && item.verdict !== null
      ? `Rock: ${OBSERVED_CONDITIONS_LABEL[item.observed_conditions]} · Forecast: ${FORECAST_VERDICT_LABEL[item.verdict]}`
      : null

  const appSaid =
    item.kind !== 'forecast'
      ? null
      : item.app_readings === null
        ? 'No app reading attached'
        : `App said: ${item.app_readings.fields.map(fieldLine).join(' · ')}`

  // Absent on a row from an API older than the field: no stops named.
  const stops = item.kind === 'forecast' ? (item.stops ?? []).map(stopLine) : []

  return { head, verdict, stops, appSaid }
}
