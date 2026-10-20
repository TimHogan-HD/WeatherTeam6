import { afterEach, describe, expect, it, vi } from 'vitest'
import { NETWORK_FIRST_MS, renderServiceWorker, shellFiles } from './serviceWorker.js'

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
      '/icons/icon-192.png',
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

type Page = { ok: boolean; body: string }
type FetchEvent = { request: { method: string; url: string; mode: string }; respondWith: (p: Promise<Page>) => void }

/**
 * The generated worker, run: a fake `self` collects its fetch listener, the
 * cache holds `kept`, and the network answers with `network`. Returns what the
 * worker answered a request with, or `undefined` when it left it alone.
 */
function runWorker(network: () => Promise<Page>, kept: Record<string, string>) {
  const listeners: Record<string, (e: FetchEvent) => void> = {}
  const self = { location: { origin: 'https://app.test' }, addEventListener: (type: string, fn: (e: FetchEvent) => void) => (listeners[type] = fn) }
  const caches = { match: (key: string) => Promise.resolve(kept[key] === undefined ? undefined : { ok: true, body: kept[key] }) }
  new Function('self', 'caches', 'fetch', renderServiceWorker(['assets/index-a.js'], '<html>'))(self, caches, network)
  return (path: string, mode: string): Promise<Page> | undefined => {
    let answer: Promise<Page> | undefined
    listeners.fetch?.({ request: { method: 'GET', url: `https://app.test${path}`, mode }, respondWith: (p) => (answer = p) })
    return answer
  }
}

describe('service worker, run', () => {
  const kept = { '/index.html': 'old page', '/assets/index-a.js': 'old script' }
  afterEach(() => vi.useRealTimers())

  it("draws the network's page on the first open after a deploy", async () => {
    const ask = runWorker(() => Promise.resolve({ ok: true, body: 'new page' }), kept)
    expect((await ask('/crag/1', 'navigate'))?.body).toBe('new page')
  })

  it("draws the device's page when the network fails or errs", async () => {
    expect((await runWorker(() => Promise.reject(new TypeError('offline')), kept)('/', 'navigate'))?.body).toBe('old page')
    expect((await runWorker(() => Promise.resolve({ ok: false, body: '502' }), kept)('/', 'navigate'))?.body).toBe('old page')
  })

  it(`draws the device's page when the network takes longer than ${NETWORK_FIRST_MS} ms`, async () => {
    vi.useFakeTimers()
    const answer = runWorker(() => new Promise<Page>(() => undefined), kept)('/', 'navigate')
    await vi.advanceTimersByTimeAsync(NETWORK_FIRST_MS)
    expect((await answer)?.body).toBe('old page')
  })

  it('serves a hashed script from the device, and leaves one it does not keep to the network', async () => {
    const ask = runWorker(() => Promise.resolve({ ok: true, body: 'network' }), kept)
    expect((await ask('/assets/index-a.js', 'no-cors'))?.body).toBe('old script')
    expect(ask('/assets/index-new.js', 'no-cors')).toBeUndefined()
  })
})
