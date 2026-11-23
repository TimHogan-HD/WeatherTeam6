import { describe, expect, it } from 'vitest'
import { colorsV2 } from '@weatherteam6/design/tokens'

/**
 * The text-contrast floor (WCAG 2.2 SC 1.4.3, AA: 4.5:1 for text under 24 px / 18.5 px
 * bold), measured with WCAG 2's formula on the surfaces text is drawn on. The design
 * system's floor used to be stated as opacities, which give a different ratio on every
 * surface: `txt5` at 38% measured 2.76–3.70:1 on the Rock tab (#648). A new text or
 * surface token goes in these lists, and a pair under the floor fails here.
 */

const hex = (h: string): [number, number, number] => {
  if (!/^#[0-9a-f]{6}$/i.test(h)) throw new Error(`not a #rrggbb colour: ${h}`)
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}
const lin = (c: number) => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const lum = ([r, g, b]: readonly [number, number, number]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const contrastRatio = (fg: string, bg: string): number => {
  const [x, y] = [lum(hex(fg)), lum(hex(bg))]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

const FLOOR = 4.5

/** Every surface small text sits on. */
const SURFACES = { bg: colorsV2.bg, surface: colorsV2.surface, card: colorsV2.card, raised: colorsV2.raised } as const

/** Every text colour, with the surfaces it is drawn on. */
const TEXT: Record<string, { color: string; on: readonly (keyof typeof SURFACES)[] }> = {
  txt1: { color: colorsV2.txt1, on: ['bg', 'surface', 'card', 'raised'] },
  txt2: { color: colorsV2.txt2, on: ['bg', 'surface', 'card', 'raised'] },
  txtMuted: { color: colorsV2.txtMuted, on: ['bg', 'surface', 'card', 'raised'] },
  brandInk: { color: colorsV2.brandInk, on: ['bg', 'surface', 'card', 'raised'] },
  // Not on `raised` (4.18:1): the one control that lays `raised` behind a label, the
  // Gauges source switch, swaps the label to `brandInk` in the same breath. Drawing
  // `txtTab` on `raised` anywhere needs a lighter token, not an entry here.
  txtTab: { color: colorsV2.txtTab, on: ['bg', 'surface', 'card'] },
}

describe('text contrast on every surface (WCAG 1.4.3, 4.5:1)', () => {
  for (const [name, { color, on }] of Object.entries(TEXT)) {
    for (const surface of on) {
      it(`${name} on ${surface}`, () => {
        expect(contrastRatio(color, SURFACES[surface])).toBeGreaterThanOrEqual(FLOOR)
      })
    }
  }

  it('measures the way WCAG does: black on white is 21, and a colour on itself is 1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio(colorsV2.card, colorsV2.card)).toBe(1)
    // The pair that fails, so the floor is shown to bite: txtTab on raised.
    expect(contrastRatio(colorsV2.txtTab, colorsV2.raised)).toBeLessThan(FLOOR)
  })
})
