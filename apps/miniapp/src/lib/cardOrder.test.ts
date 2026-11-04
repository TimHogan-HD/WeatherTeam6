import { afterEach, describe, expect, it, vi } from 'vitest'
import { arrange, moveCard, saveOrder, savedOrder } from './cardOrder.js'

const IDS = ['temperature', 'sun', 'rain', 'wind']

describe('arrange', () => {
  it("is the app's own order with nothing saved", () => {
    expect(arrange([], IDS)).toEqual(IDS)
  })

  it('follows the saved order', () => {
    expect(arrange(['wind', 'rain', 'sun', 'temperature'], IDS)).toEqual(['wind', 'rain', 'sun', 'temperature'])
  })

  it('drops a saved card that is not on screen and repeats none', () => {
    expect(arrange(['wind', 'gone', 'wind', 'rain'], ['rain', 'wind'])).toEqual(['wind', 'rain'])
  })

  it('places a card the saved order has never seen after the card it follows', () => {
    expect(arrange(['wind', 'temperature', 'rain'], IDS)).toEqual(['wind', 'temperature', 'sun', 'rain'])
  })

  it('places a new first card first', () => {
    expect(arrange(['wind', 'sun', 'rain'], IDS)).toEqual(['temperature', 'wind', 'sun', 'rain'])
  })
})

describe('moveCard', () => {
  it('moves a card one place either way', () => {
    expect(moveCard([], IDS, 'rain', -1)).toEqual(['temperature', 'rain', 'sun', 'wind'])
    expect(moveCard([], IDS, 'rain', 1)).toEqual(['temperature', 'sun', 'wind', 'rain'])
  })

  it('cannot move past either end', () => {
    expect(moveCard([], IDS, 'temperature', -1)).toBeNull()
    expect(moveCard([], IDS, 'wind', 1)).toBeNull()
  })

  it('cannot move a card that is not on screen', () => {
    expect(moveCard([], IDS, 'gone', -1)).toBeNull()
  })

  it("steps over a saved card this crag does not have, and keeps that card's place", () => {
    // `sun` is saved between the two, and absent at this crag.
    const saved = ['temperature', 'sun', 'rain', 'wind']
    const shown = ['temperature', 'rain', 'wind']
    const next = moveCard(saved, shown, 'rain', -1)
    expect(next).toEqual(['rain', 'sun', 'temperature', 'wind'])
    expect(arrange(next ?? [], shown)).toEqual(['rain', 'temperature', 'wind'])
  })

  it('reaches a card the saved order has never seen', () => {
    const next = moveCard(['wind', 'temperature', 'rain'], IDS, 'sun', 1)
    expect(arrange(next ?? [], IDS)).toEqual(['wind', 'temperature', 'rain', 'sun'])
  })

  it('walks every card to every place and loses none', () => {
    let saved: string[] = []
    for (const id of IDS) {
      for (const by of [1, 1, 1, -1, -1, -1] as const) saved = moveCard(saved, IDS, id, by) ?? saved
      expect([...arrange(saved, IDS)].sort()).toEqual([...IDS].sort())
    }
  })
})

describe('the saved order', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const memory = (initial: Record<string, string> = {}) => {
    const items = new Map(Object.entries(initial))
    return {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
    }
  }

  it('remembers each tab apart, and an empty order forgets only that tab', () => {
    vi.stubGlobal('window', { localStorage: memory() })
    saveOrder('hourly', ['wind', 'rain'])
    saveOrder('rock', ['care'])
    expect(savedOrder('hourly')).toEqual(['wind', 'rain'])
    expect(savedOrder('rock')).toEqual(['care'])
    saveOrder('hourly', [])
    expect(savedOrder('hourly')).toEqual([])
    expect(savedOrder('rock')).toEqual(['care'])
  })

  it('reads as nothing saved when storage throws', () => {
    const denied = () => {
      throw new Error('denied')
    }
    vi.stubGlobal('window', { localStorage: { getItem: denied, setItem: denied } })
    expect(() => saveOrder('hourly', ['wind'])).not.toThrow()
    expect(savedOrder('hourly')).toEqual([])
  })

  it.each(['not json', '[]', 'null', '"hourly"', '{"hourly":"wind"}'])('reads %s as nothing saved', (raw) => {
    vi.stubGlobal('window', { localStorage: memory({ 'wt6.cardOrder': raw }) })
    expect(savedOrder('hourly')).toEqual([])
  })

  it('keeps only the strings of a saved order', () => {
    vi.stubGlobal('window', { localStorage: memory({ 'wt6.cardOrder': '{"hourly":["wind",3,null,"rain"]}' }) })
    expect(savedOrder('hourly')).toEqual(['wind', 'rain'])
  })
})
