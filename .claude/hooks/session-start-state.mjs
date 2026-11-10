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
 *
 * It injected .claude/docs/STATE.md too until 2026-11-10. That file needed a
 * rewrite every session to stay true, and was sixty merges stale when found on
 * 2026-09-30; its facts now live in the files that govern them.
 *
 * Fails open in every direction. A SessionStart hook that errors or hangs
 * costs a session; one that returns nothing costs a lookup.
 *
 * Covered by `npm run check:hooks`.
 */

import { existsSync, statSync } from 'node:fs'
import {
  checksArePassing,
  currentBranch,
  defaultBranch,
  gh,
  ghApi,
  hasRemote,
  isGitRepo,
  openPullRequests,
  unpushedCommits,
  workingTreeChanges,
} from './lib/gitState.mjs'
import { activePeers } from './lib/sessionClaims.mjs'

/** Issue titles listed; the rest are counted. */
const ISSUES_SHOWN = 15

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

/**
 * Only this branch's PR in full. Until 2026-11-04 every open PR was listed with
 * "checks not green", and sessions read another session's live PR as their own
 * to-do and circled on it. Other PRs are a count and their numbers, marked as
 * not this session's.
 */
function pullRequests(branch) {
  const prs = openPullRequests()
  if (prs === null) return 'open PRs: could not read (gh unavailable)'
  if (prs.length === 0) return 'open PRs: none'
  const own = prs.filter((p) => p.headRefName === branch)
  const others = prs.filter((p) => p.headRefName !== branch)
  const lines = []
  for (const p of own) {
    const green = checksArePassing(p) ? 'checks green' : 'checks not green'
    const merge = p.mergeable === 'MERGEABLE' ? 'mergeable' : String(p.mergeable ?? 'unknown').toLowerCase()
    const state = [p.isDraft ? 'draft' : null, p.autoMerge ? 'auto-merge armed' : null].filter(Boolean).join(', ')
    lines.push(`this branch's PR: #${p.number} ${p.title} — ${green}, ${merge}${state ? `, ${state}` : ''}`)
  }
  if (own.length === 0) lines.push("this branch's PR: none")
  if (others.length > 0) {
    lines.push(
      `other open PRs: ${others.length} (${others.map((p) => `#${p.number}`).join(', ')}), other sessions' work: do not act on them unless the user asks`,
    )
  }
  return lines.join('\n')
}

/** Open issues, GraphQL first and REST where it is refused (cloud sessions). */
function openIssues() {
  const raw = gh(['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title'])
  if (raw) {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  const rest = ghApi('repos/{owner}/{repo}/issues?state=open&per_page=100')
  // The issues endpoint also returns PRs.
  return Array.isArray(rest) ? rest.filter((i) => !i.pull_request) : null
}

function issues() {
  const list = openIssues()
  if (list === null) return 'open issues: could not read (gh unavailable)'
  if (list.length === 0) return 'open issues: none'
  const more = list.length > ISSUES_SHOWN ? [`  ...and ${list.length - ISSUES_SHOWN} more: gh issue list`] : []
  return [
    `open issues: ${list.length}`,
    ...list.slice(0, ISSUES_SHOWN).map((i) => `  #${i.number} ${i.title}`),
    ...more,
  ].join('\n')
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
 * Warnings about the tooling itself: another session in this checkout, and a
 * pause flag that switches the Stop hook off (a day-old one was found live on
 * 2026-09-30).
 */
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
  return out
}

try {
  let sessionId = null
  try {
    const payload = JSON.parse(await readStdin())
    sessionId = payload?.session_id ?? null
  } catch {
    // No payload: every recent session counts as another one.
  }

  if (!isGitRepo()) process.exit(0)

  const sections = [
    '# Injected session state (SessionStart hook)',
    '',
    'Read below rather than re-running `git log` or `gh issue list`.',
    'Building the shared packages is still yours to run.',
    '',
    '## Repository',
    '```',
    repoStatus(),
    hasRemote() ? pullRequests(currentBranch()) : 'open PRs: no remote',
    hasRemote() ? issues() : 'open issues: no remote',
    ...(hasRemote() ? [defaultBranchCi()].filter(Boolean) : []),
    ...toolingWarnings(sessionId),
    '```',
  ]
  emit(sections.join('\n'))
} catch {
  // Never let a context-injection failure cost the session.
  process.exit(0)
}
