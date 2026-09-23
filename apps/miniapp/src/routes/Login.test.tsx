import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { Login } from './Login.js'

/**
 * The login screen, checked for the properties that are wrong-but-plausible.
 *
 * `vitest.config.ts` is `environment: 'node'` and components are checked with
 * `renderToStaticMarkup`, so this covers the markup a browser is handed — not
 * the submit, which has no DOM to happen in. The submit's own decisions live in
 * `lib/api.test.ts`.
 */

function markup(): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  )
}

/**
 * The one `<input>` tag carrying a given `aria-label`. Slicing by offset would
 * pass or fail on how long the inline style happens to be, which is a property
 * of the tokens rather than of this screen.
 */
function inputWithLabel(html: string, label: string): string {
  const tag = html.match(new RegExp(`<input[^>]*aria-label="${label}"[^>]*>`))
  expect(tag).not.toBeNull()
  return tag?.[0] ?? ''
}

describe('Login', () => {
  /**
   * `type="password"` is the whole of the on-screen protection, and a
   * `type="text"` field looks identical in a review diff and in a screenshot
   * taken by someone who already knows their own passphrase.
   */
  it('masks the passphrase field and only that field', () => {
    const html = markup()
    expect(inputWithLabel(html, 'Passphrase')).toContain('type="password"')
    expect(inputWithLabel(html, 'Username')).not.toContain('type="password"')
  })

  /**
   * Attribute names are matched case-insensitively because HTML's are: React's
   * static renderer emits `autoComplete` as written, and the browser reads it
   * as `autocomplete` either way.
   */
  it('labels both fields for autofill', () => {
    const html = markup()
    expect(inputWithLabel(html, 'Username')).toMatch(/autocomplete="username"/i)
    expect(inputWithLabel(html, 'Passphrase')).toMatch(/autocomplete="current-password"/i)
  })

  /**
   * §5 forbids surfacing an HTTP status or a raw API string. The server's own
   * rejection text is deliberately identical for a bad username and a bad
   * passphrase — a username oracle is the reason — and rendering it would put
   * the API's wording on screen where a later API change could alter it.
   */
  it('shows no error before a submit', () => {
    const html = markup()
    expect(html).not.toContain('role="alert"')
    expect(html).not.toContain('Invalid username or passphrase')
  })

  /**
   * "No Clerk and no self-serve signup" survives the login UI. An account
   * exists because an operator ran `npm run user:add`; offering a sign-up link
   * would promise a flow that does not exist.
   */
  it('offers no way to create an account', () => {
    const html = markup().toLowerCase()
    expect(html).not.toContain('sign up')
    expect(html).not.toContain('create account')
    expect(html).not.toContain('forgot')
  })

  it('has no back affordance', () => {
    expect(markup()).not.toContain('>Back<')
  })

  it('disables submit until both fields are filled', () => {
    expect(markup()).toContain('disabled')
  })
})
