import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

/** Static markup for a tree that holds a `Link`, which needs a router above it. */
export function renderInRouter(node: ReactElement): string {
  return renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)
}
