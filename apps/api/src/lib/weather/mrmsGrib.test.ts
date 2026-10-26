import { describe, it, expect } from 'vitest'
import { deflateSync, gzipSync } from 'node:zlib'
import { readMrmsPoints } from './mrmsGrib.js'

/** One PNG filter applied to a row, per the PNG spec — written from the spec, not from the reader. */
function filterRow(type: number, row: Uint8Array, prev: Uint8Array, bpp: number): Uint8Array {
  const out = new Uint8Array(row.length)
  for (let x = 0; x < row.length; x++) {
    const a = x >= bpp ? row[x - bpp]! : 0
    const b = prev[x]!
    const c = x >= bpp ? prev[x - bpp]! : 0
    const predictor =
      type === 0 ? 0
      : type === 1 ? a
      : type === 2 ? b
      : type === 3 ? Math.floor((a + b) / 2)
      : (() => {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        })()
    out[x] = (row[x]! - predictor) & 0xff
  }
  return out
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)])
}

/** A 16-bit greyscale PNG, row y filtered with `filters[y]`. */
function png(samples: number[][], filters: number[]): Buffer {
  const height = samples.length
  const width = samples[0]!.length
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 16
  ihdr[9] = 0
  let prev = new Uint8Array(width * 2)
  const rows: Buffer[] = []
  samples.forEach((s, y) => {
    const row = new Uint8Array(width * 2)
    s.forEach((v, x) => {
      row[x * 2] = v >> 8
      row[x * 2 + 1] = v & 0xff
    })
    rows.push(Buffer.from([filters[y]!]), Buffer.from(filterRow(filters[y]!, row, prev, 2)))
    prev = row
  })
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function section(n: number, length: number, fill: (b: Buffer) => void): Buffer {
  const b = Buffer.alloc(length)
  b.writeUInt32BE(length, 0)
  b[4] = n
  fill(b)
  return b
}

/** A GRIB2 message laid out as MRMS's: template 3.0 grid, 5.41 PNG packing, no bitmap. */
function grib(samples: number[][], filters: number[], la1: number, lo1: number, step: number, d: number): Buffer {
  const s3 = section(3, 72, (b) => {
    b.writeUInt16BE(0, 12)
    b.writeUInt32BE(samples[0]!.length, 30)
    b.writeUInt32BE(samples.length, 34)
    b.writeInt32BE(Math.round(la1 * 1e6), 46)
    b.writeInt32BE(Math.round(lo1 * 1e6), 50)
    b.writeUInt32BE(Math.round(step * 1e6), 63)
    b.writeUInt32BE(Math.round(step * 1e6), 67)
    b[71] = 0
  })
  const s5 = section(5, 21, (b) => {
    b.writeUInt16BE(41, 9)
    b.writeFloatBE(0, 11)
    b.writeUInt16BE(0, 15)
    b.writeUInt16BE(d, 17)
  })
  const s6 = section(6, 6, (b) => {
    b[5] = 255
  })
  const p = png(samples, filters)
  const s7 = Buffer.concat([section(7, 5, () => {}), p])
  s7.writeUInt32BE(s7.length, 0)
  const body = Buffer.concat([s3, s5, s6, s7, Buffer.from('7777', 'ascii')])
  const s0 = Buffer.alloc(16)
  s0.write('GRIB', 0, 'ascii')
  s0[7] = 2
  s0.writeBigUInt64BE(BigInt(16 + body.length), 8)
  return Buffer.concat([s0, body])
}

describe('readMrmsPoints', () => {
  // Five rows, one per PNG filter type, with samples above 255 so both bytes
  // of each sample carry; a reader that kept the wrong previous row, or read
  // the wrong byte order, gets other numbers out.
  const samples = [
    [300, 12, 4000, 7],
    [301, 650, 3, 9000],
    [65000, 2, 777, 256],
    [5, 60000, 1024, 300],
    [1234, 4321, 0, 65535],
  ]
  const file = grib(samples, [0, 1, 2, 3, 4], 50, 260, 0.01, 1)
  const at = (j: number, i: number) => ({ lat: 50 - j * 0.01, lon: -100 + i * 0.01 })

  it('reads every cell through every row filter, scaled by the decimal factor', () => {
    const points = samples.flatMap((row, j) => row.map((_, i) => at(j, i)))
    expect(readMrmsPoints(file, points)).toEqual(samples.flat().map((v) => v / 10))
  })

  it('reads points in the order asked, not grid order', () => {
    expect(readMrmsPoints(file, [at(4, 3), at(0, 0), at(2, 1)])).toEqual([6553.5, 30, 0.2])
  })

  it('reads a gzipped file as MRMS ships it', () => {
    expect(readMrmsPoints(gzipSync(file), [at(3, 1)])).toEqual([6000])
  })

  it('takes the nearest cell', () => {
    expect(readMrmsPoints(file, [{ lat: 50 - 0.0149, lon: -100 + 0.0249 }])).toEqual([0.3])
  })

  it('is null for a point outside the grid', () => {
    expect(readMrmsPoints(file, [{ lat: 51, lon: -100 }, { lat: 49.98, lon: -99 }, at(1, 1)])).toEqual([null, null, 65])
  })

  it('throws on a file that is not GRIB2', () => {
    expect(() => readMrmsPoints(Buffer.from('not a grib file at all'), [at(0, 0)])).toThrow('not GRIB2')
  })
})
