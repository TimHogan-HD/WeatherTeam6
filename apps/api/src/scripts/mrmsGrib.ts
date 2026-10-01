/**
 * Minimal GRIB2 reader for NOAA MRMS 1 km products: a regular lat/lon grid
 * (template 3.0) packed as PNG (template 5.41), no bitmap. Anything else throws.
 * Scripts only — nothing in the app reads MRMS.
 */
import { gunzipSync, inflateSync } from 'node:zlib'

export type MrmsGrid = {
  ni: number
  nj: number
  la1: number
  lo1: number
  di: number
  dj: number
  /** Decoded values, row-major from `la1` southward. MRMS uses negatives for missing. */
  values: Float32Array
}

const signed32 = (b: Buffer, o: number) => {
  const v = b.readUInt32BE(o)
  return v & 0x80000000 ? -(v & 0x7fffffff) : v
}
const signed16 = (b: Buffer, o: number) => {
  const v = b.readUInt16BE(o)
  return v & 0x8000 ? -(v & 0x7fff) : v
}

function pngSamples(png: Buffer): { width: number; height: number; samples: Uint32Array } {
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
  const raw = inflateSync(Buffer.concat(idat))
  const out = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!
    const src = y * (stride + 1) + 1
    const row = y * stride
    const up = row - stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[row + x - bpp]! : 0
      const b = y > 0 ? out[up + x]! : 0
      const c = x >= bpp && y > 0 ? out[up + x - bpp]! : 0
      let p = raw[src + x]!
      if (filter === 1) p += a
      else if (filter === 2) p += b
      else if (filter === 3) p += (a + b) >> 1
      else if (filter === 4) {
        const pa = Math.abs(b - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + b - 2 * c)
        p += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      out[row + x] = p & 0xff
    }
  }
  const samples = new Uint32Array(width * height)
  for (let i = 0; i < samples.length; i++) {
    let v = 0
    for (let k = 0; k < bpp; k++) v = v * 256 + out[i * bpp + k]!
    samples[i] = v
  }
  return { width, height, samples }
}

export function decodeMrms(file: Buffer): MrmsGrid {
  const b = file[0] === 0x1f && file[1] === 0x8b ? gunzipSync(file) : file
  if (b.toString('ascii', 0, 4) !== 'GRIB' || b[7] !== 2) throw new Error('not GRIB2')
  let o = 16
  let grid: Omit<MrmsGrid, 'values'> | null = null
  let r = 0
  let e = 0
  let d = 0
  let values: Float32Array | null = null
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
      const { samples } = pngSamples(b.subarray(o + 5, o + len))
      const scaleE = 2 ** e
      const scaleD = 10 ** -d
      values = new Float32Array(samples.length)
      for (let i = 0; i < samples.length; i++) values[i] = (r + samples[i]! * scaleE) * scaleD
    }
    o += len
  }
  if (!grid || !values) throw new Error('missing grid or data section')
  if (values.length !== grid.ni * grid.nj) throw new Error('value count does not match grid')
  return { ...grid, values }
}

/** Nearest grid point. Longitudes in the file run 0..360. */
export function valueAt(g: MrmsGrid, lat: number, lon: number): number | null {
  const lon360 = lon < 0 ? lon + 360 : lon
  const j = Math.round((g.la1 - lat) / g.dj)
  const i = Math.round((lon360 - g.lo1) / g.di)
  if (i < 0 || j < 0 || i >= g.ni || j >= g.nj) return null
  return g.values[j * g.ni + i]!
}
