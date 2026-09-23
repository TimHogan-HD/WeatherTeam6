/**
 * Fails when the committed PWA icons no longer match the design tokens.
 *
 * `generate-icons.mjs` derives every colour in `public/icons/` from
 * `@weatherteam6/design/tokens`, which is what keeps the installed icon and
 * the app it opens on one palette. That only holds while somebody re-runs it:
 * change `bgGradientTop` and the home-screen icon keeps the old colour
 * silently, on a surface nobody looks at twice and no typecheck can see.
 *
 * So this is the machine that notices. It is a root-level `check:*`, which
 * means CI runs it — see CLAUDE.md, *"a check nothing runs is not a check"*.
 *
 * Deterministic by construction: the same tokens and the same geometry produce
 * the same bytes, because the encoder writes fixed filter bytes and
 * `deflateSync` at a fixed level.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OUT_DIR, renderIcons } from './generate-icons.mjs'

const problems = []

for (const [file, expected] of renderIcons()) {
  const path = join(OUT_DIR, file)
  let actual
  try {
    actual = readFileSync(path)
  } catch {
    problems.push(`${file}: missing from public/icons/`)
    continue
  }
  if (!actual.equals(expected)) {
    problems.push(`${file}: ${actual.length} bytes committed, ${expected.length} bytes generated`)
  }
}

if (problems.length > 0) {
  console.error('PWA icons are out of date with the design tokens:\n')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('\nRun: npm run icons --workspace=apps/miniapp')
  process.exit(1)
}

console.log(`PWA icons match the design tokens (${renderIcons().size} files).`)
