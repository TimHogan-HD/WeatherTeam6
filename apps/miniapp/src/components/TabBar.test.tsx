import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { TabBar } from './TabBar.js'

function markup(active: Parameters<typeof TabBar>[0]['active']): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <TabBar active={active} />
    </MemoryRouter>,
  )
}

describe('TabBar', () => {
  it('links all five sections in order, each named for a screen reader', () => {
    const html = markup('conditions')
    const labels = [...html.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1])
    expect(labels).toEqual(['Main', 'Conditions', 'Trips', 'Map', 'Crags', 'Profile'])
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
    expect(hrefs).toEqual(['/', '/trips', '/map', '/crags', '/profile'])
  })

  it('marks only the lit section as the current page', () => {
    const html = markup('trips')
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    expect(html).toMatch(/href="\/trips"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/trips"/)
  })

  /**
   * The location screen's own row is a `tablist`; the bar is navigation. A
   * second set of `role="tab"` would put two tablists on one screen and make
   * `check:ui`'s tab walk click the bar.
   */
  it('uses no tab roles', () => {
    expect(markup('map')).not.toContain('role="tab"')
  })
})
