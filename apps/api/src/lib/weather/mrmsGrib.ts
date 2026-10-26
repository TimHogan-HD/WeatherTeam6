/**
 * Minimal GRIB2 reader for NOAA MRMS 1 km products: a regular lat/lon grid
 * (template 3.0) packed as PNG (template 5.41), no bitmap. Anything else throws.
 *
 * It reads points, not the grid. A CONUS file is 7000 x 3500 samples, and
 * unfiltering all of them in JS took 7.5 s; only the rows down to the
 * southernmost point are unfiltered, two rows at a time, and only the points'
 * samples are scaled.
 */
import { gunzipSync, inflateSync } from 'node:zlib'

export type LatLon = { lat: number; lon: number }

type Grid = { ni: number; nj: number; la1: number; lo1: number; di: number; dj: number }

const signed32 = (b: Buffer, o: number) => {
  const v = b.readUInt32BE(o)
  return v & 0x80000000 ? -(v & 0x7fffffff) : v
}
const signed16 = (b: Buffer, o: number) => {
  const v = b.readUInt16BE(o)
  return v & 0x8000 ? -(v & 0x7fff) : v
}

/** Nearest grid cell, or null outside the grid. Longitudes in the file run 0..360. */
function cellOf(g: Grid, p: LatLon): { i: number; j: number } | null {
  const lon360 = p.lon < 0 ? p.lon + 360 : p.lon
  const j = Math.round((g.la1 - p.lat) / g.dj)
  const i = Math.round((lon360 - g.lo1) / g.di)
  return i < 0 || j < 0 || i >= g.ni || j >= g.nj ? null : { i, j }
}

/** The raw PNG samples at each cell, unfiltering only the rows up to the last one asked for. */
function pngSamplesAt(png: Buffer, cells: ({ i: number; j: number } | null)[]): (number | null)[] {
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('section 7 is not PNG')
  let o = 8
  let width = 0
  let height = 0
  let depth = 0
  let colour = 0
  const idat: Buffer[] = []
  while (o < png.length) {
    const len = png.readUInt32BE(o)
    const type = png.toString('ascii', o + 4, o + 8)
    const data = png.subarray(o + 8, o + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      depth = data[8]!
      colour = data[9]!
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    o += 12 + len
  }
  const channels = colour === 0 ? 1 : colour === 2 ? 3 : colour === 6 ? 4 : 0
  if (!channels || depth % 8 !== 0) throw new Error(`unsupported PNG colour ${colour} depth ${depth}`)
  const bpp = (channels * depth) / 8
  const stride = width * bpp
  const raw: Uint8Array = inflateSync(Buffer.concat(idat))
  if (raw.length !== (stride + 1) * height) throw new Error('PNG data does not match its header')

  const lastRow = Math.max(-1, ...cells.map((c) => (c === null ? -1 : c.j)))
  const out: (number | null)[] = cells.map(() => null)
  let prev = new Uint8Array(stride)
  let cur = new Uint8Array(stride)
  for (let y = 0; y <= lastRow; y++) {
    const filter = raw[y * (stride + 1)]!
    const src = y * (stride + 1) + 1
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp]! : 0
      const b = prev[x]!
      let p = raw[src + x]!
      if (filter === 1) p += a
      else if (filter === 2) p += b
      else if (filter === 3) p += (a + b) >> 1
      else if (filter === 4) {
        const c = x >= bpp ? prev[x - bpp]! : 0
        const pa = Math.abs(b - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + b - 2 * c)
        p += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      cur[x] = p & 0xff
    }
    cells.forEach((c, k) => {
      if (c === null || c.j !== y) return
      let v = 0
      for (let n = 0; n < bpp; n++) v = v * 256 + cur[c.i * bpp + n]!
      out[k] = v
    })
    ;[prev, cur] = [cur, prev]
  }
  return out
}

/**
 * The value at each point, nearest grid cell; null outside the grid. MRMS uses
 * negatives for "no coverage" and "missing", and they are returned as read —
 * the caller decides what a negative means.
 */
export function readMrmsPoints(file: Buffer, points: readonly LatLon[]): (number | null)[] {
  const b = file[0] === 0x1f && file[1] === 0x8b ? gunzipSync(file) : file
  if (b.toString('ascii', 0, 4) !== 'GRIB' || b[7] !== 2) throw new Error('not GRIB2')
  let o = 16
  let grid: Grid | null = null
  let r = 0
  let e = 0
  let d = 0
  let samples: (number | null)[] | null = null
  while (o < b.length - 4 && b.toString('ascii', o, o + 4) !== '7777') {
    const len = b.readUInt32BE(o)
    const n = b[o + 4]
    if (n === 3) {
      if (b.readUInt16BE(o + 12) !== 0) throw new Error('grid is not template 3.0')
      if (b[o + 71] !== 0) throw new Error(`unexpected scanning mode ${b[o + 71]}`)
      grid = {
        ni: b.readUInt32BE(o + 30),
        nj: b.readUInt32BE(o + 34),
        la1: signed32(b, o + 46) / 1e6,
        lo1: signed32(b, o + 50) / 1e6,
        di: b.readUInt32BE(o + 63) / 1e6,
        dj: b.readUInt32BE(o + 67) / 1e6,
      }
    } else if (n === 5) {
      if (b.readUInt16BE(o + 9) !== 41) throw new Error('packing is not PNG (5.41)')
      r = b.readFloatBE(o + 11)
      e = signed16(b, o + 15)
      d = signed16(b, o + 17)
    } else if (n === 6) {
      if (b[o + 5] !== 255) throw new Error('bitmap present')
    } else if (n === 7) {
      if (!grid) throw new Error('data section before grid section')
      const g = grid
      samples = pngSamplesAt(b.subarray(o + 5, o + len), points.map((p) => cellOf(g, p)))
    }
    o += len
  }
  if (!grid || !samples) throw new Error('missing grid or data section')
  const scaleE = 2 ** e
  // Divided, not multiplied by 10 ** -d: 3 * 0.1 is 0.30000000000000004.
  const scaleD = 10 ** d
  return samples.map((s) => (s === null ? null : (r + s * scaleE) / scaleD))
}
