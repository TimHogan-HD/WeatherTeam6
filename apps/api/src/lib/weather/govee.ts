import { fetchWithRetry } from './openMeteo.js'

/**
 * Govee's Developer API (`developer.govee.com`), for the owner's own
 * thermometer (owner, 2026-11-25). The key is `GOVEE_API_KEY`, the owner's, sent
 * in `Govee-API-Key`. Two calls: the account's devices, then each thermometer's
 * current state. There is no history endpoint, so history is what
 * `/api/cron/collect-sensors` stores.
 *
 * Govee reports temperature in °F (the H5171 read 72.14 indoors on 2026-11-25,
 * which is no Celsius room) and gives no time of measurement.
 */
const BASE = 'https://openapi.api.govee.com/router/api/v1'

export type GoveeDevice = { sku: string; device: string; name: string | null }

export type GoveeState = {
  online: boolean | null
  temp_c: number | null
  humidity_pct: number | null
}

/** Device types that carry a temperature reading. */
const SENSOR_TYPES = new Set(['devices.types.thermometer', 'devices.types.sensor'])

function headers(key: string): Record<string, string> {
  return { 'Govee-API-Key': key, 'Content-Type': 'application/json' }
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * The thermometers in a `GET /user/devices` body. Anything malformed is
 * dropped; a body that is not the expected shape throws, so the caller can
 * tell "no devices" from "could not read the list" (defect class 2).
 */
export function parseGoveeDevices(body: unknown): GoveeDevice[] {
  const data = (body as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) throw new Error('Govee device list: no data array')
  const out: GoveeDevice[] = []
  for (const d of data) {
    if (typeof d !== 'object' || d === null) continue
    const { sku, device, deviceName, type } = d as Record<string, unknown>
    if (typeof sku !== 'string' || typeof device !== 'string') continue
    if (typeof type !== 'string' || !SENSOR_TYPES.has(type)) continue
    out.push({ sku, device, name: typeof deviceName === 'string' ? deviceName : null })
  }
  return out
}

/**
 * One device's state from a `POST /device/state` body. A missing or
 * non-numeric figure is null, never 0; humidity outside 0–100 is null.
 * Throws when the body has no capabilities list at all.
 */
export function parseGoveeState(body: unknown): GoveeState {
  const caps = (body as { payload?: { capabilities?: unknown } } | null)?.payload?.capabilities
  if (!Array.isArray(caps)) throw new Error('Govee device state: no capabilities')
  let online: boolean | null = null
  let tempF: number | null = null
  let humidity: number | null = null
  for (const c of caps) {
    if (typeof c !== 'object' || c === null) continue
    const { instance, state } = c as { instance?: unknown; state?: { value?: unknown } }
    const value = state?.value
    if (instance === 'online' && typeof value === 'boolean') online = value
    else if (instance === 'sensorTemperature') tempF = finite(value)
    else if (instance === 'sensorHumidity') humidity = finite(value)
  }
  return {
    online,
    temp_c: tempF === null ? null : ((tempF - 32) * 5) / 9,
    humidity_pct: humidity !== null && humidity >= 0 && humidity <= 100 ? humidity : null,
  }
}

/** Govee answers 200 with its own `code` in the body; anything else there is a failure. */
function assertGoveeOk(body: unknown, what: string): void {
  const code = (body as { code?: unknown } | null)?.code
  if (code !== 200) throw new Error(`${what}: Govee code ${typeof code === 'number' ? code : 'missing'}`)
}

export async function fetchGoveeDevices(key: string, deadline?: number): Promise<GoveeDevice[]> {
  const res = await fetchWithRetry(`${BASE}/user/devices`, 3, headers(key), deadline)
  if (!res.ok) throw new Error(`Govee device list: HTTP ${res.status}`)
  const body: unknown = await res.json()
  assertGoveeOk(body, 'Govee device list')
  return parseGoveeDevices(body)
}

export async function fetchGoveeState(key: string, device: GoveeDevice, deadline?: number): Promise<GoveeState> {
  const request = JSON.stringify({ requestId: `wt6-${Date.now()}`, payload: { sku: device.sku, device: device.device } })
  const res = await fetchWithRetry(`${BASE}/device/state`, 3, headers(key), deadline, request)
  if (!res.ok) throw new Error(`Govee device state: HTTP ${res.status}`)
  const body: unknown = await res.json()
  assertGoveeOk(body, 'Govee device state')
  return parseGoveeState(body)
}
