import { formatHumidity, formatTempF, type SensorReading } from '@weatherteam6/types'

const MINUTE_MS = 60_000

/**
 * `Read 8 min ago`: how old a stored thermometer reading is, measured from
 * when the server asked Govee. Null for a time it cannot measure (unparseable,
 * or ahead of this device's clock), which renders nothing rather than
 * "-3 min ago".
 */
export function readingAge(recordedAt: string, now: number): string | null {
  const at = Date.parse(recordedAt)
  if (!Number.isFinite(at) || at > now + MINUTE_MS) return null
  const minutes = Math.max(0, Math.floor((now - at) / MINUTE_MS))
  if (minutes < 1) return 'Read just now'
  if (minutes < 60) return `Read ${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `Read ${hours} h ago`
  return `Read ${Math.floor(hours / 24)} d ago`
}

/** `72°F · 37%`, each figure an em dash when missing, never 32°F or 0%. */
export function readingFigures(reading: SensorReading): string {
  return `${formatTempF(reading.temp_c)} · ${formatHumidity(reading.humidity_pct)}`
}
