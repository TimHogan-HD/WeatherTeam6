/**
 * Regenerates `packages/types/src/sunWallsData.ts` — the cliff faces and
 * skylines behind the Rock tab's sun-on-the-wall hours (#415) — for every
 * `KNOWN_CRAGS` entry with `sun_confirmed`.
 *
 *   npm run sun:walls --workspace=apps/api
 *
 * **Computed once and committed, never at request time:** a skyline reads
 * millions of elevation samples, and the client then needs only the sun's
 * position against 360 numbers. Re-run it when a crag gains `sun_confirmed`.
 *
 * Per crag:
 * 1. **USGS 1 m lidar** (3DEP, public domain) over the crag's box plus a
 *    margin. Every file the National Map lists is read and merged, newest
 *    first, because the first file listed can be blank over a crag (Sandstone's
 *    was, 2026-10-27).
 * 2. **Faces**: cells steeper than `FACE_SLOPE_DEG`, grouped while their facing
 *    stays within one compass point, kept when big and tall enough and within
 *    `NEAR_GUIDEBOOK_M` of an OpenBeta wall — one face per wall name, the
 *    nearest. OpenBeta's points are wrong on the ground (owner, 2026-09-29), so
 *    the name is a pointer; the owner chose to show every face under it
 *    (2026-10-27).
 * 3. **The foot**: walk out from the face's middle the way it faces until the
 *    ground flattens. Its height is the input that matters most — Google's
 *    237 m at Winter Wall was 25 m low, and that flipped an afternoon from shade
 *    to sun.
 * 4. **The skyline** from 1.5 m above the foot: lidar out to the window's edge,
 *    then AWS Terrarium tiles (the map's own terrain source) to 20 km, with
 *    earth curvature and standard refraction.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { fromUrl, type GeoTIFFImage } from 'geotiff'
import { KNOWN_CRAGS, type KnownCrag, type SunWall, type SunWalls } from '@weatherteam6/types'
import { MN_GUIDEBOOK } from '../lib/guidebook/guidebookMn.js'
import { fetchWithRetry } from '../lib/weather/openMeteo.js'

const DEG = Math.PI / 180
const EARTH_R = 6_371_000
/** Standard refraction coefficient: the curvature drop is scaled by 1 − k. */
const REFRACTION_K = 0.13

/** Margin around the crag's box read from lidar, and the least half-width read, in metres. */
const MARGIN_M = 300
const MIN_HALF_M = 600
/** Steeper than this over 2 m is cliff. */
const FACE_SLOPE_DEG = 60
/** A face is at least this many square metres of cliff... */
const MIN_FACE_CELLS = 40
/** ...and this tall. */
const MIN_FACE_HEIGHT_M = 6
/** A face further than this from every OpenBeta wall is not a climbing wall here. */
const NEAR_GUIDEBOOK_M = 200
/** The ground has flattened once it drops less than this slope per metre. */
const FOOT_SLOPE_DEG = 30
/** A climber's eye at the base. */
const EYE_M = 1.5
const HORIZON_KM = 20

const TNM =
  'https://tnmaccess.nationalmap.gov/api/v1/products?datasets=' +
  encodeURIComponent('Digital Elevation Model (DEM) 1 meter')

type LatLon = { lat: number; lon: number }

// ── geometry ──────────────────────────────────────────────────────────────────

/** NAD83 / WGS84 lat-lon to UTM metres in `zone` (north). The two datums agree to a metre here. */
function utm({ lat, lon }: LatLon, zone: number): { x: number; y: number } {
  const a = 6378137
  const f = 1 / 298.257222101
  const k0 = 0.9996
  const e2 = f * (2 - f)
  const ep2 = e2 / (1 - e2)
  const phi = lat * DEG
  const lam0 = (zone * 6 - 183) * DEG
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2)
  const T = Math.tan(phi) ** 2
  const C = ep2 * Math.cos(phi) ** 2
  const A = Math.cos(phi) * (lon * DEG - lam0)
  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64) * phi -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32) * Math.sin(2 * phi) +
      ((15 * e2 ** 2) / 256) * Math.sin(4 * phi))
  return {
    x: 500000 + k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T) * A ** 5) / 120),
    y: k0 * (M + N * Math.tan(phi) * ((A * A) / 2 + ((5 - T + 9 * C) * A ** 4) / 24)),
  }
}

/** The point `e` metres east and `n` north of `p`. Flat-earth, fine within a few km. */
function offset(p: LatLon, e: number, n: number): LatLon {
  return { lat: p.lat + n / EARTH_R / DEG, lon: p.lon + e / EARTH_R / DEG / Math.cos(p.lat * DEG) }
}

function metresBetween(a: LatLon, b: LatLon): number {
  return Math.hypot((a.lat - b.lat) * DEG * EARTH_R, (a.lon - b.lon) * DEG * EARTH_R * Math.cos(a.lat * DEG))
}

// ── Terrarium tiles, for the distant skyline ───────────────────────────────────

type Png = { w: number; px: Uint8Array; ch: number }

/** The PNGs Terrarium serves: 8-bit RGB or RGBA, not interlaced. */
function decodePng(buf: Buffer): Png {
  let p = 8
  let w = 0
  let h = 0
  let ch = 3
  const idat: Buffer[] = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString('ascii', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      ch = data[9] === 6 ? 4 : 3
    }
    if (type === 'IDAT') idat.push(data)
    p += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const px = new Uint8Array(h * stride)
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? (px[y * stride + x - ch] ?? 0) : 0
      const b = y > 0 ? (px[(y - 1) * stride + x] ?? 0) : 0
      const c = x >= ch && y > 0 ? (px[(y - 1) * stride + x - ch] ?? 0) : 0
      let v = row[x] ?? 0
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const pp = a + b - c
        const pa = Math.abs(pp - a)
        const pb = Math.abs(pp - b)
        const pc = Math.abs(pp - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      px[y * stride + x] = v & 255
    }
  }
  return { w, px, ch }
}

const tiles = new Map<string, Promise<Png>>()

function tile(z: number, x: number, y: number): Promise<Png> {
  const key = `${z}/${x}/${y}`
  let got = tiles.get(key)
  if (got === undefined) {
    got = fetchWithRetry(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${key}.png`).then(async (res) => {
      if (!res.ok) throw new Error(`Terrarium tile ${key}: HTTP ${res.status}`)
      return decodePng(Buffer.from(await res.arrayBuffer()))
    })
    tiles.set(key, got)
  }
  return got
}

/** Terrarium elevation in metres, bilinear between pixel centres. */
async function terrarium(p: LatLon, z: number): Promise<number> {
  const n = 2 ** z
  const fx = ((p.lon + 180) / 360) * n * 256
  const fy = ((1 - Math.log(Math.tan(p.lat * DEG) + 1 / Math.cos(p.lat * DEG)) / Math.PI) / 2) * n * 256
  const at = async (gx: number, gy: number) => {
    const t = await tile(z, Math.floor(gx / 256), Math.floor(gy / 256))
    const i = ((gy % 256) * t.w + (gx % 256)) * t.ch
    return (t.px[i] ?? 0) * 256 + (t.px[i + 1] ?? 0) + (t.px[i + 2] ?? 0) / 256 - 32768
  }
  const x0 = Math.floor(fx - 0.5)
  const y0 = Math.floor(fy - 0.5)
  const tx = fx - 0.5 - x0
  const ty = fy - 0.5 - y0
  const [a, b, c, d] = await Promise.all([at(x0, y0), at(x0 + 1, y0), at(x0, y0 + 1), at(x0 + 1, y0 + 1)])
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty
}

// ── lidar ─────────────────────────────────────────────────────────────────────

/** A square of 1 m lidar centred on `centre`, rows north to south. NaN where no file had data. */
type Grid = { centre: LatLon; zone: number; x0: number; y0: number; size: number; z: Float32Array }

type TnmItem = { title: string; downloadURL: string; publicationDate: string }

function utmZoneOf(img: GeoTIFFImage): number | null {
  const code = (img.getGeoKeys() as { ProjectedCSTypeGeoKey?: number }).ProjectedCSTypeGeoKey
  // EPSG 269xx is NAD83 / UTM zone xx north, the projection 3DEP's 1 m tiles use.
  return code !== undefined && code > 26900 && code < 26961 ? code - 26900 : null
}

async function readLidar(crag: KnownCrag, centre: LatLon, half: number): Promise<Grid> {
  const { south, north, west, east } = crag.bbox
  const res = await fetchWithRetry(`${TNM}&bbox=${west},${south},${east},${north}&max=50&outputFormat=JSON`)
  if (!res.ok) throw new Error(`National Map products: HTTP ${res.status}`)
  const items = ((await res.json()) as { items: TnmItem[] }).items
    .filter((i) => i.downloadURL.endsWith('.tif'))
    .sort((a, b) => b.publicationDate.localeCompare(a.publicationDate))
  if (items.length === 0) throw new Error(`${crag.slug}: no 1 m lidar listed`)

  const size = Math.round(2 * half)
  const z = new Float32Array(size * size).fill(Number.NaN)
  let zone: number | null = null
  let x0 = 0
  let y0 = 0
  for (const item of items) {
    const img = await (await fromUrl(item.downloadURL)).getImage()
    const itemZone = utmZoneOf(img)
    const [rx, ry] = img.getResolution()
    if (itemZone === null || rx !== 1 || ry !== -1) {
      console.log(`  skip ${item.title}: not 1 m NAD83 UTM`)
      continue
    }
    if (zone === null) {
      zone = itemZone
      const p = utm(centre, zone)
      x0 = Math.floor(p.x - half)
      y0 = Math.floor(p.y + half)
    } else if (itemZone !== zone) {
      console.log(`  skip ${item.title}: zone ${itemZone}, not ${zone}`)
      continue
    }
    const [ox, oy] = img.getOrigin() as [number, number]
    const c0 = Math.round(x0 - ox)
    const r0 = Math.round(oy - y0)
    const [band] = (await img.readRasters({ window: [c0, r0, c0 + size, r0 + size], fillValue: -9999 })) as unknown as [
      Float32Array,
    ]
    let filled = 0
    for (let i = 0; i < z.length; i++) {
      const v = band[i] ?? -9999
      if (Number.isNaN(z[i] ?? 0) && v > -1000) {
        z[i] = v
        filled++
      }
    }
    console.log(`  ${item.title}: ${filled} cells`)
    if (!z.some((v) => Number.isNaN(v))) break
  }
  if (zone === null) throw new Error(`${crag.slug}: no usable lidar file`)
  return { centre, zone, x0, y0, size, z }
}

function cell(g: Grid, c: number, r: number): number {
  return c < 0 || r < 0 || c >= g.size || r >= g.size ? Number.NaN : (g.z[r * g.size + c] ?? Number.NaN)
}

/** Lidar elevation at a point, bilinear, or null off the grid or in a gap. */
function lidarAt(g: Grid, p: LatLon): number | null {
  const u = utm(p, g.zone)
  const c = u.x - g.x0 - 0.5
  const r = g.y0 - u.y - 0.5
  const ci = Math.floor(c)
  const ri = Math.floor(r)
  const tx = c - ci
  const ty = r - ri
  const v =
    cell(g, ci, ri) * (1 - tx) * (1 - ty) +
    cell(g, ci + 1, ri) * tx * (1 - ty) +
    cell(g, ci, ri + 1) * (1 - tx) * ty +
    cell(g, ci + 1, ri + 1) * tx * ty
  return Number.isFinite(v) ? v : null
}

/** A cell's centre as lat-lon, through its offset from the grid's centre. */
function cellLatLon(g: Grid, c: number, r: number): LatLon {
  const p = utm(g.centre, g.zone)
  return offset(g.centre, g.x0 + c + 0.5 - p.x, g.y0 - r - 0.5 - p.y)
}

// ── faces ─────────────────────────────────────────────────────────────────────

type Face = { cells: number[]; aspectDeg: number; mid: LatLon; heightM: number }

function findFaces(g: Grid): Face[] {
  const n = g.size
  const sector = new Int8Array(n * n).fill(-1)
  const aspect = new Float32Array(n * n)
  for (let r = 1; r < n - 1; r++) {
    for (let c = 1; c < n - 1; c++) {
      const gx = (cell(g, c + 1, r) - cell(g, c - 1, r)) / 2
      const gy = (cell(g, c, r - 1) - cell(g, c, r + 1)) / 2
      if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue
      if (Math.atan(Math.hypot(gx, gy)) / DEG < FACE_SLOPE_DEG) continue
      const asp = (Math.atan2(-gx, -gy) / DEG + 360) % 360
      aspect[r * n + c] = asp
      sector[r * n + c] = Math.round(asp / 22.5) % 16
    }
  }

  const seen = new Uint8Array(n * n)
  const faces: Face[] = []
  for (let i = 0; i < n * n; i++) {
    const s = sector[i] ?? -1
    if (s < 0 || seen[i] === 1) continue
    const stack = [i]
    const cells: number[] = []
    seen[i] = 1
    while (stack.length > 0) {
      const j = stack.pop() as number
      cells.push(j)
      const c = j % n
      const r = Math.floor(j / n)
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (c + dc < 0 || c + dc >= n || r + dr < 0 || r + dr >= n) continue
          const k = (r + dr) * n + c + dc
          const sk = sector[k] ?? -1
          if (seen[k] === 1 || sk < 0) continue
          const d = Math.abs(sk - s) % 16
          if (Math.min(d, 16 - d) <= 1) {
            seen[k] = 1
            stack.push(k)
          }
        }
      }
    }
    if (cells.length < MIN_FACE_CELLS) continue
    let sx = 0
    let sy = 0
    let sc = 0
    let sr = 0
    let lo = Infinity
    let hi = -Infinity
    for (const j of cells) {
      const a = (aspect[j] ?? 0) * DEG
      sx += Math.sin(a)
      sy += Math.cos(a)
      sc += j % n
      sr += Math.floor(j / n)
      lo = Math.min(lo, g.z[j] ?? lo)
      hi = Math.max(hi, g.z[j] ?? hi)
    }
    faces.push({
      cells,
      aspectDeg: (Math.atan2(sx, sy) / DEG + 360) % 360,
      mid: cellLatLon(g, sc / cells.length, sr / cells.length),
      heightM: hi - lo,
    })
  }
  return faces.filter((f) => f.heightM >= MIN_FACE_HEIGHT_M)
}

/** Walk out from the face the way it looks until the ground stops falling steeply. */
function footOf(g: Grid, face: Face): LatLon {
  const step = { e: Math.sin(face.aspectDeg * DEG), n: Math.cos(face.aspectDeg * DEG) }
  let foot = face.mid
  let prev = lidarAt(g, foot) ?? 0
  for (let s = 1; s <= 40; s++) {
    const p = offset(face.mid, s * step.e, s * step.n)
    const h = lidarAt(g, p)
    if (h === null) break
    foot = p
    if (prev - h < Math.tan(FOOT_SLOPE_DEG * DEG)) break
    prev = h
  }
  return foot
}

async function skyline(g: Grid, foot: LatLon, half: number): Promise<number[]> {
  const footZ = lidarAt(g, foot)
  if (footZ === null) throw new Error(`no lidar at the foot ${foot.lat}, ${foot.lon}`)
  const eye = footZ + EYE_M
  const out: number[] = []
  for (let az = 0; az < 360; az++) {
    let best = -90
    for (let d = 3; d <= HORIZON_KM * 1000; d += d < half ? 2 : d < 6000 ? 60 : 150) {
      const p = offset(foot, d * Math.sin(az * DEG), d * Math.cos(az * DEG))
      const h = (d < half ? lidarAt(g, p) : null) ?? (await terrarium(p, d < 2000 ? 15 : 12))
      const drop = ((d * d) / (2 * EARTH_R)) * (1 - REFRACTION_K)
      best = Math.max(best, Math.atan2(h - eye - drop, d) / DEG)
    }
    out.push(Math.round(best * 10) / 10)
  }
  return out
}

// ── per crag ──────────────────────────────────────────────────────────────────

/** OpenBeta's walls near the crag: areas with a point and no sub-area. */
function guidebookWalls(centre: LatLon, half: number): { name: string; at: LatLon }[] {
  const parents = new Set(MN_GUIDEBOOK.map((a) => a.parent))
  return MN_GUIDEBOOK.flatMap((a) =>
    a.lat === null || a.lon === null || parents.has(a.id) || metresBetween(centre, { lat: a.lat, lon: a.lon }) > half * 1.5
      ? []
      : [{ name: a.name, at: { lat: a.lat, lon: a.lon } }],
  )
}

async function wallsFor(crag: KnownCrag): Promise<SunWall[]> {
  const { south, north, west, east } = crag.bbox
  const centre = { lat: (south + north) / 2, lon: (west + east) / 2 }
  const half = Math.max(MIN_HALF_M, metresBetween({ lat: south, lon: west }, { lat: north, lon: east }) / 2 + MARGIN_M)
  const named = guidebookWalls(centre, half)
  if (named.length === 0) throw new Error(`${crag.slug}: no OpenBeta walls near it`)

  const g = await readLidar(crag, centre, half)
  const nearest = new Map<string, { face: Face; d: number }>()
  for (const face of findFaces(g)) {
    const pick = named
      .map((w) => ({ name: w.name, d: metresBetween(w.at, face.mid) }))
      .sort((a, b) => a.d - b.d)[0]
    if (pick === undefined || pick.d > NEAR_GUIDEBOOK_M) continue
    const had = nearest.get(pick.name)
    if (had === undefined || pick.d < had.d) nearest.set(pick.name, { face, d: pick.d })
  }

  const walls: SunWall[] = []
  for (const [name, { face, d }] of [...nearest].sort(([a], [b]) => a.localeCompare(b))) {
    const foot = footOf(g, face)
    console.log(`  ${name}: faces ${face.aspectDeg.toFixed(0)}°, ${face.heightM.toFixed(0)} m, ${d.toFixed(0)} m from its OpenBeta point`)
    walls.push({
      name,
      aspect_deg: Math.round(face.aspectDeg),
      height_m: Math.round(face.heightM),
      foot: { lat: Number(foot.lat.toFixed(5)), lon: Number(foot.lon.toFixed(5)) },
      horizon_deg: await skyline(g, foot, half),
    })
  }
  return walls
}

/** The crag's IANA zone, from Open-Meteo's own answer — the zone every forecast here is read in. */
async function timeZoneOf(crag: KnownCrag): Promise<string> {
  const lat = (crag.bbox.south + crag.bbox.north) / 2
  const lon = (crag.bbox.west + crag.bbox.east) / 2
  const res = await fetchWithRetry(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=1&daily=sunrise`,
  )
  const zone = res.ok ? ((await res.json()) as { timezone?: string }).timezone : undefined
  if (zone === undefined) throw new Error(`${crag.slug}: no time zone (HTTP ${res.status})`)
  return zone
}

async function main(): Promise<void> {
  const out: Record<string, SunWalls> = {}
  const computed = new Date().toISOString().slice(0, 10)
  for (const crag of KNOWN_CRAGS.filter((c) => c.sun_confirmed === true)) {
    console.log(crag.name)
    out[crag.slug] = { time_zone: await timeZoneOf(crag), computed, walls: await wallsFor(crag) }
  }

  const body = Object.entries(out)
    .map(([slug, s]) => {
      const walls = s.walls.map((w) => `      ${JSON.stringify(w)},`).join('\n')
      return `  ${JSON.stringify(slug)}: {\n    time_zone: ${JSON.stringify(s.time_zone)},\n    computed: ${JSON.stringify(s.computed)},\n    walls: [\n${walls}\n    ],\n  },`
    })
    .join('\n')
  const file = `/**
 * The cliff faces and skylines behind the Rock tab's sun-on-the-wall hours
 * (#415), for every \`KNOWN_CRAGS\` entry with \`sun_confirmed\`. Generated by
 * \`npm run sun:walls\` (\`apps/api\`) from USGS 3DEP 1 m lidar (public domain)
 * and AWS Terrarium tiles — do not edit by hand. \`SunWall\` says what each field is.
 */
import type { SunWalls } from './sun.js'

export const SUN_WALLS: Readonly<Record<string, SunWalls>> = {
${body}
}
`
  const target = fileURLToPath(new URL('../../../../packages/types/src/sunWallsData.ts', import.meta.url))
  writeFileSync(target, file)
  console.log(`wrote ${target}`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
