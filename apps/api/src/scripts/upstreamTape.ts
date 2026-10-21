/**
 * Record the API's upstream weather calls once, then replay them, so `check:ui`
 * can run in CI without Open-Meteo's shared-IP rate limits or today's weather.
 *
 * A replayed response is moved forward by the days since it was recorded: every
 * date, date-time and epoch timestamp within `NEAR_DAYS` of the recording day
 * shifts by that many days, and the same rule turns request URLs into keys
 * (`start_date=@D-7`), so a request made on the replay day finds the one made on
 * the recording day. Dates further away (the 1991-2020 normals) stay literal.
 * Times of day do not move: an observation recorded at 14:00 replays at 14:00.
 */

const NEAR_DAYS = 400
const DAY_MS = 86_400_000

/** The tape's day is Minnesota's, where the checked crags are. */
const TAPE_TIME_ZONE = 'America/Chicago'

export interface TapeEntry {
  key: string
  status: number
  contentType: string | null
  body: string
}

export interface Tape {
  recordedOn: string
  entries: TapeEntry[]
}

export function tapeDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TAPE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function dayNumber(isoDay: string): number {
  return Math.round(Date.UTC(Number(isoDay.slice(0, 4)), Number(isoDay.slice(5, 7)) - 1, Number(isoDay.slice(8, 10))) / DAY_MS)
}

function isoDayOf(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10)
}

export function daysBetween(fromDay: string, toDay: string): number {
  return dayNumber(toDay) - dayNumber(fromDay)
}

// Not `\b`: `2026-10-21T00:00` has no word boundary between the day and the T.
const DATE = /(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g
// The look-behind skips the fraction digits of a coordinate.
const EPOCH_MS = /(?<![\d.])\d{13}(?!\d)/g
const EPOCH_SEC = /(?<![\d.])\d{10}(?!\d)/g

/** `url` with each date near `anchorDay` written as its offset, the same on any day the request is made. */
export function tapeKey(url: string, anchorDay: string): string {
  const anchor = dayNumber(anchorDay)
  return url.replace(DATE, (whole) => {
    const offset = dayNumber(whole) - anchor
    return Math.abs(offset) <= NEAR_DAYS ? `@D${offset >= 0 ? '+' : ''}${offset}` : whole
  })
}

/** `body` with every date and epoch timestamp near `anchorDay` moved `days` later. */
export function shiftBody(body: string, anchorDay: string, days: number): string {
  if (days === 0) return body
  const anchor = dayNumber(anchorDay)
  const anchorSec = anchor * 86_400
  const near = (sec: number): boolean => Math.abs(sec - anchorSec) <= NEAR_DAYS * 86_400
  return body
    .replace(DATE, (whole) => {
      const n = dayNumber(whole)
      return Math.abs(n - anchor) <= NEAR_DAYS ? isoDayOf(n + days) : whole
    })
    .replace(EPOCH_MS, (ms) => (near(Number(ms) / 1000) ? String(Number(ms) + days * DAY_MS) : ms))
    .replace(EPOCH_SEC, (sec) => (near(Number(sec)) ? String(Number(sec) + days * 86_400) : sec))
}

/** Prefer a success: a recording that retried past a 5xx keeps the answer the app went on to use. */
export function addEntry(tape: Tape, entry: TapeEntry): void {
  const i = tape.entries.findIndex((e) => e.key === entry.key)
  if (i === -1) tape.entries.push(entry)
  else if (entry.status < 400 || tape.entries[i]!.status >= 400) tape.entries[i] = entry
}

export function isUpstream(url: string): boolean {
  const { hostname } = new URL(url)
  return hostname !== 'localhost' && hostname !== '127.0.0.1'
}

export function requestUrl(input: Parameters<typeof fetch>[0]): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
}

/**
 * Wraps `realFetch` so every non-local request is written to `tape`. Local
 * requests (the API, vite) pass through untouched.
 */
export function recordingFetch(realFetch: typeof fetch, tape: Tape): typeof fetch {
  return async (input, init) => {
    const url = requestUrl(input)
    const res = await realFetch(input, init)
    if (!isUpstream(url)) return res
    const body = await res.clone().text()
    addEntry(tape, { key: tapeKey(url, tape.recordedOn), status: res.status, contentType: res.headers.get('content-type'), body })
    return res
  }
}

/**
 * Serves non-local requests from `tape`, moved to `today`. A request the tape
 * does not hold gets a 404, which the app does not retry, and its URL goes on
 * `misses` for the run to fail on.
 */
export function replayingFetch(realFetch: typeof fetch, tape: Tape, today: string, misses: Set<string>): typeof fetch {
  const days = daysBetween(tape.recordedOn, today)
  const byKey = new Map(tape.entries.map((e) => [e.key, e]))
  return async (input, init) => {
    const url = requestUrl(input)
    if (!isUpstream(url)) return realFetch(input, init)
    const entry = byKey.get(tapeKey(url, today))
    if (!entry) {
      misses.add(url)
      return new Response('not on the tape', { status: 404 })
    }
    return new Response(shiftBody(entry.body, tape.recordedOn, days), {
      status: entry.status,
      headers: entry.contentType ? { 'content-type': entry.contentType } : {},
    })
  }
}
