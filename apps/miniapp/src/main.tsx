// Token custom properties first — `globals.css` consumes them, and a `var()`
// that resolves to nothing drops the whole declaration.
import 'virtual:wt6-tokens.css'
import './theme/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'

const container = document.getElementById('root')
if (container === null) {
  throw new Error('Mini App mount point #root is missing from index.html')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
