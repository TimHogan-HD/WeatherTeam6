import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { renderTokenCss } from './src/theme/cssVars.js'

const VIRTUAL_ID = 'virtual:wt6-tokens.css'
const RESOLVED_ID = `\0${VIRTUAL_ID}`

/**
 * Serves the design tokens as a real stylesheet generated from
 * `@weatherteam6/design/tokens`.
 *
 * Emitting them through the CSS pipeline (rather than injecting a `<style>` at
 * runtime) puts the `:root` block in the bundled stylesheet in `<head>`, so the
 * gradient in `globals.css` has its custom properties on first paint instead of
 * one frame later.
 */
function tokenCssPlugin(): Plugin {
  return {
    name: 'wt6-token-css',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null
    },
    load(id) {
      return id === RESOLVED_ID ? renderTokenCss() : null
    },
  }
}

export default defineConfig({
  plugins: [tokenCssPlugin(), react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
})
