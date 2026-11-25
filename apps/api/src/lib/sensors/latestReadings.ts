import { desc } from 'drizzle-orm'
import type { SensorReading } from '@weatherteam6/types'
import { db } from '../../db/index.js'
import { sensorReadings } from '../../db/schema.js'

/** Each device's newest stored reading, newest device first. */
export async function latestSensorReadings(): Promise<SensorReading[]> {
  const rows = await db
    .selectDistinctOn([sensorReadings.device])
    .from(sensorReadings)
    .orderBy(sensorReadings.device, desc(sensorReadings.recorded_at))
  return rows
    .map((r) => ({
      device: r.device,
      device_name: r.device_name ?? null,
      recorded_at: r.recorded_at.toISOString(),
      temp_c: r.temp_c ?? null,
      humidity_pct: r.humidity_pct ?? null,
    }))
    .sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at))
}
