import { defineConfig } from 'vitest/config'

/**
 * Node environment. Components are checked with `renderToStaticMarkup` from
 * react-dom/server, which needs no DOM — deliberately no jsdom and no testing
 * library, because either would pull more of a browser stack into a workspace
 * whose vite resolution is already delicate (see CLAUDE.md's vite pin).
 *
 * That covers what matters here: the copy a screen actually emits. It does not
 * cover interaction, and a test that needs a click belongs somewhere else.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
