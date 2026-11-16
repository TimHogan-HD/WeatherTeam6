import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Feedback, ForecastStop, GuidebookRoute, GuidebookWall, HourlyReading, HourlyReadings, HourlySeries } from '@weatherteam6/types'
import {
  OTHER_AREA,
  draftLine,
  emptyStop,
  feedbackLines,
  firstStopTime,
  fromLocalInputValue,
  initialCheckDay,
  localHourLabel,
  missingAnswer,
  pickRoute,
  pickSun,
  pickWall,
  routeChoices,
  routeOptionLabel,
  spanReading,
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
const H = 3600_000
const NOW_MS = Date.parse(NOW)
const at = (ms: number): string => new Date(ms).toISOString()

const reading: HourlyReading = {
  valid_at: NOW,
  rock: { level: 'dry', qualified: true },
  friction: { level: 'poor', condensing: false, qualified: true },
  score: 58,
  t_surface_c: 52,
  condensation_margin_c: 20,
}

/** Hours from `NOW - 6h` to `NOW + 3h`, every one scored 90 unless `scores` says otherwise. */
function series(
  scores: Record<number, number | null> = {},
  readings: Partial<HourlyReadings> | null = {},
): Pick<HourlySeries, 'readings' | 'utc_offset_seconds'> {
  // `null` is an older API that sent no readings at all, which the type no
  // longer admits — hence the cast.
  if (readings === null) return { utc_offset_seconds: -5 * 3600 } as unknown as Pick<HourlySeries, 'readings' | 'utc_offset_seconds'>
  const hours: HourlyReading[] = []
  for (let k = -6; k <= 3; k++) {
    const score = k in scores ? (scores[k] ?? null) : 90
    hours.push({ ...reading, valid_at: at(NOW_MS + k * H), score })
  }
  return {
    utc_offset_seconds: -5 * 3600,
    readings: {
      model: 'gfs_seamless',
      rain_models: null,
      unavailable_reason: null,
      hours,
      days: [],
      ...readings,
    },
  }
}

describe('spanReading', () => {
  it('captures the words and the score a screen prints, with the hour’s own instant and model', () => {
    const r = spanReading(series({ 0: 58 }), NOW_MS, NOW_MS)
    expect(r?.valid_at).toBe(NOW)
    expect(r?.model).toBe('gfs_seamless')
    expect(r?.fields.map((f) => f.label)).toEqual(['Dryness', 'Score'])
    expect(r?.fields.find((f) => f.label === 'Score')?.value).toBe('58')
  })

  it('never carries a 0-1 factor — values are words or the score', () => {
    const r = spanReading(series(), NOW_MS - 2 * H, NOW_MS)
    for (const f of r?.fields ?? []) expect(f.value).not.toMatch(/^0\.\d+$/)
  })

  it('reads hours that were over before the check was entered (2026-11-15: entered at 20:32, attached nothing)', () => {
    // Climbed 10:30 to 16:30 local, entered that evening: every hour is in the past.
    const r = spanReading(series({ [-5]: 70 }), NOW_MS - 5.5 * H, NOW_MS - 2.5 * H)
    expect(r?.valid_at).toBe(at(NOW_MS - 5 * H))
    expect(r?.fields.find((f) => f.label === 'Score')?.value).toBe('70')
  })

  it('is the span’s worst hour, not the first, the last or the best', () => {
    const r = spanReading(series({ [-4]: 95, [-3]: 61, [-2]: 88 }), NOW_MS - 4 * H, NOW_MS - 2 * H)
    expect(r?.valid_at).toBe(at(NOW_MS - 3 * H))
    expect(r?.fields.find((f) => f.label === 'Score')?.value).toBe('61')
  })

  it('takes the hour in progress at the start and none after the finish', () => {
    // 8:30 to 10:00 local: the 8, 9 and 10 o'clock hours. 7:00 and 11:00 are outside it.
    const from = NOW_MS - 4.5 * H
    const until = NOW_MS - 3 * H
    expect(spanReading(series({ [-6]: 10 }), from, until)?.fields.find((f) => f.label === 'Score')?.value).toBe('90')
    expect(spanReading(series({ [-2]: 10 }), from, until)?.fields.find((f) => f.label === 'Score')?.value).toBe('90')
    expect(spanReading(series({ [-5]: 10 }), from, until)?.valid_at).toBe(at(NOW_MS - 5 * H))
    expect(spanReading(series({ [-3]: 10 }), from, until)?.valid_at).toBe(at(NOW_MS - 3 * H))
  })

  it('withholds the span when any hour in it is unread, rather than the worst of the rest', () => {
    expect(spanReading(series({ [-3]: null }), NOW_MS - 4 * H, NOW_MS - 2 * H)).toBeNull()
    // An unread hour outside the span does not.
    expect(spanReading(series({ [-6]: null }), NOW_MS - 4 * H, NOW_MS - 2 * H)).not.toBeNull()
  })

  it('attaches nothing for a span the readings do not reach, such as an earlier day', () => {
    expect(spanReading(series(), NOW_MS - 30 * H, NOW_MS - 26 * H)).toBeNull()
  })

  /** Yesterday's hours, `NOW - 30h` to `NOW - 7h`, every one scored 80 unless `scores` says otherwise. */
  const yesterday = (scores: Record<number, number | null> = {}): HourlyReading[] => {
    const out: HourlyReading[] = []
    for (let k = -30; k <= -7; k++) out.push({ ...reading, valid_at: at(NOW_MS + k * H), score: k in scores ? (scores[k] ?? null) : 80 })
    return out
  }

  it('reads a span from the day before, entered the next day', () => {
    const r = spanReading(series({}, { yesterday_hours: yesterday({ [-27]: 64 }) }), NOW_MS - 29.5 * H, NOW_MS - 26 * H)
    expect(r?.valid_at).toBe(at(NOW_MS - 27 * H))
    expect(r?.fields.find((f) => f.label === 'Score')?.value).toBe('64')
  })

  it('reads a span that runs across the crag’s midnight from both days', () => {
    const r = spanReading(series({ [-5]: 55 }, { yesterday_hours: yesterday() }), NOW_MS - 8.5 * H, NOW_MS - 5 * H)
    expect(r?.valid_at).toBe(at(NOW_MS - 5 * H))
    // Yesterday's worse hour wins just the same.
    const s = spanReading(series({}, { yesterday_hours: yesterday({ [-8]: 40 }) }), NOW_MS - 8.5 * H, NOW_MS - 5 * H)
    expect(s?.valid_at).toBe(at(NOW_MS - 8 * H))
  })

  it('withholds a span from the day before when an hour of it was left out as unread', () => {
    const gappy = yesterday().filter((h) => h.valid_at !== at(NOW_MS - 27 * H))
    expect(spanReading(series({}, { yesterday_hours: gappy }), NOW_MS - 29.5 * H, NOW_MS - 26 * H)).toBeNull()
  })

  it('withholds a span the readings reach only part of, rather than the worst of the hours they hold', () => {
    // Starts two hours before the readings' first hour (NOW - 6h), as a span before the crag's midnight does.
    expect(spanReading(series(), NOW_MS - 8 * H, NOW_MS - 4 * H)).toBeNull()
    // Runs past the readings' last hour (NOW + 3h).
    expect(spanReading(series(), NOW_MS + 2 * H, NOW_MS + 5 * H)).toBeNull()
    // An hour missing from the middle.
    const gappy = series()
    if (gappy.readings) gappy.readings.hours = gappy.readings.hours.filter((h) => h.valid_at !== at(NOW_MS - 3 * H))
    expect(spanReading(gappy, NOW_MS - 4 * H, NOW_MS - 2 * H)).toBeNull()
    // The same span with every hour present attaches.
    expect(spanReading(series(), NOW_MS - 4 * H, NOW_MS - 2 * H)).not.toBeNull()
  })

  it('attaches nothing when there is nothing to read', () => {
    expect(spanReading(null, NOW_MS, NOW_MS)).toBeNull()
    expect(spanReading(undefined, NOW_MS, NOW_MS)).toBeNull()
    expect(spanReading(series({}, null), NOW_MS, NOW_MS)).toBeNull()
    expect(spanReading(series({}, { unavailable_reason: 'model_unavailable' }), NOW_MS, NOW_MS)).toBeNull()
    expect(spanReading(series(), Number.NaN, NOW_MS)).toBeNull()
  })
})

describe('localHourLabel', () => {
  it('reads the hour on the location’s clock, not UTC', () => {
    expect(localHourLabel(NOW, -5 * 3600)).toBe('1 pm')
  })

  it('is null rather than a guessed clock when the offset or instant is unknown', () => {
    expect(localHourLabel(NOW, undefined)).toBeNull()
    expect(localHourLabel(NOW, null)).toBeNull()
    expect(localHourLabel('not a time', 0)).toBeNull()
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
  // Each wall needs its rock said; the stops here said Dry unless a test says otherwise.
  const stop = (from: string, to = '', patch: Partial<StopDraft> = {}): StopDraft => ({ ...emptyStop(from), to, rock: 'dry', ...patch })

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

  it('names the answer still missing: each wall’s rock, then the verdict', () => {
    expect(emptyStop('09:00').rock).toBeNull()
    expect(missingAnswer([stop('09:00', '', { rock: null })], 'matched')).toBe('Say what the rock was like.')
    expect(missingAnswer([stop('09:00'), stop('11:00', '', { rock: null })], 'matched')).toBe('Say what the rock was like at wall 2.')
    expect(missingAnswer([stop('09:00')], null)).toBe('Say whether the app matched.')
    expect(missingAnswer([stop('09:00'), stop('11:00')], 'partly')).toBeNull()
    // A missing rock is not a refusal under the row: the form just opened has answered nothing.
    expect(stopProblem(DAY, stop('09:00', '', { rock: null }), at(9), at(14))).toBeNull()
  })

  it('drops what kept the sun off once the sun is full or unsaid, and never sends it then', () => {
    expect(pickSun('mostly_shade')).toEqual({ sun: 'mostly_shade' })
    expect(pickSun('full_sun')).toEqual({ sun: 'full_sun', shadeCauses: [] })
    expect(pickSun(null)).toEqual({ sun: null, shadeCauses: [] })
    // A draft can still hold causes from before (state set outside pickSun); the payload drops them.
    const [full, shade] =
      stopsPayload(DAY, [stop('09:00', '', { sun: 'full_sun', shadeCauses: ['trees'] }), stop('10:00', '', { sun: 'mixed', shadeCauses: ['trees', 'clouds'] })], []) ?? []
    expect(full?.shade_causes).toEqual([])
    expect(shade?.shade_causes).toEqual(['trees', 'clouds'])
  })

  it('folds a wall to the start, rock and sun said so far, leaving the place to its name', () => {
    expect(draftLine(stop('09:00', '', { areaPick: 'a1', rock: 'wet', sun: 'mostly_shade', facing: 'SE' }))).toMatch(
      /^\d{1,2}:00.* · Wet · Mostly shade · Faces SE$/,
    )
    expect(draftLine({ ...emptyStop('') })).toBe('Nothing said yet')
    expect(draftLine(stop('', '', { areaPick: OTHER_AREA, areaText: ' Winter Wall ', rock: null }))).toBe('Nothing said yet')
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
      { area_id: 'a1', area_name: 'Cyclops Area', wall_id: null, wall: null, route_picks: [], routes: null, started_at: new Date(at(9)).toISOString(), ended_at: new Date(at(11)).toISOString(), rock: 'dry', sun_exposure: 'mostly_shade', shade_causes: [], facing: null, angle: null },
      { area_id: null, area_name: 'Winter Wall', wall_id: null, wall: 'left', route_picks: [], routes: 'Pine Tree', started_at: new Date(at(11, 15)).toISOString(), ended_at: null, rock: 'dry', sun_exposure: null, shade_causes: [], facing: null, angle: null },
      { area_id: null, area_name: null, wall_id: null, wall: null, route_picks: [], routes: null, started_at: new Date(at(13)).toISOString(), ended_at: null, rock: 'dry', sun_exposure: null, shade_causes: [], facing: null, angle: null },
    ])
  })

  it('sends each wall’s own rock, direction and angle', () => {
    const payload = stopsPayload(
      DAY,
      [stop('09:00', '', { areaPick: 'a1', rock: 'wet', facing: 'SE', angle: 'overhang' }), stop('11:00', '', { facing: 'N' })],
      AREAS,
    )
    expect(payload?.map((s) => [s.rock, s.facing, s.angle])).toEqual([['wet', 'SE', 'overhang'], ['dry', 'N', null]])
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
    expect(stops[1]).toMatch(/^Winter Wall · \d{1,2}:\d{2}[^–]* · All sun$/)
    expect(renderToStaticMarkup(<HistoryItem item={{ ...check, stops: [STOP, second] }} />)).toContain('Winter Wall')
  })

  it('prints picked routes before typed ones, and a stop from an older API without picks', () => {
    const picked: ForecastStop = { ...STOP, route_picks: [{ id: 'r1', name: 'Cyclops' }], routes: 'Unlisted' }
    expect(feedbackLines({ ...check, stops: [picked] }).stops[0]).toMatch(/· Routes: Cyclops, Unlisted ·/)
    const { route_picks: _omit, ...older } = STOP
    expect(feedbackLines({ ...check, stops: [older as ForecastStop] }).stops[0]).toMatch(/· Routes: Pine Tree ·/)
  })

  it('prints the wall’s rock, what shaded it, its direction and angle, and nothing for a row from an older API', () => {
    const told: ForecastStop = { ...STOP, rock: 'damp', shade_causes: ['trees', 'facing'], facing: 'SW', angle: 'roof' }
    expect(feedbackLines({ ...check, stops: [told] }).stops[0]).toMatch(
      /· Rock: Damp · Mostly shade · Shaded by: Trees, Faces away from sun · Faces SW · Roof$/,
    )
    expect(feedbackLines({ ...check, stops: [STOP] }).stops[0]).toMatch(/· \d{1,2}:\d{2}[^·]* · Mostly shade$/)
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

describe('initialCheckDay', () => {
  // Noon on 2026-11-03 on this device's clock, whatever zone the tests run in.
  const now = new Date(2026, 10, 3, 12, 0).getTime()

  it('opens on a trip day the server would take', () => {
    expect(initialCheckDay('2026-10-24', now)).toBe('2026-10-24')
    expect(initialCheckDay('2026-11-03', now)).toBe('2026-11-03')
  })

  it('opens on today for a day past the 60-day limit, a future day, or none', () => {
    expect(initialCheckDay('2026-09-03', now)).toBe('2026-11-03')
    expect(initialCheckDay('2026-09-04', now)).toBe('2026-09-04')
    expect(initialCheckDay('2026-11-04', now)).toBe('2026-11-03')
    expect(initialCheckDay(null, now)).toBe('2026-11-03')
  })

  it('opens on today for a malformed or impossible date rather than one the browser rolls over', () => {
    expect(initialCheckDay('2026-10-2', now)).toBe('2026-11-03')
    expect(initialCheckDay('2026-02-30', now)).toBe('2026-11-03')
    expect(initialCheckDay('<script>', now)).toBe('2026-11-03')
  })
})

describe('firstStopTime', () => {
  const now = new Date(2026, 10, 3, 14, 5).getTime()

  it('starts today’s check at now, and an earlier day’s blank rather than a guessed hour', () => {
    expect(firstStopTime('2026-11-03', now)).toBe('14:05')
    expect(firstStopTime('2026-10-24', now)).toBe('')
  })
})
