import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    unstubGlobals: true,
    restoreMocks: true,
    // Pino logs at debug outside production, and the suite's debug lines were
    // half of `npm run test`'s output (27 KB of 51 KB, 2026-11-10). No test
    // reads them; set LOG_LEVEL in the shell to see them again.
    env: { LOG_LEVEL: process.env['LOG_LEVEL'] || 'silent' },
    // Under Claude Code (CLAUDECODE=1), Vitest's `agent` reporter: failures in
    // full, a passing run in a summary. Vitest picks it on its own when it sees
    // the agent, but turbo's strict env mode strips CLAUDECODE unless passed
    // through (turbo.json), so every run printed a line per file — 51 KB a run.
    // People and CI keep the default.
    reporters: process.env['CLAUDECODE'] ? ['agent'] : ['default'],
  },
})
