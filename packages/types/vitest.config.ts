import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // The agent reporter under Claude Code; see apps/api/vitest.config.ts.
    reporters: process.env['CLAUDECODE'] ? ['agent'] : ['default'],
    include: ['src/**/*.test.ts'],
  },
})
