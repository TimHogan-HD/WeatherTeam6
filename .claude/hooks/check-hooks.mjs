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
const STOP = join(here, 'session-finish-check.mjs')
const SESSION_START = join(here, 'session-start-state.mjs')

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

  // NOTE: the "prose about a forbidden command" cases used to live here. They
  // carry `git commit` payloads, so once the default-branch guard landed their
  // verdict depended on the ambient checked-out branch — they passed on a
  // feature branch and failed on `main`. Moved to `gitScenarios`. The assertion
  // below stops the category from coming back.

  // A real command after a message is still caught. These block regardless of
  // branch, so ambient state cannot change the verdict.
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

  // Note: the `git commit` advisory cases are NOT here. The default-branch
  // guard reads real git state, so their verdict depends on which branch the
  // repo happens to be on — they live in `gitScenarios` with a controlled repo.

  // ---- post-push --------------------------------------------------------
  ['gh pr create asks for review', POST, bash('gh pr create --fill'), ALLOW, 'code-review high'],
  ['git push asks for review', POST, bash('git push -u origin HEAD'), ALLOW, 'code-review'],
  ['unrelated command is silent', POST, bash('npm run test'), ALLOW],
]

let failures = 0
let passes = 0

/* ------------------------------------------------------------------ *
 * Categorical guard against the ambient-state bug.
 *
 * Cases in `cases` run with the *real* repo as cwd, so any payload whose
 * verdict depends on git state gives a different answer depending on which
 * branch happens to be checked out. That shipped twice: `git commit` cases
 * expecting ALLOW passed on a feature branch and failed on `main` once the
 * default-branch guard landed. Fixing the instances was not enough — this
 * asserts the category.
 *
 * A `git commit` case expecting ALLOW belongs in `gitScenarios`, which controls
 * the branch. One expecting BLOCK is fine here only if it blocks for a reason
 * unrelated to the branch.
 * ------------------------------------------------------------------ */
for (const [name, , payload, expectedCode] of cases) {
  const command = payload?.tool_input?.command ?? ''
  if (/\bgit\s+commit\b/.test(command) && expectedCode === ALLOW) {
    failures += 1
    console.log(`  FAIL  [meta] "${name}" carries a git-commit payload expecting ALLOW`)
    console.log('          Its verdict depends on the ambient branch. Move it to gitScenarios.')
  }
}

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

/* ------------------------------------------------------------------ *
 * Git-state guards.
 *
 * The default-branch commit guard and the Stop hook read real git state, so
 * they are exercised against scratch repositories rather than mocked. Each
 * scenario builds a bare "origin", clones it, and puts the clone into the state
 * under test.
 * ------------------------------------------------------------------ */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'

/** How many settings.json-coverage assertions ran; set by the meta block below. */
let metaCoverageCount = 0
import { tmpdir } from 'node:os'

function g(cwd, ...args) {
  spawnSync('git', args, { cwd, encoding: 'utf8', stdio: 'ignore' })
}

/** A clone with an origin, one commit on the default branch, and origin/HEAD set. */
function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'wt6-hook-'))
  const origin = join(root, 'origin.git')
  const work = join(root, 'work')
  mkdirSync(origin)
  spawnSync('git', ['init', '--bare', '--initial-branch=main', origin], { stdio: 'ignore' })
  spawnSync('git', ['clone', origin, work], { stdio: 'ignore' })
  g(work, 'config', 'user.email', 'test@example.com')
  g(work, 'config', 'user.name', 'Hook Test')
  writeFileSync(join(work, 'README.md'), '# scratch\n')
  g(work, 'add', '-A')
  g(work, 'commit', '-m', 'initial')
  g(work, 'push', '-u', 'origin', 'main')
  g(work, 'remote', 'set-head', 'origin', 'main')
  return { root, work }
}

function runIn(cwd, hookPath, payload) {
  const r = spawnSync(process.execPath, [hookPath], {
    cwd,
    input: JSON.stringify(payload ?? {}),
    encoding: 'utf8',
  })
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

const gitScenarios = [
  [
    'Stop: clean and synced on main allows the turn to end',
    (w) => {},
    STOP,
    {},
    ALLOW,
    null,
  ],
  [
    'Stop: uncommitted changes block the turn',
    (w) => writeFileSync(join(w, 'dirty.txt'), 'x'),
    STOP,
    {},
    BLOCK,
    'uncommitted changes',
  ],
  [
    'Stop: .claude/.wip suppresses the block',
    (w) => {
      writeFileSync(join(w, 'dirty.txt'), 'x')
      mkdirSync(join(w, '.claude'), { recursive: true })
      writeFileSync(join(w, '.claude', '.wip'), '')
    },
    STOP,
    {},
    ALLOW,
    null,
  ],
  [
    'Stop: unpushed commits on main block the turn',
    (w) => {
      writeFileSync(join(w, 'a.txt'), 'a')
      g(w, 'add', '-A')
      g(w, 'commit', '-m', 'direct to main')
    },
    STOP,
    {},
    BLOCK,
    'have not been pushed',
  ],
  [
    'Stop: unpushed commits on a feature branch block the turn',
    (w) => {
      g(w, 'checkout', '-b', 'feat/x')
      writeFileSync(join(w, 'a.txt'), 'a')
      g(w, 'add', '-A')
      g(w, 'commit', '-m', 'work')
    },
    STOP,
    {},
    BLOCK,
    'unpushed commit',
  ],
  [
    'PreToolUse: git commit on the default branch is blocked',
    (w) => {},
    PRE,
    bash('git commit -m "x"'),
    BLOCK,
    'default branch',
  ],
  [
    'PreToolUse: git commit on a feature branch is allowed',
    (w) => g(w, 'checkout', '-b', 'feat/y'),
    PRE,
    bash('git commit -m "x"'),
    ALLOW,
    null,
  ],
  [
    'PreToolUse: git commit on a feature branch still prints Gate 0',
    (w) => g(w, 'checkout', '-b', 'feat/z'),
    PRE,
    bash('git commit -m "x"'),
    ALLOW,
    'Gate 0',
  ],
  [
    'PreToolUse: git commit --amend on a feature branch stays quiet',
    (w) => g(w, 'checkout', '-b', 'feat/w'),
    PRE,
    bash('git commit --amend --no-edit'),
    ALLOW,
    null,
  ],
  [
    'PreToolUse: git commit --amend on the default branch is still blocked',
    (w) => {},
    PRE,
    bash('git commit --amend --no-edit'),
    BLOCK,
    'default branch',
  ],

  // ---- prose about a forbidden command is not that command ----------------
  // The first real commit under these hooks was blocked by its own commit
  // message, which described the drizzle-kit guard. These run on a feature
  // branch so the default-branch guard is not what is being measured.
  [
    'inert: commit message naming drizzle-kit push is allowed',
    (w) => g(w, 'checkout', '-b', 'feat/inert-a'),
    PRE,
    bash("git commit -m 'fix: block drizzle-kit push properly'"),
    ALLOW,
    null,
  ],
  [
    'inert: heredoc commit body naming rm -rf and DROP TABLE is allowed',
    (w) => g(w, 'checkout', '-b', 'feat/inert-b'),
    PRE,
    bash("git commit -F - <<'EOF'\nfix: guard rm -rf and DROP TABLE\nEOF"),
    ALLOW,
    null,
  ],
  [
    'inert: unterminated heredoc body is allowed',
    (w) => g(w, 'checkout', '-b', 'feat/inert-c'),
    PRE,
    bash("git commit -F - <<'EOF'\nnotes about drizzle-kit push"),
    ALLOW,
    null,
  ],
]

for (const [name, setup, hook, payload, expectedCode, fragment] of gitScenarios) {
  const { root, work } = makeRepo()
  try {
    setup(work)
    const result = runIn(work, hook, payload)
    const codeOk = result.code === expectedCode
    const fragmentOk = fragment ? result.out.includes(fragment) : true
    if (codeOk && fragmentOk) {
      passes += 1
      console.log(`  PASS  ${name}`)
    } else {
      failures += 1
      console.log(`  FAIL  ${name}`)
      if (!codeOk) console.log(`          expected exit ${expectedCode}, got ${result.code}`)
      if (!fragmentOk) console.log(`          expected output to contain: ${fragment}`)
      if (result.out.trim()) console.log(`          output: ${result.out.trim().slice(0, 300)}`)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}


/* ------------------------------------------------------------------ *
 * SessionStart context injection.
 *
 * This hook cannot block anything, so the property under test is not an exit
 * code: it is that the JSON is well formed, that the state it reports is the
 * state the repo is actually in, and that it never fails loudly. A SessionStart
 * hook that throws costs a whole session.
 * ------------------------------------------------------------------ */

function withState(work, body) {
  mkdirSync(join(work, '.claude', 'docs'), { recursive: true })
  writeFileSync(join(work, '.claude', 'docs', 'STATE.md'), body)
}

const sessionScenarios = [
  [
    'SessionStart: emits valid JSON naming the current branch',
    (w) => {
      g(w, 'checkout', '-b', 'feat/session-a')
      withState(w, '# Current state\nSENTINEL_STATE_BODY\n')
    },
    (out) => {
      const parsed = JSON.parse(out)
      const ctx = parsed.hookSpecificOutput.additionalContext
      if (parsed.hookSpecificOutput.hookEventName !== 'SessionStart') return 'wrong hookEventName'
      if (!ctx.includes('feat/session-a')) return 'did not name the current branch'
      if (!ctx.includes('SENTINEL_STATE_BODY')) return 'did not inline STATE.md'
      return null
    },
  ],
  [
    'SessionStart: flags the default branch as a place not to commit',
    (w) => withState(w, '# s'),
    (out) => {
      const ctx = JSON.parse(out).hookSpecificOutput.additionalContext
      return ctx.includes('DEFAULT BRANCH') ? null : 'did not flag the default branch'
    },
  ],
  [
    'SessionStart: reports uncommitted changes rather than claiming clean',
    (w) => {
      withState(w, '# s')
      writeFileSync(join(w, 'dirty.txt'), 'x')
    },
    (out) => {
      const ctx = JSON.parse(out).hookSpecificOutput.additionalContext
      if (ctx.includes('working tree: clean')) return 'claimed a dirty tree was clean'
      return ctx.includes('dirty.txt') ? null : 'did not list the changed file'
    },
  ],
  [
    'SessionStart: a missing STATE.md is reported, not fatal',
    (w) => {},
    (out) => {
      const ctx = JSON.parse(out).hookSpecificOutput.additionalContext
      return ctx.includes('could not be read') ? null : 'did not report the missing state doc'
    },
  ],
  [
    'SessionStart: an oversized STATE.md is truncated with a warning',
    (w) => withState(w, 'x'.repeat(30000)),
    (out) => {
      const ctx = JSON.parse(out).hookSpecificOutput.additionalContext
      return ctx.includes('TRUNCATED') ? null : 'did not truncate an oversized state doc'
    },
  ],
]

for (const [name, setup, assertion] of sessionScenarios) {
  const { root, work } = makeRepo()
  try {
    setup(work)
    const r = spawnSync(process.execPath, [SESSION_START], {
      cwd: work,
      input: JSON.stringify({ hook_event_name: 'SessionStart', matcher: 'startup' }),
      encoding: 'utf8',
    })
    let problem = null
    if (r.status !== ALLOW) problem = 'exited ' + r.status + ', must always exit 0'
    else if ((r.stderr ?? '').trim()) problem = 'wrote to stderr: ' + r.stderr.trim().slice(0, 200)
    else {
      try {
        problem = assertion(r.stdout ?? '')
      } catch (err) {
        problem = 'output was not the expected JSON: ' + err.message
      }
    }
    if (problem === null) {
      passes += 1
      console.log('  PASS  ' + name)
    } else {
      failures += 1
      console.log('  FAIL  ' + name)
      console.log('          ' + problem)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

/* ------------------------------------------------------------------ *
 * Categorical guard: every hook settings.json registers is exercised here.
 *
 * The failure this repo keeps repeating is not a broken guard, it is a guard
 * that nothing runs. Four project hooks were dead for their whole lives because
 * they shelled out to a python3 that does not exist here, and "check:hooks"
 * itself was absent from CI during the window it was failing on main.
 *
 * Fixing instances does not fix the category. So: if settings.json points at a
 * hook script that no scenario above executes, this fails, and because CI runs
 * check:hooks the PR cannot merge. Adding an untested hook stops being possible.
 * ------------------------------------------------------------------ */
{
  const basename = (h) => h.replace(/\\/g, '/').split('/').pop()
  const exercised = new Set(
    [...cases.map((c) => c[1]), ...gitScenarios.map((c) => c[2]), SESSION_START].map(basename),
  )

  let settings
  try {
    settings = JSON.parse(readFileSync(join(here, '..', 'settings.json'), 'utf8'))
  } catch (err) {
    failures += 1
    console.log('  FAIL  [meta] .claude/settings.json could not be read: ' + err.message)
    settings = { hooks: {} }
  }

  const registered = new Set()
  for (const entries of Object.values(settings.hooks ?? {})) {
    for (const entry of entries ?? []) {
      for (const h of entry.hooks ?? []) {
        for (const m of String(h.command ?? '').matchAll(/([A-Za-z0-9._-]+\.mjs)/g)) {
          registered.add(m[1])
        }
      }
    }
  }

  if (registered.size === 0) {
    failures += 1
    console.log('  FAIL  [meta] settings.json registers no hooks — that cannot be right')
  }

  for (const hook of [...registered].sort()) {
    if (exercised.has(hook)) {
      passes += 1
      console.log('  PASS  [meta] ' + hook + ' is registered and exercised')
    } else {
      failures += 1
      console.log('  FAIL  [meta] settings.json registers ' + hook + ', but no scenario runs it')
      console.log('          Add coverage before merging. An untested hook is a dead hook.')
    }
  }

  metaCoverageCount = registered.size === 0 ? 1 : registered.size
}

const total = cases.length + gitScenarios.length + sessionScenarios.length + metaCoverageCount
console.log('')
console.log(`  ${passes} passed, ${failures} failed, ${total} total`)

if (failures > 0) {
  console.log('')
  console.log('  A failing guard means the hook does not do what settings.json claims.')
  process.exit(1)
}
