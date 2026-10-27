import {
  compassPoint,
  daylightSpans,
  localDayInstants,
  sunSpans,
  type SunWalls,
} from '@weatherteam6/types'

/** A span drawn on the day strip, in minutes past the crag's local midnight. */
export type DayBand = { from: number; to: number }

export type SunWallRow = {
  name: string
  /** `faces SSE`. */
  faces: string
  sun: DayBand[]
  daylight: DayBand[]
  /** `7:50 AM – 5:25 PM`, spans joined with commas, or null with no direct sun. */
  sunText: string | null
  sunMinutes: number
}

/** The crag's own date at `now`, `YYYY-MM-DD`. */
export function localYmd(now: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** `9 h 35 min`, `40 min`, `8 h`. */
export function formatSunMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Every wall's sun on one local day, in the order the data lists them (A–Z). */
export function sunWallRows(data: SunWalls, ymd: string): SunWallRow[] {
  const instants = localDayInstants(ymd, data.time_zone)
  const clock = new Intl.DateTimeFormat('en-US', { timeZone: data.time_zone, hour: 'numeric', minute: '2-digit' })
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: data.time_zone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
  const minuteOfDay = (t: number) => {
    const p = parts.formatToParts(t)
    return Number(p.find((x) => x.type === 'hour')?.value ?? 0) * 60 + Number(p.find((x) => x.type === 'minute')?.value ?? 0)
  }
  // A span that runs to local midnight ends at 24:00, not 0:00.
  const band = (s: { from: number; to: number }): DayBand => {
    const from = minuteOfDay(s.from)
    const to = minuteOfDay(s.to)
    return { from, to: to <= from ? 24 * 60 : to }
  }

  return data.walls.map((wall) => {
    const sun = sunSpans(wall, instants)
    return {
      name: wall.name,
      faces: `faces ${compassPoint(wall.aspect_deg) ?? `${wall.aspect_deg}°`}`,
      sun: sun.map(band),
      daylight: daylightSpans(wall, instants).map(band),
      sunText: sun.length === 0 ? null : sun.map((s) => `${clock.format(s.from)} – ${clock.format(s.to)}`).join(', '),
      sunMinutes: sun.reduce((n, s) => n + Math.round((s.to - s.from) / 60_000), 0),
    }
  })
}
