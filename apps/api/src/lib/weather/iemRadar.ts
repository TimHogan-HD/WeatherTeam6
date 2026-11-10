import { logger } from '../logger.js'
import { fetchWithRetry } from './openMeteo.js'
import type { RadarLatest, RadarLayers, RadarPeriod } from '@weatherteam6/types'

/**
 * IEM's US composite reflectivity (N0Q), refreshed every 5 minutes. This file
 * names the newest frame; the tiles themselves load straight from IEM in the
 * browser, stamped with this time, so the label and the picture are one frame.
 */
const LATEST_URL = 'https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.json'

type LatestResponse = { meta?: { valid?: unknown } }

/**
 * The newest composite's valid time, or null when IEM did not answer or said
 * something unreadable. Null means "no radar", never "no rain".
 */
export async function fetchLatestRadar(): Promise<RadarLatest | null> {
  let res: Response
  try {
    res = await fetchWithRetry(LATEST_URL, 3)
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, '[iemRadar] fetch failed after retries')
    return null
  }
  if (!res.ok) {
    logger.warn({ statusCode: res.status }, '[iemRadar] non-ok response')
    return null
  }

  const valid = ((await res.json()) as LatestResponse).meta?.valid
  const time = typeof valid === 'string' ? Date.parse(valid) : NaN
  if (!Number.isFinite(time)) {
    logger.warn('[iemRadar] response has no readable valid time')
    return null
  }
  return { valid_at: new Date(time).toISOString() }
}

const IEM = 'https://mesonet.agron.iastate.edu'
const RAIN_24H_URL = `${IEM}/data/gis/images/4326/mrms/p24h.json`
const RAIN_72H_URL = `${IEM}/data/gis/images/4326/mrms/p72h.json`
/**
 * The HRRR run is read from its last frame, not its first: IEM rewrites each
 * frame's file as it processes that frame, so the run named at 18 hours is one
 * whose every earlier frame is already there. Its first frame can name a run
 * still being drawn.
 */
const FORECAST_LAST_URL = `${IEM}/data/gis/images/4326/hrrr/refd_1080.json`
const FORECAST_LAST_MINUTE = 1080

/** How far back the loop reaches, and how far ahead the forecast. */
export const PAST_MS = 55 * 60_000
export const FORECAST_AHEAD_MS = 6 * 60 * 60_000
/** The forecast's step. HRRR draws every 15 minutes; 30 keeps the loop to a dozen frames. */
export const FORECAST_STEP_MS = 30 * 60_000

/** The whole of `GET /radar/layers` shares one deadline, well inside the function's 60 s. */
const LAYERS_BUDGET_MS = 20_000

/** `2026-11-10T14:50Z`, the form IEM's scan listing takes. */
const listTime = (at: number): string => new Date(at).toISOString().slice(0, 16) + 'Z'

async function readJson(url: string, deadline: number): Promise<unknown> {
  try {
    const res = await fetchWithRetry(url, 3, undefined, deadline)
    if (!res.ok) {
      logger.warn({ statusCode: res.status, url }, '[iemRadar] non-ok response')
      return null
    }
    return (await res.json()) as unknown
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), url }, '[iemRadar] fetch failed after retries')
    return null
  }
}

function instant(value: unknown): number | null {
  const at = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(at) ? at : null
}

const iso = (at: number): string => new Date(at).toISOString()

/**
 * The composite frames IEM lists from `PAST_MS` before the newest one up to it,
 * oldest first. A scan IEM did not list is left out, so the loop never shows a
 * frame that has no picture. When the listing fails the newest frame stands alone.
 */
export function parseScans(body: unknown, latest: number): string[] {
  const scans = (body as { scans?: unknown } | null)?.scans
  const listed = Array.isArray(scans)
    ? scans
        .map((s) => instant((s as { ts?: unknown } | null)?.ts))
        .filter((at): at is number => at !== null && at >= latest - PAST_MS && at < latest)
    : []
  return [...new Set(listed)].sort((a, b) => a - b).map(iso).concat(iso(latest))
}

export function parsePeriod(body: unknown): RadarPeriod | null {
  const meta = (body as { meta?: { start_valid?: unknown; end_valid?: unknown } } | null)?.meta
  const start = instant(meta?.start_valid)
  const end = instant(meta?.end_valid)
  if (start === null || end === null || end <= start) return null
  return { start_at: iso(start), end_at: iso(end) }
}

/**
 * The run's frames from the first half hour after `after` to `FORECAST_AHEAD_MS`
 * past it, kept inside the run's 18 hours. Null when the run is unreadable or
 * has no frame in that span.
 */
export function parseForecast(body: unknown, after: number): RadarLayers['forecast'] {
  const run = instant((body as { model_init_utc?: unknown } | null)?.model_init_utc)
  if (run === null) return null
  const lastValid = run + FORECAST_LAST_MINUTE * 60_000
  const frames: string[] = []
  for (let at = Math.floor(after / FORECAST_STEP_MS) * FORECAST_STEP_MS + FORECAST_STEP_MS; at <= after + FORECAST_AHEAD_MS; at += FORECAST_STEP_MS) {
    if (at > run && at <= lastValid) frames.push(iso(at))
  }
  return frames.length === 0 ? null : { run_at: iso(run), frames }
}

/** Every layer's frame times, each read on its own so one failure blanks only its layer. */
export async function fetchRadarLayers(now: number = Date.now()): Promise<RadarLayers> {
  const deadline = Date.now() + LAYERS_BUDGET_MS
  const pastFrames = (async (): Promise<string[] | null> => {
    const body = (await readJson(LATEST_URL, deadline)) as LatestResponse | null
    const latest = instant(body?.meta?.valid)
    if (latest === null) return null
    const listUrl = `${IEM}/json/radar.py?operation=list&product=N0Q&radar=USCOMP&start=${listTime(latest - PAST_MS)}&end=${listTime(latest + 60_000)}`
    return parseScans(await readJson(listUrl, deadline), latest)
  })()
  const [past, rain24, rain72, forecastBody] = await Promise.all([
    pastFrames,
    readJson(RAIN_24H_URL, deadline),
    readJson(RAIN_72H_URL, deadline),
    readJson(FORECAST_LAST_URL, deadline),
  ])
  const newest = past === null ? now : (instant(past.at(-1)) ?? now)
  return {
    past,
    rain_24h: parsePeriod(rain24),
    rain_72h: parsePeriod(rain72),
    forecast: parseForecast(forecastBody, newest),
  }
}
