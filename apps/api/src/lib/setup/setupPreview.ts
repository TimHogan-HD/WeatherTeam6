import {
  DEFAULT_PREFERENCES,
  effectiveClimbHours,
  effectiveTempRangeC,
  type ClimbHours,
  type SetupPreview,
  type SetupPreviewDay,
} from '@weatherteam6/types'
import { dayRepresentative, evaluateCragA, heldBackBy, type CragAHour, type TempRangeC } from '../scoring/cragModel.js'
import { parsePreferencesUpdate, planPreferencesUpdate } from '../preferences/updatePreferences.js'
import {
  SAMPLE_CRAG,
  SAMPLE_LEAD_IN_DAYS,
  SAMPLE_SHOWN_DAYS,
  SAMPLE_UTC_OFFSET_S,
  sampleWeekHours,
} from './sampleWeek.js'

/**
 * **`GET /setup/preview`, minus Express** (#543). The welcome screen's example
 * week on the reader's draft settings, beside the defaults. Pure and
 * deterministic: no database, no upstream.
 */

export type PreviewDraft = { climbHours: ClimbHours; range: TempRangeC }

const QUERY_FIELDS = {
  first: 'climb_first_hour',
  last: 'climb_last_hour',
  low_c: 'temp_low_c',
  high_c: 'temp_high_c',
} as const

/**
 * The draft from the query string, held to exactly the rules `PUT /preferences`
 * holds a save to, so the screen can never preview a setting it could not save.
 * An absent field is the default. 400 for a malformed value, 409 for a range or
 * window too narrow, as the save would answer.
 */
export function parsePreviewQuery(
  query: Record<string, unknown>,
): { ok: true; draft: PreviewDraft } | { ok: false; status: 400 | 409; error: string } {
  const unknown = Object.keys(query).filter((k) => !(k in QUERY_FIELDS))
  if (unknown.length > 0) {
    return { ok: false, status: 400, error: `Unsupported parameter(s): ${unknown.join(', ')}` }
  }
  const body: Record<string, unknown> = {}
  for (const [param, field] of Object.entries(QUERY_FIELDS)) {
    const raw = query[param]
    if (raw === undefined) continue
    // A blank or repeated parameter is malformed, not a default.
    body[field] = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
  }
  // An empty draft is the defaults; the save path refuses an empty body, so skip it.
  const parsed = Object.keys(body).length === 0 ? {} : parsePreferencesUpdate(body)
  if ('error' in parsed) return { ok: false, status: 400, error: parsed.error.replace(/, or null$/, '') }
  const plan = planPreferencesUpdate({ ...DEFAULT_PREFERENCES }, parsed)
  if (!plan.ok) return { ok: false, status: plan.status, error: plan.error }
  return { ok: true, draft: { climbHours: effectiveClimbHours(plan.next), range: effectiveTempRangeC(plan.next) } }
}

const localHour = (validAt: string): number => new Date(Date.parse(validAt) + SAMPLE_UTC_OFFSET_S * 1000).getUTCHours()

/**
 * The hours of one local day: those whose stamp (the hour's end) falls on it,
 * as `dayRepresentative`'s callers group them. Hour 0's stamp is the first of
 * the day's 24.
 */
function shownDays<H extends { valid_at: string }>(all: readonly H[]): H[][] {
  return Array.from({ length: SAMPLE_SHOWN_DAYS }, (_, d) => all.slice((SAMPLE_LEAD_IN_DAYS + d) * 24, (SAMPLE_LEAD_IN_DAYS + d + 1) * 24))
}

export function buildSetupPreview(draft: PreviewDraft): SetupPreview {
  const weather = sampleWeekHours()
  const crag = { rockType: SAMPLE_CRAG.rockType, lat: SAMPLE_CRAG.lat, lon: SAMPLE_CRAG.lon }
  const defaults = { climbHours: effectiveClimbHours(DEFAULT_PREFERENCES), range: effectiveTempRangeC(DEFAULT_PREFERENCES) }
  const mine = shownDays(evaluateCragA(weather, { ...crag, range: draft.range }))
  const base = shownDays(evaluateCragA(weather, { ...crag, range: defaults.range }))
  const rain = shownDays(weather)

  const days: SetupPreviewDay[] = mine.map((hours: CragAHour[], d) => {
    const best = dayRepresentative(hours, SAMPLE_UTC_OFFSET_S, draft.climbHours)
    const baseBest = dayRepresentative(base[d]!, SAMPLE_UTC_OFFSET_S, defaults.climbHours)
    const stamp = new Date(Date.parse(hours[0]!.valid_at) + SAMPLE_UTC_OFFSET_S * 1000)
    return {
      date: stamp.toISOString().slice(0, 10),
      score: best?.score ?? null,
      default_score: baseBest?.score ?? null,
      held_back_by: best === null ? null : heldBackBy(best.diagnostics.penalties),
      hours: hours.map((h, i) => ({
        hour: localHour(h.valid_at),
        score: h.score,
        air_temp_c: rain[d]![i]!.air_temp_c,
        precip_mm: rain[d]![i]!.precip_mm,
      })),
    }
  })
  return { crag_name: SAMPLE_CRAG.name, days }
}
