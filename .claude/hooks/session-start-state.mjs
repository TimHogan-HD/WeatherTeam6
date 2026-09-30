#!/usr/bin/env node
/**
 * SessionStart hook — inject live project state instead of relying on a
 * protocol being followed.
 *
 * Written 2026-08-26 after the user asked, reasonably, what the point of the
 * enforcement hooks was when the first thing that happened after building them
 * was a missed defect and a manual request for another sweep.
 *
 * Part of the answer was mechanical (CI never ran `check:hooks`). The other
 * part is this: a session-start protocol in CLAUDE.md is a list of things an
 * agent is asked to remember. Everything in this repo's history says that a
 * remembered step is a step that eventually gets skipped. So the state is
 * pushed into context rather than fetched by request.
 *
 * What it injects:
 *   - branch / default branch / working tree / unpushed commits
 *   - open PRs with CI status  (the "is anything left open" question)
 *   - open issues              (replaces `gh issue list` at session start)
 *   - .claude/docs/STATE.md    (the one state document, verbatim)
 *
 * Fails open in every direction. A SessionStart hook that errors or hangs
 * costs a session; one that returns nothing costs a lookup.
 *
 * Covered by `npm run check:hooks`.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import {
  checksArePassing,
  currentBranch,
  defaultBranch,
  gh,
  git,
  hasRemote,
  isGitRepo,
  openPullRequests,
  unpushedCommits,
  workingTreeChanges,
} from './lib/gitState.mjs'
import { activePeers } from './lib/sessionClaims.mjs'

const STATE_DOC = '.claude/docs/STATE.md'
/** Guard against a STATE.md that has grown past what it should be. */
const STATE_DOC_MAX_CHARS = 24000

function readStdin() {
  return new Promise((resolve) => {
    let raw = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => {
      raw += c
    })
    process.stdin.on('end', () => resolve(raw))
    process.stdin.on('error', () => resolve(''))
  })
}

/** Emit context for Claude and exit successfully. */
function emit(context) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: context,
      },
    }),
  )
  process.exit(0)
}

function repoStatus() {
  const lines = []
  const branch = currentBranch()
  const base = defaultBranch()
  const changes = workingTreeChanges()
  const ahead = unpushedCommits()

  lines.push(`branch: ${branch ?? 'detached'}${base && branch === base ? '  (DEFAULT BRANCH — commits here are blocked; branch first)' : ''}`)
  lines.push(`default branch: ${base ?? 'unknown'}`)
  lines.push(
    changes.length === 0
      ? 'working tree: clean'
      : `working tree: ${changes.length} uncommitted change(s)\n  ${changes.slice(0, 15).join('\n  ')}`,
  )
  if (ahead.length > 0) {
    lines.push(`unpushed: ${ahead.length} commit(s)\n  ${ahead.join('\n  ')}`)
  } else {
    lines.push('unpushed: none')
  }
  return lines.join('\n')
}

function pullRequests() {
  const prs = openPullRequests()
  if (prs === null) return 'open PRs: could not read (gh unavailable)'
  if (prs.length === 0) return 'open PRs: none'
  return [
    `open PRs: ${prs.length}`,
    ...prs.map((p) => {
      const green = checksArePassing(p) ? 'checks green' : 'checks not green'
      const merge = p.mergeable === 'MERGEABLE' ? 'mergeable' : String(p.mergeable ?? 'unknown').toLowerCase()
      return `  #${p.number} ${p.title} [${p.headRefName}] — ${green}, ${merge}`
    }),
  ].join('\n')
}

function issues() {
  const raw = gh(['issue', 'list', '--state', 'open', '--limit', '30', '--json', 'number,title'])
  if (!raw) return 'open issues: could not read (gh unavailable)'
  try {
    const list = JSON.parse(raw)
    if (list.length === 0) return 'open issues: none'
    return [`open issues: ${list.length}`, ...list.map((i) => `  #${i.number} ${i.title}`)].join('\n')
  } catch {
    return 'open issues: could not parse'
  }
}

/**
 * The health of the LATEST CI run on the default branch.
 *
 * This is the automatic version of "go and do another sweep". On 2026-08-26
 * a defect reached `main` and was only found because the user asked for a
 * second audit by hand. With CI now running every check, that failure shows up
 * as a red run on `main` — but only matters if somebody is told about it.
 */
function defaultBranchCi() {
  const base = defaultBranch()
  if (!base) return null
  const raw = gh([
    'run',
    'list',
    '--branch',
    base,
    '--limit',
    '1',
    '--json',
    'conclusion,status,displayTitle,url',
  ])
  if (!raw) return null
  try {
    const [run] = JSON.parse(raw)
    if (!run) return null
    if (run.status !== 'completed') {
      return `CI on ${base}: still running — "${run.displayTitle}"`
    }
    if (run.conclusion === 'success') return `CI on ${base}: green`
    return (
      `!! CI on ${base} is ${run.conclusion?.toUpperCase() ?? 'NOT GREEN'} — "${run.displayTitle}"
` +
      `   ${run.url}
` +
      `   The default branch is broken. Fixing it comes before new work.`
    )
  } catch {
    return null
  }
}

/**
 * Warnings about the tooling itself: a pause flag that switches the Stop hook
 * off, and a STATE.md that has fallen behind `main`. Both were found live on
 * 2026-09-30 — a day-old `.wip` and a STATE.md sixty merges out of date that
 * this hook was injecting as current.
 */
const STATE_DOC_MAX_COMMITS_BEHIND = 15

function toolingWarnings(sessionId) {
  const out = []
  for (const peer of activePeers(sessionId)) {
    out.push(
      `!! Another Claude session (${peer.id.slice(0, 8)}) made a tool call in this checkout ` +
        `${peer.minutesAgo} min ago. Do not switch branches or commit here: call EnterWorktree ` +
        'first so its branch and files are not yours.',
    )
  }
  if (existsSync('.claude/.wip')) {
    const hours = Math.round((Date.now() - statSync('.claude/.wip').mtimeMs) / 3_600_000)
    out.push(
      `!! .claude/.wip exists (${hours} h old). Under 12 h it switches the Stop hook's delivery ` +
        'checks off. Delete it unless the user asked to pause.',
    )
  }
  const last = git(['log', '-1', '--format=%H', '--', STATE_DOC])?.trim()
  if (last) {
    const behind = Number(git(['rev-list', '--count', `${last}..HEAD`])?.trim())
    if (Number.isFinite(behind) && behind > STATE_DOC_MAX_COMMITS_BEHIND) {
      out.push(
        `!! ${STATE_DOC} was last changed ${behind} commits ago. Treat it as stale where it ` +
          'disagrees with the code, and rewrite it in /session-end.',
      )
    }
  }
  return out
}

function stateDoc() {
  try {
    const text = readFileSync(STATE_DOC, 'utf8')
    if (text.length > STATE_DOC_MAX_CHARS) {
      return (
        `${text.slice(0, STATE_DOC_MAX_CHARS)}\n\n[TRUNCATED — ${STATE_DOC} is over ` +
        `${STATE_DOC_MAX_CHARS} characters. Per the Session End Protocol it should be ` +
        `short enough to read every session; move the history into the archive.]`
      )
    }
    return text
  } catch {
    return `[${STATE_DOC} could not be read.]`
  }
}

try {
  let sessionId = null
  try {
    sessionId = JSON.parse(await readStdin())?.session_id ?? null
  } catch {
    // No payload: every recent session counts as another one.
  }

  if (!isGitRepo()) process.exit(0)

  const sections = [
    '# Injected session state (SessionStart hook)',
    '',
    'Read below rather than re-running `git log`, `gh issue list`, or opening STATE.md.',
    'Building the shared packages is still yours to run.',
    '',
    '## Repository',
    '```',
    repoStatus(),
    hasRemote() ? pullRequests() : 'open PRs: no remote',
    hasRemote() ? issues() : 'open issues: no remote',
    ...(hasRemote() ? [defaultBranchCi()].filter(Boolean) : []),
    ...toolingWarnings(sessionId),
    '```',
    '',
    `## ${STATE_DOC}`,
    '',
    stateDoc(),
  ]

  emit(sections.join('\n'))
} catch {
  // Never let a context-injection failure cost the session.
  process.exit(0)
}
