// Token custom properties first — `globals.css` consumes them, and a `var()`
// that resolves to nothing drops the whole declaration.
import 'virtual:wt6-tokens.css'
import './theme/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'

const container = document.getElementById('root')
if (container === null) {
  throw new Error('App mount point #root is missing from index.html')
}

// iOS Safari applies `:active` to a touch only once the page listens for
// touches; `globals.css`'s press dim depends on it.
document.addEventListener('touchstart', () => {}, { passive: true })

// The app shell, kept on the device so a cold open draws at once
// (`src/theme/serviceWorker.ts`). A failed registration leaves the app as it
// was before there was one.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
