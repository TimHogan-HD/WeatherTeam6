/**
 * Generates the PWA icons in `public/icons/` from the design tokens.
 *
 * `npm run icons --workspace=apps/miniapp`. The output is committed — this is
 * not a build step, because the icons change only when the mark or the palette
 * does, and running a rasteriser on every deploy to produce identical bytes
 * would be a build-time cost for nothing.
 *
 * **Why a script and not four PNGs somebody drew.** Every colour here comes
 * from `@weatherteam6/design/tokens`. A hand-made icon would be the palette
 * restated in a binary file, where the token rule cannot see it and nobody can
 * grep it — and the gradient is the same one `globals.css` paints, so the
 * installed icon and the app it opens would drift apart silently.
 *
 * No image library: there is none in this workspace and `sharp` is a native
 * dependency on a repo that already has a delicate vite resolution. A PNG of a
 * few flat shapes is a zlib stream and a CRC, both of which are in Node.
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { colors } from '@weatherteam6/design/tokens'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

/** Supersampling factor. 3× is enough for flat shapes at these sizes. */
const SS = 3

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/** `#rrggbb` or `rgba(r,g,b,a)` — both shapes the tokens use. */
function parseColor(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex !== null) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(value)
  if (rgba !== null) {
    const parts = rgba[1].split(',').map((p) => Number(p.trim()))
    return [parts[0], parts[1], parts[2], parts[3] ?? 1]
  }
  throw new Error(`Cannot parse colour: ${value}`)
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    1,
  ]
}

// ---------------------------------------------------------------------------
// Geometry, in unit coordinates so the mark is resolution independent
// ---------------------------------------------------------------------------

/** Inside a rounded square of side `s` with corner radius `r`? */
function inRoundedSquare(x, y, s, r) {
  if (x < 0 || y < 0 || x > s || y > s) return false
  const cx = x < r ? r : x > s - r ? s - r : x
  const cy = y < r ? r : y > s - r ? s - r : y
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

/** Even-odd point-in-polygon over a list of [x, y]. */
function inPolygon(x, y, points) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    const straddles = yi > y !== yj > y
    if (straddles && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function inCircle(x, y, cx, cy, r) {
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

/**
 * The mark: a crag in two planes with the sun behind it.
 *
 * It says what the app is about — rock, and the weather on it — at 48px, which
 * is where a home-screen icon is actually read. The sun sits behind the ridge
 * rather than beside it so the silhouette stays one shape when the launcher
 * shrinks it.
 *
 * Coordinates are fractions of the mark's box, y downwards.
 */
const FRONT_RIDGE = [
  [0.02, 0.96],
  [0.40, 0.20],
  [0.56, 0.52],
  [0.66, 0.38],
  [0.98, 0.96],
]
const BACK_RIDGE = [
  [0.52, 0.96],
  [0.80, 0.34],
  [1.04, 0.96],
]
const SUN = { cx: 0.70, cy: 0.20, r: 0.125 }

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * @param size   output edge length in pixels
 * @param bleed  true for a maskable icon: the background fills the square with
 *               square corners, because the launcher applies its own shape. A
 *               rounded background under a launcher mask shows as a sliced
 *               corner, which is the failure `purpose: maskable` exists to
 *               avoid.
 * @param margin the mark's inset as a fraction of `size`. Larger for maskable,
 *               where everything outside the centre 80% may be cropped away.
 */
function renderIcon(size, bleed, margin) {
  const top = parseColor(colors.bgGradientTop)
  const bottom = parseColor(colors.bgGradientBottom)
  const mid = parseColor(colors.bgGradientMid)
  const rock = parseColor(colors.txt1)
  const rockBack = parseColor(colors.txt3)
  const sun = parseColor(colors.good)

  const radius = bleed ? 0 : size * 0.22
  const box = size * (1 - margin * 2)
  const origin = size * margin

  const pixels = Buffer.alloc(size * size * 4)

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // Supersampled accumulation. Each sample is opaque or absent, so the
      // average is the coverage — which is the whole of the antialiasing.
      let r = 0
      let g = 0
      let b = 0
      let a = 0

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS
          const y = py + (sy + 0.5) / SS

          if (!inRoundedSquare(x, y, size, radius)) continue

          // Background: the same three-stop gradient globals.css paints, with
          // the mid stop at 45%.
          const t = y / size
          const bg = t < 0.45 ? mix(top, mid, t / 0.45) : mix(mid, bottom, (t - 0.45) / 0.55)

          // Mark coordinates.
          const mx = (x - origin) / box
          const my = (y - origin) / box

          let c = bg
          if (inCircle(mx, my, SUN.cx, SUN.cy, SUN.r)) c = sun
          if (inPolygon(mx, my, BACK_RIDGE)) c = rockBack
          if (inPolygon(mx, my, FRONT_RIDGE)) c = rock

          // `rockBack` is txt3, which is translucent — composite it over the
          // background rather than writing its nominal RGB, or the back ridge
          // would come out lighter than the front one it sits behind.
          if (c[3] < 1) c = mix(bg, [c[0], c[1], c[2], 1], c[3])

          r += c[0]
          g += c[1]
          b += c[2]
          a += 255
        }
      }

      const samples = SS * SS
      const coverage = a / samples
      const i = (py * size + px) * 4
      // Premultiplied averages divided back out by coverage, so an edge pixel
      // takes the shape's colour at partial alpha instead of fading to black.
      if (coverage > 0) {
        const covered = a / 255
        pixels[i] = Math.round(r / covered)
        pixels[i + 1] = Math.round(g / covered)
        pixels[i + 2] = Math.round(b / covered)
      }
      pixels[i + 3] = Math.round(coverage)
    }
  }

  return pixels
}

// ---------------------------------------------------------------------------
// PNG container
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([length, typed, crc])
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  // compression, filter, interlace — the only values PNG defines.

  // One filter byte per scanline. Filter 0 (none): these are flat shapes, so
  // the win from a predictor is small and the encoder stays readable.
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const from = y * size * 4
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, from, from + size * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------------------

const OUTPUTS = [
  { file: 'icon-192.png', size: 192, bleed: false, margin: 0.2 },
  { file: 'icon-512.png', size: 512, bleed: false, margin: 0.2 },
  { file: 'icon-maskable-512.png', size: 512, bleed: true, margin: 0.26 },
  // iOS crops nothing and applies its own rounding, so this one is full-bleed
  // with square corners too. 180px is what Safari asks for.
  { file: 'apple-touch-icon.png', size: 180, bleed: true, margin: 0.2 },
]

export { OUT_DIR, OUTPUTS }

/** filename → PNG bytes. Exported so `check-icons.mjs` compares like for like. */
export function renderIcons() {
  return new Map(
    OUTPUTS.map(({ file, size, bleed, margin }) => [
      file,
      encodePng(size, renderIcon(size, bleed, margin)),
    ]),
  )
}

// Only when run directly. `check-icons.mjs` imports this module and must not
// rewrite the files it is about to compare — a check that repairs what it
// checks always passes.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(OUT_DIR, { recursive: true })
  for (const [file, png] of renderIcons()) {
    writeFileSync(join(OUT_DIR, file), png)
    console.log(`${file}  ${png.length} bytes`)
  }
}
