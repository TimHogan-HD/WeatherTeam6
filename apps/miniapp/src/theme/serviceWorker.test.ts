import { describe, expect, it } from 'vitest'
import { renderServiceWorker, shellFiles } from './serviceWorker.js'

const precacheOf = (source: string): string[] => {
  const match = /const PRECACHE = (\[.*\])/.exec(source)
  return JSON.parse(match?.[1] ?? '[]') as string[]
}
const versionOf = (source: string) => /const CACHE = '([^']+)'/.exec(source)?.[1]

describe('service worker', () => {
  it('keeps the page and the hashed build output, never source maps or the manifest', () => {
    const files = shellFiles([
      'assets/index-a.js',
      'assets/index-a.js.map',
      'assets/index-b.css',
      'index.html',
      'manifest.webmanifest',
    ])
    expect(precacheOf(renderServiceWorker(files, '<html>'))).toEqual([
      '/assets/index-a.js',
      '/assets/index-b.css',
      '/index.html',
    ])
  })

  it('gets a new version when the page changes but the assets do not — or a head edit would never reach an installed app', () => {
    const files = ['assets/index-a.js']
    expect(versionOf(renderServiceWorker(files, '<html>1'))).not.toEqual(
      versionOf(renderServiceWorker(files, '<html>2')),
    )
  })

  it('gets a new version when an asset changes', () => {
    expect(versionOf(renderServiceWorker(['assets/index-a.js'], '<html>'))).not.toEqual(
      versionOf(renderServiceWorker(['assets/index-b.js'], '<html>')),
    )
  })

  it('never intercepts another origin, where the API lives', () => {
    expect(renderServiceWorker([], '')).toContain('if (url.origin !== self.location.origin) return')
  })
})
