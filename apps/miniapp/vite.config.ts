import react from '@vitejs/plugin-react'
import { colorsV2 } from '@weatherteam6/design/tokens'
import { defineConfig, type Plugin } from 'vite'
import { renderTokenCss } from './src/theme/cssVars.js'
import { buildWebManifest } from './src/theme/webManifest.js'
import { renderServiceWorker, shellFiles } from './src/theme/serviceWorker.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

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

const MANIFEST_PATH = '/manifest.webmanifest'

/**
 * Emits the PWA manifest and the `theme-color` meta, both derived from
 * `@weatherteam6/design/tokens` (see `src/theme/webManifest.ts` for why they
 * cannot be static files).
 *
 * It serves the manifest in dev as well as emitting it in the build. A manifest
 * that only exists in `dist/` means Add to Home Screen cannot be checked before
 * a deploy, and Phase 2's whole point is that the app is now testable in an
 * ordinary browser.
 */
function webManifestPlugin(): Plugin {
  const body = (): string => JSON.stringify(buildWebManifest(), null, 2)

  return {
    name: 'wt6-webmanifest',
    transformIndexHtml() {
      return [
        { tag: 'link', attrs: { rel: 'manifest', href: MANIFEST_PATH }, injectTo: 'head' as const },
        {
          tag: 'meta',
          attrs: { name: 'theme-color', content: colorsV2.bg },
          injectTo: 'head' as const,
        },
      ]
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== MANIFEST_PATH) return next()
        res.setHeader('Content-Type', 'application/manifest+json')
        res.end(body())
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: MANIFEST_PATH.slice(1),
        source: body(),
      })
    },
  }
}

/**
 * Writes `sw.js` beside the built page, listing the build's own files (see
 * `src/theme/serviceWorker.ts`). After the bundle is written, so the finished
 * `index.html` is part of the version. Build only: `main.tsx` registers it only
 * in a production build, and the dev server has nothing for it to cache.
 */
function serviceWorkerPlugin(): Plugin {
  return {
    name: 'wt6-service-worker',
    apply: 'build',
    writeBundle(options, bundle) {
      const dir = options.dir ?? 'dist'
      const indexHtml = readFileSync(join(dir, 'index.html'), 'utf8')
      writeFileSync(join(dir, 'sw.js'), renderServiceWorker(shellFiles(Object.keys(bundle)), indexHtml))
    },
  }
}

export default defineConfig({
  plugins: [tokenCssPlugin(), webManifestPlugin(), serviceWorkerPlugin(), react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  // MapLibre starts its worker as a module worker (`MapScreen.tsx`).
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
  },
})
