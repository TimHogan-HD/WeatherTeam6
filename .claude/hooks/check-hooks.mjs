#!/usr/bin/env node
/**
 * Acceptance check for the Claude Code hooks. Run with `npm run check:hooks`.
 *
 * This exists because the previous hooks were broken for their entire life and
 * nothing noticed: they parsed stdin with `python3`, which on this machine is
 * the Windows Store stub, so every guard silently passed. A hook that is not
 * exercised is indistinguishable from one that is absent — the same reasoning
 * that put `check:add-location` under apps/api/src/scripts.
 *
 * Each case feeds a real hook payload to the real hook over stdin and asserts
 * the exit code and, where it matters, the output. No mocks.
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const PRE = join(here, 'pre-tool-safety.mjs')
const POST = join(here, 'post-push-review.mjs')

const BLOCK = 2
const ALLOW = 0

/** Run a hook with a payload on stdin and return { code, stdout, stderr }. */
function run(hookPath, payload) {
  const result = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  })
  return {
    code: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } })
const write = (file_path) => ({ tool_name: 'Write', tool_input: { file_path } })
const edit = (file_path) => ({ tool_name: 'Edit', tool_input: { file_path } })

/** [description, hook, payload, expectedExit, expectedOutputFragment?] */
const cases = [
  // ---- must block -------------------------------------------------------
  ['drizzle-kit push', PRE, bash('npx drizzle-kit push'), BLOCK, 'db:generate'],
  ['drizzle-kit push --force', PRE, bash('cd apps/api && npx drizzle-kit push --force'), BLOCK],
  ['npm run db:push', PRE, bash('npm run db:push'), BLOCK],
  ['rm -rf', PRE, bash('rm -rf ./dist'), BLOCK, 'Recursive force delete'],
  ['rm -fr (reversed flags)', PRE, bash('rm -fr ./dist'), BLOCK],
  ['rm -r -f (split flags)', PRE, bash('rm -r -f ./dist'), BLOCK],
  ['rm --recursive --force', PRE, bash('rm --recursive --force ./dist'), BLOCK],
  ['DROP TABLE', PRE, bash('psql -c "DROP TABLE users"'), BLOCK, 'DROP'],
  ['DROP DATABASE', PRE, bash('psql -c "drop database weatherteam6"'), BLOCK],
  ['TRUNCATE CASCADE', PRE, bash('psql -c "TRUNCATE locations CASCADE"'), BLOCK],
  ['redirect into .env', PRE, bash('echo "SECRET=1" > .env'), BLOCK, '.env.example'],
  ['append into .env', PRE, bash('echo "SECRET=1" >> .env'), BLOCK],
  ['tee into .env', PRE, bash('echo x | tee .env'), BLOCK],
  ['Write to .env', PRE, write('c:/Users/Tim/code/weatherteam6/.env'), BLOCK, '.env.example'],
  ['Edit .env (posix path)', PRE, edit('/repo/.env'), BLOCK],
  ['Write a migration .sql', PRE, write('apps/api/drizzle/0003_add_col.sql'), BLOCK, 'db:generate'],
  ['Edit drizzle/meta', PRE, edit('apps/api/drizzle/meta/_journal.json'), BLOCK],

  // ---- must allow (regression guards against over-blocking) -------------
  ['db:generate is fine', PRE, bash('npm run db:generate'), ALLOW],
  ['generate then push is fine', PRE, bash('npm run db:generate && git push'), ALLOW],
  ['git push alone', PRE, bash('git push origin main'), ALLOW],
  ['plain rm', PRE, bash('rm ./tmp.txt'), ALLOW],
  ['rm -r without -f', PRE, bash('rm -r ./dist'), ALLOW],
  ['rm -f without -r', PRE, bash('rm -f ./tmp.txt'), ALLOW],
  ['separate rm -r and rm -f', PRE, bash('rm -r a && rm -f b'), ALLOW],
  ['Write to .env.example', PRE, write('.env.example'), ALLOW],
  ['redirect into .env.example', PRE, bash('echo "KEY=" > .env.example'), ALLOW],
  ['Write a normal file', PRE, write('apps/api/src/lib/http.ts'), ALLOW],
  ['Write schema.ts', PRE, write('apps/api/src/db/schema.ts'), ALLOW],
  ['npm run test', PRE, bash('npm run test'), ALLOW],
  ['empty stdin does not block', PRE, null, ALLOW],

  // ---- prose about a forbidden command is not that command --------------
  // The first real commit under this hook was blocked by its own commit
  // message, which described the drizzle-kit guard.
  [
    'commit message naming drizzle-kit push',
    PRE,
    bash("git commit -m 'fix: block drizzle-kit push properly'"),
    ALLOW,
  ],
  [
    'heredoc commit body naming rm -rf and DROP TABLE',
    PRE,
    bash("git commit -F - <<'EOF'\nfix: guard rm -rf and DROP TABLE\nEOF"),
    ALLOW,
  ],
  [
    'unterminated heredoc body',
    PRE,
    bash("git commit -F - <<'EOF'\nnotes about drizzle-kit push"),
    ALLOW,
  ],
  // ...but a real command after a message is still caught.
  [
    'real rm -rf after a commit message',
    PRE,
    bash("git commit -m 'tidy' && rm -rf ./dist"),
    BLOCK,
  ],
  [
    'real drizzle push after a commit message',
    PRE,
    bash("git commit -m 'schema' && npx drizzle-kit push"),
    BLOCK,
  ],
  [
    'heredoc redirect into .env is still caught',
    PRE,
    bash("cat > .env <<'EOF'\nSECRET=1\nEOF"),
    BLOCK,
  ],

  // ---- advisory (allow, but must say something) -------------------------
  ['git commit prints Gate 0', PRE, bash('git commit -m "x"'), ALLOW, 'Gate 0'],
  ['git commit --amend stays quiet', PRE, bash('git commit --amend --no-edit'), ALLOW],

  // ---- post-push --------------------------------------------------------
  ['gh pr create asks for review', POST, bash('gh pr create --fill'), ALLOW, 'code-review high'],
  ['git push asks for review', POST, bash('git push -u origin HEAD'), ALLOW, 'code-review'],
  ['unrelated command is silent', POST, bash('npm run test'), ALLOW],
]

let failures = 0
let passes = 0

for (const [name, hook, payload, expectedCode, fragment] of cases) {
  const result =
    payload === null
      ? (() => {
          const r = spawnSync(process.execPath, [hook], { input: '', encoding: 'utf8' })
          return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
        })()
      : run(hook, payload)

  const output = result.stdout + result.stderr
  const codeOk = result.code === expectedCode
  const fragmentOk = fragment ? output.includes(fragment) : true

  // A case with no expected fragment and an ALLOW verdict on the post hook
  // should produce no additionalContext at all.
  const silenceOk =
    hook === POST && !fragment && expectedCode === ALLOW ? output.trim() === '' : true

  if (codeOk && fragmentOk && silenceOk) {
    passes += 1
    console.log(`  PASS  ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL  ${name}`)
    if (!codeOk) console.log(`          expected exit ${expectedCode}, got ${result.code}`)
    if (!fragmentOk) console.log(`          expected output to contain: ${fragment}`)
    if (!silenceOk) console.log(`          expected no output, got: ${output.trim()}`)
  }
}

console.log('')
console.log(`  ${passes} passed, ${failures} failed, ${cases.length} total`)

if (failures > 0) {
  console.log('')
  console.log('  A failing guard means the hook does not do what settings.json claims.')
  process.exit(1)
}
