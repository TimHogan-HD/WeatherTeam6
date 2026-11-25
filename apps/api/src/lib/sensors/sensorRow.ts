import type { GoveeDevice, GoveeState } from '../weather/govee.js'

const MINUTE_MS = 60_000

/** The row a state becomes, or null when it is not a reading worth keeping. Pure, for the tests. */
export function toSensorRow(device: GoveeDevice, state: GoveeState, at: Date) {
  // Govee keeps answering an offline device's last value; that is not a reading.
  if (state.online !== true) return null
  if (state.temp_c === null && state.humidity_pct === null) return null
  return {
    device: device.device,
    sku: device.sku,
    device_name: device.name,
    // The minute asked, so a retried or overlapping run writes the same key.
    recorded_at: new Date(Math.floor(at.getTime() / MINUTE_MS) * MINUTE_MS),
    temp_c: state.temp_c,
    humidity_pct: state.humidity_pct,
  }
}
