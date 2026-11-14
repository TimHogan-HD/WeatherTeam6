import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Express } from 'express'

/**
 * **The app is loaded from one bundled file** (`bundle/app.mjs`, written by
 * `vercel-build` through `scripts/bundle.mjs`, #598). Loading it as hundreds of
 * separate modules cost most of each cold start's CPU.
 *
 * The unbundled source stays the fallback, so a deploy whose bundle step did
 * not run still serves rather than failing every request, and says so in the
 * log. `cold` requests' `initCpuMs` is the measure of which one loaded.
 */
async function loadApp(): Promise<{ createApp: () => Express }> {
  try {
    const m = await import('../bundle/app.mjs')
    return { createApp: m.createApp }
  } catch (err) {
    const m = await import('../src/index.js')
    const { logger } = await import('../src/lib/logger.js')
    const { describeError } = await import('../src/lib/http.js')
    logger.warn({ err: describeError(err) }, 'api: bundle not loaded, serving unbundled source')
    return { createApp: m.createApp }
  }
}

const { createApp } = await loadApp()
const app = createApp()

export default function handler(req: VercelRequest, res: VercelResponse): void {
  app(req, res)
}
