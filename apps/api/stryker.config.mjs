import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Mutation testing answers the one question no other gate in this repo can:
// "which line of the implementation would have to change for this test to
// fail?" That is the definition of a mutation score, and it is exactly the
// question defect-patterns class 11 says to ask of every assertion by hand.
//
// The mutate list is DERIVED, never hand-written. A hand-maintained list of
// files drifts the same way this repo's hand-maintained list of CI checks did
// (bfe1e83: CI reported green while check:hooks was failing 46 of its 49
// cases). Every source file with a sibling *.test.ts is mutated the moment it
// exists. A file with no test is deliberately excluded: it would report ~100%
// survivors and bury the real signal under noise. Coverage of untested files
// is a different problem with a different tool.
const root = dirname(fileURLToPath(import.meta.url))

/** Paths are built POSIX-style by hand — Stryker matches its globs that way. */
function testedSources(dir, prefix) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix + entry.name
    if (entry.isDirectory()) {
      out.push(...testedSources(join(dir, entry.name), rel + '/'))
    } else if (entry.name.endsWith('.test.ts')) {
      out.push(rel.replace(/\.test\.ts$/, '.ts'))
    }
  }
  return out
}

const mutate = testedSources(join(root, 'src'), 'src/').sort()

if (mutate.length === 0) {
  throw new Error('stryker: no tested source files found — the derivation is broken, not the repo')
}

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  // `related: false` is load-bearing on this repo, not a performance knob.
  // The runner's default is to ask vitest which test files are *related* to the
  // mutated file; here that returns nothing and Stryker exits with "No tests
  // were executed" before mutating anything. Tests import their subject through
  // an ESM `./foo.js` specifier that resolves to `foo.ts`, which vitest's
  // related-file matching does not follow. Turning it off runs the whole suite
  // in the dry run; `coverageAnalysis: 'perTest'` still narrows each mutant to
  // the tests that actually cover it, so the cost is one full run, not N.
  vitest: { configFile: 'vitest.config.ts', related: false },
  mutate,
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  clearTextReporter: { maxTestsToLog: 0 },
  tempDirName: 'node_modules/.stryker-tmp',
  timeoutMS: 20000,
  concurrency: 4,

  // `break` is the only one of these that does anything: below it, the run
  // exits non-zero. 65 sits just under the 66.09 measured on 2026-08-26, which
  // makes this a ratchet against regression rather than a target — it is not a
  // claim that 65% is good. `high`/`low` only colour the HTML report.
  //
  // Raise `break` when the score rises. Lowering it to make a run pass is the
  // move this file exists to prevent.
  thresholds: { high: 85, low: 70, break: 65 },
}
