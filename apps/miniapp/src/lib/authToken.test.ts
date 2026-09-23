import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The store survives a browser that will not let it store anything.
 *
 * Safari's private mode and a browser with site data blocked make the
 * `localStorage` accessor *throw* rather than return null, and the failure is
 * silent everywhere else: the user signs in, the app works, and nothing
 * indicates the token went nowhere until the next reload. The rule being
 * pinned here is that the in-memory copy is always correct even when the write
 * is not — anything else would present a credential the API has rejected, or
 * refuse a login the API accepted.
 */

function throwingStorage(): Storage {
  const boom = (): never => {
    throw new Error('SecurityError: storage is disabled')
  }
  return {
    get length(): number {
      return boom()
    },
    clear: boom,
    getItem: boom,
    key: boom,
    removeItem: boom,
    setItem: boom,
  }
}

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  }
}

async function load(storage: Storage | 'none'): Promise<typeof import('./authToken.js')> {
  vi.resetModules()
  // 'none' is the case where `window` itself is missing, which is how this
  // module is first evaluated in a non-DOM environment. It must not throw at
  // import time, or nothing that transitively imports it can be tested.
  vi.stubGlobal('window', storage === 'none' ? undefined : { localStorage: storage })
  return import('./authToken.js')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('authToken', () => {
  it('starts signed out with no window at all', async () => {
    const store = await load('none')
    expect(store.getToken()).toBeNull()
  })

  it('reads a token left behind by a previous load', async () => {
    const storage = memoryStorage()
    storage.setItem('wt6.session.token', 'from-last-time')
    const store = await load(storage)
    expect(store.getToken()).toBe('from-last-time')
  })

  /**
   * An empty string is what a storage write of `''` leaves behind, and it is
   * not a credential — sent as `Session ` it produces a 401 that looks like an
   * expired session rather than a corrupted one.
   */
  it('treats an empty stored value as signed out', async () => {
    const storage = memoryStorage()
    storage.setItem('wt6.session.token', '')
    const store = await load(storage)
    expect(store.getToken()).toBeNull()
  })

  it('persists a token across a reload', async () => {
    const storage = memoryStorage()
    const first = await load(storage)
    first.setToken('tok')

    const second = await load(storage)
    expect(second.getToken()).toBe('tok')
  })

  it('removes the token from storage on clear', async () => {
    const storage = memoryStorage()
    const store = await load(storage)
    store.setToken('tok')
    store.clearToken()

    expect(storage.getItem('wt6.session.token')).toBeNull()
    const reloaded = await load(storage)
    expect(reloaded.getToken()).toBeNull()
  })

  it('still signs the user in when storage throws', async () => {
    const store = await load(throwingStorage())
    store.setToken('tok')
    expect(store.getToken()).toBe('tok')
  })

  /**
   * The half that matters more. If a throwing `removeItem` prevented the
   * in-memory clear, every subsequent call would keep presenting a credential
   * the API has already rejected — a 401 loop with no way out of it.
   */
  it('still signs the user out when storage throws', async () => {
    const store = await load(throwingStorage())
    store.setToken('tok')
    store.clearToken()
    expect(store.getToken()).toBeNull()
  })

  it('notifies subscribers on both set and clear, and stops after unsubscribe', async () => {
    const store = await load(memoryStorage())
    const seen: (string | null)[] = []
    const unsubscribe = store.subscribeToToken(() => seen.push(store.getToken()))

    store.setToken('tok')
    store.clearToken()
    unsubscribe()
    store.setToken('ignored')

    expect(seen).toEqual(['tok', null])
  })
})
