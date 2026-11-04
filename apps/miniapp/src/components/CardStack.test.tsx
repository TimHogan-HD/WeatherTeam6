import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CardStack, type StackCard } from './CardStack.js'

const card = (id: string): StackCard => ({ id, title: id, node: <p>card-{id}</p> })
const CARDS = [card('a'), card('b'), card('c')]

const stored = (order: unknown) =>
  vi.stubGlobal('window', {
    localStorage: { getItem: () => JSON.stringify({ hourly: order }), setItem: () => {} },
  })

const positions = (html: string, ids: readonly string[]) =>
  [...ids].sort((x, y) => html.indexOf(`card-${x}`) - html.indexOf(`card-${y}`))

describe('CardStack', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("draws the app's order with nothing saved, and offers the rearranging", () => {
    const html = renderToStaticMarkup(<CardStack tab="hourly" cards={CARDS} />)
    expect(positions(html, ['c', 'a', 'b'])).toEqual(['a', 'b', 'c'])
    expect(html).toContain('Rearrange cards')
  })

  it('draws the saved order', () => {
    stored(['c', 'a', 'b'])
    const html = renderToStaticMarkup(<CardStack tab="hourly" cards={CARDS} />)
    expect(positions(html, ['a', 'b', 'c'])).toEqual(['c', 'a', 'b'])
  })

  it('leaves out a card the screen cannot draw, and a saved id it does not know', () => {
    stored(['c', 'gone', 'a'])
    const html = renderToStaticMarkup(<CardStack tab="hourly" cards={[card('a'), null, card('c')]} />)
    expect(positions(html, ['a', 'c'])).toEqual(['c', 'a'])
    expect(html).not.toContain('gone')
    expect(html).not.toContain('card-b')
  })

  it('offers nothing with one card to arrange', () => {
    const html = renderToStaticMarkup(<CardStack tab="hourly" cards={[card('a'), null]} />)
    expect(html).toContain('card-a')
    expect(html).not.toContain('Rearrange')
  })
})
