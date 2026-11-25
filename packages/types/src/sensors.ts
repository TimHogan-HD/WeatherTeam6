/**
 * The owner's own thermometer (Govee H5171), polled by `/api/cron/collect-sensors`
 * for data building (owner, 2026-11-25). Readings carry no location: the device
 * is portable and the owner chose to tag places later, not at collection time.
 * Nothing scores from it.
 */

/**
 * One device's newest stored reading (`GET /sensors`, owner only). Govee
 * reports no time of measurement, so `recorded_at` is when the server asked,
 * and only readings the device reported while online are stored: an offline
 * device leaves a gap, never its last value again.
 */
export type SensorReading = {
  device: string
  device_name: string | null
  recorded_at: string
  temp_c: number | null
  humidity_pct: number | null
}
