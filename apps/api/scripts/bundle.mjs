// Bundles the Express app into one ES module, `bundle/app.mjs`, for the Vercel
// function (`api/index.ts`). Run by `vercel-build`, which @vercel/node runs
// before it builds the function (#598).
//
// Why: unbundled, every cold start loads the app as hundreds of separate files
// (Drizzle and our schema were over half of it). Measured locally on the same
// code, importing the app took ~640 ms of CPU unbundled and ~213 ms bundled.
//
// `ws` stays external: it loads optional native add-ons by a computed
// `require` that a bundle cannot follow. The banner gives the CommonJS
// dependencies (Express and friends) the `require` an ES module lacks.
//
// Also the project's `buildCommand`, since which of the two Vercel runs before
// it traces the function is not documented; it takes under a second. esbuild
// comes from `tsx`'s own dependency. If the bundle is missing at runtime,
// `api/index.ts` serves the unbundled source and logs it.
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'bundle/app.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Not minified and no source map, so a stack trace in the logs still names
  // our functions. A source map would be parsed on every cold start.
  minify: false,
  external: ['ws'],
  banner: {
    js: "import { createRequire as __wt6CreateRequire } from 'node:module'; const require = __wt6CreateRequire(import.meta.url);",
  },
  logLevel: 'warning',
})
