import { db } from '../../db/index.js'
import { sensorReadings } from '../../db/schema.js'
import { describeError } from '../http.js'
import { logger } from '../logger.js'
import { fetchGoveeDevices, fetchGoveeState } from '../weather/govee.js'
import { toSensorRow } from './sensorRow.js'
import { FETCH_BUDGET_MS } from '../weather/openMeteo.js'

export type CollectSensorsResult = {
  devices: number
  stored: number
  /** Devices Govee reported offline (or did not say): nothing stored, a gap. */
  offline: string[]
  failed: string[]
}

/**
 * Store one reading from every thermometer on the owner's Govee account.
 * Idempotent per minute. Throws only when the device list cannot be read, so
 * the route answers 500 rather than a clean-looking `devices: 0`.
 */
export async function collectSensors(key: string, now: Date = new Date()): Promise<CollectSensorsResult> {
  const deadline = Date.now() + FETCH_BUDGET_MS
  const devices = await fetchGoveeDevices(key, Date.now() + 15_000)
  const states = await Promise.allSettled(devices.map((d) => fetchGoveeState(key, d, deadline)))

  const result: CollectSensorsResult = { devices: devices.length, stored: 0, offline: [], failed: [] }
  const rows = []
  for (const [i, settled] of states.entries()) {
    const device = devices[i]
    if (device === undefined) continue
    if (settled.status === 'rejected') {
      result.failed.push(device.device)
      logger.warn({ device: device.device, reason: describeError(settled.reason) }, '[sensors] state fetch failed')
      continue
    }
    const row = toSensorRow(device, settled.value, now)
    if (row === null) result.offline.push(device.device)
    else rows.push(row)
  }

  if (rows.length > 0) {
    const inserted = await db
      .insert(sensorReadings)
      .values(rows)
      .onConflictDoNothing()
      .returning({ device: sensorReadings.device })
    result.stored = inserted.length
  }
  return result
}
