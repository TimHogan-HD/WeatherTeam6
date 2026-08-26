// Token custom properties first — `globals.css` consumes them, and a `var()`
// that resolves to nothing drops the whole declaration.
import 'virtual:wt6-tokens.css'
import './theme/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { applyDeepLink, readStartParam } from './lib/deepLink.js'
import { getWebApp } from './telegram/webApp.js'

// Deep link before React mounts, not in an effect. Two reasons: `BrowserRouter`
// then reads `/location/:id` as its initial location so the list never flashes,
// and a `<StrictMode>` double-invoked effect cannot push the detail entry twice
// — which would leave BackButton going from detail to detail.
applyDeepLink(readStartParam(getWebApp(), window.location), window.history)

const container = document.getElementById('root')
if (container === null) {
  throw new Error('Mini App mount point #root is missing from index.html')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
