import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ConditionsReadings, Conditions, Feedback, ForecastStop, GuidebookRoute, GuidebookWall, HourlyReading } from '@weatherteam6/types'
import {
  OTHER_AREA,
  emptyStop,
  feedbackLines,
  fromLocalInputValue,
  pickRoute,
  pickWall,
  routeChoices,
  routeOptionLabel,
  shownReading,
  stopProblem,
  stopsPayload,
  stopsSpan,
  subWallsOf,
  timeOnDay,
  toLocalInputValue,
  type StopDraft,
} from './feedback.js'
import { HistoryItem } from '../routes/Feedback.js'

const NOW = '2026-09-29T18:00:00.000Z'

const reading: HourlyReading = {
  valid_at: NOW,
  rock: { level: 'dry', qualified: true },
  friction: { level: 'poor', condensing: false, qualified: true },
  score: 58,
  t_surface_c: 52,
  condensation_margin_c: 20,
}

function scored(readings: Partial<ConditionsReadings> | null = {}): Conditions {
  const base = { location_id: 'loc', forecast_date: '2026-09-29' }
  // `null` is an older API that sent no readings at all, which the type no
  // longer admits — hence the cast.
  if (readings === null) return base as unknown as Conditions
  return {
    ...base,
    readings: {
      model: 'gfs_seamless',
      unavailable_reason: null,
      utc_offset_seconds: 0,
      now: reading,
      today: null,
      ...readings,
    },
  }
}

describe('shownReading', () => {
  it('captures the words and the score the card prints, with the reading’s own hour and model', () => {
    const r = shownReading(scored(), null)
    expect(r?.valid_at).toBe(NOW)
    expect(r?.model).toBe('gfs_seamless')
    expect(r?.fields.map((f) => f.label)).toEqual(['Dryness', 'Score'])
    expect(r?.fields.find((f) => f.label === 'Score')?.value).toBe('58')
  })

  it('drops the number under a Severe+ alert, as the card does, and keeps the words', () => {
    const r = shownReading(scored(), 'Extreme Heat Warning')
    expect(r?.fields.map((f) => f.label)).toEqual(['Dryness'])
  })

  it('never carries a 0-1 factor — values are words or the score', () => {
    const r = shownReading(scored(), null)
    for (const f of r?.fields ?? []) expect(f.value).not.toMatch(/^0\.\d+$/)
  })

  it('attaches nothing when there is nothing on screen', () => {
    expect(shownReading(null, null)).toBeNull()
    expect(shownReading(undefined, null)).toBeNull()
    // An older API with no `readings` field at all.
    expect(shownReading(scored(null), null)).toBeNull()
    expect(shownReading(scored({ now: null }), null)).toBeNull()
    expect(shownReading(scored({ unavailable_reason: 'model_unavailable' }), null)).toBeNull()
  })
})

describe('datetime-local round trip', () => {
  it('reads back the minute it wrote', () => {
    const ms = new Date(2026, 8, 29, 7, 5).getTime()
    expect(toLocalInputValue(ms)).toBe('2026-09-29T07:05')
    expect(fromLocalInputValue(toLocalInputValue(ms))).toBe(ms)
  })

  it('refuses an empty or malformed value rather than reading it as now or epoch', () => {
    expect(fromLocalInputValue('')).toBeNull()
    expect(fromLocalInputValue('2026-09-29')).toBeNull()
  })
})

describe('stops', () => {
  const DAY = '2026-09-29'
  const at = (h: number, m = 0) => new Date(2026, 8, 29, h, m).getTime()
  const stop = (from: string, to = '', patch: Partial<StopDraft> = {}): StopDraft => ({ ...emptyStop(from), to, ...patch })

  it('puts every time on the check’s day', () => {
    expect(timeOnDay(DAY, '14:15')).toBe(at(14, 15))
    expect(timeOnDay(DAY, '')).toBeNull()
    expect(timeOnDay('', '14:15')).toBeNull()
  })

  it('spans the earliest start to the latest end, out of order and with open ends', () => {
    expect(stopsSpan(DAY, [stop('13:00', '15:00'), stop('09:30'), stop('15:15')])).toEqual({
      fromMs: at(9, 30),
      untilMs: at(15, 15),
    })
    // Withheld while a start is missing, rather than spanning the rest.
    expect(stopsSpan(DAY, [stop('09:00'), stop('')])).toBeNull()
  })

  it('passes a stop between the start and now', () => {
    expect(stopProblem(DAY, stop('09:00', '12:00'), at(9), at(14))).toBeNull()
    expect(stopProblem(DAY, stop('09:00'), at(9), at(14))).toBeNull()
  })

  it('says why a stop would be refused, under the row — the server would 400 each', () => {
    expect(stopProblem(DAY, stop(''), null, at(14))).toMatch(/start time/)
    expect(stopProblem(DAY, stop('12:00', '11:00'), at(9), at(14))).toMatch(/after the start/)
    expect(stopProblem(DAY, stop('12:00', '12:00'), at(9), at(14))).toMatch(/after the start/)
    // Filled in at 14:00 with an expected 17:00 finish.
    expect(stopProblem(DAY, stop('12:00', '17:00'), at(9), at(14))).toMatch(/finish time can’t be later/)
    expect(stopProblem(DAY, stop('15:00'), at(9), at(14))).toMatch(/start time can’t be later/)
    // Five minutes of clock skew pass, as on the server.
    expect(stopProblem(DAY, stop('12:00', '14:05'), at(9), at(14))).toBeNull()
    expect(stopProblem(DAY, stop('21:30', '22:30'), at(6), at(23))).toMatch(/within 16 hours/)
  })

  const route = (id: string, grade: string | null = null): GuidebookRoute => ({
    id, name: id, yds: grade, french: null, vscale: null, kinds: [], first_ascent: null, safety: null, left_right: null, mp_id: null, description: null,
  })
  // Red Wing's shape: an area that is itself one wall.
  const CYCLOPS = { id: 'a1', name: 'Cyclops Area', routes: [route('Pine Tree', '5.9'), route('Cyclops')], sub_walls: [] } as unknown as GuidebookWall
  // Taylors Falls' shape: an area holding walls, and one route on the area itself.
  const BOULDERING = {
    id: 'b1',
    name: 'Bouldering',
    routes: [route('Zed'), route('Sizzle'), route('Path One'), route('Loose')],
    sub_walls: [
      { id: 'w-path', name: 'Path Area', route_ids: ['Path One'] },
      { id: 'w-sizzle', name: 'Sizzlefoot Wall', route_ids: ['Zed', 'Sizzle'] },
    ],
  } as unknown as GuidebookWall
  const AREAS = [CYCLOPS, BOULDERING]

  it('sends a picked area’s id and name, a typed one’s name only, and blanks as null', () => {
    const payload = stopsPayload(
      DAY,
      [
        stop('09:00', '11:00', { areaPick: 'a1', routes: '', sun: 'mostly_shade' }),
        stop('11:15', '', { areaPick: OTHER_AREA, areaText: ' Winter Wall ', wall: ' left ', routes: ' Pine Tree ' }),
        stop('13:00', '', { areaPick: '' }),
      ],
      AREAS,
    )
    expect(payload).toEqual([
      { area_id: 'a1', area_name: 'Cyclops Area', wall_id: null, wall: null, route_picks: [], routes: null, started_at: new Date(at(9)).toISOString(), ended_at: new Date(at(11)).toISOString(), sun_exposure: 'mostly_shade', facing: null, tree_cover: null },
      { area_id: null, area_name: 'Winter Wall', wall_id: null, wall: 'left', route_picks: [], routes: 'Pine Tree', started_at: new Date(at(11, 15)).toISOString(), ended_at: null, sun_exposure: null, facing: null, tree_cover: null },
      { area_id: null, area_name: null, wall_id: null, wall: null, route_picks: [], routes: null, started_at: new Date(at(13)).toISOString(), ended_at: null, sun_exposure: null, facing: null, tree_cover: null },
    ])
  })

  it('sends which way each wall faces and its trees, each its own', () => {
    const payload = stopsPayload(DAY, [stop('09:00', '', { areaPick: 'a1', facing: 'SE', trees: 'partly' }), stop('11:00', '', { facing: 'N' })], AREAS)
    expect(payload?.map((s) => [s.facing, s.tree_cover])).toEqual([['SE', 'partly'], ['N', null]])
  })

  it('sends a picked wall and picked routes by id with their names', () => {
    const [only] = stopsPayload(DAY, [stop('09:00', '', { areaPick: 'b1', wallPick: 'w-sizzle', routePicks: ['Zed', 'Sizzle'] })], AREAS) ?? []
    expect(only).toMatchObject({
      area_id: 'b1',
      wall_id: 'w-sizzle',
      wall: 'Sizzlefoot Wall',
      route_picks: [{ id: 'Sizzle', name: 'Sizzle' }, { id: 'Zed', name: 'Zed' }],
      routes: null,
    })
  })

  it('sends no typed wall for an area that is itself the wall, and typed routes only once asked for', () => {
    const [cyclops] = stopsPayload(DAY, [stop('09:00', '', { areaPick: 'a1', wall: 'left', routes: 'Old route' })], AREAS) ?? []
    expect(cyclops).toMatchObject({ wall_id: null, wall: null, routes: null })
    const [typed] = stopsPayload(DAY, [stop('09:00', '', { areaPick: 'a1', routesTyped: true, routes: ' Old route ' })], AREAS) ?? []
    expect(typed).toMatchObject({ routes: 'Old route' })
    const [other] = stopsPayload(DAY, [stop('09:00', '', { areaPick: 'b1', wallPick: OTHER_AREA, wall: ' North face ' })], AREAS) ?? []
    expect(other).toMatchObject({ wall_id: null, wall: 'North face' })
  })

  it('offers a picked wall’s routes only, the whole area’s without one, A–Z', () => {
    expect(routeChoices(BOULDERING, 'w-sizzle').map((r) => r.id)).toEqual(['Sizzle', 'Zed'])
    expect(routeChoices(BOULDERING, '').map((r) => r.id)).toEqual(['Loose', 'Path One', 'Sizzle', 'Zed'])
    expect(routeChoices(BOULDERING, OTHER_AREA)).toHaveLength(4)
    expect(subWallsOf(CYCLOPS)).toEqual([])
    // An older API with no sub_walls field: no walls, not a crash.
    expect(subWallsOf({ ...BOULDERING, sub_walls: undefined })).toEqual([])
  })

  it('ties a route picked before its wall to the wall it is on', () => {
    expect(pickRoute(stop('09:00'), BOULDERING, 'Zed')).toEqual({ routePicks: ['Zed'], wallPick: 'w-sizzle' })
    // A route on the area itself names no wall.
    expect(pickRoute(stop('09:00'), BOULDERING, 'Loose')).toEqual({ routePicks: ['Loose'] })
    // A route already picked off that wall would vanish under it, so no wall is picked.
    const withLoose = stop('09:00', '', { areaPick: 'b1', routePicks: ['Loose'] })
    expect(pickRoute(withLoose, BOULDERING, 'Zed')).toEqual({ routePicks: ['Loose', 'Zed'] })
    expect(stopsPayload(DAY, [{ ...withLoose, ...pickRoute(withLoose, BOULDERING, 'Zed') }], AREAS)?.[0]?.route_picks.map((r) => r.id)).toEqual(['Loose', 'Zed'])
    // A second route on the same wall keeps it.
    expect(pickRoute(stop('09:00', '', { routePicks: ['Sizzle'] }), BOULDERING, 'Zed')).toEqual({ routePicks: ['Sizzle', 'Zed'], wallPick: 'w-sizzle' })
    // Never moves a wall already picked.
    expect(pickRoute(stop('09:00', '', { wallPick: OTHER_AREA }), BOULDERING, 'Zed')).toEqual({ routePicks: ['Zed'] })
  })

  it('drops routes that are not on a newly picked wall', () => {
    const s = stop('09:00', '', { areaPick: 'b1', routePicks: ['Zed', 'Path One'] })
    expect(pickWall(s, BOULDERING, 'w-path')).toEqual({ wallPick: 'w-path', routePicks: ['Path One'] })
    expect(pickWall(s, BOULDERING, '')).toEqual({ wallPick: '', routePicks: ['Zed', 'Path One'] })
  })

  it('labels a route with its grade when it has one', () => {
    expect(routeOptionLabel(route('Pine Tree', '5.9'))).toBe('Pine Tree 5.9')
    expect(routeOptionLabel(route('Cyclops'))).toBe('Cyclops')
  })

  it('sends a typed area when the crag has no guidebook, whatever the pick', () => {
    const [only] = stopsPayload(DAY, [stop('09:00', '', { areaPick: 'a1', areaText: 'The Main Wall' })], []) ?? []
    expect(only).toMatchObject({ area_id: null, area_name: 'The Main Wall' })
  })

  it('sends nothing while a start time is missing', () => {
    expect(stopsPayload(DAY, [stop('09:00'), stop('')], [])).toBeNull()
  })
})

describe('HistoryItem', () => {
  const check: Feedback = {
    id: 'f1',
    kind: 'forecast',
    location_id: null,
    location_name: 'Red Rock',
    message: 'Seeping <left> side',
    observed_at: NOW,
    observed_conditions: 'damp',
    verdict: 'missed',
    app_readings: { valid_at: NOW, model: 'gfs_seamless', fields: [{ label: 'Dryness', value: 'Dry' }] },
    stops: [],
    created_at: NOW,
  }

  const STOP: ForecastStop = {
    area_id: null,
    area_name: 'Cyclops Area',
    wall_id: null,
    wall: 'left side',
    route_picks: [],
    routes: 'Pine Tree',
    started_at: NOW,
    ended_at: new Date(Date.parse(NOW) + 3 * 3600_000).toISOString(),
    sun_exposure: 'mostly_shade',
  }

  it('prints one line per stop, in order, each with its own hours and sun', () => {
    const second: ForecastStop = { ...STOP, area_name: 'Winter Wall', wall: null, routes: null, ended_at: null, sun_exposure: 'full_sun' }
    const { stops } = feedbackLines({ ...check, stops: [STOP, second] })
    expect(stops).toHaveLength(2)
    expect(stops[0]).toMatch(/^Cyclops Area · left side · Routes: Pine Tree · \d{1,2}:\d{2}.* – \d{1,2}:\d{2}.* · Mostly shade$/)
    expect(stops[1]).toMatch(/^Winter Wall · \d{1,2}:\d{2}[^–]* · Full sun$/)
    expect(renderToStaticMarkup(<HistoryItem item={{ ...check, stops: [STOP, second] }} />)).toContain('Winter Wall')
  })

  it('prints picked routes before typed ones, and a stop from an older API without picks', () => {
    const picked: ForecastStop = { ...STOP, route_picks: [{ id: 'r1', name: 'Cyclops' }], routes: 'Unlisted' }
    expect(feedbackLines({ ...check, stops: [picked] }).stops[0]).toMatch(/· Routes: Cyclops, Unlisted ·/)
    const { route_picks: _omit, ...older } = STOP
    expect(feedbackLines({ ...check, stops: [older as ForecastStop] }).stops[0]).toMatch(/· Routes: Pine Tree ·/)
  })

  it('prints which way the wall faces and its trees last, and nothing for a row from an older API', () => {
    const told: ForecastStop = { ...STOP, facing: 'SW', tree_cover: 'under' }
    expect(feedbackLines({ ...check, stops: [told] }).stops[0]).toMatch(/· Mostly shade · Faces SW · Under trees$/)
    expect(feedbackLines({ ...check, stops: [STOP] }).stops[0]).toMatch(/· Mostly shade$/)
  })

  it('prints no stop lines when none were named, or for a row from an older API', () => {
    expect(feedbackLines(check).stops).toEqual([])
    const { stops: _omit, ...old } = check
    expect(feedbackLines(old as Feedback).stops).toEqual([])
  })

  it('shows what the climber saw beside what the app said', () => {
    const html = renderToStaticMarkup(<HistoryItem item={check} />)
    expect(html).toContain('Rock: Damp · Forecast: Missed')
    expect(html).toContain('App said: Dryness: Dry')
    expect(html).toContain('Red Rock')
    expect(html).toContain('Seeping &lt;left&gt; side')
  })

  it('says a check had no reading rather than showing an empty one', () => {
    const html = renderToStaticMarkup(<HistoryItem item={{ ...check, app_readings: null }} />)
    expect(html).toContain('No app reading attached')
  })

  it('shows app feedback without a verdict line', () => {
    const html = renderToStaticMarkup(
      <HistoryItem
        item={{ ...check, kind: 'app', observed_at: null, observed_conditions: null, verdict: null, app_readings: null }}
      />,
    )
    expect(html).toContain('App feedback')
    expect(html).not.toContain('Forecast:')
    expect(html).not.toContain('No app reading')
  })

  it("names the sender first only on the owner's list", () => {
    expect(feedbackLines(check, 'kyle').head.startsWith('kyle · Forecast check · Red Rock · ')).toBe(true)
    expect(feedbackLines(check).head.startsWith('Forecast check · Red Rock · ')).toBe(true)
  })

  it('offers Done only when the item can be resolved', () => {
    expect(renderToStaticMarkup(<HistoryItem item={check} />)).not.toContain('Done')
    expect(renderToStaticMarkup(<HistoryItem item={check} onResolve={() => {}} />)).toContain('>Done<')
    const pending = renderToStaticMarkup(<HistoryItem item={check} resolving onResolve={() => {}} />)
    expect(pending).toContain('Marking…')
    expect(pending).toContain('disabled')
  })
})
