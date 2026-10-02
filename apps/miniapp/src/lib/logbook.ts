import { EM_DASH, mToFt } from '@weatherteam6/types'

const pad = (n: number): string => String(n).padStart(2, '0')

/**
 * `YYYY-MM-DD` for the day `ms` falls on **on this device's clock** — the day a
 * climber means by "today". `toISOString().slice(0, 10)` is the UTC day, which
 * in Minnesota turns into tomorrow every evening from 7 pm.
 */
export function localDateString(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** `Sep 29, 2026` for a stored `YYYY-MM-DD`, read as that calendar day wherever the reader is. */
export function formatTickDate(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (m === null) return EM_DASH
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** The reader's local day an instant fell on, as `Sep 29, 2026`. An em dash for an unparseable stamp. */
export function formatInstantDate(iso: string): string {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? formatTickDate(localDateString(ms)) : EM_DASH
}

/** A phone's accuracy estimate as `±26 ft`. An em dash for a missing or nonsense figure, never `±0 ft`. */
export function formatAccuracyFt(metres: number | null): string {
  if (metres === null || !Number.isFinite(metres) || metres <= 0) return EM_DASH
  return `±${Math.round(mToFt(metres))} ft`
}

/** A Google Maps search for a point, which opens the Maps app on a phone that has it. */
export function mapsHref(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
}

/**
 * What to say when the phone gave no fix. The codes are the Geolocation API's
 * own (`GeolocationPositionError`): 1 denied, 2 unavailable, 3 timeout.
 */
export function geolocationErrorLine(code: number): string {
  switch (code) {
    case 1:
      return 'Location permission denied. Allow it for this site in the browser settings.'
    case 2:
      return 'Can’t find your location. Try somewhere with open sky.'
    case 3:
      return 'Location timed out. Try again.'
    default:
      return 'Couldn’t read the location.'
  }
}
