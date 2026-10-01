/**
 * Pulls hourly MRMS gauge-corrected rain (MultiSensor QPE 01H Pass2) at each
 * point of `MRMS_PAIRS` — the crag and its airport — into a JSONL cache that
 * `compare:mrms` reads. Network and CPU only; no database.
 *
 * `tsx src/scripts/collectMrms.ts <out.jsonl> <days> [shard] [shards]`
 *
 * One line per hour: `{ hour, crag: [...], airport: [...] }`, millimetres,
 * null where MRMS has no value (negative in the file) or the file is absent.
 * The hour is the END of the accumulation, as Open-Meteo stamps it.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { fetchWithRetry } from '../lib/weather/openMeteo.js'
import { decodeMrms, valueAt } from './mrmsGrib.js'
import { MRMS_PAIRS } from './mrmsPoints.js'

const BUCKET = 'https://noaa-mrms-pds.s3.amazonaws.com/CONUS/MultiSensor_QPE_01H_Pass2_00.00'

async function airports(): Promise<Map<string, { lat: number; lon: number }>> {
  const out = new Map<string, { lat: number; lon: number }>()
  for (const id of new Set(MRMS_PAIRS.map((p) => p.station))) {
    const meta = await fetchWithRetry(`https://mesonet.agron.iastate.edu/api/1/station/${id}.json`).catch(() => null)
    if (meta?.ok) {
      const body = (await meta.json()) as { data?: { latitude: number; longitude: number }[] }
      const d = body.data?.[0]
      if (d) out.set(id, { lat: d.latitude, lon: d.longitude })
    }
  }
  return out
}

async function run(): Promise<void> {
  const [outPath, daysArg, shardArg = '0', shardsArg = '1'] = process.argv.slice(2)
  if (!outPath || !daysArg) throw new Error('usage: collectMrms <out.jsonl> <days> [shard] [shards]')
  const shard = Number(shardArg)
  const shards = Number(shardsArg)
  const done = new Set(
    existsSync(outPath)
      ? readFileSync(outPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => (JSON.parse(l) as { hour: string }).hour)
      : [],
  )
  const ap = await airports()
  for (const p of MRMS_PAIRS) if (!ap.has(p.station)) throw new Error(`no coordinates for ${p.station}`)

  const end = new Date()
  end.setUTCMinutes(0, 0, 0)
  end.setUTCHours(end.getUTCHours() - 2) // Pass2 lands about an hour after the hour
  const hours: Date[] = []
  for (let t = end.getTime() - Number(daysArg) * 86_400_000; t <= end.getTime(); t += 3_600_000) hours.push(new Date(t))

  let n = 0
  for (const [i, h] of hours.entries()) {
    if (i % shards !== shard) continue
    const hour = h.toISOString().slice(0, 13)
    if (done.has(hour)) continue
    const stamp = `${hour.slice(0, 10).replaceAll('-', '')}-${hour.slice(11, 13)}0000`
    const url = `${BUCKET}/${stamp.slice(0, 8)}/MRMS_MultiSensor_QPE_01H_Pass2_00.00_${stamp}.grib2.gz`
    let crag: (number | null)[] = MRMS_PAIRS.map(() => null)
    let airport: (number | null)[] = MRMS_PAIRS.map(() => null)
    try {
      const res = await fetchWithRetry(url)
      if (res.ok) {
        const grid = decodeMrms(Buffer.from(await res.arrayBuffer()))
        const at = (lat: number, lon: number) => {
          const v = valueAt(grid, lat, lon)
          return v === null || v < 0 ? null : Math.round(v * 100) / 100
        }
        crag = MRMS_PAIRS.map((p) => at(p.lat, p.lon))
        airport = MRMS_PAIRS.map((p) => {
          const a = ap.get(p.station)!
          return at(a.lat, a.lon)
        })
      } else console.error(`${hour} ${res.status}`)
    } catch (err) {
      console.error(`${hour} ${(err as Error).message}`)
    }
    appendFileSync(outPath, `${JSON.stringify({ hour, crag, airport })}\n`)
    if (++n % 50 === 0) console.error(`shard ${shard}: ${n} hours`)
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
