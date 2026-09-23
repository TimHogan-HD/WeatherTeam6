import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { KNOWN_CRAGS, ROCK_TYPES } from '@weatherteam6/types'
import { SaveBar, type SaveDraft } from './SaveBar.js'

const RED_WING = KNOWN_CRAGS.find((c) => c.slug === 'red-wing') ?? null

function render(draft: Partial<SaveDraft>, knownCrag = null as typeof RED_WING): string {
  return renderToStaticMarkup(
    <SaveBar
      draft={{ name: 'Somewhere', isClimbing: true, rockType: 'unknown', ...draft }}
      knownCrag={knownCrag}
      onChange={() => {}}
      onSave={() => {}}
      saving={false}
      error={null}
    />,
  )
}

describe('SaveBar — rock type', () => {
  it('offers every rock type, grouped, as one select', () => {
    const html = render({})
    expect(html).toContain('<select')
    for (const rockType of ROCK_TYPES) {
      expect(html).toContain(`value="${rockType}"`)
    }
    expect(html).toContain('<optgroup label="Sandstone"')
  })

  /**
   * The lock, on the surface the user sees before saving. A picker here would
   * be a control whose answer the API throws away.
   */
  it('shows a known crag’s rock type with no picker at all', () => {
    expect(RED_WING).not.toBeNull()
    const html = render({ rockType: 'granite' }, RED_WING)
    expect(html).not.toContain('<select')
    expect(html).toContain('Dolomite or limestone (with chert)')
    expect(html).toContain('Red Wing (Barn Bluff)')
  })

  it('shows neither while the location is not marked as climbing', () => {
    const html = render({ isClimbing: false }, RED_WING)
    expect(html).not.toContain('<select')
    expect(html).not.toContain('Rock type')
  })
})
