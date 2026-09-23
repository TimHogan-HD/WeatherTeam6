import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Screen } from './Screen.js'

/**
 * The back affordance `miniapp-design-v1.md` §2 and §8 forbade, required from
 * Phase 2 of `docs/handoffs/leave-telegram-v1.md` onwards because there is no
 * Telegram `BackButton` in a browser.
 *
 * Both halves matter. Missing where it is needed strands the user on a screen
 * with no way out; present on the list, it is the "second back affordance is a
 * bug" rule with the destination wrong instead of the count.
 */

function markup(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(node)
}

describe('Screen', () => {
  it('renders no back control without onBack', () => {
    const html = markup(
      <Screen title="Locations">
        <p>body</p>
      </Screen>,
    )
    expect(html).not.toContain('Back')
  })

  it('renders a back control when onBack is given', () => {
    const html = markup(
      <Screen title="Red Rock" onBack={() => {}}>
        <p>body</p>
      </Screen>,
    )
    expect(html).toContain('Back')
  })

  /**
   * A bare chevron is a 18px tap target. The padding is what reaches the 44px
   * minimum, and it is the kind of thing a later tidy-up deletes as "unused
   * spacing" — so it is asserted rather than left to the eye.
   */
  it('pads the back control rather than relying on the glyph for a tap target', () => {
    const html = markup(
      <Screen title="Red Rock" onBack={() => {}}>
        <p>body</p>
      </Screen>,
    )
    const button = html.slice(html.indexOf('<button'), html.indexOf('</button>'))
    expect(button).toMatch(/padding-top:\s*10px/)
    expect(button).toMatch(/padding-bottom:\s*10px/)
  })

  it('still renders the title and a right-hand action alongside back', () => {
    const html = markup(
      <Screen title="Red Rock" onBack={() => {}} action={<span>Add</span>}>
        <p>body</p>
      </Screen>,
    )
    expect(html).toContain('Red Rock')
    expect(html).toContain('Add')
  })
})
