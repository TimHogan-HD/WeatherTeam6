import { colors } from '@weatherteam6/design/tokens'
import { describe, expect, it } from 'vitest'
import { buildWebManifest } from './webManifest.js'

/**
 * The manifest is what makes Add to Home Screen produce an app rather than a
 * bookmark, and every one of these fields fails silently: a browser that
 * dislikes the manifest installs a shortcut with browser chrome and says
 * nothing about why.
 */

describe('buildWebManifest', () => {
  it('declares the fields an installable app needs', () => {
    const manifest = buildWebManifest()
    expect(manifest.name).not.toBe('')
    expect(manifest.short_name).not.toBe('')
    expect(manifest.start_url).toBe('/')
    // Anything else — `browser`, or the field missing — installs a shortcut
    // that opens in a tab, which is what the bot's menu button replaced.
    expect(manifest.display).toBe('standalone')
  })

  /**
   * The reason this is TypeScript and not a `.webmanifest` in `public/`. A hex
   * typed into JSON is a colour redefined inside an app, and it would drift
   * from the gradient the moment the palette moved.
   */
  it('takes both colours from the design tokens', () => {
    const manifest = buildWebManifest()
    expect(manifest.theme_color).toBe(colors.bgGradientTop)
    expect(manifest.background_color).toBe(colors.bgGradientBottom)
  })

  /**
   * A maskable icon is cropped to the launcher's own shape. Listing an `any`
   * icon as maskable is what produces a logo with its corners sliced off, and
   * omitting maskable entirely makes Android draw a white plate behind the
   * icon — so exactly one entry carries the purpose, and it is its own file.
   */
  it('ships exactly one maskable icon, and it is not one of the others', () => {
    const icons = buildWebManifest().icons
    const maskable = icons.filter((icon) => icon.purpose === 'maskable')
    expect(maskable).toHaveLength(1)

    const others = icons.filter((icon) => icon.purpose !== 'maskable')
    expect(others.length).toBeGreaterThan(0)
    for (const icon of others) {
      expect(icon.src).not.toBe(maskable[0]?.src)
    }
  })

  /**
   * Chrome requires a 192px and a 512px icon for installability, and reports
   * neither absence in the UI — the install prompt simply never appears.
   */
  it('covers the sizes an install prompt requires', () => {
    const sizes = buildWebManifest().icons.map((icon) => icon.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
  })

  it('points every icon at a path the app actually serves', () => {
    for (const icon of buildWebManifest().icons) {
      expect(icon.src.startsWith('/icons/')).toBe(true)
      expect(icon.type).toBe('image/png')
    }
  })
})
