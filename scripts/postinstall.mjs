#!/usr/bin/env node
/**
 * Root postinstall.
 *
 * One job: build the shared packages. `packages/types` and `packages/design`
 * compile to `dist/`, and every consuming workspace fails to typecheck without
 * it — a fresh clone reports "cannot find module" rather than anything that
 * names the cause. This is not optional.
 *
 * It used to have a second job, repairing Expo Router's module resolution for
 * `apps/mobile`. That workspace was deleted on 2026-09-23; recover it from the
 * `archive/2026-09-23-pre-cleanup` tag if it is ever wanted back.
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Run a command line, inheriting stdio, and exit non-zero if it fails.
 *
 * The command is passed as one string with no args array. On Windows `npm` is
 * `npm.cmd`, a batch file Node cannot exec without a shell — but passing an
 * args array *with* `shell: true` concatenates rather than escapes them
 * (Node DEP0190). One string and a shell avoids both problems.
 */
function run(commandLine, label) {
  const result = spawnSync(commandLine, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: true,
  })
  if (result.error) {
    console.error(`postinstall: ${label} could not start — ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) {
    console.error(`postinstall: ${label} failed (exit ${result.status})`)
    process.exit(result.status ?? 1)
  }
}

run('npm run build -w @weatherteam6/types', 'build @weatherteam6/types')
run('npm run build -w @weatherteam6/design', 'build @weatherteam6/design')
