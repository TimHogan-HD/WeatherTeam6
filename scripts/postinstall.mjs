#!/usr/bin/env node
/**
 * Root postinstall.
 *
 * Two jobs, in order:
 *   1. Build the shared packages. `packages/types` and `packages/design` compile
 *      to `dist/`, and every consuming workspace fails to typecheck without it.
 *      This is not optional and runs unconditionally.
 *   2. Repair Expo Router's module resolution — but only if `apps/mobile` is
 *      actually installed.
 *
 * Step 2 used to run unconditionally as part of a chained `&&` postinstall.
 * `apps/mobile` has been archived and out of the build since 2026-08-26, so on a
 * fresh clone that step either did nothing useful or failed on a directory that
 * need not exist. Making it conditional means removing `apps/mobile` from the
 * workspace list is a one-line change rather than a broken install.
 */

import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

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

// 1. Shared packages — always.
run('npm run build -w @weatherteam6/types', 'build @weatherteam6/types')
run('npm run build -w @weatherteam6/design', 'build @weatherteam6/design')

// 2. Expo Router symlinks — only when the archived mobile app is present.
const mobileInstalled = existsSync(join(repoRoot, 'apps', 'mobile', 'node_modules'))
if (mobileInstalled) {
  run('node scripts/fix-expo-router-link.mjs', 'fix-expo-router-link')
} else {
  console.log('postinstall: apps/mobile not installed — skipping the Expo Router fixup.')
}
